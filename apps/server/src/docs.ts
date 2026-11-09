import type { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';
import type {
  DocSnapshotResponse,
  DocSummary,
  DocUpdatePayload,
  DocUpdateRecord,
  DocWsPresenceMember,
  DocWsServerMessage,
  OpResult,
} from '@edusync/protocol';
import { getDocumentRow, getUser, listDocUpdateRows, listDocumentRows, type DocumentRow } from './repos';
import { appendAudit } from './store';
import type { Actor, IncomingOp, SyncContext } from './sync';

/**
 * Server-side collaborative document engine (Yjs CRDT).
 *
 * Implements docs/CONTRACT.md addendum v0.2:
 *  - In-memory Y.Doc cache backed by snapshot_b64 in the `documents` table.
 *  - Sequential doc_updates log: each update gets a monotonic per-document seq.
 *  - Dedupe by op_id: replayed ops return 'duplicate' with the existing seq.
 *  - Corrupt or invalid updates return 'rejected' without crashing the batch.
 *  - Real-time WebSocket room and presence broadcast.
 */

// Global document cache in memory (docId -> Y.Doc)
const docCache = new Map<string, Y.Doc>();

export function clearDocCache(): void {
  docCache.clear();
}

export function getOrLoadYDoc(db: DatabaseSync, docId: string, row?: DocumentRow): Y.Doc {
  let doc = docCache.get(docId);
  if (doc) return doc;

  const docRow = row ?? getDocumentRow(db, docId);
  doc = new Y.Doc();
  if (docRow && docRow.snapshot_b64) {
    try {
      const bytes = new Uint8Array(Buffer.from(docRow.snapshot_b64, 'base64'));
      Y.applyUpdate(doc, bytes);
    } catch {
      /* ignore load error, doc remains empty */
    }
  }
  docCache.set(docId, doc);
  return doc;
}

/** Get current text content of a document. */
export function docText(db: DatabaseSync, docId: string): string {
  const row = getDocumentRow(db, docId);
  if (!row) return '';
  const ydoc = getOrLoadYDoc(db, docId, row);
  return ydoc.getText('content').toString();
}

/** List all documents summary. */
export function listDocs(db: DatabaseSync): DocSummary[] {
  return listDocumentRows(db).map((row) => ({
    id: row.id,
    title: row.title,
    courseId: row.course_id,
    updatedAt: row.updated_at,
    updateCount: Number(row.update_count),
  }));
}

/** Return the latest snapshot for catching up a client. */
export function getDocSnapshot(db: DatabaseSync, docId: string): DocSnapshotResponse | null {
  const row = getDocumentRow(db, docId);
  if (!row) return null;
  return {
    doc: {
      id: row.id,
      title: row.title,
      courseId: row.course_id,
      updatedAt: row.updated_at,
      updateCount: Number(row.update_count),
    },
    snapshotB64: row.snapshot_b64,
    cursor: Number(row.cursor),
    stateVectorB64: row.state_vector_b64,
  };
}

/**
 * Apply one Yjs document update op.
 */
export function applyDocUpdate(
  ctx: SyncContext,
  actor: Actor,
  op: IncomingOp,
  payload: DocUpdatePayload,
): OpResult {
  const db = ctx.db;
  const docRow = getDocumentRow(db, payload.docId);
  if (!docRow) {
    return { opId: op.opId, status: 'rejected', serverRev: 0, reason: 'unknown_document' };
  }

  // Dedupe check
  const existingUpdate = db.prepare('SELECT seq FROM doc_updates WHERE op_id = ?').get(op.opId) as
    | { seq: number }
    | undefined;
  if (existingUpdate) {
    return {
      opId: op.opId,
      status: 'duplicate',
      serverRev: Number(existingUpdate.seq),
    };
  }

  // Parse and validate base64
  let updateBytes: Uint8Array;
  try {
    const buf = Buffer.from(payload.updateB64, 'base64');
    if (buf.length === 0 && payload.updateB64.trim() !== '') {
      throw new Error('invalid base64');
    }
    updateBytes = new Uint8Array(buf);
  } catch {
    return { opId: op.opId, status: 'rejected', serverRev: 0, reason: 'corrupt_base64' };
  }

  const ydoc = getOrLoadYDoc(db, payload.docId, docRow);
  try {
    Y.applyUpdate(ydoc, updateBytes);
  } catch {
    return { opId: op.opId, status: 'rejected', serverRev: 0, reason: 'invalid_yjs_update' };
  }

  const newSeq = Number(docRow.cursor) + 1;
  const newUpdateCount = Number(docRow.update_count) + 1;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO doc_updates
       (doc_id, seq, op_id, device_id, author_user_id, update_b64, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    payload.docId,
    newSeq,
    op.opId,
    op.deviceId || actor.deviceId,
    actor.userId,
    payload.updateB64,
    now,
  );

  const snapshotB64 = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
  const stateVectorB64 = Buffer.from(Y.encodeStateVector(ydoc)).toString('base64');

  db.prepare(
    `UPDATE documents
        SET snapshot_b64 = ?, state_vector_b64 = ?, cursor = ?, update_count = ?, updated_at = ?
      WHERE id = ?`,
  ).run(snapshotB64, stateVectorB64, newSeq, newUpdateCount, now, payload.docId);

  appendAudit(
    db,
    actor.userId,
    'doc.update',
    `doc:${payload.docId}`,
    null,
    { seq: newSeq, opId: op.opId, deviceId: op.deviceId || actor.deviceId },
  );

  const author = getUser(db, actor.userId);
  broadcastToDoc(payload.docId, {
    type: 'doc_update',
    docId: payload.docId,
    seq: newSeq,
    updateB64: payload.updateB64,
    authorUserId: actor.userId,
    authorName: author?.name ?? actor.userId,
    authorDeviceId: op.deviceId || actor.deviceId,
  });

  return { opId: op.opId, status: 'applied', serverRev: newSeq };
}

/** Pull document updates for the given cursors, capped at 500 total updates. */
export function pullDocUpdates(
  db: DatabaseSync,
  docCursors: Record<string, number> = {},
): { docUpdates: DocUpdateRecord[]; nextDocCursors: Record<string, number> } {
  const docs = listDocumentRows(db);
  const nextDocCursors: Record<string, number> = { ...docCursors };
  const docUpdates: DocUpdateRecord[] = [];

  for (const doc of docs) {
    const afterSeq = docCursors[doc.id] ?? 0;
    const remainingLimit = Math.max(0, 500 - docUpdates.length);
    if (remainingLimit === 0) break;

    const rows = listDocUpdateRows(db, doc.id, afterSeq, remainingLimit);
    let maxSeq = afterSeq;
    for (const row of rows) {
      if (row.seq > maxSeq) maxSeq = row.seq;
      docUpdates.push({
        docId: row.doc_id,
        seq: Number(row.seq),
        updateB64: row.update_b64,
        authorUserId: row.author_user_id,
        authorDeviceId: row.device_id,
        createdAt: row.created_at,
      });
    }
    nextDocCursors[doc.id] = maxSeq;
  }

  return { docUpdates, nextDocCursors };
}

/* -------------------------------------------------------------------------- */
/*                            WebSocket Realtime Rooms                        */
/* -------------------------------------------------------------------------- */

export interface WsClient {
  send(data: string): void;
  readyState: number;
}

export interface DocSubscriber {
  client: WsClient;
  userId: string;
  name: string;
  deviceId: string;
  docId: string;
}

const docRooms = new Map<string, Set<DocSubscriber>>();

function sendWs(client: WsClient, msg: DocWsServerMessage): void {
  try {
    if (client.readyState === 1) {
      client.send(JSON.stringify(msg));
    }
  } catch {
    /* socket closed */
  }
}

export function broadcastToDoc(docId: string, msg: DocWsServerMessage): void {
  const room = docRooms.get(docId);
  if (!room) return;
  for (const sub of room) {
    sendWs(sub.client, msg);
  }
}

function broadcastPresence(docId: string): void {
  const room = docRooms.get(docId);
  if (!room) return;
  const members: DocWsPresenceMember[] = Array.from(room).map((s) => ({
    userId: s.userId,
    name: s.name,
    deviceId: s.deviceId,
  }));
  const msg: DocWsServerMessage = {
    type: 'presence',
    docId,
    count: room.size,
    members,
  };
  for (const sub of room) {
    sendWs(sub.client, msg);
  }
}

export function joinDocRoom(
  client: WsClient,
  docId: string,
  user: { id: string; name: string },
  deviceId: string,
  db: DatabaseSync,
): DocSubscriber {
  let room = docRooms.get(docId);
  if (!room) {
    room = new Set();
    docRooms.set(docId, room);
  }

  const sub: DocSubscriber = {
    client,
    userId: user.id,
    name: user.name,
    deviceId,
    docId,
  };
  room.add(sub);

  const docRow = getDocumentRow(db, docId);
  const cursor = Number(docRow?.cursor ?? 0);

  // Send hello_ok
  sendWs(client, { type: 'hello_ok', docId, cursor });

  // Broadcast presence to all subscribers in the room
  broadcastPresence(docId);

  return sub;
}

export function leaveDocRoom(sub: DocSubscriber): void {
  const room = docRooms.get(sub.docId);
  if (!room) return;
  room.delete(sub);
  if (room.size === 0) {
    docRooms.delete(sub.docId);
  } else {
    broadcastPresence(sub.docId);
  }
}
