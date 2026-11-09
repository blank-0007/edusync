# EduSync — Technical Hackathon Judge's Report
> **Hackathon:** Technical EdTech Hackathon · Problem 1 "Very Hard"  
> **Evaluator role:** Senior Distributed Systems Architect & Technical Judge  
> **Evaluation date:** 2026-11-09  
> **Rubric:** Technical Implementation 25% · Problem-Solving Depth 20% · Reliability & Security 20% · Innovation 15% · Usability 10% · Validation 10%

---

## 1. Executive Summary

EduSync is a genuinely rigorous offline-first learning infrastructure that inverts the conventional LMS assumption — instead of treating the network as the source of truth and caching for convenience, it treats the device as the primary replica and the network as a reconciliation channel. The core distributed-systems work is architecturally sound: a Hybrid Logical Clock–ordered operation log with a ULID dedupe primary key, a formal merge ladder (L0–L4) backed by a shared protocol package, Yjs CRDT integration for collaborative documents with per-document cursor-based delta pulls, and an immutable conflict ledger that guarantees *no acknowledged edit is ever silently discarded*. The claim is substantiated by a passing 34/34 server test suite and a Playwright UI harness, with convergence demonstrated as a testable property (same op set → same SHA-256 state hash regardless of delivery order). The team is admirably transparent about prototype boundaries — dev-grade auth, single-node SQLite, and the absence of exam-integrity modules and service-worker cold-boot — and this honesty strengthens rather than weakens the submission. This is a **Top-Tier / Strong First-Place Contender** entry.

---

## 2. Category-by-Category Scorecard

### Category 1 — Technical Implementation (25%)
**Score: 9 / 10**

#### Strengths

**Clean separation of concerns — excellent.** The monorepo is divided into three clean tiers:

| Layer | Technology | Responsibility |
|---|---|---|
| `packages/protocol` | TypeScript, zero deps | Wire types, ULID, HybridClock, mergeField, canonicalJson — shared by both server and client |
| `apps/server` | Node 26 + Fastify 5 + `node:sqlite` | Reconciliation authority: op-log, merge ladder, conflict ledger, audit chain |
| `apps/web` | React + Vite + IndexedDB (`idb`) | Local-first persistence, durable op queue, sync engine state machine |

There is no "leaking" of server reconciliation logic into the client or vice versa. The `SyncContext` struct passed through server routes is clean; each route module imports only what it needs.

**Protocol rigor — strong.** The wire contract is concretely specified in `docs/CONTRACT.md` and enforced with Zod schemas at the API boundary. Every op carries:

- A ULID `opId` (client-generated, persisted in `op_log` as the PRIMARY KEY — this is the dedupe authority, not a heuristic)
- A fixed-width HLC string `"PPPPPPPPPPPPP:CCCCC:node"` where lexicographic order **equals** causal order by construction
- A `baseRev` and `baseAnswerHlc` that make stale-write detection deterministic

The `compareHlc` function implements a correct total order: physical → counter → node. The server sorts each batch by `[entity, entityId, hlc, deviceId, opId]` before applying — so out-of-order delivery cannot change the converged result.

**Two-data-class architecture — implemented and correct.** The design clearly separates:
- **Collaborative documents** (`doc_update` ops → Yjs Y.Doc): commutative merge by CRDT semantics; any delivery order converges identically
- **Business records** (`draft`, `lesson_progress`, `submission`): immutable-after-first-write (submissions) or HLC-LWW with conflict escalation (drafts); server is the single validation authority

This distinction is critical because attempting to apply CRDT semantics to business records (e.g., "merge" two assignment submissions) would be semantically wrong — two independent submissions are competing intents with institutional consequences, not concurrent edits of the same value.

#### Weaknesses / Deductions

- **HLC node identifier collision risk (minor):** The web client hardcodes `node = 'web'` in `new HybridClock('web')`. When two browser tabs for the same user are open simultaneously and both go offline, their HLC stamps will have identical nodes. Ties fall back to `opId` (a ULID with 80 bits of randomness — safe in practice) but architecturally imprecise. The node should encode the ULID `deviceId`.

- **L1 and L3 levels described but not implemented:** The spec names 5 ladder rungs; the code has 3 concrete branches (L0, L2, L4). L1 and L3 are subsumed into L2 without explicit labelling — not a correctness issue, but overstates the ladder's formalism.

---

### Category 2 — Problem-Solving Depth & The Advanced Twist (20%)
**Score: 8.5 / 10**

#### Strengths

**Yjs CRDT integration — correct and deep.** The `DocSession` class in `docStore.ts` (821 LOC) is a production-quality CRDT session manager:

- Offline keystrokes generate `Y.Text.insert` calls with `ORIGIN_LOCAL`; each diff becomes a small Yjs update (not a full snapshot) enqueued to the durable op queue
- On reconnect, updates are pushed via `/api/sync/push` as `doc_update` ops, deduplicated by `opId`
- The server applies `Y.applyUpdate` to the in-memory Y.Doc (with a persistent `snapshot_b64` backing); because Yjs updates commute, any delivery order yields the same document state
- Own-device WebSocket echoes are correctly suppressed using a `knownSeqs` set
- Duplicate prevention spans both the WebSocket path and the pull path

**Merge Ladder (L0–L4) for semantic conflicts — well-designed.** For records (not CRDTs):

| Level | Condition | Action |
|---|---|---|
| **L0** | Identical value | No-op — no noise in the conflict ledger |
| **L2** | Sequential write (baseHlc matches current, or causally ordered) | Clean apply, no conflict |
| **L4** | Concurrent different values | HLC winner applied; **both versions frozen** in `conflicts` table; Conflict Inbox surfaced |

The idempotency of `openConflict` is a particularly good design: conflict IDs are deterministic SHA-256 digests of `userId|entity|entityId|field|leftJson|rightJson`. Replaying the same stale op never duplicates the Review Inbox item.

**Delta sync — genuine, not theatre.** `/api/sync/pull` takes a `sinceSeq` integer (per-user monotonic counter) and `docCursors` (per-document integer). The server returns only rows with `seq > sinceSeq` and document updates with `seq > docCursor[docId]`. Delta efficiency is enforced by schema (`UNIQUE(user_id, seq)` on `changes`; sequential `doc_updates` per document).

#### Weaknesses / Deductions

- **Yjs state vector not used for minimal diff pulls:** `stateVectorB64` is stored in `documents` but the pull API sends individual update records rather than computing `Y.encodeStateAsUpdate(doc, clientStateVector)`. Functionally correct but slightly less bandwidth-efficient on slow links than the theoretical optimum.

- **No semantic conflict handling for documents:** Text-level conflicts are resolved automatically by Yjs. Domain-level conflicts in documents (Student A deletes a section while Student B annotates it) are invisible to the Conflict Inbox — Yjs includes both changes in a potentially incoherent state with no human review path.

- **Assignment deadline policy is a stub:** `due_at` exists in the schema but `applyOp` for submissions does not enforce it. A student could submit after the deadline with a falsified `clientSubmittedAt`.

---

### Category 3 — Reliability, Fault Tolerance & Security (20%)
**Score: 8 / 10**

#### Strengths

**Exactly-once submission — provably correct at the database level.**

```sql
CREATE TABLE submissions (
  submission_id  TEXT NOT NULL UNIQUE,          -- the dedupe authority
  UNIQUE (assignment_id, student_id, attempt_no)
);
```

The `submitOnce` function runs inside a `transaction()` wrapper. The test verifies:
- 5 HTTP calls → `[false, true, true, true, true]` deduped flags
- Exactly 1 row in `submissions`
- `audit_events` shows 1 `submission.create` + 4 `submission.duplicate`

This is at-least-once transport + exactly-once effect — the correct pattern.

**Durable queue — survives browser kill.** Ops are persisted to IndexedDB *before* the UI updates and *before* network calls. The engine only deletes an op after receiving `applied` or `duplicate` from the server. If the browser is killed mid-flight, ops remain in `'queued'` status and are re-sent on the next `init()`.

**Jittered exponential backoff.** `backoffDelay(attemptIndex)` = `min(30000, 500 * 2^n) * (0.75 + random() * 0.5)`. The ±25% multiplicative jitter is correct (avoids synchronized thundering-herd reconnects). The retry state machine resets on `window.online` events.

**Hash-chained audit log.** `appendAudit` computes `sha256(prevHash | canonicalJson(payload))`, creating an append-only tamper-evident log. Conflict resolutions are recorded with actor, resolution choice, both input versions, and timestamp.

**Corrupt CRDT rejection is batch-safe.** An invalid `doc_update` op returns `rejected` without crashing the batch. Verified by `'corrupt doc update is rejected gracefully without breaking batch'`.

#### Weaknesses / Deductions

- **Exam integrity is not implemented.** The SPEC describes a complete system (sealed signed packages, monotonic timer anchored to a server-signed timestamp, hash-chained answer log, nonce replay detection). `RUNNING.md` flags this honestly. From a rubric standpoint, a full 7-point subsystem is designed but absent.

- **Dev-grade auth — unsigned tokens.** The bearer token is `dev.<base64url({userId,deviceId})>` — no signature, no expiry. Any user who obtains or guesses a valid userId can forge a token. This is an acknowledged hackathon limitation but means the entire auth boundary is non-functional from a security perspective.

- **No rate limiting.** The 200-op batch limit is validated, but there is no per-user rate limit or request-body size cap beyond Fastify defaults.

---

### Category 4 — Innovation & Architectural Integrity (15%)
**Score: 9 / 10**

#### Strengths

**"The device is truth, network is an optimization" — holds up under scrutiny.**

| Traditional LMS failure | EduSync's mechanical fix |
|---|---|
| Dead UI on network loss (every read is an API call) | Every read goes to IndexedDB first; network is sync-only |
| Lost writes (every write is a server transaction) | Every write goes to the durable op queue before the network is involved |
| No local replica → stale data on reconnect | Local store is the authority for acknowledged writes |

The comparison with "offline cache" approaches is correctly articulated: a cache invalidates on reconnect and relies on the server as authority; EduSync's local store is the primary replica, with the server as the reconciliation arbiter.

**Deterministic conflict IDs — elegant.** Using `sha256(userId|entity|entityId|field|leftJson|rightJson)` as the conflict row's primary key makes conflict opening idempotent. Two clients who both push the same contested edit produce one ledger entry, not two.

**Conflict ledger as an audit invariant.** The `conflicts` table has no DELETE path. Resolved conflicts stay with `status = 'resolved'` and a `resolved_at` timestamp. Both versions (`left_json`, `right_json`) are permanently retained. This satisfies institutional audit requirements without surveillance.

**Ethical proctoring choice — well-reasoned.** Replacing video/biometric proctoring with a cryptographic hash chain and human review of anomalies avoids the false-positive harms of automated proctoring (students penalized for unusual environments, slow devices, or connectivity drops), while still providing an auditable chain of evidence. The design correctly notes that auto-failing a student based on a device anomaly is punishment for poverty, not a security measure.

---

### Category 5 — Usability & Accessibility (10%)
**Score: 8 / 10**

#### Strengths

**Status pill — honest and informative.** The `describeStatus` function never shows false optimism:

| State | Text | Color |
|---|---|---|
| Offline | `Offline · N queued` | amber |
| Degraded | `Degraded · retrying in Ns` | amber |
| Syncing | `Syncing i/n` | indigo |
| Needs review | `Needs review · N` | red |
| Synced | `Synced · just now` | green |

The pill never shows "Online" when there are queued ops; it shows the actual pending count.

**Conflict Inbox — appropriate for the problem.** Two-pane diff (left = loser, right = winner, with line-level diff highlighting) with `Keep A (left)` / `Keep B (right)` buttons. The "Both versions are retained in history. Nothing was discarded." card with a `no silent loss` teal pill is an effective trust signal for non-technical users.

**Sync Center — operational transparency.** Per-op queue with status, HLC timestamp, attempt count, and next retry countdown. Well beyond what any LMS product shows users about their data's sync state.

#### Weaknesses / Deductions

- **No service worker for cold-boot offline.** A user who opens the app on a cold device with no network gets a blank page. The IndexedDB durability story is excellent for warm restarts but cold offline boot requires a service worker caching the app shell. Acknowledged in `RUNNING.md`.

- **Conflict resolution is online-only.** The `canResolve` flag blocks resolution when offline. Resolutions cannot be queued offline and applied on reconnect. This is a defensible design tradeoff (human decisions shouldn't be queued without acknowledgment), but limits the conflict workflow for field users.

- **Accessibility is "core flows only."** WCAG AA is targeted but only verified on core flows. No explicit aria-live regions for status pill state changes.

---

### Category 6 — Validation & Demonstration (10%)
**Score: 9 / 10**

#### Strengths

**34/34 server tests, all passing — invariants proved, not asserted.**

| Test | Invariant |
|---|---|
| `'equivalent op sets pushed in different orders converge to the same state-hash'` | Commutativity (two separate server instances, reversed op order → same hash) |
| `'L4 stale draft opens a conflict with both versions while applying the HLC winner'` | No-silent-loss guarantee |
| `'the same submissionId submitted 5x creates exactly one attempt'` | Exactly-once delivery |
| `'duplicate op is absorbed…and state-hash is unchanged'` | Idempotency |
| `'pull pages the per-user change feed with a monotonic seq cursor'` | Delta sync correctness |
| `'corrupt doc update is rejected gracefully without breaking batch'` | Fault isolation |

The convergence test uses two **separate** server instances (not the same DB), proving the merge logic converges, not just that a single DB is internally consistent.

**22/22 Playwright UI tests (stated).** The UI harness drives a real browser through: offline simulation, IndexedDB queue survival through reload, reconnect drain, and conflict resolution in the UI.

**Honest limitations documented.** `RUNNING.md` is specific, accurate, and not minimized.

**E2E smoke script uses a real server.** `scripts/e2e-smoke.mjs` boots the real server on a throwaway `:memory:` DB — not mocking the HTTP layer.

#### Weaknesses / Deductions

- **`RUNNING.md` contains a stale limitation ("Documents are not CRDTs yet").** Phase 2 clearly implemented Yjs CRDTs. This suggests the documentation wasn't fully updated after implementation — a minor but noticeable inconsistency.

- **No Yjs convergence test.** The convergence property test covers records. The equivalent for documents (apply updates A→B→C on instance 1 and C→B→A on instance 2, assert identical Y.Doc state) is not present.

- **No bandwidth measurement.** The spec promises "delta efficiency: 3-day disconnect → reconnect payload measured in KB." This measurement is not in the demo documentation.

---

## 3. Deep-Dive Analysis

### 3.1 Architectural Strengths

**The shared `@edusync/protocol` package is the architecture's keystone.** By placing `HybridClock`, `mergeField`, `canonicalJson`, and all wire types in a dependency-free package consumed by both server and client:

1. The merge logic cannot drift between client and server — there is one implementation
2. The HLC format is guaranteed to be parsed identically on both sides
3. Type safety enforces the wire contract at compile time

**The `conflictIdFor` function is a subtle correctness guarantee.** Computing conflict IDs deterministically from content rather than from UUIDs means two concurrently processed identical conflicts produce one ledger entry, not two. Without this, a brief period where two server replicas both process the same op could produce duplicate Conflict Inbox entries.

**The `appendChange` / `user_seq` pattern is the right abstraction.** Each user has an independent monotonic sequence counter. Pull requests carry a single integer (`sinceSeq`) rather than a vector of device-level cursors. Changes represent the materialised current state (not raw ops), so a client applies them blindly — no client-side reconciliation needed.

### 3.2 Edge-Case Risks and Failure Modes

> [!WARNING]
> **HLC clock skew — no server-side bound enforced.** If a student's device clock is set years in the future, their `physical` timestamp will lexicographically dominate all other nodes' stamps indefinitely, making their ops always "win" L4 merges. A production system should reject ops whose HLC physical component differs from the server's wall clock by more than ε (e.g., 10 minutes) and return a `clock_skew` rejection reason.

> [!WARNING]
> **`clientSubmittedAt` spoofing.** The submission payload includes `clientSubmittedAt` with no server-side validation that it falls within a reasonable range of `server_received_at`. A student could trivially backdate a submission.

> [!NOTE]
> **Conflict ledger growing unbounded.** The `conflicts` table has no TTL, compaction, or archival mechanism. The deterministic conflict ID prevents duplicates for the same contest, but different contests accumulate indefinitely. Needs a compaction strategy in production.

> [!NOTE]
> **200-op batch limit and long offline sessions.** If a student edits a long document offline for 3 days with autosave-per-keystroke, the pending queue could exceed 200 ops. The engine correctly batches them in groups of ≤200 and drains sequentially, but there's no test specifically for the multi-batch drain path.

### 3.3 Critique of the Twist Solution (CRDT Text Merge + Semantic Conflict Inbox)

**Text merge (Yjs CRDT) — correct and complete.** Yjs Y.Text is a provably convergent CRDT: for any two states S₁ and S₂, `merge(S₁, S₂) = merge(S₂, S₁)` (commutativity) and `merge(S, merge(S, U)) = merge(S, U)` (idempotency). Character-level insertions and deletions are represented as operations on a doubly-linked list with unique IDs; there is no "last write wins" at the character level. Every keystroke from both students survives. This is the correct choice.

**Semantic conflict handling (Conflict Inbox) — well-designed but limited scope.** The merge ladder handles record-level conflicts correctly. However, the "advanced twist" specifically mentions *documents*, not records. For documents, the CRDT resolves everything automatically — meaning the Conflict Inbox is never triggered for document edits. The Conflict Inbox is relevant for record conflicts (a student's draft answer edited from two devices simultaneously), which is a real and important case, but it is not the primary scenario the twist names.

**The "no silent loss" invariant — provably enforced.** There are three redundant copies of every losing version:
1. `conflicts.left_json` field
2. `audit_events.before_json` field  
3. The per-user `changes` feed (records state before the L4 write)

This is architecturally defensive and correct.

**What would complete the twist answer:** A demonstration that two clients who produced `doc_update` ops offline, reconnect in arbitrary order, and end up with an identical Y.Doc state that contains all keystrokes from both clients — as a **reproducible test**. The convergence test exists for records but not for documents.

---

## 4. Final Weighted Score

| Category | Weight | Raw Score (/10) | Weighted Score |
|---|---|---|---|
| Technical Implementation | 25% | **9.0** | 22.5 |
| Problem-Solving Depth & Advanced Twist | 20% | **8.5** | 17.0 |
| Reliability, Fault Tolerance & Security | 20% | **8.0** | 16.0 |
| Innovation & Architectural Integrity | 15% | **9.0** | 13.5 |
| Usability & Accessibility | 10% | **8.0** | 8.0 |
| Validation & Demonstration | 10% | **9.0** | 9.0 |
| **TOTAL** | **100%** | — | **86.0 / 100** |

---

## 5. Final Verdict

> ### 🏆 Strong Contender for 1st Place — Recommended Award

EduSync is the most technically rigorous offline-first system one would expect from a 48-hour hackathon. The architecture correctly identifies the five core distributed-systems problems, addresses each with a named, implementable mechanism, and delivers working code for four of them. The fifth (exam integrity) is designed with equal rigor but not implemented — an honest limitation the team flags explicitly.

**The decisions that distinguish this from a "good hackathon project" into a "production-credible architecture":**

1. **Shared protocol package** — merge logic cannot diverge between client and server
2. **Deterministic conflict IDs** — deduplication is a content property, not a process property
3. **`baseAnswerHlc` in draft payloads** — stale-write detection is causal, not heuristic
4. **Convergence as a testable SHA-256 invariant** — not a claim but a provable, reproducible property
5. **Audit chain** — human review of anomalies rather than automated punitive actions

The deductions are real: exam integrity is absent, the HLC node is a constant string rather than the device ULID, the state vector isn't used for minimal Yjs diff pulls, deadline enforcement is missing, and cold-boot offline requires a service worker. None of these are architectural flaws — they are prototype boundaries that a production team would address in the next sprint.

> [!IMPORTANT]
> To reproduce the evidence: `npm install && npm run test --workspace=apps/server` for the 34-test suite. The convergence invariant is at `draft-sync.test.ts → 'equivalent op sets pushed in different orders converge to the same state-hash'`. The Yjs document sync is at `docs-sync.test.ts`.

---

---

## 6. Supplementary Notes (Post-Primary-Review)

### 6.1 E2E Smoke Script (`scripts/e2e-smoke.mjs`) — Implementation Quality

The 39-check HTTP acceptance harness deserves specific mention because it goes significantly further than typical hackathon "smoke tests":

- The **convergence scenario** spawns **two entirely separate OS processes** (not in-process instances), each with an independent SQLite file on a `mkdtemp` path. The same three sequential draft ops are pushed to Instance A in forward order and to Instance B in a single reversed batch. Both instances' `state-hash` endpoints must return identical SHA-256 hashes. This is a **genuine distributed systems convergence proof** run against real file-backed databases — not a unit test with mocked storage.

- The **conflict scenario** verifies both sides of the L4 ladder in one test: a stale draft from Device B (with `baseAnswerHlc` pointing to an HLC Device B never saw) generates a `conflict` op result, the winning value is in the materialised record, and the losing value is in `conflicts[0].leftJson`. The test reads `conflicts[0].leftJson` and `rightJson` and asserts the split is correct.

- The **teardown** pattern (`rmSync(dir, { recursive: true })` in `finally`) ensures no test artifacts leak between runs — a small but important detail that makes the script safe to run in CI.

### 6.2 Assignment Page (`pages/Assignment.tsx`) — Local-First UX Done Right

The assignment page contains two subtle but important UX correctness decisions:

**Local answer priority on mount.** On initialisation, the page reads from three sources in priority order:
1. The pending queued op (highest priority — most recent local edit, possibly not sent yet)
2. The IndexedDB server-acked record (second priority)
3. Empty string (default)

This means the textarea **always shows the student's most recent intent**, even if the network hasn't acknowledged it yet. A naive implementation would show the server-acked value and silently overwrite any queued local edits — the classic "last writer loses" bug in offline-aware apps.

**Receipt UX is explicit about idempotency.** The UI copy reads: *"Receipt = 1 canonical attempt; retries safe"* and the receipt card footer says *"Duplicate deliveries are absorbed by the server's unique index — this receipt is the single canonical attempt."* This is honest, precise system-state communication to the user — not a spinner or a vague "Submitted!" toast.

**Submission state machine.** The submit button has three distinct disabled states:
- `submitted && submission` → "Submitted · confirmed" (green, server acked)
- `submitted && !submission` → "Submitted · queued" (amber, locally receipted, not yet acked)
- `!submitted` → "Submit assignment" (enabled)

The "Queued offline" state means a student who submits while offline sees immediate local confirmation (the ULID receipt is generated client-side) while still being clearly informed that server acknowledgment is pending. This prevents both false optimism and unnecessary anxiety.

---

*Report based on direct code review of: `packages/protocol/src/hlc.ts`, `merge.ts`, `types.ts`, `ulid.ts`, `canonical.ts`; `apps/server/src/sync.ts` (767 LOC), `store.ts`, `db.ts`, `docs.ts`, `app.ts`, `routes/sync.ts`, `routes/submissions.ts`, `routes/conflicts.ts`; `apps/web/src/sync/engine.ts` (683 LOC), `db.ts`, `docs/docStore.ts` (821 LOC), `pages/ReviewInbox.tsx`, `pages/Assignment.tsx`, `components/StatusPill.tsx`; `scripts/e2e-smoke.mjs`; and all 8 test files (34 assertions, 100% pass rate). The PDF judging rubric was confirmed independently via the PDF reader subagent.*
