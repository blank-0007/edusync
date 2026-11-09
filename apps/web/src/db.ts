/**
 * Local-first persistence for the EduSync web client.
 *
 * IndexedDB database `edusync` (per CONTRACT.md §3):
 *  - meta      key/value: token, user, deviceId, seq, lastSyncAt, hlc:last, receipt:…
 *  - ops       keyPath `opId`: durable, append-only operation queue + retry bookkeeping
 *  - records   keyPath `key` = `${entity}:${entityId}`: materialised server records
 *  - conflicts keyPath `id`: conflict ledger mirror
 *  - catalog   keyPath `key`: offline course / lessons / assignment cache
 *  - docs      keyPath `docId`: last Yjs snapshot per shared document (phase 2, v2 schema)
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { compareHlc } from '@edusync/protocol';
import type {
  ConflictRecord,
  DraftRecord,
  LessonProgressRecord,
  Op,
  OpEntity,
  SubmissionRecord,
} from '@edusync/protocol';

export const DB_NAME = 'edusync';
/** v2 adds the `docs` store (shared Yjs documents). */
export const DB_VERSION = 2;

export type RecordPayload = DraftRecord | LessonProgressRecord | SubmissionRecord;

export interface RecordRow {
  key: string;
  entity: OpEntity;
  entityId: string;
  rev: number;
  payload: RecordPayload;
  updatedAt: number;
}

export type OpQueueStatus = 'queued' | 'retry' | 'rejected';

/** A queued op: the wire `Op` plus local delivery bookkeeping. */
export interface QueuedOp extends Op {
  status: OpQueueStatus;
  attempts: number;
  queuedAt: number;
  lastAttemptAt: number | null;
  nextAttemptAt: number | null;
  lastError: string | null;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface CatalogRow {
  key: string;
  value: unknown;
  fetchedAt: number;
}

/**
 * Locally persisted Yjs document snapshot (phase 2, CONTRACT.md §D3).
 * The snapshot is a full `Y.encodeStateAsUpdate` of the document; `cursor` is the last
 * per-document server seq included in it. The doc summary fields let the Document page
 * render its list/editor chrome before the network answers.
 */
export interface DocStateRow {
  docId: string;
  /** base64 of a full Yjs state update. */
  snapshotB64: string;
  /** Last per-document seq applied on this device. */
  cursor: number;
  title: string;
  courseId: string;
  updateCount: number;
  /** Wall-clock of the last local write to this snapshot. */
  savedAt: number;
}

interface EduSyncDB extends DBSchema {
  meta: { key: string; value: MetaRow };
  ops: { key: string; value: QueuedOp };
  records: { key: string; value: RecordRow };
  conflicts: { key: string; value: ConflictRecord };
  catalog: { key: string; value: CatalogRow };
  docs: { key: string; value: DocStateRow };
}

let dbPromise: Promise<IDBPDatabase<EduSyncDB>> | null = null;

export function open(): Promise<IDBPDatabase<EduSyncDB>> {
  if (!dbPromise) {
    dbPromise = openDB<EduSyncDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('ops')) db.createObjectStore('ops', { keyPath: 'opId' });
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('conflicts')) db.createObjectStore('conflicts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('catalog')) db.createObjectStore('catalog', { keyPath: 'key' });
        // v1 -> v2: existing installs keep every store; only `docs` is added.
        if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'docId' });
      },
    });
  }
  return dbPromise;
}

/** Wipe the whole local database (`?fresh=1`). Used before `open()` on boot. */
export async function deleteDatabase(): Promise<void> {
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      /* noop */
    }
    dbPromise = null;
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/* ------------------------------------------------------------------ meta */

export async function getMeta<T>(key: string): Promise<T | null> {
  const row = await (await open()).get('meta', key);
  return row ? (row.value as T) : null;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await open()).put('meta', { key, value });
}

export async function delMeta(key: string): Promise<void> {
  await (await open()).delete('meta', key);
}

/* ------------------------------------------------------------------- ops */

export async function putOp(op: QueuedOp): Promise<void> {
  await (await open()).put('ops', op);
}

export async function getOp(opId: string): Promise<QueuedOp | undefined> {
  return (await open()).get('ops', opId);
}

export async function deleteOp(opId: string): Promise<void> {
  await (await open()).delete('ops', opId);
}

/** All queued ops, oldest first (HLC causal order, opId tiebreak). */
export async function listOps(): Promise<QueuedOp[]> {
  const ops = await (await open()).getAll('ops');
  return ops.sort((a, b) => {
    const order = compareHlc(a.hlc, b.hlc);
    return order !== 0 ? order : a.opId < b.opId ? -1 : 1;
  });
}

export async function clearOps(): Promise<void> {
  await (await open()).clear('ops');
}

/* --------------------------------------------------------------- records */

export function recordKey(entity: OpEntity, entityId: string): string {
  return `${entity}:${entityId}`;
}

export async function putRecord(row: RecordRow): Promise<void> {
  await (await open()).put('records', row);
}

export async function putRecords(rows: RecordRow[]): Promise<void> {
  if (!rows.length) return;
  const db = await open();
  const tx = db.transaction('records', 'readwrite');
  await Promise.all([...rows.map((row) => tx.store.put(row)), tx.done]);
}

export async function getRecordRow(entity: OpEntity, entityId: string): Promise<RecordRow | undefined> {
  return (await open()).get('records', recordKey(entity, entityId));
}

export async function listRecords(): Promise<RecordRow[]> {
  return (await open()).getAll('records');
}

export async function clearRecords(): Promise<void> {
  await (await open()).clear('records');
}

/* ------------------------------------------------------------- conflicts */

export async function listConflicts(): Promise<ConflictRecord[]> {
  return (await open()).getAll('conflicts');
}

export async function replaceConflicts(conflicts: ConflictRecord[]): Promise<void> {
  const db = await open();
  const tx = db.transaction('conflicts', 'readwrite');
  await tx.store.clear();
  await Promise.all([...conflicts.map((c) => tx.store.put(c)), tx.done]);
}

/* --------------------------------------------------------------- catalog */

export async function putCatalog(key: string, value: unknown): Promise<void> {
  await (await open()).put('catalog', { key, value, fetchedAt: Date.now() });
}

export async function getCatalog<T>(key: string): Promise<T | null> {
  const row = await (await open()).get('catalog', key);
  return row ? (row.value as T) : null;
}

export async function getCatalogRow(key: string): Promise<CatalogRow | undefined> {
  return (await open()).get('catalog', key);
}

export async function listCatalog(): Promise<CatalogRow[]> {
  return (await open()).getAll('catalog');
}

/* ------------------------------------------------------------------ docs */

/** Persist the full local Yjs snapshot + cursor for one shared document. */
export async function putDocState(row: DocStateRow): Promise<void> {
  await (await open()).put('docs', row);
}

export async function getDocState(docId: string): Promise<DocStateRow | undefined> {
  return (await open()).get('docs', docId);
}

export async function listDocStates(): Promise<DocStateRow[]> {
  return (await open()).getAll('docs');
}

export async function clearDocStates(): Promise<void> {
  await (await open()).clear('docs');
}
