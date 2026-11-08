# EduSync — Offline-First Learning Infrastructure
### Solution specification (source of truth for all documents & visuals)

Source: "Technical EdTech Hackathon | Problem Statements" — Problem 1, rated **Very hard**.
Theme: Education technology. Primary domains: distributed systems, databases, networking, fault tolerance.

---

## 1. The problem, restated clearly

### 1.1 What the brief says

Build a distributed learning platform that lets students **access lessons, submit assignments, take examinations and collaborate when internet access is unavailable**. When connectivity returns, the system must **synchronise data reliably across devices**.

Core technical challenges named by the brief:
1. Offline-first application architecture with local persistence.
2. Conflict-aware synchronisation across multiple devices.
3. Background sync queues, retries and idempotent operations.
4. Distributed file storage and version management.
5. Real-time collaboration when connectivity is restored.
6. Data integrity and duplicate-submission prevention.

**Advanced twist:** two students edit the same shared document while offline. When both reconnect, the platform must reconcile conflicting edits **without silently losing valid work**.

### 1.2 What the brief actually means

The sentence "access lessons when internet is unavailable" hides the entire difficulty. A normal LMS is a *thin client over a database*: the network is assumed to exist, so every read is an API call and every write is a transaction on the server. Take the network away and that architecture produces three failures: **dead UI, lost writes, and divergent copies of the truth.**

EduSync inverts the assumption. **The device is the source of truth; the network is an optimisation.** That inversion creates five distinct engineering problems that must be solved *together*, because each one constrains the others:

| # | Problem | Why it is genuinely hard |
|---|---------|--------------------------|
| P1 | **Availability** — lessons, drafts, submissions, exams and co-editing must work with zero network for hours or days, across app restarts and low-storage devices. | Requires local persistence, a cache/eviction policy, and a UI that never blocks on I/O. Offline is not a boolean: it degrades *partially* (fast but lossy links, captive portals, background tab throttling). |
| P2 | **Convergence** — every device and the server must converge on one identical state, in any order of arrival. | Requires causal ordering without reliable clocks, commutative merge, and a deterministic answer to "who wins". Wall-clock LWW silently destroys data; naive LWW is exactly what the twist forbids. |
| P3 | **Exactly-once effects** — submission and file upload must produce **one** canonical record under retry. | The transport can only promise at-least-once. Duplicate submits are the #1 real-world LMS bug; the fix is client-generated idempotency keys + immutable server-side attempts, not server-side de-duplication heuristics. |
| P4 | **Integrity without trust** — an offline exam answer sheet and offline-authored submissions are produced on a device you do not control, at a time you cannot verify. | Server must verify *provenance and ordering* (signed sessions, tamper-evident chains, single-use nonces, monotonic timing) without trusting the device clock, and without auto-penalising students whose device behaves oddly. |
| P5 | **Resource reality** — low-end Android, 2G, flaky handovers, limited storage. | Delta sync (state vectors, not table dumps), chunked resumable uploads, compressed batches, bounded queues, back-pressure, battery-aware scheduling. |

### 1.3 The failure we must make impossible

The twist names it precisely: **silent loss of valid work**. A merge strategy that "resolves" a conflict by discarding one side is not a solution — it is data loss with extra steps. So the product requirement is stronger than "sync works":

> **No acknowledged edit is ever destroyed without a human-visible record of it.**

That is the design constraint that drives every choice below, and it is the thing a demo must prove.

### 1.4 Scope for a hackathon build (non-goals)

In scope: one course, two roles (student, instructor), lessons + media, assignment draft/submit, shared document co-editing, one exam, sync engine, conflict inbox, sync centre, integrity ledger, observability.

Out of scope for the prototype (state honestly in the demo): real proctoring/video, plagiarism detection, SCORM/QTI import, payments, timetabling, full accessibility audit, production-grade auth (MFA/SSO), horizontal sharding.

---

## 2. The solution

### 2.1 One-line definition

> **EduSync is a local-first learning platform: every user action is durably recorded on the device first, then reconciled with the server and other devices through a conflict-aware, idempotent, resumable sync protocol that never loses acknowledged work.**

### 2.2 Seven design principles

1. **Local write first, always.** A user action appends to the device's operation log and updates the UI immediately. Network is a background concern. There is no spinner between a student and their own words.
2. **Two data classes, two merge strategies.** *Documents* (collaborative text) are CRDTs (Yjs) — merge is commutative, so no edit is ever lost by definition. *Records* (submissions, grades, exam sessions) are **not** CRDTs: they are immutable server-validated facts, ordered by the server, with idempotency keys. Mixing these up is the classic architectural mistake.
3. **One append-only op log per device, ordered by Hybrid Logical Clock.** HLC gives causal order without trusting wall clocks; ops are immutable, idempotent (ULID `opId`), and carry the author device.
4. **Merge ladder, not a single rule.** Auto-merge when possible; surface a human decision when not. The ladder ends in a **Conflict Inbox**, never in a silent overwrite.
5. **At-least-once transport + exactly-once effects.** Every write is idempotent; every submission carries a client-generated `submissionId`; the server's unique index is the dedupe authority.
6. **Delta everything.** Pull by state vector / per-table cursor; push coalesced batches; upload blobs in resumable chunks; a reconnect after 3 days costs kilobytes, not gigabytes.
7. **Everything auditable.** Submission and exam events are hash-chained. Any reconciliation decision (auto or human) is recorded with actor, inputs and timestamp.

### 2.3 What the student actually experiences

* **Before going offline:** the app pre-fetches lessons, media, rubrics and a *sealed* exam package; a "Available offline" chip and a storage meter make readiness explicit.
* **While offline:** the app never blocks. A status pill reads `Offline · 12 changes queued`. Drafts autosave to the device. The exam timer runs from a signed start token. Co-editing shows the other author's last-known cursors with an "as of 14:02" caveat.
* **On reconnect:** changes push automatically in batches; the pill walks through `Syncing 7/12 → Synced · just now`; any unmergeable conflict appears in the **Review Inbox** with a two-pane diff and three actions (keep mine / keep theirs / merge manually); both versions remain recoverable from history forever.
* **If the same submission is sent five times** (retry storm, flaky link, duplicated tab): exactly one attempt exists on the server; the UI shows one submission with a "confirmed" receipt, and the audit log shows the four duplicate deliveries were absorbed, not lost.

### 2.4 How the advanced twist is actually solved

Two students edit the same shared document offline. Concretely:

1. Both devices are Yjs peers (offline). Each edit produces an update with a client-side clock.
2. Dev A reconnects: its pending updates layer onto the doc; server persists updates and returns a snapshot vector.
3. Dev B reconnects with a *stale* vector: it pulls A's updates and pushes its own; Yjs merges both runs of updates — **interleaving is preserved, no keystroke is dropped**, and both devices converge to the same byte-identical sequence (property-tested for all arrival orders).
4. If the conflict is not textual but *semantic* — two different submitted versions of the same assignment, or a student draft vs an instructor annotation — CRDT rules cannot decide. The system then **freezes both versions as immutable artifacts**, writes a `conflict` record, and surfaces it in the Review Inbox. Nothing is chosen automatically, nothing is destroyed, a human (or an explicit policy) decides, and the decision is recorded.
5. If the two edits are to non-overlapping parts of the *same* structured record (e.g., one student edits the problem statement, another edits the answer body), the merge ladder's field-level rule applies: the changed fields merge, only the genuinely contested field escalates.

This is why the twist is answerable: **CRDTs remove silent loss for text; an explicit conflict ledger removes silent loss for semantics.**

### 2.5 Sync protocol (wire contract)

```jsonc
// Every write becomes an op. Immutable, idempotent, causally ordered.
op = {
  "opId":    "01J9Z6K3Q8R2V7M4X1N5B0T6AC",  // ULID, client-generated, globally unique
  "deviceId":"dev_7f3a…",
  "hlc":     "1762598400123:3:dev_7f3a…",    // physical ms : logical counter : node
  "entity":  "submission",
  "entityId":"sub_01J9…",
  "type":    "create" | "update" | "delete" | "append",
  "baseRev": 42,                              // last server revision the client saw
  "payload": { … },
  "sig":     "ed25519:…"                      // device key signature
}

POST /sync/push  { "deviceId": "dev_7f3a…", "ops": [op, …] }        // ≤ 200 ops or 512 KB
→ 200 { "results": [ { "opId": "…", "status": "applied" | "duplicate" | "rejected" | "conflict",
                       "serverRev": 43, "reason": null }, … ],
        "serverHlc": "1762598400500:0:srv" }

POST /sync/pull  { "deviceId": "…",
                   "docVectors":  { "doc_42": "AQAAAA…" },   // Yjs state vectors
                   "recordCursor": "1762598400000:0:srv" }
→ 200 { "updates":  [ { "docId": "doc_42", "update": "base64…" } ],
        "records":  [ { "entity": "assignment", "id": "…", "rev": 44, "data": { … } } ],
        "conflicts":[ { "id": "cfl_9", "entity": "submission", "left": {…}, "right": {…} } ],
        "nextCursor": "1762598400500:0:srv" }
```

Rules that make it correct:
* **Dedupe authority = unique index on `op_id`** (Postgres), with Redis `SETNX` as a fast path. Duplicate push returns `duplicate` with the original `serverRev` — safe to retry blindly.
* **Ordering:** server applies ops per entity in HLC order; ties broken by `deviceId` (deterministic on every replica).
* **Backoff:** `min(30s, 500ms · 2^attempt) ± 25%` jitter; `navigator.onLine` is a hint, never the truth — a failed request decides.
* **Bounded queue:** coalesce repeated field edits; oldest-first; drop *superseded* drafts only, never submitted work. Storage budget per device with eviction of *derived* caches (media can be re-fetched; ops cannot).
* **Convergence:** pull-then-push on reconnect; pull again after push; the state vector makes the second pull cheap. A final `GET /sync/state-hash` lets tests assert byte-equal convergence across devices.

### 2.6 Submission integrity (duplicate-submission prevention)

* Client generates `submissionId` **once**, on first submit intent, and persists it with the draft. Retries reuse it.
* Server writes an **immutable attempt row** with `UNIQUE (assignment_id, student_id, attempt_no)` and `UNIQUE (idempotency_key)`; the first request wins, retries return `200` with the *same* attempt (not `409`), so the client can safely replay forever.
* `content_hash` (SHA-256 of normalised payload) detects "same content, new submission id" and files it as a *revision of the same attempt*, not a second attempt.
* Late/offline submissions are stamped with both `client_submitted_at` (device) and `server_received_at` (authority). Deadline policy is evaluated on the server against the client timestamp **plus** a bounded offline grace window, and both timestamps are shown to the instructor — no silent penalty.

### 2.7 Offline exam integrity (P4, the highest-risk feature)

1. **Seal before the network leaves.** Server issues `{ ciphertext, iv, keyId, nonce, validFrom, validUntil, sig }`, signed with the server's Ed25519 key, content key wrapped per student+session. Device verifies the signature *offline* and refuses to open outside the window.
2. **Anchor time without trusting the clock.** At issue, server sends `serverTimeAtIssue`; the device stores `issuedAt` and anchors the countdown to a **monotonic** timer. Wall-clock changes, timezone edits and reboots are detected and logged.
3. **Tamper-evident answer log.** Every autosave event is chained: `h_i = SHA-256(h_{i-1} ‖ event_i)`, signed with the device key; the local log is encrypted at rest with a key derived from the session token.
4. **Verify on sync, flag — don't auto-fail.** Server checks chain integrity, session nonce single-use, device binding, window validity, clock-monotonicity. Anomalies raise an **integrity flag for human review** (explicitly demanded by the judging rubric: "for high-risk features, especially examination monitoring, require human review and privacy safeguards"). Answers are never silently discarded.
5. **Privacy:** no keystroke logging, no screen capture, no background camera. We record *events necessary to prove the answer log is intact*, nothing behavioural beyond that, and students can inspect their own integrity report.

### 2.8 Merge ladder (the conflict model)

| Level | Situation | Strategy | Loss risk |
|-------|-----------|----------|-----------|
| L0 | values identical | no-op | none |
| L1 | collaborative text/list | **Yjs CRDT merge** (commutative) | none |
| L2 | independent scalar fields of one record | per-field HLC last-writer + `deviceId` tiebreak | none (both values kept in history) |
| L3 | domain rule (grades: instructor wins · deadline: server clock · enrolment: server wins) | policy merge, recorded | none |
| L4 | genuinely contested (two submitted versions, conflicting annotations) | **freeze both, open Conflict Inbox, human decides** | none — nothing discarded |

Every L2–L4 decision writes a `conflict` row: `{entity, field, left, right, resolution, resolved_by, resolved_at}` and both sides stay in `op_log` / `doc_updates` forever. History is the guaranteed escape hatch.

---

## 3. Architecture

### 3.1 System shape (three tiers + one reconciliation spine)

```
┌──────────────────────────── CLIENT (PWA, offline-capable) ────────────────────────────┐
│  React UI  ·  local command bus  ·  SYNC ENGINE (scheduler · batcher · backoff ·      │
│  conflict router)  ·  Local store adapter: SQLite-WASM/OPFS (records) · IndexedDB     │
│  (Yjs docs, op queue)  ·  Blob cache (content-addressed)  ·  WebCrypto (device keys)  │
│  Service worker (app shell + media)  ·  Connectivity monitor (probe, not onLine)      │
└───────────────▲───────────────────────────────┬───────────────────────────────────────┘
                │  HTTPS + WSS (batched, resumable)  │
┌───────────────┴───────────────────────────────▼───────────────────────────────────────┐
│ EDGE: CDN / TLS termination / rate limiting  →  API GATEWAY (JWT + device key,        │
│ request validation, sync-aware routing)                                                │
└───────────────▲───────────────────────────────────────────────────────────────────────┘
                │
┌───────────────┴────────────────────── SERVICES (Node.js) ─────────────────────────────┐
│ sync-service   │ doc-service      │ submission-service │ exam-service │ media-service  │
│ op-log ingest  │ Yjs update store │ immutable attempts │ sealed pkgs  │ presigned      │
│ dedupe · HLC   │ snapshots        │ idempotency keys   │ nonce verify │ chunked upload │
│ version vectors│ WS rooms         │ content hashing    │ chain verify │ checksums      │
└───────┬────────┴───────┬──────────┴────────┬───────────┴──────┬───────┴────────┬───────┘
        │                │                   │                  │                │
┌───────▼──────┐ ┌───────▼───────┐ ┌─────────▼──────┐ ┌─────────▼──────┐ ┌───────▼──────┐
│ PostgreSQL 16│ │ Redis 7       │ │ BullMQ workers │ │ S3 / MinIO     │ │ Observability│
│ op_log (uniq │ │ dedupe keys   │ │ merge, notify, │ │ blobs by sha256│ │ OTel→Tempo   │
│ op_id), outbox│ presence, rate│ │ integrity jobs │ │ lifecycle      │ │ Prom + Loki  │
│ JSONB, HLC   │ limits, queues│ │ snapshots      │ │ versioning     │ │ pino logs    │
└──────────────┘ └───────────────┘ └────────────────┘ └────────────────┘ └──────────────┘
```

**The reconciliation spine** (the part that makes this "distributed systems" and not "a CRUD app with a cache"):

`intent → local op (durable) → UI reflects instantly → queue → batched push → server dedupe/order/validate → ack → delta pull → merge → converge → audit`

### 3.2 Component responsibilities

| Component | Owns | Must never do |
|---|---|---|
| **Client sync engine** | durability of un-acked ops, backoff, batching, delta pull, conflict routing, state machine | block the UI, drop un-acked writes, trust `navigator.onLine` |
| **sync-service** | op ingestion, dedupe by `opId`, HLC ordering, per-entity revision, acks | reorder conflicting writes silently |
| **doc-service** | Yjs updates, periodic snapshots, WS rooms, presence | interpret document semantics |
| **submission-service** | immutable attempts, idempotency, content hash, deadline policy, receipts | update a submitted attempt in place |
| **exam-service** | sealed packages, session tokens, nonce single-use, chain verification, integrity flags | auto-fail a student on an anomaly |
| **media-service** | presigned chunked uploads, checksum verification, content-addressed blobs, GC | serve unverified bytes |
| **workers** | snapshots, merge jobs, notifications, analytics rollups, integrity review queue | hold request-path latency |
| **Postgres** | authoritative record state + op log + outbox + audit chain | be the only copy of client work |
| **Redis** | dedupe fast path, presence, queues, rate limits | be the source of truth for records |

### 3.3 Device sync state machine

```
                 probe ok                  push ok
   OFFLINE ──────────────────▶ CONNECTED ────────────▶ SYNCING ──▶ SYNCED ──(op)──▶ SYNCING
      ▲   ◀──── probe fail ────── │                     │  ▲                     │
      │                           │                     │  └── pull ok ──────────┘
      │ failed ≥ N times            │ push timeout
      └────────── DEGRADED ◀────────┘ (retry/backoff, never drops ops)
```
States are surfaced honestly in the Sync Center: `Offline · 12 queued`, `Syncing 7/12`, `Synced · 2m ago`, `Degraded · retrying in 8s`, `Needs review · 1 conflict`.

### 3.4 Data model (core tables)

```
users(id, role, name, email)
devices(id, user_id, pubkey, last_seen, platform)
courses(id, title, instructor_id)
lessons(id, course_id, title, body_blob_id, ordering, updated_at, rev)
lesson_media(id, lesson_id, blob_id, kind, duration_s, size_bytes)
enrollments(id, course_id, user_id, state)
assignments(id, course_id, title, instructions_doc_id, rubric_json, due_at, rev)
submissions(id, assignment_id, student_id, attempt_no, status, content_hash,
            client_submitted_at, server_received_at, idempotency_key,
            UNIQUE(assignment_id, student_id, attempt_no), UNIQUE(idempotency_key))
submission_files(id, submission_id, blob_id, filename, sha256)
exams(id, course_id, title, opens_at, closes_at, duration_s, package_key_id)
exam_sessions(id, exam_id, student_id, device_id, nonce, issued_at, expires_at, state)
exam_events(id, session_id, seq, kind, payload, prev_hash, hash, sig)      -- hash-chained
documents(id, course_id, kind, title, snapshot_blob_id, snapshot_vector)
doc_updates(id, doc_id, hlc, author_device, payload, seq)
op_log(op_id PK, device_id, hlc, entity, entity_id, type, payload_json, base_rev,
        server_rev, applied_at, sig,          UNIQUE(op_id))
device_cursors(device_id, entity, cursor_hlc, updated_at)
conflicts(id, entity, entity_id, field, left_json, right_json, status,
          resolution, resolved_by, resolved_at)
audit_events(id, actor, action, subject, before_json, after_json, prev_hash, hash, at)
blobs(sha256 PK, size_bytes, mime, storage_uri, refcount)
outbox(id, aggregate, payload, published_at)                              -- transaction→queue
```

---

## 4. Tech stack (and why)

**The brief suggests:** React, Node.js, PostgreSQL, IndexedDB, Redis, WebSockets, Docker. We keep that spine and add only what the distributed-systems requirements force.

### Frontend (client)
| Concern | Choice | Why |
|---|---|---|
| UI | **React 18 + TypeScript + Vite** | Brief alignment; smallest cold start; large hiring pool |
| Styling | **Tailwind CSS + Radix primitives** | Accessible dialogs/menus (rubric rewards accessibility) |
| Server state | **TanStack Query** | Stale-while-revalidate that already speaks "cached, then refresh" |
| UI state | **Zustand** | No provider tree; sync-engine events map cleanly |
| Records store | **SQLite-WASM on OPFS** (fallback: **Dexie/IndexedDB**) | Real SQL + transactions + indices locally; OPFS survives restarts; Dexie fallback for older browsers |
| Documents | **Yjs + y-indexeddb + y-websocket** | Proven CRDT; offline merge by construction; tiny updates |
| Offline shell | **Workbox service worker** | App shell + media cache, versioned precache |
| Sync engine | **TypeScript in a Web Worker** | Keeps batching/backoff off the main thread; testable pure core |
| Crypto | **WebCrypto** (Ed25519 via libsodium-wrappers fallback) | Device keys + local encryption without native deps |

### Backend (server)
| Concern | Choice | Why |
|---|---|---|
| Runtime | **Node.js 20 LTS** | Brief alignment; same language end-to-end; `ws` + Fastify are fast enough |
| Framework | **Fastify + zod** | Schema-first validation is the guardrail for untrusted offline payloads |
| Realtime | **`ws` rooms + `y-protocols`** | Yjs updates are binary; socket.io adds framing we don't need |
| ORM/migrations | **Drizzle ORM + drizzle-kit** | Typed SQL, transparent unique indexes (dedupe depends on them) |
| Primary DB | **PostgreSQL 16** | `UNIQUE(op_id)`, JSONB payloads, transactional outbox, HLC indices; the dedupe index is the correctness anchor |
| Cache/queue | **Redis 7 + BullMQ** | Dedupe fast path, presence, rate limits, retryable jobs |
| Object storage | **MinIO (S3 API)** | Local-first dev parity; presigned chunked PUTs; content-addressed keys |
| Packaging | **Docker Compose** | Brief alignment; one command dev loop (`make up`) |
| Edge proxy | **Caddy** | Automatic HTTPS on LAN demos, reverse proxy + rate limits |

### Cross-cutting
- **Observability:** OpenTelemetry → Prometheus + Grafana (sync latency, queue depth, duplicate rate, conflict rate, convergence time) + pino structured logs + Tempo traces. *Evidence beats claims per the rubric.*
- **Testing:** Vitest (unit), Playwright (offline mode via CDP network emulation + throttling), property tests for convergence (random op permutations → identical final state hash), k6 (load), a chaos harness that kills the network mid-batch.
- **CI:** GitHub Actions → lint, typecheck, unit, e2e-offline, convergence property suite, docker build.

### Deliberate rejections (say these out loud in the demo — judges reward honest trade-offs)
- **Automerge instead of Yjs:** better history model, heavier payloads; Yjs wins for 2G.
- **PouchDB/CouchDB replication:** attractive, but replicating whole documents then reconciling app-level semantics pushes conflicts to the wrong layer.
- **Server-authoritative CRUD + "offline cache":** this is the bug the brief is testing for.
- **Vector clocks per record:** HLC + version vectors for docs is simpler and sufficient; per-record vector clocks blow up in metadata size.
- **Firebase/Firestore:** offline support exists but sync semantics, exam integrity and audit requirements need our own server.

---

## 5. What the demo must prove (mapped to the judging rubric)

| Rubric (weight) | Proof in the demo |
|---|---|
| Technical implementation (25%) | Working three-tier system; typed sync protocol; op-log dedupe index visible; architecture diagram matches code |
| Problem-solving depth (20%) | The twist: two offline co-editors converge with zero keystrokes lost; conflict inbox for semantics; delta sync math shown |
| Reliability & security (20%) | Submit 5× → 1 attempt; kill network mid-upload → resumes; exam chain verified + nonce replay rejected; signed packages |
| Innovation (15%) | Merge ladder + immutable conflict ledger ("no silent loss" as a testable invariant); integrity ledger without surveillance |
| Usability & accessibility (10%) | Honest status pill, Sync Center, keyboard-navigable conflict inbox, AA contrast, 320px responsive |
| Demonstration & validation (10%) | Convergence property tests, chaos test report, live metrics dashboard, stated limitations |

**Demo script (7 minutes):** load course online (watch prefetch) → **wifi off** → read lesson, write assignment, submit → **kill app, reopen** (work persists) → two devices co-edit the same doc offline → second device submits the same assignment twice → **wifi on** → watch batches drain, convergence, conflict inbox appears for a genuinely contested edit → resolve it, show both versions still in history → open Sync Center + metrics → exam flow with tamper-evident log → state limitations.

### Honest limitations to state
Prototype uses one course and two roles; exam monitoring is integrity-focused (no proctoring); conflict inbox resolution is manual (policy engine is a follow-on); Postgres is single-node (no HA story); media GC is reference-counted but not production-hardened; accessibility tested on core flows only.

---

## 6. Build plan (48 h)

| Hours | Milestone | Exit criterion |
|---|---|---|
| 0–6 | Skeleton: monorepo, docker compose, Postgres/Redis/MinIO, auth, seeded course/lessons | app runs, login works |
| 6–16 | Local persistence + read path: SQLite-WASM adapter, op log, prefetch, service worker, offline lesson reading | app works fully with network off |
| 16–26 | Sync engine: push/pull, HLC, dedupe index, backoff, state machine, Sync Center UI | restart-persistent queue; reconnect drains |
| 26–34 | Assignments + submissions: drafts, idempotent attempts, receipts, deadline policy | 5 submits → 1 attempt, proven by test |
| 34–42 | CRDT docs: Yjs rooms, presence, offline co-edit, conflict ledger + inbox | 2 offline editors converge byte-identically |
| 42–46 | Exam: sealed package, monotonic timer, hash chain, server verification + flags | tamper test flags, clean test passes |
| 46–48 | Hardening: chaos test, convergence property suite, metrics dashboard, demo dry-run, README | rubric evidence collected |

---

## 7. Visuals required (deliverables)

1. `assets/diagrams/01-architecture.png` — three-tier system + reconciliation spine.
2. `assets/diagrams/02-sync-sequence.png` — two offline devices reconnecting; push/pull/merge; convergence.
3. `assets/diagrams/03-conflict-ladder.png` — L0–L4 merge ladder ending in Conflict Inbox.
4. `assets/diagrams/04-sync-state-machine.png` — device sync states + backoff.
5. `assets/diagrams/05-exam-integrity.png` — sealed package → local chain → verify → flag/review.
6. `assets/mockups/01-library.png` — lesson library, offline-ready chips, storage meter.
7. `assets/mockups/02-assignment.png` — assignment workspace, autosave, queued ops, offline pill.
8. `assets/mockups/03-conflict-inbox.png` — two-pane diff, keep mine/theirs/merge, "nothing is lost".
9. `assets/mockups/04-sync-center.png` — queue, per-op status, backoff countdown, state machine.
10. `assets/mockups/05-exam.png` — sealed exam, timer, integrity chain indicator, offline notice.
11. `assets/mockups/06-instructor.png` — submissions table with integrity flags + human review queue.
12. `assets/00-overview.png` — one-slide executive summary.
