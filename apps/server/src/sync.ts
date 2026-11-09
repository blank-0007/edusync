import type { DatabaseSync } from 'node:sqlite';
import {
  canonicalJson,
  compareHlc,
  mergeField,
  parseHlc,
  type ChangeRow,
  type ConflictRecord,
  type DocUpdatePayload,
  type DraftPayload,
  type DraftRecord,
  type Field,
  type LessonProgressPayload,
  type LessonProgressRecord,
  type OpEntity,
  type OpResult,
  type OpStatus,
  type SubmissionPayload,
  type SubmissionRecord,
  type SyncPullResponse,
} from '@edusync/protocol';
import { z } from 'zod';
import type { HybridClock } from '@edusync/protocol';
import { transaction } from './db';
import { applyDocUpdate, docText, pullDocUpdates } from './docs';
import { httpError } from './errors';
import {
  conflictToWire,
  getAssignmentRow,
  getDraftRow,
  getLessonRow,
  getOpLog,
  getProgressRow,
  getSubmissionBySubmissionId,
  getConflictRow,
  listConflictRows,
  listDocumentRows,
  listDraftRows,
  listProgressRows,
  submissionToWire,
  type SubmissionRow,
} from './repos';
import { appendAudit, appendChange, describeHlc, openConflict, sameHlcNode, sha256 } from './store';

/**
 * The reconciliation core (docs/CONTRACT.md §2).
 *
 *  - op_log's primary key on op_id is the dedupe authority: at-least-once transport,
 *    exactly-once effect. A replayed op returns `duplicate` with the original serverRev.
 *  - Per-entity ops are applied in HLC order (the caller sorts the batch; ties are broken
 *    by deviceId, then opId).
 *  - Drafts merge per-field through `mergeField` from the shared protocol package: L0/L2
 *    auto-apply, L4 applies the HLC winner *and* freezes both versions in the conflicts
 *    ledger (nothing is ever silently discarded).
 *  - Submissions are exactly-once via UNIQUE(submission_id) and a single MVP attempt.
 *  - Every applied state change appends a per-user `changes` row (pull cursor).
 *  - `stateHash` hashes a deterministic serialisation of observable state so convergence
 *    can be asserted end-to-end.
 */

export const PULL_LIMIT = 500;

export interface SyncContext {
  db: DatabaseSync;
  clock: HybridClock;
}

export interface Actor {
  userId: string;
  deviceId: string;
}

/** Wire op with an untrusted payload (validated per entity inside applyOp). */
export interface IncomingOp {
  opId: string;
  deviceId: string;
  hlc: string;
  entity: OpEntity;
  entityId: string;
  type: 'create' | 'update' | 'delete' | 'append';
  baseRev: number;
  payload: unknown;
}

/** ---- payload validation (payloads come from untrusted offline clients) ---- */

const draftPayloadSchema = z.object({
  assignmentId: z.string().min(1),
  answer: z.string(),
  answerHlc: z.string().min(1),
  baseAnswerHlc: z.string().min(1).nullable().optional(),
});

const lessonProgressPayloadSchema = z.object({
  lessonId: z.string().min(1),
  percent: z.number().finite().min(0).max(100),
  lastOpenedAt: z.string().min(1),
});

const submissionPayloadSchema = z.object({
  assignmentId: z.string().min(1),
  submissionId: z.string().min(1),
  contentHash: z.string().min(1),
  body: z.string(),
  clientSubmittedAt: z.string().min(1),
});

const docUpdatePayloadSchema = z.object({
  docId: z.string().min(1),
  updateB64: z.string().min(1),
});

type ValidatedPayload = DraftPayload | LessonProgressPayload | SubmissionPayload | DocUpdatePayload;

type PayloadValidation = { ok: true; payload: ValidatedPayload } | { ok: false; reason: string };

function isHlc(value: string): boolean {
  try {
    const parts = parseHlc(value);
    return Number.isFinite(parts.physical) && Number.isFinite(parts.counter) && parts.node.length > 0;
  } catch {
    return false;
  }
}

export function validateOpPayload(op: IncomingOp): PayloadValidation {
  if (!isHlc(op.hlc)) return { ok: false, reason: 'invalid_hlc' };
  if (op.type === 'delete') return { ok: false, reason: 'unsupported_op_type' };
  switch (op.entity) {
    case 'draft': {
      const parsed = draftPayloadSchema.safeParse(op.payload);
      if (!parsed.success) return { ok: false, reason: 'invalid_payload' };
      if (!isHlc(parsed.data.answerHlc)) return { ok: false, reason: 'invalid_hlc' };
      const base = parsed.data.baseAnswerHlc ?? null;
      if (base !== null && !isHlc(base)) return { ok: false, reason: 'invalid_hlc' };
      return {
        ok: true,
        payload: {
          assignmentId: parsed.data.assignmentId,
          answer: parsed.data.answer,
          answerHlc: parsed.data.answerHlc,
          baseAnswerHlc: base,
        },
      };
    }
    case 'lesson_progress': {
      const parsed = lessonProgressPayloadSchema.safeParse(op.payload);
      if (!parsed.success) return { ok: false, reason: 'invalid_payload' };
      return { ok: true, payload: parsed.data };
    }
    case 'submission': {
      const parsed = submissionPayloadSchema.safeParse(op.payload);
      if (!parsed.success) return { ok: false, reason: 'invalid_payload' };
      return { ok: true, payload: parsed.data };
    }
    case 'doc_update': {
      const parsed = docUpdatePayloadSchema.safeParse(op.payload);
      if (!parsed.success) return { ok: false, reason: 'invalid_payload' };
      return { ok: true, payload: parsed.data };
    }
    default:
      return { ok: false, reason: 'unknown_entity' };
  }
}

/** ---- op application ---- */

function rejected(op: IncomingOp, reason: string): OpResult {
  return { opId: op.opId, status: 'rejected', serverRev: 0, reason };
}

function applied(op: IncomingOp, rev: number): OpResult {
  return { opId: op.opId, status: 'applied', serverRev: rev };
}

/**
 * Apply one op. Idempotent by opId. Runs in its own transaction, so a batch is applied
 * atomically per op (a rejected op never poisons its neighbours).
 */
export function applyOp(ctx: SyncContext, actor: Actor, op: IncomingOp): OpResult {
  return transaction(ctx.db, () => {
    const existing = getOpLog(ctx.db, op.opId);
    if (existing) {
      if (existing.status === 'rejected') {
        return {
          opId: op.opId,
          status: 'rejected',
          serverRev: Number(existing.server_rev ?? 0),
          reason: existing.reason ?? 'rejected',
        };
      }
      return {
        opId: op.opId,
        status: 'duplicate',
        serverRev: Number(existing.server_rev ?? 0),
      };
    }

    const validation = validateOpPayload(op);
    const result: OpResult = validation.ok
      ? applyValidatedOp(ctx, actor, op, validation.payload)
      : rejected(op, validation.reason);

    ctx.db
      .prepare(
        `INSERT INTO op_log
           (op_id, user_id, device_id, hlc, entity, entity_id, type, payload_json,
            base_rev, server_rev, status, reason, applied_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        op.opId,
        actor.userId,
        op.deviceId || actor.deviceId,
        op.hlc,
        op.entity,
        op.entityId,
        op.type,
        JSON.stringify(op.payload ?? null),
        Number(op.baseRev ?? 0),
        result.serverRev,
        result.status,
        result.reason ?? null,
        new Date().toISOString(),
      );

    return result;
  });
}

function applyValidatedOp(
  ctx: SyncContext,
  actor: Actor,
  op: IncomingOp,
  payload: ValidatedPayload,
): OpResult {
  switch (op.entity) {
    case 'draft':
      return applyDraft(ctx, actor, op, payload as DraftPayload);
    case 'lesson_progress':
      return applyLessonProgress(ctx, actor, op, payload as LessonProgressPayload);
    case 'submission':
      return applySubmission(ctx, actor, op, payload as SubmissionPayload);
    case 'doc_update':
      return applyDocUpdate(ctx, actor, op, payload as DocUpdatePayload);
    default:
      return rejected(op, 'unknown_entity');
  }
}

/**
 * Same-device writes are causally ordered by construction: a single device cannot edit
 * its own draft concurrently. When a client writes its first op (baseAnswerHlc = null)
 * and the stored value came from that same device, the write is sequential, not a race.
 * Without this, flushing two local edits as one batch would open a bogus conflict.
 */
function effectiveBaseHlc(
  baseAnswerHlc: string | null,
  incomingHlc: string,
  currentHlc: string | undefined,
): string | null {
  if (baseAnswerHlc !== null) return baseAnswerHlc;
  if (!currentHlc) return null;
  return sameHlcNode(incomingHlc, currentHlc) ? currentHlc : null;
}

function applyDraft(
  ctx: SyncContext,
  actor: Actor,
  op: IncomingOp,
  payload: DraftPayload,
): OpResult {
  const db = ctx.db;
  if (!getAssignmentRow(db, payload.assignmentId)) return rejected(op, 'unknown_assignment');

  const current = getDraftRow(db, actor.userId, payload.assignmentId);
  const incoming: Field<string> = { v: payload.answer, hlc: payload.answerHlc };
  const currentField: Field<string> | undefined = current
    ? { v: current.answer, hlc: current.answer_hlc }
    : undefined;
  const base = effectiveBaseHlc(payload.baseAnswerHlc ?? null, incoming.hlc, current?.answer_hlc);
  const outcome = mergeField(incoming, currentField, base);

  // First write for this (student, assignment): L2 in the merge ladder.
  if (!current) {
    const rev = 1;
    db.prepare(
      `INSERT INTO drafts (user_id, assignment_id, answer, answer_hlc, rev, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(actor.userId, payload.assignmentId, outcome.winner.v, outcome.winner.hlc, rev, new Date().toISOString());
    const record: DraftRecord = {
      assignmentId: payload.assignmentId,
      answer: outcome.winner.v,
      answerHlc: outcome.winner.hlc,
      rev,
    };
    appendChange(db, actor.userId, 'draft', payload.assignmentId, rev, record);
    return applied(op, rev);
  }

  // L0: identical value, nothing to materialise (and no seq burned).
  if (outcome.level === 'L0') return applied(op, Number(current.rev));

  const winner = outcome.winner;
  const loser = outcome.loser;
  const unchanged =
    winner.hlc === current.answer_hlc && canonicalJson(winner.v) === canonicalJson(current.answer);
  let rev = Number(current.rev);

  if (!unchanged) {
    rev = Number(current.rev) + 1;
    db.prepare(
      `UPDATE drafts SET answer = ?, answer_hlc = ?, rev = ?, updated_at = ?
         WHERE user_id = ? AND assignment_id = ?`,
    ).run(winner.v, winner.hlc, rev, new Date().toISOString(), actor.userId, payload.assignmentId);
    const record: DraftRecord = {
      assignmentId: payload.assignmentId,
      answer: winner.v,
      answerHlc: winner.hlc,
      rev,
    };
    appendChange(db, actor.userId, 'draft', payload.assignmentId, rev, record);
  }

  let status: OpStatus = 'applied';
  if (outcome.level === 'L4' && loser) {
    // Contested: keep the HLC winner as the materialised value, freeze both sides.
    status = 'conflict';
    openConflict(db, {
      userId: actor.userId,
      entity: 'draft',
      entityId: payload.assignmentId,
      field: 'answer',
      left: { answer: loser.v, hlc: loser.hlc },
      right: { answer: winner.v, hlc: winner.hlc },
      leftLabel: `loser · ${describeHlc(loser.hlc)}`,
      rightLabel: `winner · ${describeHlc(winner.hlc)}`,
    });
    appendAudit(
      db,
      actor.userId,
      'conflict.open',
      `draft:${payload.assignmentId}`,
      { answer: loser.v, hlc: loser.hlc },
      { answer: winner.v, hlc: winner.hlc, reason: outcome.reason },
    );
  }

  return { opId: op.opId, status, serverRev: rev };
}

function applyLessonProgress(
  ctx: SyncContext,
  actor: Actor,
  op: IncomingOp,
  payload: LessonProgressPayload,
): OpResult {
  const db = ctx.db;
  if (!getLessonRow(db, payload.lessonId)) return rejected(op, 'unknown_lesson');

  const current = getProgressRow(db, actor.userId, payload.lessonId);
  if (!current) {
    const rev = 1;
    db.prepare(
      `INSERT INTO lesson_progress (user_id, lesson_id, percent, hlc, rev, last_opened_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(actor.userId, payload.lessonId, Math.round(payload.percent), op.hlc, rev, payload.lastOpenedAt);
    const record: LessonProgressRecord = {
      lessonId: payload.lessonId,
      percent: Math.round(payload.percent),
      hlc: op.hlc,
      rev,
    };
    appendChange(db, actor.userId, 'lesson_progress', payload.lessonId, rev, record);
    return applied(op, rev);
  }

  // LWW by HLC: a later stamp overwrites, a stale replay is acknowledged without effect.
  if (compareHlc(op.hlc, current.hlc) > 0) {
    const rev = Number(current.rev) + 1;
    db.prepare(
      `UPDATE lesson_progress SET percent = ?, hlc = ?, rev = ?, last_opened_at = ?
         WHERE user_id = ? AND lesson_id = ?`,
    ).run(
      Math.round(payload.percent),
      op.hlc,
      rev,
      payload.lastOpenedAt,
      actor.userId,
      payload.lessonId,
    );
    const record: LessonProgressRecord = {
      lessonId: payload.lessonId,
      percent: Math.round(payload.percent),
      hlc: op.hlc,
      rev,
    };
    appendChange(db, actor.userId, 'lesson_progress', payload.lessonId, rev, record);
    return applied(op, rev);
  }

  return applied(op, Number(current.rev));
}

function applySubmission(
  ctx: SyncContext,
  actor: Actor,
  op: IncomingOp,
  payload: SubmissionPayload,
): OpResult {
  const outcome = submitOnce(ctx, actor, payload);
  switch (outcome.kind) {
    case 'created':
      return applied(op, outcome.rev);
    case 'duplicate':
      return { opId: op.opId, status: 'duplicate', serverRev: outcome.rev };
    case 'conflict':
      return {
        opId: op.opId,
        status: 'conflict',
        serverRev: outcome.rev,
        reason: `already_submitted:${outcome.existing.id}`,
      };
    case 'rejected':
      return rejected(op, outcome.reason);
  }
}

/** ---- submissions (exactly-once) ---- */

export type SubmitOutcome =
  | { kind: 'created'; submission: SubmissionRecord; rev: number }
  | { kind: 'duplicate'; submission: SubmissionRecord; rev: number }
  | { kind: 'conflict'; existing: SubmissionRecord; attempted: SubmissionPayload; conflictId: string; rev: number }
  | { kind: 'rejected'; reason: string };

function attemptedSubmission(payload: SubmissionPayload): SubmissionPayload {
  return {
    assignmentId: payload.assignmentId,
    submissionId: payload.submissionId,
    contentHash: payload.contentHash,
    body: payload.body,
    clientSubmittedAt: payload.clientSubmittedAt,
  };
}

/**
 * Exactly-once submission. MUST be called inside a transaction (applyOp already is; the
 * POST /api/submissions route wraps it).
 *
 *  - same submissionId             -> duplicate (safe blind retry)
 *  - different submissionId        -> conflict row, no second attempt row is ever created
 *  - otherwise                     -> one immutable attempt, attempt_no = 1
 */
export function submitOnce(ctx: SyncContext, actor: Actor, payload: SubmissionPayload): SubmitOutcome {
  const db = ctx.db;
  if (!getAssignmentRow(db, payload.assignmentId)) return { kind: 'rejected', reason: 'unknown_assignment' };

  const byKey = getSubmissionBySubmissionId(db, payload.submissionId);
  if (byKey) {
    const existing = submissionToWire(byKey);
    if (byKey.student_id === actor.userId && byKey.assignment_id === payload.assignmentId) {
      appendAudit(
        db,
        actor.userId,
        'submission.duplicate',
        `submission:${payload.submissionId}`,
        null,
        { existingId: byKey.id, absorbed: 'duplicate delivery' },
      );
      return { kind: 'duplicate', submission: existing, rev: Number(byKey.rev) };
    }
    // Same idempotency key, different owner/assignment: never overwrite; freeze both.
    const conflictId = openConflict(db, {
      userId: actor.userId,
      entity: 'submission',
      entityId: payload.submissionId,
      field: 'submission',
      left: existing,
      right: attemptedSubmission(payload),
      leftLabel: `existing submission · ${existing.submissionId}`,
      rightLabel: `colliding key · ${payload.submissionId}`,
    });
    appendAudit(db, actor.userId, 'submission.conflict', `submission:${payload.submissionId}`, existing, attemptedSubmission(payload));
    return { kind: 'conflict', existing, attempted: payload, conflictId, rev: Number(byKey.rev) };
  }

  const existingAttempt = db
    .prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY attempt_no ASC LIMIT 1')
    .get(payload.assignmentId, actor.userId) as SubmissionRow | undefined;

  if (existingAttempt) {
    const existing = submissionToWire(existingAttempt);
    const conflictId = openConflict(db, {
      userId: actor.userId,
      entity: 'submission',
      entityId: payload.submissionId,
      field: 'submission',
      left: existing,
      right: attemptedSubmission(payload),
      leftLabel: `attempt ${existingAttempt.attempt_no} · ${existingAttempt.submission_id}`,
      rightLabel: `rejected new attempt · ${payload.submissionId}`,
    });
    appendAudit(
      db,
      actor.userId,
      'submission.conflict',
      `submission:${payload.submissionId}`,
      existing,
      attemptedSubmission(payload),
    );
    return { kind: 'conflict', existing, attempted: payload, conflictId, rev: Number(existingAttempt.rev) };
  }

  // Server id is derived deterministically from the client's idempotency key, so the
  // state hash does not depend on push order.
  const id = `sub_${payload.submissionId}`;
  const serverReceivedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO submissions
       (id, assignment_id, student_id, attempt_no, submission_id, content_hash, body,
        client_submitted_at, server_received_at, status, rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 1)`,
  ).run(
    id,
    payload.assignmentId,
    actor.userId,
    1,
    payload.submissionId,
    payload.contentHash,
    payload.body,
    payload.clientSubmittedAt,
    serverReceivedAt,
  );
  const record: SubmissionRecord = {
    id,
    assignmentId: payload.assignmentId,
    studentId: actor.userId,
    attemptNo: 1,
    submissionId: payload.submissionId,
    contentHash: payload.contentHash,
    body: payload.body,
    clientSubmittedAt: payload.clientSubmittedAt,
    serverReceivedAt,
    status: 'submitted',
  };
  appendChange(db, actor.userId, 'submission', payload.submissionId, 1, record);
  appendAudit(db, actor.userId, 'submission.create', `submission:${payload.submissionId}`, null, record);
  return { kind: 'created', submission: record, rev: 1 };
}

/** ---- pull / state hash ---- */

export function pullChanges(
  ctx: SyncContext,
  userId: string,
  sinceSeq: number,
  docCursors: Record<string, number> = {},
): SyncPullResponse {
  const db = ctx.db;
  const rows = db
    .prepare(
      `SELECT seq, entity, entity_id, rev, payload_json
         FROM changes WHERE user_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?`,
    )
    .all(userId, sinceSeq, PULL_LIMIT) as {
    seq: number;
    entity: string;
    entity_id: string;
    rev: number;
    payload_json: string;
  }[];

  const changes: ChangeRow[] = rows.map((row) => ({
    seq: Number(row.seq),
    entity: row.entity as OpEntity,
    entityId: row.entity_id,
    rev: Number(row.rev),
    payload: JSON.parse(row.payload_json) as ChangeRow['payload'],
  }));

  const { docUpdates, nextDocCursors } = pullDocUpdates(db, docCursors);

  return {
    changes,
    conflicts: listConflictRows(db, userId).map(conflictToWire),
    nextSeq: changes.length > 0 ? changes[changes.length - 1].seq : sinceSeq,
    docUpdates,
    nextDocCursors,
    serverHlc: ctx.clock.now(),
  };
}

function sortKey(entity: string, entityId: string, id = ''): string {
  return `${entity}\u0000${entityId}\u0000${id}`;
}

/**
 * sha256 over canonicalJson of the observable per-user state: draft rows, lesson progress,
 * submissions and the conflict ledger, deterministically sorted by entity / entity id.
 * Two devices that converge must produce byte-identical hashes, so no arrival-time field
 * (conflict createdAt) is included.
 */
export function stateHash(ctx: SyncContext, userId: string): { seq: number; hash: string } {
  const db = ctx.db;

  const drafts = listDraftRows(db, userId).map((row) => ({
    assignmentId: row.assignment_id,
    answer: row.answer,
    answerHlc: row.answer_hlc,
    rev: Number(row.rev),
  }));

  const lessonProgress = listProgressRows(db, userId).map((row) => ({
    lessonId: row.lesson_id,
    percent: Number(row.percent),
    hlc: row.hlc,
    rev: Number(row.rev),
  }));

  const submissions = (
    db
      .prepare('SELECT * FROM submissions WHERE student_id = ? ORDER BY submission_id ASC')
      .all(userId) as unknown as SubmissionRow[]
  ).map(submissionToWire);

  const conflicts = listConflictRows(db, userId)
    .map(conflictToWire)
    .sort((a, b) => {
      const keyA = sortKey(a.entity, a.entityId, a.id);
      const keyB = sortKey(b.entity, b.entityId, b.id);
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    })
    .map((conflict) => ({
      id: conflict.id,
      entity: conflict.entity,
      entityId: conflict.entityId,
      field: conflict.field,
      leftJson: conflict.leftJson,
      rightJson: conflict.rightJson,
      leftLabel: conflict.leftLabel,
      rightLabel: conflict.rightLabel,
      status: conflict.status,
    }));

  const docs = listDocumentRows(db)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      text: docText(db, row.id),
      seq: Number(row.cursor),
    }));

  const state = { drafts, lessonProgress, submissions, conflicts, docs };
  const seqRow = db.prepare('SELECT next_seq FROM user_seq WHERE user_id = ?').get(userId) as
    | { next_seq: number }
    | undefined;

  return {
    seq: Number(seqRow?.next_seq ?? 0),
    hash: sha256(canonicalJson(state)),
  };
}

/** ---- conflict resolution ---- */

export interface ResolveConflictInput {
  resolution: 'mine' | 'theirs';
  note?: string;
}

export interface ResolveConflictResult {
  conflict: ConflictRecord;
  applied: true;
}

/**
 * Human decision on a frozen conflict.
 *
 * Convention: the conflict row stores `left` (loser / earlier-known version) and `right`
 * (winner / newest version). Resolving `"mine"` applies `right`, `"theirs"` applies
 * `left`; for drafts the chosen answer is written back at a fresh server HLC so a stale
 * replay cannot undo the decision. Submission conflicts are resolved as a recorded
 * decision (exactly-once forbids creating a second attempt). Both versions remain in the
 * audit trail regardless of the resolution.
 */
export function resolveConflict(
  ctx: SyncContext,
  userId: string,
  conflictId: string,
  input: ResolveConflictInput,
): ResolveConflictResult {
  return transaction(ctx.db, () => {
    const row = getConflictRow(ctx.db, conflictId);
    if (!row || row.user_id !== userId) {
      throw httpError(404, 'conflict_not_found', `No conflict with id ${conflictId}.`);
    }
    if (row.status === 'resolved') {
      return { conflict: conflictToWire(row), applied: true };
    }

    const chosenJson = input.resolution === 'mine' ? row.right_json : row.left_json;

    if (row.entity === 'draft') {
      let chosen: { answer?: unknown } = {};
      try {
        chosen = JSON.parse(chosenJson) as { answer?: unknown };
      } catch {
        chosen = {};
      }
      if (typeof chosen.answer === 'string') {
        const current = getDraftRow(ctx.db, userId, row.entity_id);
        const rev = Number(current?.rev ?? 0) + 1;
        // Fresh server HLC: the human decision is causally after every contested version.
        const resolutionHlc = ctx.clock.now();
        ctx.db
          .prepare(
            `INSERT INTO drafts (user_id, assignment_id, answer, answer_hlc, rev, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, assignment_id) DO UPDATE SET
               answer = excluded.answer,
               answer_hlc = excluded.answer_hlc,
               rev = excluded.rev,
               updated_at = excluded.updated_at`,
          )
          .run(
            userId,
            row.entity_id,
            chosen.answer,
            resolutionHlc,
            rev,
            new Date().toISOString(),
          );
        const record: DraftRecord = {
          assignmentId: row.entity_id,
          answer: chosen.answer,
          answerHlc: resolutionHlc,
          rev,
        };
        appendChange(ctx.db, userId, 'draft', row.entity_id, rev, record);
      }
    }

    const resolvedAt = new Date().toISOString();
    ctx.db
      .prepare(`UPDATE conflicts SET status = 'resolved', resolution = ?, note = ?, resolved_at = ? WHERE id = ?`)
      .run(input.resolution, input.note ?? null, resolvedAt, row.id);

    appendAudit(
      ctx.db,
      userId,
      'conflict.resolve',
      `conflict:${row.id}`,
      { status: row.status, resolution: row.resolution },
      {
        resolution: input.resolution,
        note: input.note ?? null,
        appliedSide: input.resolution === 'mine' ? 'right' : 'left',
        resolvedAt,
      },
    );

    const updated = getConflictRow(ctx.db, row.id);
    if (!updated) throw httpError(500, 'internal_error', 'Conflict disappeared during resolution.');
    return { conflict: conflictToWire(updated), applied: true };
  });
}
