/**
 * Shared-document manager (CONTRACT.md addendum v0.2, §D1–D5).
 *
 * One `DocSession` per open document id, owning:
 *   - a Y.Doc with a `Y.Text('content')` (the CRDT — merges are commutative),
 *   - the durable local snapshot in IndexedDB (`docs` store) + the pull cursor,
 *   - the boot sequence: local snapshot -> replay queued doc ops -> GET /api/docs/:id ->
 *     pull catch-up -> WebSocket subscribe,
 *   - local edits: diff-based textarea binding -> one small Yjs update per keystroke group ->
 *     durable `doc_update` op through the sync engine's queue (never fire-and-forget),
 *   - live remote updates from the WebSocket (own-device echoes are ignored: they are
 *     already in the local Y.Doc) and from pull catch-up.
 *
 * Offline rule: every keystroke is written to the Y.Doc *and* to the durable op queue before
 * the network is involved; the snapshot is persisted on a short debounce so a reload while
 * offline restores the exact text even if the server is unreachable.
 */
import * as Y from 'yjs';
import { ulid } from '@edusync/protocol';
import type {
  DocSummary,
  DocUpdatePayload,
  DocUpdateRecord,
  DocWsPresenceMember,
  DocWsServerMessage,
} from '@edusync/protocol';
import * as db from '../db';
import { ApiError, api, docWsUrl } from '../api';
import { ensureToken, getAuthState, getSeedAccount, notifyUnauthorized, subscribeAuth } from '../auth';
import { engine } from '../sync/engine';
import { base64ToBytes, bytesToBase64, tryBase64ToBytes } from './base64';

export const DEFAULT_DOC_ID = 'd_group2';

/** Yjs transaction origins: local edits are the only ones that create ops. */
const ORIGIN_LOCAL = 'edusync:local';
const ORIGIN_REMOTE = 'edusync:remote';
const ORIGIN_BOOTSTRAP = 'edusync:bootstrap';

const SNAPSHOT_DEBOUNCE_MS = 180;
const WS_RECONNECT_MAX_MS = 10_000;
const SERVER_RETRY_MAX_MS = 30_000;

export type DocConnection = 'offline' | 'connecting' | 'live' | 'pull-only';

export interface DocPresenceMember extends DocWsPresenceMember {}

export interface DocMergeEvent {
  at: number;
  updates: number;
  authors: string[];
}

export interface DocSessionSnapshot {
  docId: string;
  title: string;
  courseId: string;
  /** The local IndexedDB snapshot has been read (the editor can render stored text). */
  loaded: boolean;
  /** GET /api/docs/:id succeeded during this session. */
  serverLoaded: boolean;
  text: string;
  cursor: number;
  updateCount: number;
  updatedAt: string | null;
  connection: DocConnection;
  presence: { count: number; members: DocPresenceMember[] };
  /** Set when remote edits were merged into local offline edits (the info strip). */
  merge: DocMergeEvent | null;
  saving: boolean;
  lastSavedAt: number | null;
  /** Human-readable non-fatal problem (server not ready, WS token rejected, …). */
  error: string | null;
}

function emptySnapshot(docId: string): DocSessionSnapshot {
  return {
    docId,
    title: '',
    courseId: '',
    loaded: false,
    serverLoaded: false,
    text: '',
    cursor: 0,
    updateCount: 0,
    updatedAt: null,
    connection: 'offline',
    presence: { count: 0, members: [] },
    merge: null,
    saving: false,
    lastSavedAt: null,
    error: null,
  };
}

function authorName(authorUserId: string, fallback?: string): string {
  if (fallback && fallback.trim()) return fallback;
  return getSeedAccount(authorUserId)?.user.name ?? authorUserId;
}

function delayFor(attempt: number, cap: number, base = 900): number {
  return Math.min(cap, base * 2 ** Math.max(0, attempt));
}

/** React-visible shared document session. */
export class DocSession {
  readonly docId: string;

  private doc: Y.Doc;
  private text: Y.Text;
  private snapshot: DocSessionSnapshot;
  private listeners = new Set<() => void>();

  private cursor = 0;
  private localLoaded = false;
  private initPromise: Promise<void> | null = null;
  private disposed = false;

  /* remote-update bookkeeping (merge detection + de-dupe across WS and pull) */
  private knownSeqs = new Set<number>();
  private knownOrder: number[] = [];
  private offlineEdits = 0;
  private mergeAuthors = new Set<string>();
  private mergeUpdates = 0;

  /* persistence */
  private saveTimer: number | null = null;
  private saveInFlight: Promise<void> | null = null;

  /* network */
  private ws: WebSocket | null = null;
  private wsPingTimer: number | null = null;
  private wsReconnectTimer: number | null = null;
  private wsAttempts = 0;
  private authFailures = 0;
  private pullOnly = false;
  private serverRetryTimer: number | null = null;
  private serverRetryAttempt = 0;
  private serverUnavailable = false;
  private onlineHandler = (): void => this.handleConnectivity();
  private offlineHandler = (): void => this.handleConnectivity();
  private engineUnsub: (() => void) | null = null;
  private authUnsub: (() => void) | null = null;

  constructor(docId: string) {
    this.docId = docId;
    this.doc = new Y.Doc();
    this.text = this.doc.getText('content');
    this.snapshot = emptySnapshot(docId);
    this.doc.on('update', this.handleUpdate);
  }

  /* --------------------------------------------------------- react store */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): DocSessionSnapshot => this.snapshot;

  private emit(patch: Partial<DocSessionSnapshot> = {}): void {
    if (this.disposed) return;
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      text: this.text.toString(),
      cursor: this.cursor,
      presence: this.snapshot.presence,
      merge: this.snapshot.merge,
    };
    for (const listener of this.listeners) listener();
  }

  /* -------------------------------------------------------------- boot */

  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    // 1. Offline-first: the last persisted snapshot is available before any network call.
    try {
      const row = await db.getDocState(this.docId);
      if (row) {
        const bytes = tryBase64ToBytes(row.snapshotB64);
        if (bytes) {
          try {
            Y.applyUpdate(this.doc, bytes, ORIGIN_BOOTSTRAP);
          } catch {
            /* corrupt local snapshot: keep the in-memory doc and let the server repair it */
          }
        }
        this.cursor = Math.max(this.cursor, row.cursor ?? 0);
        this.snapshot = {
          ...this.snapshot,
          title: row.title || this.snapshot.title,
          courseId: row.courseId || this.snapshot.courseId,
          updateCount: row.updateCount ?? 0,
        };
      }
    } catch {
      /* IndexedDB unavailable: still try the network path */
    }
    this.localLoaded = true;

    // 2. Replay locally queued doc ops (durability across reloads; Yjs is idempotent).
    await this.replayQueuedOps();

    this.emit({ loaded: true, text: this.text.toString() });

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    this.engineUnsub = engine.subscribe(this.handleEngineChange);
    this.authUnsub = subscribeAuth(this.handleConnectivity);

    if (!this.canReachServer()) {
      this.emit({ connection: 'offline' });
      return;
    }

    await this.loadServerSnapshot();
    void this.connectWs();
  }

  private async replayQueuedOps(): Promise<void> {
    let ops: Awaited<ReturnType<typeof db.listOps>>;
    try {
      ops = await db.listOps();
    } catch {
      return;
    }
    for (const op of ops) {
      if (op.entity !== 'doc_update' || op.entityId !== this.docId) continue;
      if (op.status === 'rejected') continue;
      const payload = op.payload as DocUpdatePayload;
      if (payload?.docId !== this.docId) continue;
      const bytes = tryBase64ToBytes(payload.updateB64);
      if (!bytes) continue;
      try {
        Y.applyUpdate(this.doc, bytes, ORIGIN_BOOTSTRAP);
      } catch {
        /* a corrupt queued update must not block the document */
      }
    }
  }

  private async loadServerSnapshot(): Promise<void> {
    const token = await ensureToken();
    if (!token) {
      this.emit({ connection: 'offline' });
      return;
    }
    try {
      const response = await api.docSnapshot(token, this.docId);
      const bytes = tryBase64ToBytes(response.snapshotB64);
      if (bytes) {
        try {
          Y.applyUpdate(this.doc, bytes, ORIGIN_BOOTSTRAP);
        } catch {
          this.emit({ error: 'The server snapshot could not be decoded — keeping local text.' });
        }
      }
      // Keep the max: local text may already contain updates newer than this snapshot
      // (queued local ops, or updates we applied via WS/pull moments ago).
      this.cursor = Math.max(this.cursor, response.cursor ?? 0);
      this.snapshot = {
        ...this.snapshot,
        title: response.doc?.title || this.snapshot.title,
        courseId: response.doc?.courseId || this.snapshot.courseId,
        updateCount: Math.max(this.snapshot.updateCount, response.doc?.updateCount ?? 0),
        updatedAt: response.doc?.updatedAt ?? this.snapshot.updatedAt,
        serverLoaded: true,
        error: null,
      };
      this.serverUnavailable = false;
      this.serverRetryAttempt = 0;
      this.emit();
      this.schedulePersist(0);
      // §D3: after setting the cursor, pull to catch up on everything that happened while
      // this device was away, then (re)subscribe for live updates.
      await engine.pullNow();
      this.emit();
    } catch (error) {
      this.handleServerError(error);
    }
  }

  private handleServerError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Could not open the shared document';
    if (error instanceof ApiError && error.status === 404) {
      this.serverUnavailable = true;
      this.emit({
        connection: 'offline',
        error: 'Shared documents are not available on this server yet — the local copy is safe.',
      });
    } else {
      this.emit({ connection: 'offline', error: message });
    }
    if (!this.disposed) this.scheduleServerRetry();
  }

  private scheduleServerRetry(): void {
    if (this.serverRetryTimer !== null) return;
    const delay = delayFor(this.serverRetryAttempt, SERVER_RETRY_MAX_MS);
    this.serverRetryAttempt += 1;
    this.serverRetryTimer = window.setTimeout(() => {
      this.serverRetryTimer = null;
      void this.retryServer();
    }, delay);
  }

  private async retryServer(): Promise<void> {
    if (this.disposed || !this.canReachServer()) return;
    try {
      await this.loadServerSnapshot();
      if (!this.serverUnavailable) {
        this.serverRetryAttempt = 0;
        void this.connectWs();
      }
    } catch {
      /* loadServerSnapshot already schedules the next retry */
    }
  }

  /** Manual "Retry" from the Document page. */
  async retry(): Promise<void> {
    if (this.disposed) return;
    this.clearTimer('server');
    this.serverRetryAttempt = 0;
    this.serverUnavailable = false;
    this.authFailures = 0;
    this.pullOnly = false;
    this.emit({ error: null, connection: this.canReachServer() ? 'connecting' : 'offline' });
    if (!this.canReachServer()) return;
    await this.loadServerSnapshot();
    void this.connectWs();
  }

  /* ------------------------------------------------------ local edits */

  /**
   * Diff-based binding for the textarea: only the changed middle is replaced, so each
   * keystroke produces a tiny Yjs update instead of a whole-document delete+insert.
   */
  setText(next: string): void {
    if (this.disposed) return;
    const current = this.text.toString();
    if (current === next) return;

    let prefix = 0;
    const shortest = Math.min(current.length, next.length);
    while (prefix < shortest && current.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix += 1;

    let suffixCurrent = current.length;
    let suffixNext = next.length;
    while (
      suffixCurrent > prefix &&
      suffixNext > prefix &&
      current.charCodeAt(suffixCurrent - 1) === next.charCodeAt(suffixNext - 1)
    ) {
      suffixCurrent -= 1;
      suffixNext -= 1;
    }

    this.doc.transact(() => {
      if (suffixCurrent > prefix) this.text.delete(prefix, suffixCurrent - prefix);
      const insert = next.slice(prefix, suffixNext);
      if (insert) this.text.insert(prefix, insert);
    }, ORIGIN_LOCAL);
  }

  /** Force a snapshot write (used on blur / before leaving the page). */
  async flush(): Promise<void> {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.persistNow();
  }

  private handleUpdate = (update: Uint8Array, origin: unknown): void => {
    this.schedulePersist();
    if (origin === ORIGIN_LOCAL) {
      // A local edit is visible immediately; durability comes from the op queue.
      if (!this.canReachServer()) this.offlineEdits += 1;
      this.emit();
      void this.enqueueLocalUpdate(update);
      return;
    }
    this.emit();
  };

  private async enqueueLocalUpdate(update: Uint8Array): Promise<void> {
    const auth = getAuthState();
    if (auth.status !== 'signed-in' || !auth.deviceId) return;
    const payload: DocUpdatePayload = {
      docId: this.docId,
      updateB64: bytesToBase64(update),
    };
    const hlc = engine.nowHlc();
    try {
      await engine.enqueue({
        opId: ulid(),
        deviceId: auth.deviceId,
        hlc,
        entity: 'doc_update',
        entityId: this.docId,
        type: 'update',
        baseRev: 0,
        payload,
      });
    } catch {
      // The Y.Doc still holds the text; the next successful enqueue/pull reconciles it.
    }
  }

  /* --------------------------------------------------- remote updates */

  /** Engine hook: apply `docUpdates` from a pull response (§D4). */
  applyDocPull = (docUpdates: DocUpdateRecord[], nextDocCursors: Record<string, number>): void => {
    if (this.disposed) return;
    const myDevice = getAuthState().deviceId;
    let applied = 0;
    for (const record of docUpdates) {
      if (!record || record.docId !== this.docId) continue;
      if (record.authorDeviceId === myDevice) continue; // own echo: already in the Y.Doc
      if (this.knownSeqs.has(record.seq)) continue;
      const bytes = tryBase64ToBytes(record.updateB64);
      if (!bytes) continue;
      try {
        Y.applyUpdate(this.doc, bytes, ORIGIN_REMOTE);
        this.noteRemoteApplied(record.seq, record.authorUserId, '');
        this.snapshot = {
          ...this.snapshot,
          updateCount: this.snapshot.updateCount + 1,
          updatedAt: record.createdAt || this.snapshot.updatedAt,
        };
        applied += 1;
      } catch {
        /* one corrupt broadcast must not break the rest of the batch */
      }
    }

    const nextCursor = nextDocCursors?.[this.docId];
    if (typeof nextCursor === 'number' && nextCursor > this.cursor) {
      this.cursor = nextCursor;
    }
    if (applied > 0 || typeof nextCursor === 'number') {
      this.schedulePersist(0);
      this.emit();
    }
  };

  private noteRemoteApplied(seq: number, authorUserId: string, authorDisplayName: string): void {
    this.knownSeqs.add(seq);
    this.knownOrder.push(seq);
    if (this.knownOrder.length > 4000) {
      const dropped = this.knownOrder.splice(0, this.knownOrder.length - 4000);
      for (const value of dropped) this.knownSeqs.delete(value);
    }
    if (this.offlineEdits > 0) {
      this.mergeUpdates += 1;
      this.mergeAuthors.add(authorName(authorUserId, authorDisplayName));
      this.snapshot = {
        ...this.snapshot,
        merge: {
          at: Date.now(),
          updates: this.mergeUpdates,
          authors: [...this.mergeAuthors],
        },
      };
    }
  }

  clearMerge(): void {
    this.snapshot = { ...this.snapshot, merge: null };
    this.emit();
  }

  /* ------------------------------------------------------------ persist */

  private schedulePersist(delay = SNAPSHOT_DEBOUNCE_MS): void {
    if (!this.localLoaded || this.disposed) return;
    if (this.saveTimer !== null) {
      if (delay > 0) return;
      window.clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.persistNow();
    }, delay);
    if (!this.snapshot.saving) this.emit({ saving: true });
  }

  private async persistNow(): Promise<void> {
    if (!this.localLoaded || this.disposed) return;
    if (this.saveInFlight) {
      this.saveTimer = window.setTimeout(() => {
        this.saveTimer = null;
        void this.persistNow();
      }, SNAPSHOT_DEBOUNCE_MS);
      return;
    }
    const row: db.DocStateRow = {
      docId: this.docId,
      snapshotB64: bytesToBase64(Y.encodeStateAsUpdate(this.doc)),
      cursor: this.cursor,
      title: this.snapshot.title,
      courseId: this.snapshot.courseId,
      updateCount: this.snapshot.updateCount,
      savedAt: Date.now(),
    };
    this.saveInFlight = db
      .putDocState(row)
      .then(() => {
        this.emit({ saving: false, lastSavedAt: row.savedAt });
      })
      .catch(() => {
        this.emit({ saving: false, error: 'Could not save the local document snapshot.' });
      })
      .finally(() => {
        this.saveInFlight = null;
      });
    await this.saveInFlight;
  }

  /* ------------------------------------------------------- websocket */

  private canReachServer(): boolean {
    if (this.disposed) return false;
    if (engine.isSimulateOffline()) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    return getAuthState().status === 'signed-in';
  }

  private connectWs(): void {
    if (this.disposed || this.ws || !this.canReachServer() || this.serverUnavailable) return;
    if (this.wsReconnectTimer !== null) {
      window.clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    this.emit({ connection: 'connecting' });
    void (async () => {
      const token = await ensureToken();
      if (!token || this.disposed || this.ws) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(docWsUrl(token, this.docId));
      } catch {
        this.scheduleWsReconnect();
        return;
      }
      this.ws = socket;
      socket.onopen = () => {
        this.wsAttempts = 0;
        this.authFailures = 0;
        socket.send(JSON.stringify({ type: 'hello', docId: this.docId }));
        this.startPing();
        this.emit({ connection: 'live' });
      };
      socket.onmessage = (event: MessageEvent) => this.handleWsMessage(event.data);
      socket.onerror = () => {
        /* onclose follows */
      };
      socket.onclose = (event: CloseEvent) => {
        this.cleanupWs();
        if (this.disposed) return;
        this.emit({
          connection: this.pullOnly ? 'pull-only' : 'offline',
          presence: { count: 0, members: [] },
        });
        if (event.code === 4401) {
          this.handleWsAuthFailure();
          return;
        }
        if (this.canReachServer()) this.scheduleWsReconnect();
      };
    })();
  }

  private handleWsMessage(raw: unknown): void {
    if (this.disposed) return;
    let message: DocWsServerMessage;
    try {
      message = JSON.parse(String(raw)) as DocWsServerMessage;
    } catch {
      return;
    }
    if (!message || message.type === undefined) return;

    if (message.type === 'hello_ok') {
      if (message.docId !== this.docId) return;
      this.wsAttempts = 0;
      this.pullOnly = false;
      this.emit({ connection: 'live', error: null });
      // Subscribed first, then catch up: both paths are idempotent in Yjs.
      void engine.pullNow();
      return;
    }
    if (message.type === 'presence') {
      if (message.docId !== this.docId) return;
      this.emit({
        presence: {
          count: Math.max(0, message.count ?? message.members?.length ?? 0),
          members: Array.isArray(message.members) ? message.members : [],
        },
      });
      return;
    }
    if (message.type === 'doc_update') {
      this.handleWsDocUpdate(message);
    }
  }

  private handleWsDocUpdate(message: Extract<DocWsServerMessage, { type: 'doc_update' }>): void {
    if (message.docId !== this.docId) return;
    const myDevice = getAuthState().deviceId;
    if (message.authorDeviceId === myDevice) return; // own echo: already applied locally
    if (this.knownSeqs.has(message.seq)) return;
    const bytes = tryBase64ToBytes(message.updateB64);
    if (!bytes) return;
    try {
      Y.applyUpdate(this.doc, bytes, ORIGIN_REMOTE);
    } catch {
      return;
    }
    this.noteRemoteApplied(message.seq, message.authorUserId, message.authorName);
    this.snapshot = {
      ...this.snapshot,
      updateCount: this.snapshot.updateCount + 1,
      updatedAt: new Date().toISOString(),
    };
    this.schedulePersist();
    this.emit();
  }

  private startPing(): void {
    this.stopPing();
    this.wsPingTimer = window.setInterval(() => {
      try {
        this.ws?.send(JSON.stringify({ type: 'ping' }));
      } catch {
        /* closing */
      }
    }, 20_000);
  }

  private stopPing(): void {
    if (this.wsPingTimer !== null) {
      window.clearInterval(this.wsPingTimer);
      this.wsPingTimer = null;
    }
  }

  private scheduleWsReconnect(): void {
    if (this.wsReconnectTimer !== null || this.disposed || !this.canReachServer()) return;
    const delay = delayFor(this.wsAttempts, WS_RECONNECT_MAX_MS);
    this.wsAttempts += 1;
    this.wsReconnectTimer = window.setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWs();
    }, delay);
  }

  private handleWsAuthFailure(): void {
    this.pullOnly = true;
    this.authFailures += 1;
    this.emit({
      connection: 'pull-only',
      error: 'Live collaboration needs a fresh session token — catching up via pull.',
    });
    void notifyUnauthorized();
    const delay = delayFor(this.authFailures, 30_000, 1500);
    this.wsReconnectTimer = window.setTimeout(() => {
      this.wsReconnectTimer = null;
      if (!this.disposed && this.canReachServer()) this.connectWs();
    }, delay);
  }

  private cleanupWs(): void {
    this.stopPing();
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        /* already closed */
      }
    }
  }

  private disconnectWs(): void {
    this.cleanupWs();
    if (this.wsReconnectTimer !== null) {
      window.clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
  }

  /* ------------------------------------------------------- connectivity */

  private handleConnectivity = (): void => {
    if (this.disposed) return;
    if (!this.canReachServer()) {
      this.disconnectWs();
      if (this.serverRetryTimer !== null) {
        window.clearTimeout(this.serverRetryTimer);
        this.serverRetryTimer = null;
      }
      this.emit({ connection: 'offline', presence: { count: 0, members: [] } });
      return;
    }
    if (this.serverUnavailable) {
      this.scheduleServerRetry();
      return;
    }
    void this.connectWs();
    if (!this.snapshot.serverLoaded) void this.loadServerSnapshot();
  };

  private handleEngineChange = (): void => {
    if (this.disposed) return;
    const state = engine.getSnapshot().state;
    if (state === 'synced') {
      // The reconnect pull finished; any remote edits it carried were merged above.
      // Later remote updates are normal live collaboration, not offline merges.
      if (this.snapshot.merge) this.offlineEdits = 0;
      else this.offlineEdits = 0;
      this.emit({ connection: this.ws ? 'live' : this.pullOnly ? 'pull-only' : 'offline' });
      return;
    }
    if (state === 'offline' || state === 'degraded') {
      this.emit({ connection: 'offline' });
    }
  };

  /* ------------------------------------------------------------ teardown */

  private clearTimer(kind: 'server' | 'ws'): void {
    if (kind === 'server' && this.serverRetryTimer !== null) {
      window.clearTimeout(this.serverRetryTimer);
      this.serverRetryTimer = null;
    }
    if (kind === 'ws' && this.wsReconnectTimer !== null) {
      window.clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    // Persist synchronously as far as IndexedDB allows; queued doc ops are already durable.
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    void this.persistNow();
    this.disposed = true;
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    this.engineUnsub?.();
    this.engineUnsub = null;
    this.authUnsub?.();
    this.authUnsub = null;
    this.clearTimer('server');
    this.clearTimer('ws');
    this.disconnectWs();
    this.doc.off('update', this.handleUpdate);
  }
}

/* ---------------------------------------------------------------- registry */

const sessions = new Map<string, DocSession>();

export function getDocSession(docId: string): DocSession {
  const existing = sessions.get(docId);
  if (existing) return existing;
  const session = new DocSession(docId);
  sessions.set(docId, session);
  return session;
}

export function releaseDocSession(docId: string): void {
  const session = sessions.get(docId);
  if (!session) return;
  sessions.delete(docId);
  session.dispose();
}

/** Cached doc summaries, used as an offline fallback for the document list. */
export async function cachedDocSummaries(): Promise<DocSummary[]> {
  try {
    const stored = await db.getCatalog<DocSummary[]>('docs:list');
    if (stored && stored.length > 0) return stored;
  } catch {
    /* ignore */
  }
  try {
    const rows = await db.listDocStates();
    return rows.map((row) => ({
      id: row.docId,
      title: row.title || 'Shared document',
      courseId: row.courseId || '',
      updatedAt: new Date(row.savedAt).toISOString(),
      updateCount: row.updateCount,
    }));
  } catch {
    return [];
  }
}
