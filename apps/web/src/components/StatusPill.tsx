import type { SyncSnapshot } from '../sync/engine';
import { fmtAgo } from '../lib/util';

export type PillTone = 'teal' | 'amber' | 'red' | 'green' | 'indigo' | 'grey';

export interface StatusDescriptor {
  text: string;
  tone: PillTone;
  title: string;
}

/**
 * Status pill strings from the contract §3:
 *   Offline · N queued | Syncing i/n | Synced · just now | Degraded · retrying in Ns | Needs review · N
 */
export function describeStatus(sync: SyncSnapshot, now = Date.now()): StatusDescriptor {
  const openConflicts = sync.conflicts.filter((conflict) => conflict.status === 'open').length;
  const retryIn = sync.retryInMs != null ? Math.max(0, Math.ceil(sync.retryInMs / 1000)) : null;

  if (sync.simulateOffline || !sync.browserOnline || sync.state === 'offline') {
    return {
      text: `Offline · ${sync.pending} queued`,
      tone: 'amber',
      title: sync.simulateOffline
        ? 'Simulated offline — network calls are short-circuited'
        : 'Changes are saved on this device and will sync when the connection returns',
    };
  }

  if (sync.state === 'degraded') {
    return {
      text: retryIn != null ? `Degraded · retrying in ${retryIn}s` : 'Degraded · retrying soon',
      tone: 'amber',
      title: sync.lastError ?? 'The server is not reachable; retrying with backoff',
    };
  }

  if (sync.state === 'syncing') {
    const total = sync.batch?.total ?? sync.pending;
    const done = sync.batch ? Math.min(sync.batch.done + 1, total) : 1;
    return {
      text: `Syncing ${done}/${Math.max(1, total)}`,
      tone: 'indigo',
      title: 'Pushing queued operations, oldest first',
    };
  }

  if (sync.state === 'connecting') {
    if (sync.pending > 0) {
      return { text: `Connecting · ${sync.pending} queued`, tone: 'grey', title: 'Establishing a connection to the EduSync server' };
    }
    return { text: 'Connecting…', tone: 'grey', title: 'Connecting to the EduSync server' };
  }

  if (openConflicts > 0) {
    return {
      text: `Needs review · ${openConflicts}`,
      tone: 'red',
      title: 'Contested edits are preserved in the Review Inbox',
    };
  }

  const syncedRecently = sync.lastSyncAt !== null && now - sync.lastSyncAt < 90_000;
  return {
    text: `Synced · ${syncedRecently ? 'just now' : fmtAgo(sync.lastSyncAt, now)}`,
    tone: 'green',
    title: sync.lastSyncAt
      ? `Last successful sync ${fmtAgo(sync.lastSyncAt, now)}`
      : 'Everything on this device is acknowledged',
  };
}

interface StatusPillProps {
  sync: SyncSnapshot;
  onClick?: () => void;
}

/** The top-bar connectivity / sync state pill. */
export function StatusPill({ sync, onClick }: StatusPillProps) {
  const { text, tone, title } = describeStatus(sync);
  const className = `pill ${tone} status-pill`;
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={title} aria-label={`Sync status: ${text}`}>
        <span className="dot" aria-hidden="true" />
        <span>{text}</span>
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      <span className="dot" aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}
