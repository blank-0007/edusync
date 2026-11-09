import { useEffect, useMemo, useState } from 'react';
import type { Page } from '../flags';
import { useAuth, useSync } from '../state/useEngine';
import { useCatalog } from '../state/useCatalog';
import { engine, MAX_BACKOFF_MS } from '../sync/engine';
import type { QueuedOp } from '../db';
import { Banner } from '../components/Banner';
import { Card, CardHead, MetaRow } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { describeStatus } from '../components/StatusPill';
import {
  cls,
  fmtAgo,
  fmtHlc,
  fmtRetryIn,
  plural,
  shortId,
  storageKb,
} from '../lib/util';

interface SyncCenterPageProps {
  navigate: (page: Page) => void;
}

function opStatusPill(op: QueuedOp, sending: string[]): { tone: string; text: string } {
  if (sending.includes(op.opId)) return { tone: 'indigo', text: 'sending' };
  if (op.status === 'rejected') return { tone: 'red', text: 'rejected' };
  if (op.status === 'retry') {
    const seconds =
      op.nextAttemptAt && op.nextAttemptAt > Date.now()
        ? Math.ceil((op.nextAttemptAt - Date.now()) / 1000)
        : null;
    return { tone: 'amber', text: seconds !== null ? `retry · ${seconds}s` : 'retry' };
  }
  return { tone: 'amber', text: 'queued' };
}

const STATE_STEPS = ['offline', 'connecting', 'syncing', 'synced'] as const;

export function SyncCenterPage({ navigate }: SyncCenterPageProps) {
  const auth = useAuth();
  const sync = useSync();
  const catalog = useCatalog();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const descriptor = describeStatus(sync, now);
  const retrySeconds = sync.retryAt !== null ? Math.max(0, Math.ceil((sync.retryAt - now) / 1000)) : null;
  const retryIn = fmtRetryIn(retrySeconds !== null ? retrySeconds * 1000 : null);
  const openConflicts = sync.conflicts.filter((conflict) => conflict.status === 'open').length;
  const queueKb = useMemo(() => (sync.ops.length ? storageKb(sync.ops) : 0), [sync.ops]);
  const rejectedCount = sync.ops.filter((op) => op.status === 'rejected').length;
  const offline = sync.simulateOffline || !sync.browserOnline || sync.state === 'offline';
  const busy = sync.flushing || sync.state === 'syncing';

  function handleRetry() {
    engine.retryNow();
  }

  function handleProbe() {
    void engine.probe();
  }

  function handleSimulator(next: boolean) {
    engine.setSimulateOffline(next);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="crumbs">
            <span className="eyebrow">Sync &amp; review</span>
            <span className="crumb-sep">/</span>
            <span className="crumbs-current">Sync Center</span>
          </div>
          <div className="sync-title-row">
            <h1 className="page-title">Sync Center</h1>
            <span className={`pill state-pill ${descriptor.tone}`}>
              <span className="dot" aria-hidden="true" />
              {sync.state.toUpperCase()}
            </span>
            <span className="sync-countdown">
              {retrySeconds !== null ? (
                <>
                  <strong>{retrySeconds}s</strong>
                  <span className="tiny muted">until retry</span>
                </>
              ) : (
                <span className="tiny muted">
                  {sync.state === 'syncing'
                    ? `${sync.batch?.done ?? 0}/${sync.batch?.total ?? sync.pending} pushed`
                    : 'no retry scheduled'}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={handleProbe} disabled={offline}>
            <Icon name="refresh" size={14} /> Probe now
          </button>
          <button type="button" className="btn primary" onClick={handleRetry} disabled={offline}>
            <Icon name="uploadCloud" size={14} /> Retry now
          </button>
        </div>
      </header>

      {rejectedCount > 0 ? (
        <Banner tone="red" icon="alertCircle">
          <strong>{plural(rejectedCount, 'op')} were rejected by the server.</strong> They are held as
          terminal failures — never retried in a loop, and never silently dropped. The rest of the queue
          continues to sync; inspect the rows below.
        </Banner>
      ) : null}

      <div className="content-grid sync-grid">
        <div className="stack">
          <Card flush className="queue-card">
            <div className="queue-head">
              <div className="queue-head-left">
                <h2 className="h3">Operation queue</h2>
                <span className={`pill ${sync.pending > 0 ? 'amber' : 'green'} sm`}>
                  <span className="dot" aria-hidden="true" />
                  {sync.pending > 0 ? `${sync.pending} pending` : 'empty'}
                </span>
                <span className="pill grey sm">{queueKb} KB</span>
              </div>
              <div className="queue-head-right">
                <span className={`pill ${sync.flushing ? 'indigo' : 'grey'} sm`}>
                  Queue {sync.ops.length}
                </span>
                <span className="pill outline sm">Retrying {sync.attempt}</span>
                <span className="pill outline sm">Conflicts {openConflicts}</span>
              </div>
            </div>

            {sync.ops.length === 0 ? (
              <EmptyState
                icon="checkCircle"
                title="No pending operations"
                action={
                  <button type="button" className="btn teal" onClick={handleRetry} disabled={offline}>
                    <Icon name="refresh" size={14} /> Probe the server
                  </button>
                }
              >
                Every write on this device has been acknowledged. New edits appear here immediately,
                before the network is involved.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table queue-table">
                  <caption className="visually-hidden">Pending synchronization operations queue</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="col-opid">OpID (ULID)</th>
                      <th scope="col" className="col-entity">Entity</th>
                      <th scope="col" className="col-type">Type</th>
                      <th scope="col" className="col-hlc">HLC</th>
                      <th scope="col" className="col-att">Att.</th>
                      <th scope="col" className="col-status">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sync.ops.map((op) => {
                      const status = opStatusPill(op, sync.sending);
                      return (
                        <tr key={op.opId}>
                          <td className="mono opid-cell" title={op.opId}>
                            {op.opId}
                          </td>
                          <td>
                            <span className="entity-cell">
                              <span className={`pill ${op.entity === 'submission' ? 'indigo' : op.entity === 'draft' ? 'teal' : 'grey'} sm`}>
                                {op.entity}
                              </span>
                              <span className="mono tiny muted entity-id" title={op.entityId}>
                                {shortId(op.entityId, 10)}
                              </span>
                            </span>
                          </td>
                          <td>
                            <span className="pill outline sm">{op.type}</span>
                          </td>
                          <td className="mono hlc-cell" title={op.hlc}>
                            {fmtHlc(op.hlc)}
                          </td>
                          <td className="att-cell">{op.attempts}</td>
                          <td>
                            <span className={`pill ${status.tone} sm`}>
                              <span className="dot" aria-hidden="true" />
                              {status.text}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="queue-foot">
              <span>
                Showing {sync.ops.length} of {sync.ops.length} · oldest-first · batches ≤ 200 ops
              </span>
              <span className="queue-foot-right">
                <Icon name="shield" size={12} /> immutable · ULID-unique · op log survives reload
              </span>
            </div>
          </Card>

          <Card className="state-machine-card">
            <CardHead
              title="State machine"
              icon="sliders"
              badge={
                <span className={`pill ${descriptor.tone}`}>
                  <span className="dot" aria-hidden="true" />
                  {sync.state}
                </span>
              }
            />
            <div className="state-track" role="list" aria-label="Sync engine states">
              {STATE_STEPS.map((step, index) => (
                <div className="state-step-wrap" key={step} role="listitem">
                  {index > 0 ? <span className="state-arrow" aria-hidden="true">→</span> : null}
                  <span className={cls('state-step', sync.state === step && 'current')}>
                    {step.toUpperCase()}
                  </span>
                </div>
              ))}
              <span className="state-arrow" aria-hidden="true">→</span>
              <span className={cls('state-step degraded', sync.state === 'degraded' && 'current')}>
                DEGRADED
              </span>
            </div>
            <p className="tiny muted state-note">
              Requests — not <code>navigator.onLine</code> — decide the state. A timed-out probe moves
              the engine to DEGRADED; held ops are never dropped. Backoff:{' '}
              <code>min(30s, 500ms · 2^n) ± 25%</code> → capped at {MAX_BACKOFF_MS / 1000}s.
            </p>
            <div className="state-meta">
              <span className={`pill ${sync.retryAt !== null ? 'amber' : 'grey'} sm`}>
                {sync.attempt === 0 ? 'attempt 0' : `attempt ${sync.attempt}`}
              </span>
              <span className="pill outline sm">
                {retryIn !== null ? `retry in ${retryIn}` : offline ? 'held while offline' : 'idle'}
              </span>
              <span className="pill outline sm">seq {sync.seq}</span>
              <span className="pill outline sm">
                last sync {sync.lastSyncAt ? fmtAgo(sync.lastSyncAt, now) : 'never'}
              </span>
            </div>
          </Card>
        </div>

        <aside className="rail">
          <Card className="rail-card">
            <CardHead
              title="This device"
              icon="monitor"
              badge={<span className="pill outline sm mono">{shortId(auth.deviceId, 10)}</span>}
            />
            <div className="device-hero">
              <span className="device-icon" aria-hidden="true">
                <Icon name="monitor" size={18} />
              </span>
              <div>
                <div className="device-name">This browser</div>
                <div className="tiny muted">
                  {catalog.cached ? 'BIOL 201 cached · ' : ''}
                  {sync.pending} ops queued
                </div>
              </div>
              {retrySeconds !== null ? (
                <div className="device-countdown">
                  <strong>{retrySeconds}s</strong>
                  <span className="tiny muted">until retry</span>
                </div>
              ) : (
                <span className={`pill ${descriptor.tone} sm`}>{sync.state}</span>
              )}
            </div>
            <div className="rail-list">
              <MetaRow label="Last successful push" value={sync.lastPushAt ? fmtAgo(sync.lastPushAt, now) : 'never'} />
              <MetaRow label="Last successful pull" value={sync.lastPullAt ? fmtAgo(sync.lastPullAt, now) : 'never'} />
              <MetaRow label="Pending upload" value={`${plural(sync.pending, 'op')} · ${queueKb} KB`} />
              <MetaRow label="Failed attempts" value={String(sync.attempt)} tone={sync.attempt > 0 ? 'amber' : 'default'} />
              <MetaRow label="Next automatic retry" value={retryIn !== null ? `in ${retryIn}` : '—'} />
              <MetaRow label="Browser online" value={sync.browserOnline ? 'yes (hint only)' : 'no'} />
            </div>
          </Card>

          <Card className="rail-card">
            <CardHead title="Connection simulator" icon="wifiOff" />
            <div className="simulator-row">
              <div>
                <div className="simulator-title">Simulate offline</div>
                <div className="tiny muted">
                  Short-circuits every network call from the sync engine. Your Wi-Fi stays untouched.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={sync.simulateOffline}
                aria-label="Simulate offline"
                className={cls('switch', sync.simulateOffline && 'on')}
                onClick={() => handleSimulator(!sync.simulateOffline)}
              >
                <span className="switch-knob" />
              </button>
            </div>
            <div className="simulator-state tiny muted">
              <span className={`pill ${offline ? 'amber' : 'green'} sm`}>
                <span className="dot" aria-hidden="true" />
                {offline ? 'Network calls blocked' : 'Network calls allowed'}
              </span>
              <span>{sync.simulateOffline ? 'Demo offline mode is ON' : 'Real network mode'}</span>
            </div>
            <button type="button" className="btn block" onClick={() => navigate('review')}>
              Open Review Inbox <Icon name="arrowRight" size={13} />
            </button>
          </Card>

          <Card className="rail-card">
            <CardHead
              title="De-duplicated pushes are safe"
              icon="shield"
              badge={<span className="pill green sm">at-least-once</span>}
            />
            <div className="rail-list">
              <MetaRow label="Ops applied (session)" value={String(sync.stats.applied)} />
              <MetaRow label="Duplicates absorbed" value={String(sync.stats.duplicate)} />
              <MetaRow label="Conflicts opened" value={String(sync.stats.conflict)} tone={sync.stats.conflict > 0 ? 'amber' : 'default'} />
              <MetaRow label="Rejected ops" value={String(sync.stats.rejected)} tone={sync.stats.rejected > 0 ? 'red' : 'default'} />
            </div>
            <div className="tiny muted rail-note">
              Every op carries a client-generated ULID opId. A repeat push returns{' '}
              <span className="mono">duplicate</span> with the original serverRev — retries are safe
              forever.
            </div>
          </Card>

          <Card className="rail-card">
            <CardHead title="Devices" icon="monitor" badge={<span className="pill grey sm">1</span>} />
            <div className="device-mini">
              <span className="avatar sm" aria-hidden="true">
                {auth.user?.initials ?? '··'}
              </span>
              <div className="device-mini-text">
                <div className="device-name">This browser</div>
                <div className="tiny muted mono">{shortId(auth.deviceId, 16)}</div>
              </div>
              <span className={`pill ${offline ? 'amber' : 'green'} sm`}>
                <span className="dot" aria-hidden="true" />
                {offline ? 'offline' : 'last seen now'}
              </span>
            </div>
            <div className="tiny muted rail-note">
              Each device keeps its own append-only op log; HLC orders writes across devices. Sign in
              from a second browser to watch a merge.
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
