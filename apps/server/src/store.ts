import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { canonicalJson, parseHlc } from '@edusync/protocol';

/** Small write-side helpers shared by sync.ts and the HTTP routes. */

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Human label for an HLC: ISO time + device node (used on conflict panes). */
export function describeHlc(hlc: string): string {
  try {
    const parts = parseHlc(hlc);
    const iso = new Date(parts.physical).toISOString();
    return `${iso} · ${parts.node || 'unknown device'}`;
  } catch {
    return hlc;
  }
}

export function sameHlcNode(a: string, b: string): boolean {
  try {
    return parseHlc(a).node === parseHlc(b).node;
  } catch {
    return false;
  }
}

/**
 * Allocate the next per-user change seq and append the materialised record.
 * Must be called inside a transaction.
 */
export function appendChange(
  db: DatabaseSync,
  userId: string,
  entity: 'draft' | 'lesson_progress' | 'submission',
  entityId: string,
  rev: number,
  payload: unknown,
): number {
  const row = db.prepare('SELECT next_seq FROM user_seq WHERE user_id = ?').get(userId) as
    | { next_seq: number }
    | undefined;
  const seq = Number(row?.next_seq ?? 0) + 1;
  db.prepare(
    `INSERT INTO user_seq (user_id, next_seq) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET next_seq = excluded.next_seq`,
  ).run(userId, seq);
  db.prepare(
    `INSERT INTO changes (user_id, seq, entity, entity_id, rev, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, seq, entity, entityId, rev, JSON.stringify(payload), new Date().toISOString());
  return seq;
}

/** Highest seq allocated for a user (0 when the feed is empty). */
export function lastSeq(db: DatabaseSync, userId: string): number {
  const row = db.prepare('SELECT next_seq FROM user_seq WHERE user_id = ?').get(userId) as
    | { next_seq: number }
    | undefined;
  return Number(row?.next_seq ?? 0);
}

/** Append a hash-chained audit event. */
export function appendAudit(
  db: DatabaseSync,
  actor: string,
  action: string,
  subject: string,
  before: unknown,
  after: unknown,
): void {
  const previous = db.prepare('SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1').get() as
    | { hash: string }
    | undefined;
  const prevHash = previous?.hash ?? 'genesis';
  const at = new Date().toISOString();
  const payload = { actor, action, subject, before: before ?? null, after: after ?? null, at };
  const hash = sha256(`${prevHash}|${canonicalJson(payload)}`);
  db.prepare(
    `INSERT INTO audit_events (actor, action, subject, before_json, after_json, prev_hash, hash, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    actor,
    action,
    subject,
    before === undefined ? null : JSON.stringify(before),
    after === undefined ? null : JSON.stringify(after),
    prevHash,
    hash,
    at,
  );
}

/**
 * Deterministic conflict id, derived from the contested content (never from wall-clock
 * time or randomness) so the same contest fingerprints to the same ledger row. That keeps
 * `/sync/state-hash` order-independent — two equivalent push orders must converge.
 */
export function conflictIdFor(
  userId: string,
  entity: string,
  entityId: string,
  field: string,
  leftJson: string,
  rightJson: string,
): string {
  const digest = sha256(`${userId}|${entity}|${entityId}|${field}|${leftJson}|${rightJson}`);
  return `cfl_${digest.slice(0, 26)}`;
}

export interface OpenConflictInput {
  userId: string;
  entity: 'draft' | 'lesson_progress' | 'submission';
  entityId: string;
  field: string;
  left: unknown;
  right: unknown;
  leftLabel: string;
  rightLabel: string;
}

/**
 * Freeze both versions of a contested value. Idempotent by content fingerprint: replaying
 * the same stale op does not duplicate the Review Inbox item. Returns the conflict id.
 * Must be called inside a transaction.
 */
export function openConflict(db: DatabaseSync, input: OpenConflictInput): string {
  const leftJson = canonicalJson(input.left);
  const rightJson = canonicalJson(input.right);
  const id = conflictIdFor(input.userId, input.entity, input.entityId, input.field, leftJson, rightJson);
  const existing = db.prepare('SELECT id FROM conflicts WHERE id = ?').get(id) as { id: string } | undefined;
  if (existing) return id;
  db.prepare(
    `INSERT INTO conflicts
       (id, user_id, entity, entity_id, field, left_json, right_json, left_label, right_label, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
  ).run(
    id,
    input.userId,
    input.entity,
    input.entityId,
    input.field,
    leftJson,
    rightJson,
    input.leftLabel,
    input.rightLabel,
    new Date().toISOString(),
  );
  return id;
}
