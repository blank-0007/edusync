# EduSync MVP — implementation contract (v0.1)

Shared source of truth for `apps/server` and `apps/web`. Both sides MUST match these shapes.
Protocol primitives (`ulid`, `HybridClock`, `mergeField`, types) live in `@edusync/protocol` — import them, do not re-implement.

- **Server**: `http://127.0.0.1:8787`, all routes under `/api`, CORS open for dev.
- **Web**: Vite dev server `http://127.0.0.1:5173`, API base from `import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8787'`.
- **Server DB**: `node:sqlite` (`DatabaseSync`), file `apps/server/data/edusync.db` (env `EDU_DB_PATH`), WAL mode. Schema + seed created idempotently on boot.
- **Server port**: env `PORT` (default 8787). Health: `GET /api/health` -> `{ ok: true, time, serverHlc }`.

Authentication is a dev-grade bearer token:

```
POST /api/auth/login   { "userId": "u_aarav", "deviceId": "<ULID>", "platform": "web" }
  -> { "user": User, "token": "dev.<base64url({userId,deviceId})>", "serverTime": "<ISO>" }
Every other route:  Authorization: Bearer dev.<...>
```

`deviceId` is a client-generated ULID persisted in IndexedDB. The server upserts a `devices` row on login.

Errors: `{ "error": "<code>", "message": "<human readable>", "details"?: unknown }` with 4xx/5xx.

---

## 1. Seed data (exact ids — the web app and e2e tests assume these)

Users:

| id | name | role | email |
|---|---|---|---|
| `u_priya` | Dr. Priya Nair | instructor | priya.nair@university.edu |
| `u_aarav` | Aarav Menon | student | aarav.menon@student.edu |
| `u_yuki` | Yuki Tanaka | student | yuki.tanaka@student.edu |

Course `c_bio201`: code `BIOL 201`, title `Cell Biology`, instructor `u_priya`.

Lessons (`l_1` … `l_6`), in order, each with `title`, `summary`, a few paragraphs of real `body` text, `durationMin`, `media[]`:

1. `l_1` Osmosis and tonicity (9 min, video 9 min + quiz 2)
2. `l_2` Facilitated diffusion: GLUT transporters (11 min)
3. `l_3` Ion pumps and the Na⁺/K⁺ ATPase (14 min, diagram)
4. `l_4` Membrane transport: active vs passive (12 min)
5. `l_5` Lab 3 prep: cell fractionation (7 min, PDF 6 pp)
6. `l_6` Membrane transport problem set (25 min, 12 questions)

Assignment `a_3`: course `c_bio201`, title `Membrane transport worksheet`, points 14, due ~3 days from boot, prompt about the Na⁺/K⁺ ATPase (use the mockup text), rubric:

| id | label | points | hint |
|---|---|---|---|
| `r1` | Pump stoichiometry (3 Na⁺ out : 2 K⁺ in) | 4 | Covered in line 2 |
| `r2` | Links pump current to resting potential | 4 | "electrogenic current" paragraph |
| `r3` | Predicts ouabain effect on Vm | 3 | Needs a table value |
| `r4` | Uses Table 2 concentrations | 3 | Na⁺ and K⁺ quoted; Cl⁻ missing |

---

## 2. Sync model

An op is appended locally first; the client renders immediately and pushes in the background. Types are in `@edusync/protocol`.

```jsonc
op = {
  "opId": "<ULID>", "deviceId": "<ULID>", "hlc": "<HLC>",
  "entity": "draft" | "lesson_progress" | "submission",
  "entityId": "…", "type": "create" | "update",
  "baseRev": 0, "payload": { … }
}
```

`entityId` conventions: `draft` → assignmentId, `lesson_progress` → lessonId, `submission` → the submission's server id is assigned by the server, so `entityId` = the client `submissionId` (temporary id; server maps it).

### Entity rules

**draft** (one per student+assignment). Payload `{ assignmentId, answer, answerHlc, baseAnswerHlc }`.

- Server applies with `mergeField({ v: answer, hlc: answerHlc }, current, baseAnswerHlc)` from the protocol package.
- L0/L2 → update record, status `applied`.
- L4 → update to HLC winner **and** insert a `conflicts` row (left = loser, right = winner), status `conflict` (still applied — nothing is discarded; the loser is preserved in the conflict row and in the audit trail).
- The client must send `baseAnswerHlc` = the `answerHlc` it last received from the server (or `null` on first write).
- Batch order does not matter: the server sorts ops for the same entity by HLC before applying.

**lesson_progress**. Payload `{ lessonId, percent, lastOpenedAt }`. LWW by HLC, status `applied`.

**submission** (exactly-once). Payload `{ assignmentId, submissionId, contentHash, body, clientSubmittedAt }`.

- `UNIQUE(submissions.submission_id)`; duplicate `submissionId` → status `duplicate`, returns the existing `serverRev` (safe blind retry).
- If a *different* `submissionId` already exists for the same student+assignment → status `conflict`, reason `already_submitted:<existingId>`, and insert a `conflicts` row (left = first submission, right = new one). No second attempt row is created.
- Otherwise insert attempt `attempt_no = 1` (MVP: one attempt), status `applied`.

### Endpoints

```
POST /api/sync/push   body { "ops": Op[] }            // ≤ 200 ops, client sends oldest-first
  -> { results: OpResult[], serverHlc, seq }
     OpResult = { opId, status: applied|duplicate|conflict|rejected, serverRev, reason? }

POST /api/sync/pull   body { "sinceSeq": number }
  -> { changes: ChangeRow[], conflicts: ConflictRecord[], nextSeq, serverHlc }
     ChangeRow = { seq, entity, entityId, rev, payload }   // payload: DraftRecord | LessonProgressRecord | SubmissionRecord

GET  /api/sync/state-hash        // per authenticated user, for convergence tests
  -> { seq, hash }               // sha256 of canonicalJson(sorted records incl. conflicts)

GET  /api/conflicts              -> { conflicts: ConflictRecord[] }
POST /api/conflicts/:id/resolve  body { "resolution": "mine" | "theirs", "note"?: string }
  -> { conflict: ConflictRecord, applied: true }
```

`ChangeRow.seq` is a monotonically increasing integer per user; pull returns rows with `seq > sinceSeq` ascending, `nextSeq` = max seq seen (or `sinceSeq` if nothing). Records in `changes` are the materialised current state after the op, so a client can apply them blindly. `state-hash` must cover what a client can observe: draft rows, lesson progress rows, submissions, and conflicts — sorted by `entity` then `entityId`/`id`.

### Catalog endpoints

```
GET /api/me                         -> { user }
GET /api/courses                    -> { courses: { id, code, title, lessonCount }[] }
GET /api/courses/:id                -> { course: Course }            // includes all lessons + bodies (offline cache)
GET /api/assignments                -> { assignments: Assignment[] }
GET /api/assignments/:id            -> { assignment: Assignment, submission: SubmissionRecord | null }
GET /api/submissions/mine           -> { submissions: SubmissionRecord[] }
POST /api/submissions               body { assignmentId, submissionId, contentHash, body, clientSubmittedAt }
   -> 200 { submission, deduped: boolean }
   -> 409 { error: "already_submitted", existing: SubmissionRecord, conflictId } when a *different*
      submissionId already exists for this student+assignment
```

---

## 3. Web app requirements

Local-first store in IndexedDB (`idb`), database `edusync`, stores:

- `meta` (key/value: `token`, `user`, `deviceId`, `seq`, `lastSyncAt`)
- `ops` (keyPath `opId`: queued ops + status/attempts/nextAttemptAt)
- `records` (keyPath `key` = `${entity}:${entityId}`)
- `conflicts` (keyPath `id`)
- `catalog` (keyPath `key`: `course:c_bio201`, `lessons`, `assignment:a_3`)

Sync engine (main thread is fine for MVP; keep it a separate module):

1. `enqueue(op)` → persist to `ops` (durable), notify subscribers, `flush()`.
2. `flush()`: if offline/backoff wait → no-op. Batch pending ops oldest-first (`hlc`), POST `/sync/push`; mark `applied`/`duplicate` → delete from queue; `conflict` → delete from queue + refetch conflicts.
3. Then `pull`: POST `/sync/pull` with `sinceSeq`; upsert records, replace conflicts, update `seq`, `lastSyncAt`.
4. State machine: `offline | connecting | syncing | synced | degraded`; exponential backoff `min(30s, 500ms·2^n)` with ±25% jitter; retry on `online` event and on "Retry now".
5. Never drop un-acked ops. `simulateOffline` toggle (dev UI) must gate network calls so the demo works without killing wifi.

Status pill strings (match the design pack): `Offline · N queued`, `Syncing i/n`, `Synced · just now`, `Degraded · retrying in Ns`, `Needs review · N`.

Pages (React + Router-less state nav is fine):

1. **Library** — course header, "Available offline" chips after prefetch, lesson list, lesson reader (renders cached body), "continue learning" hero, offline banner.
2. **Assignment** — prompt + rubric; textarea autosaving a local draft (debounce ~400ms, enqueue `draft` op); status line `Autosaved HH:MM · N ops queued · retrying in Ns`; Submit → create `submissionId` once, enqueue `submission` op + local receipt (`1 canonical attempt; retries safe`); show receipt/attempt once confirmed.
3. **Sync Center** — state chip, queue table (opId, entity, HLC, attempts, status), devices, last sync, storage note, Retry now, connection simulator.
4. **Review Inbox** — conflicts from `/api/conflicts` + pulled list; two-pane view of left/right JSON strings, resolve mine/theirs via API when online (queued resolution is out of scope).

Also: top bar with user chip, status pill; sidebar nav styled from the design pack (`assets/design.css`, already in the repo — copy tokens into `src/styles.css`, don't import across the workspace from apps/web).

**Dev/demo query flags** (needed for automated screenshots): `?as=u_aarav` auto-login (skip login screen), `?page=library|assignment|sync|review|login`, `?offline=1` start with simulated offline, `?fresh=1` clear local DB.

---

## 4. Acceptance (Lead runs this)

`npm test` (protocol + server unit tests) and `npm run e2e` (HTTP-level smoke) must pass:

1. login as `u_aarav` device A; catalog fetch returns 6 lessons and assignment `a_3`.
2. push the same draft op twice → `applied` then `duplicate`; state-hash unchanged by the duplicate.
3. two draft ops for the same entity pushed out of HLC order → final answer = HLC winner, no conflict.
4. stale draft (baseAnswerHlc older than server's) → status `conflict` + `GET /api/conflicts` has an open item with both versions.
5. submit with the same `submissionId` 5× → exactly one `submissions` row, 1 applied + 4 duplicate; `GET /api/submissions/mine` length 1.
6. submit a second, different `submissionId` → 409/conflict, still one attempt.
7. device A pushes ops [1,2,3]; pull since 0 returns them; pull again since nextSeq returns empty.
8. convergence: two devices of the same user push equivalent op sets in different orders → identical `state-hash`.

Server unit tests must cover the merge ladder, dedupe, and pull cursor directly against the DB. `tools/edusync-demo.sh` (Lead) starts everything for screenshots.

---

## 5. Out of scope for this phase (next phases)

Yjs document co-editing + Conflict Inbox UI for docs, offline exam integrity (sealed packages, hash chains), service-worker app shell, WebSocket realtime presence, Docker/Postgres. Build the record-sync spine first; do not stub these with fake data.

---

# Addendum v0.2 — shared documents (Yjs CRDT)

Phase 2 adds collaborative documents. Text documents are CRDTs (Yjs); the op-log spine is reused so
offline document edits are durable, deduped and replayed exactly like record edits. **One protocol,
two data classes**: records are server-validated facts (recorded in §2), documents are Yjs updates
(merge is commutative, so no keystroke can be lost).

## D1. Seed document

`d_group2` — title `Lab 3 — membrane data (shared)`, course `c_bio201`, created by `u_priya`.
Initial content (Yjs `Y.Text` named `content`, plain text, `\n` separated):

```
Lab 3 — membrane data (group 2)

Protocol: pellet resuspended in NaCl, 25 °C, 10 min.
Control: 0.15 M NaCl; test: 0.30 M NaCl; n = 3.
Observation — 0.30 M NaCl, 10 min:
cells shrank and the pellet cleared slowly in the first minute of centrifugation.
Control (0.15 M NaCl): no volume change; absorbance stable at 0.42 ± 0.01.
Conclusion: water crosses the membrane freely, so lysis depended on the osmotic gradient alone.
```

## D2. Document ops (same `/api/sync/push`)

```jsonc
{
  "opId": "<ULID>", "deviceId": "<ULID>", "hlc": "<HLC>",
  "entity": "doc_update", "entityId": "d_group2", "type": "append",
  "baseRev": 0,
  "payload": { "docId": "d_group2", "updateB64": "<base64 Yjs update>" }
}
```

Server rules:

1. Dedupe by `op_id` exactly like other ops (`duplicate` returns the original `serverRev`).
2. Validate: doc exists and `Y.applyUpdate` succeeds (corrupt update -> `rejected`, never a 500).
3. Assign a per-document monotonic `seq`; persist the update in `doc_updates`, then update the
   document snapshot (`Y.encodeStateAsUpdate` -> base64) and store the state vector.
4. Broadcast to every WebSocket subscriber of that document:
   `{ "type": "doc_update", "docId", "seq", "updateB64", "authorUserId", "authorName", "authorDeviceId" }`.
5. `serverRev` for a doc op = the new per-document `seq`.
6. Result status: `applied | duplicate | rejected`.

`GET /api/sync/state-hash` must additionally include, per document: `{ id, text, seq }`
(`text` = `Y.Text('content').toString()`), sorted by id — this is the convergence assertion.

## D3. Document catalog + snapshot

```
GET /api/docs
  -> { docs: [{ id, title, courseId, updatedAt, updateCount }] }

GET /api/docs/:id
  -> { doc: { id, title, courseId, updatedAt, updateCount },
       snapshotB64: "<base64 Yjs state update>",   // full state
       cursor: number,                              // = latest per-doc seq included in snapshot
       stateVectorB64: "<base64 Yjs state vector>" }
```

Client boot sequence for a document: `GET /api/docs/:id` -> `Y.applyUpdate(doc, snapshotB64)` ->
set `docCursors[id] = cursor` -> pull (`§D4`) to catch up -> subscribe over WebSocket for live updates.
When offline, load the last locally persisted snapshot from IndexedDB and replay any locally queued
`doc_update` ops.

## D4. Pull extension

```
POST /api/sync/pull
  body { sinceSeq, docCursors?: { [docId]: number } }
  -> { changes, conflicts, nextSeq, serverHlc,
       docUpdates: [{ docId, seq, updateB64, authorUserId, authorDeviceId, createdAt }],
       nextDocCursors: { [docId]: number } }
```

- `docUpdates` = updates with `seq > docCursors[docId]`, ascending, capped at 500 total.
- `nextDocCursors` = the client's new cursors (max seq returned, else the requested cursor).
- Clients must apply every returned update to their local `Y.Doc` (idempotent).

## D5. WebSocket (live collaboration when online)

`ws://127.0.0.1:8787/ws?token=<bearer token>&docId=d_group2`

Client -> server:

```jsonc
{ "type": "hello", "docId": "d_group2" }        // subscribe
{ "type": "ping" }                               // keepalive
```

Server -> client:

```jsonc
{ "type": "presence", "docId": "d_group2", "count": 2,
  "members": [{ "userId": "u_aarav", "name": "Aarav Menon", "deviceId": "…" }] }
{ "type": "doc_update", "docId": "d_group2", "seq": 7, "updateB64": "…",
  "authorUserId": "u_yuki", "authorName": "Yuki Tanaka", "authorDeviceId": "…" }
{ "type": "hello_ok", "docId": "d_group2", "cursor": 6 }
```

The WS is **receive-only** (updates are written through the durable op queue, never
fire-and-forget). A client that is offline simply misses broadcasts and catches up via pull. Presence
is computed from the live socket set and is best-effort.

## D6. Acceptance additions (Lead runs `npm run e2e` + `npm run ui`)

- Two devices edit disjoint paragraphs of `d_group2` while offline, then push in either order; both
  converge byte-identically, **both edits are present**, and the server `state-hash` matches.
- Replaying a `doc_update` op returns `duplicate` and does not advance the doc seq.
- A corrupt `updateB64` is `rejected` without breaking the batch.
- `GET /api/docs/:id` snapshot + pull catch-up reproduces the same text as a client that was online
  the whole time.
- UI: two browser contexts, offline edits in both, reconnect -> both editors show the merged text
  and a "Collaborators" presence indicator; nothing typed is lost.
