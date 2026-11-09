/**
 * Durable local-first sync engine (CONTRACT.md §3).
 *
 *   enqueue(op)  -> persist to `ops` (durable) -> notify subscribers -> flush()
 *   flush()      -> push pending ops oldest-first (<=200/batch) -> apply results -> pull(sinceSeq)
 *   state        -> offline | connecting | syncing | synced | degraded
 *   failures     -> jittered exponential backoff min(30s, 500ms * 2^n) ±25%, retry on online/Retry now
 *
 * Guarantees: un-acked ops are never dropped (they survive reloads); every request is
 * idempotent because ops carry a client-generated ULID opId.
 */
import {
  HybridClock,
  compareHlc,
  parseHlc,
  type ConflictRecord,
  type DocUpdateRecord,
  type Op,
  type OpResult,
} from '@edusync/protocol';
import * as db from '../db';
import type { QueuedOp } from '../db';
import { ApiError, api } from '../api';
import { ensureToken, getAuthState, notifyUnauthorized, subscribeAuth } from '../auth';

export type EngineState = 'offline' | 'connecting' | 'syncing' | 'synced' | 'degraded';

/**
 * The shared-document manager registers itself here (phase 2, CONTRACT.md §D3/D4) so the
 * sync engine can (a) send the per-document cursors with every pull and (b) hand returned
 * Yjs updates to the Y.Doc store. Decoupled via an interface to avoid an import cycle.
 */
export interface DocSyncSource {
  /** Last per-document seq applied on this device, for `pull.docCursors`. */
  getDocCursors(): Record<string, number>;
  /** Apply `docUpdates` / adopt `nextDocCursors` from a pull response (idempotent). */
  applyDocPull(docUpdates: DocUpdateRecord[], nextDocCursors: Record<string, number>): void;
}

export interface SyncStats {
  applied: number;
  duplicate: number;
  conflict: number;
  rejected: number;
}

export interface SyncSnapshot {
  state: EngineState;
  simulateOffline: boolean;
  browserOnline: boolean;
  /** Latest queued ops, oldest (HLC) first. Terminal `rejected` ops are kept for visibility. */
  ops: QueuedOp[];
  /** opIds currently in an in-flight push batch. */
  sending: string[];
  /** Pending = queued + retry (excludes terminal rejected). */
  pending: number;
  conflicts: ConflictRecord[];
  lastSyncAt: number | null;
  lastPushAt: number | null;
  lastPullAt: number | null;
  attempt: number;
  retryAt: number | null;
  retryInMs: number | null;
  lastError: string | null;
  batch: { done: number; total: number } | null;
  flushing: boolean;
  seq: number;
  recordsRev: number;
  stats: SyncStats;
}

export const BATCH_LIMIT = 200;
export const MAX_BACKOFF_MS = 30_000;

/** min(30s, 500ms * 2^n) with ±25% jitter. */
export function backoffDelay(attemptIndex: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** Math.max(0, attemptIndex));
  const jitter = 0.75 + random() * 0.5; // ±25%
  return Math.round(base * jitter);
}

function sortByHlc(a: { hlc: string; opId: string }, b: { hlc: string; opId: string }): number {
  const order = compareHlc(a.hlc, b.hlc);
  return order !== 0 ? order : a.opId < b.opId ? -1 : 1;
}

function toWireOp(op: QueuedOp): Op {
  return {
    opId: op.opId,
    deviceId: op.deviceId,
    hlc: op.hlc,
    entity: op.entity,
    entityId: op.entityId,
    type: op.type,
    baseRev: op.baseRev,
    payload: op.payload,
  };
}

class SyncEngine {
  private inited = false;
  private flushing = false;
  private rerun = false;
  private clock: HybridClock;
  private deviceId = '';
  private userId: string | null = null;

  private ops: QueuedOp[] = [];
  private conflicts: ConflictRecord[] = [];
  private sending: string[] = [];
  private inflight = new Set<string>();
  private state: EngineState = 'connecting';
  private simulateOffline = false;
  private attempt = 0;
  private retryAt: number | null = null;
  private lastError: string | null = null;
  private lastSyncAt: number | null = null;
  private lastPushAt: number | null = null;
  private lastPullAt: number | null = null;
  private seq = 0;
  private recordsRev = 0;
  private batchTotal = 0;
  private stats: SyncStats = { applied: 0, duplicate: 0, conflict: 0, rejected: 0 };
  private retryTimer: number | null = null;
  private tickTimer: number | null = null;
  private listeners = new Set<() => void>();
  private authUnsub: (() => void) | null = null;
  private snapshot: SyncSnapshot;
  private initialized: Promise<void> | null = null;
  private docSource: DocSyncSource | null = null;

  constructor() {
    this.clock = new HybridClock('web');
    this.snapshot = this.buildSnapshot();
  }

  /* ---------------------------------------------------------- lifecycle */

  init(): Promise<void> {
    if (this.initialized) return this.initialized;
    this.initialized = this.doInit();
    return this.initialized;
  }

  private async doInit(): Promise<void> {
    if (this.inited) return;
    this.inited = true;

    const auth = getAuthState();
    this.userId = auth.user?.id ?? null;
    this.deviceId = auth.deviceId || 'web';
    const lastHlc = await db.getMeta<string>('hlc:last');
    this.resetClock(lastHlc);

    this.ops = await db.listOps();
    this.conflicts = await db.listConflicts();
    this.seq = (await db.getMeta<number>('seq')) ?? 0;
    this.lastSyncAt = (await db.getMeta<number>('lastSyncAt')) ?? null;
    this.lastPushAt = (await db.getMeta<number>('lastPushAt')) ?? null;
    this.lastPullAt = (await db.getMeta<number>('lastPullAt')) ?? null;
    this.state = this.pendingCount() > 0 ? 'connecting' : 'connecting';

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.authUnsub = subscribeAuth(this.handleAuthChange);

    this.emit();
    void this.flush(true);
  }

  dispose(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.authUnsub?.();
    this.authUnsub = null;
    this.clearRetryTimer();
  }

  private resetClock(lastHlc: string | null): void {
    let physical = 0;
    let counter = 0;
    if (lastHlc) {
      try {
        const parts = parseHlc(lastHlc);
        physical = parts.physical;
        counter = parts.counter;
      } catch {
        /* corrupt meta: start fresh */
      }
    }
    this.clock = new HybridClock(this.deviceId || 'web', physical, counter + 1);
  }

  /** Read the queue + conflict ledger back from IndexedDB (e.g. after an account switch). */
  private async reloadLocal(): Promise<void> {
    this.ops = await db.listOps();
    this.conflicts = await db.listConflicts();
    this.seq = (await db.getMeta<number>('seq')) ?? 0;
    this.lastSyncAt = (await db.getMeta<number>('lastSyncAt')) ?? null;
    this.recordsRev += 1;
    this.emit();
  }

  /* --------------------------------------------------------- subscribers */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SyncSnapshot => this.snapshot;

  /** Register (or with `null`, unregister) the active document manager. */
  setDocSyncSource(source: DocSyncSource | null): void {
    this.docSource = source;
  }

  hasDocSyncSource(): boolean {
    return this.docSource !== null;
  }

  private buildSnapshot(): SyncSnapshot {
    return {
      state: this.state,
      simulateOffline: this.simulateOffline,
      browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      ops: this.ops,
      sending: this.sending,
      pending: this.pendingCount(),
      conflicts: this.conflicts,
      lastSyncAt: this.lastSyncAt,
      lastPushAt: this.lastPushAt,
      lastPullAt: this.lastPullAt,
      attempt: this.attempt,
      retryAt: this.retryAt,
      retryInMs: this.retryAt === null ? null : Math.max(0, this.retryAt - Date.now()),
      lastError: this.lastError,
      batch:
        this.batchTotal > 0
          ? { done: Math.max(0, this.batchTotal - this.pendingCount()), total: this.batchTotal }
          : null,
      flushing: this.flushing,
      seq: this.seq,
      recordsRev: this.recordsRev,
      stats: { ...this.stats },
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  /* ------------------------------------------------------------ helpers */

  private pendingOps(): QueuedOp[] {
    return this.ops.filter((op) => op.status === 'queued' || op.status === 'retry');
  }

  pendingCount(): number {
    return this.pendingOps().length;
  }

  /** HLC stamp for a new local event; persists the clock watermark for reloads. */
  nowHlc(): string {
    const hlc = this.clock.now();
    void db.setMeta('hlc:last', hlc);
    return hlc;
  }

  getDeviceId(): string {
    return this.deviceId || getAuthState().deviceId;
  }

  /* ------------------------------------------------------------ actions */

  /**
   * Persist an op FIRST (durability), then kick the sync loop. Draft and lesson
   * progress ops are coalesced per entity: a newer value supersedes older un-acked
   * copies (never submitted work — those use the submission entity's idempotency key).
   */
  async enqueue(op: Op): Promise<QueuedOp> {
    if (op.entity === 'draft' || op.entity === 'lesson_progress') {
      const superseded = this.ops.filter(
        (existing) =>
          existing.entity === op.entity &&
          existing.entityId === op.entityId &&
          (existing.status === 'queued' || existing.status === 'retry') &&
          !this.inflight.has(existing.opId),
      );
      for (const old of superseded) await db.deleteOp(old.opId);
      if (superseded.length) {
        const removed = new Set(superseded.map((old) => old.opId));
        this.ops = this.ops.filter((existing) => !removed.has(existing.opId));
      }
    }

    const queued: QueuedOp = {
      ...op,
      status: 'queued',
      attempts: 0,
      queuedAt: Date.now(),
      lastAttemptAt: null,
      nextAttemptAt: null,
      lastError: null,
    };
    await db.putOp(queued);
    this.ops = [...this.ops, queued].sort(sortByHlc);
    void db.setMeta('hlc:last', this.clock.encode());
    this.emit();
    void this.flush();
    return queued;
  }

  async flush(force = false): Promise<void> {
    if (!this.inited) return;
    if (this.flushing) {
      this.rerun = true;
      return;
    }
    if (this.simulateOffline || !this.browserOnline()) {
      this.setState('offline');
      return;
    }
    if (getAuthState().status !== 'signed-in') {
      this.setState('offline');
      return;
    }
    if (!force && this.retryAt !== null && Date.now() < this.retryAt) return;

    this.flushing = true;
    this.clearRetryTimer();
    if (force) {
      this.attempt = 0;
      this.retryAt = null;
    }
    this.sending = [];
    this.batchTotal = this.pendingCount();
    this.state = this.batchTotal > 0 ? 'syncing' : 'connecting';
    this.emit();

    let inFlight: QueuedOp[] = [];
    try {
      const token = await ensureToken();
      if (!token) throw new ApiError(0, 'Connecting to the EduSync server…', { reason: 'no-token' });

      // Push every pending batch, oldest-first. Each op is idempotent, so a batch is
      // safe to re-send after any failure.
      for (;;) {
        const batch = this.pendingOps().slice(0, BATCH_LIMIT);
        if (batch.length === 0) break;
        inFlight = batch;
        this.inflight = new Set(batch.map((op) => op.opId));
        this.sending = batch.map((op) => op.opId);
        this.emit();

        const response = await api.push(token, batch.map(toWireOp));
        const results = new Map<string, OpResult>(response.results.map((row) => [row.opId, row]));

        const acked: string[] = [];
        const rejectedRows: QueuedOp[] = [];
        let conflictsChanged = false;
        let missing = 0;

        for (const op of batch) {
          const result = results.get(op.opId);
          if (!result) {
            missing += 1;
            continue;
          }
          if (result.status === 'applied') {
            this.stats.applied += 1;
            acked.push(op.opId);
          } else if (result.status === 'duplicate') {
            this.stats.duplicate += 1;
            acked.push(op.opId);
          } else if (result.status === 'conflict') {
            this.stats.conflict += 1;
            acked.push(op.opId);
            conflictsChanged = true;
          } else if (result.status === 'rejected') {
            this.stats.rejected += 1;
            rejectedRows.push({
              ...op,
              status: 'rejected',
              attempts: op.attempts + 1,
              lastAttemptAt: Date.now(),
              nextAttemptAt: null,
              lastError: result.reason ?? 'Rejected by the server',
            });
          }
        }

        for (const opId of acked) await db.deleteOp(opId);
        const ackedSet = new Set(acked);
        this.ops = this.ops.filter((op) => !ackedSet.has(op.opId));

        for (const rejected of rejectedRows) {
          await db.putOp(rejected);
          this.ops = this.ops.map((op) => (op.opId === rejected.opId ? rejected : op));
        }

        this.inflight = new Set();
        this.sending = [];
        if (conflictsChanged) {
          try {
            await this.refreshConflicts(token);
          } catch {
            /* the subsequent pull also carries the conflict ledger */
          }
        }
        this.emit();

        if (missing > 0) {
          throw new Error('The server did not acknowledge every op in the batch — retrying');
        }
        if (acked.length === 0 && rejectedRows.length === batch.length) break;
      }

      this.lastPushAt = Date.now();
      await db.setMeta('lastPushAt', this.lastPushAt);
      await this.pull(token);

      this.attempt = 0;
      this.retryAt = null;
      this.lastError = null;
      this.state = 'synced';
      this.emit();
    } catch (error) {
      await this.handleFailure(error, inFlight);
    } finally {
      this.flushing = false;
      this.sending = [];
      this.inflight = new Set();
      this.batchTotal = 0;
      this.emit();
      if (this.rerun) {
        this.rerun = false;
        void this.flush();
      }
    }
  }

  private async pull(token: string): Promise<void> {
    const sinceSeq = this.seq;
    const cursors = this.docSource?.getDocCursors() ?? null;
    const response = await api.pull(token, sinceSeq, cursors ?? undefined);
    const now = Date.now();

    // §D4: apply returned Yjs updates idempotently and adopt the new per-doc cursors.
    // Own-device updates come back too (they are no-ops in Yjs); never drop them here.
    if (this.docSource) {
      const docUpdates = response.docUpdates ?? [];
      const nextDocCursors = response.nextDocCursors ?? {};
      if (docUpdates.length > 0 || Object.keys(nextDocCursors).length > 0) {
        this.docSource.applyDocPull(docUpdates, nextDocCursors);
      }
    }

    if (response.changes && response.changes.length > 0) {
      const rows: db.RecordRow[] = response.changes.map((change) => ({
        key: db.recordKey(change.entity, change.entityId),
        entity: change.entity,
        entityId: change.entityId,
        rev: change.rev,
        payload: change.payload,
        updatedAt: now,
      }));
      await db.putRecords(rows);
      this.recordsRev += 1;
    }

    if (Array.isArray(response.conflicts)) {
      await db.replaceConflicts(response.conflicts);
      this.conflicts = response.conflicts;
    }

    this.seq = Math.max(this.seq, response.nextSeq ?? sinceSeq);
    this.lastSyncAt = now;
    this.lastPullAt = now;
    await db.setMeta('seq', this.seq);
    await db.setMeta('lastSyncAt', now);
    await db.setMeta('lastPullAt', now);
    this.emit();
  }

  /**
   * Pull catch-up outside a flush — used by the document manager after it has loaded the
   * server snapshot, and when a live WebSocket (re)connects. Never throws.
   */
  async pullNow(): Promise<void> {
    if (!this.inited) return;
    if (this.flushing) return; // the in-flight flush finishes with its own pull
    if (this.simulateOffline || !this.browserOnline()) return;
    if (getAuthState().status !== 'signed-in') return;
    const token = await ensureToken();
    if (!token) return;
    try {
      await this.pull(token);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Document catch-up failed';
      this.emit();
    }
  }

  private async handleFailure(error: unknown, inFlight: QueuedOp[]): Promise<void> {
    const message = error instanceof Error ? error.message : 'Sync failed';
    if (error instanceof ApiError && error.isUnauthorized) {
      void notifyUnauthorized();
    }

    this.attempt += 1;
    const delay = backoffDelay(this.attempt - 1);
    const retryAt = Date.now() + delay;
    this.retryAt = retryAt;
    this.lastError = message;

    const inFlightIds = new Set(inFlight.map((op) => op.opId));
    for (const op of this.ops) {
      if (!inFlightIds.has(op.opId) || op.status === 'rejected') continue;
      const updated: QueuedOp = {
        ...op,
        status: 'retry',
        attempts: op.attempts + 1,
        lastAttemptAt: Date.now(),
        nextAttemptAt: retryAt,
        lastError: message,
      };
      await db.putOp(updated);
      this.ops = this.ops.map((existing) => (existing.opId === updated.opId ? updated : existing));
    }

    this.state = 'degraded';
    this.emit();
    this.scheduleRetry(delay);
  }

  private scheduleRetry(delay: number): void {
    this.clearRetryTimer();
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.retryAt = null;
      void this.flush();
    }, delay + 50);
    this.tickTimer = window.setInterval(() => {
      if (this.retryAt !== null) this.emit();
    }, 1000);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /** "Retry now": reset backoff and flush immediately. */
  retryNow(): void {
    if (this.simulateOffline) {
      this.setState('offline');
      return;
    }
    this.attempt = 0;
    this.retryAt = null;
    this.lastError = null;
    this.clearRetryTimer();
    this.emit();
    void this.flush(true);
  }

  /** "Probe now" in the Sync Center — checks the server and refreshes the ledger. */
  async probe(): Promise<void> {
    if (this.simulateOffline) {
      this.setState('offline');
      return;
    }
    const token = await ensureToken();
    if (!token) {
      this.retryNow();
      return;
    }
    try {
      await this.refreshConflicts(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Probe failed';
      this.lastError = message;
      this.emit();
    }
    this.retryNow();
  }

  async refreshConflicts(tokenOverride?: string | null): Promise<ConflictRecord[]> {
    const token = tokenOverride ?? (await ensureToken());
    if (!token) return this.conflicts;
    const response = await api.conflicts(token);
    await db.replaceConflicts(response.conflicts);
    this.conflicts = response.conflicts;
    this.emit();
    return this.conflicts;
  }

  /** Connection simulator (dev/demo): short-circuit all network calls while on. */
  setSimulateOffline(value: boolean): void {
    if (this.simulateOffline === value) return;
    this.simulateOffline = value;
    if (value) {
      this.clearRetryTimer();
      this.retryAt = null;
      this.state = 'offline';
      this.emit();
    } else {
      this.attempt = 0;
      this.retryAt = null;
      this.lastError = null;
      this.state = 'connecting';
      this.emit();
      void this.flush(true);
    }
  }

  isSimulateOffline(): boolean {
    return this.simulateOffline;
  }

  private browserOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }

  private setState(next: EngineState): void {
    if (this.state === next) return;
    this.state = next;
    this.emit();
  }

  private handleOnline = (): void => {
    if (this.simulateOffline) return;
    this.attempt = 0;
    this.retryAt = null;
    this.clearRetryTimer();
    void this.flush(true);
  };

  private handleOffline = (): void => {
    if (this.simulateOffline) return;
    this.clearRetryTimer();
    this.setState('offline');
  };

  private handleAuthChange = (): void => {
    const auth = getAuthState();
    if (auth.deviceId && auth.deviceId !== this.deviceId) {
      this.deviceId = auth.deviceId;
      this.resetClock(null);
    }
    if ((auth.user?.id ?? null) !== this.userId) {
      this.userId = auth.user?.id ?? null;
      void this.reloadLocal();
    }
    if (auth.status === 'signed-out') {
      this.clearRetryTimer();
      this.setState('offline');
      return;
    }
    if (auth.token && !this.flushing && this.state !== 'syncing') {
      this.attempt = 0;
      this.retryAt = null;
      void this.flush(true);
    }
  };
}

export const engine = new SyncEngine();

/** Convenience for pages that need the engine's live op list outside React. */
export function currentOps(): QueuedOp[] {
  return engine.getSnapshot().ops;
}
