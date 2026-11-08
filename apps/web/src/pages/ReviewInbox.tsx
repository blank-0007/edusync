import { useEffect, useMemo, useState } from 'react';
import type { Page } from '../flags';
import { useAuth, useSync } from '../state/useEngine';
import { engine } from '../sync/engine';
import { api, ApiError } from '../api';
import { Banner } from '../components/Banner';
import { Card, CardHead } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { cls, diffLines, fmtAgo, fmtDateTime, prettyJson } from '../lib/util';
import type { ConflictRecord } from '@edusync/protocol';

interface ReviewInboxPageProps {
  navigate: (page: Page) => void;
}

type ResolveSide = 'mine' | 'theirs';

const ENTITY_TITLES: Record<string, string> = {
  draft: 'Draft answer',
  submission: 'Submission',
  lesson_progress: 'Lesson progress',
};

function conflictTitle(conflict: ConflictRecord): string {
  const entity = ENTITY_TITLES[conflict.entity] ?? conflict.entity;
  return `${entity} · ${conflict.entityId}`;
}

function parseRev(json: string): string | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      if (typeof record.rev === 'number') return `rev ${record.rev}`;
    }
  } catch {
    /* not json */
  }
  return null;
}

export function ReviewInboxPage({ navigate }: ReviewInboxPageProps) {
  const auth = useAuth();
  const sync = useSync();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [busy, setBusy] = useState<ResolveSide | null>(null);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null);

  const offline = sync.simulateOffline || !sync.browserOnline || sync.state === 'offline';
  const canResolve = Boolean(auth.token) && !sync.simulateOffline && sync.browserOnline;

  const conflicts = useMemo(
    () =>
      [...sync.conflicts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [sync.conflicts],
  );
  const openConflicts = conflicts.filter((conflict) => conflict.status === 'open');
  const resolvedConflicts = conflicts.filter((conflict) => conflict.status === 'resolved');
  const visible = filter === 'open' ? openConflicts : conflicts;

  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((conflict) => conflict.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  const selected = conflicts.find((conflict) => conflict.id === selectedId) ?? null;

  async function handleRefresh() {
    try {
      await engine.refreshConflicts();
      setNotice({ tone: 'green', text: 'Conflict ledger refreshed from the server.' });
    } catch (error) {
      setNotice({
        tone: 'red',
        text: error instanceof Error ? error.message : 'Could not refresh conflicts',
      });
    }
  }

  async function handleResolve(resolution: ResolveSide) {
    if (!selected || !auth.token) return;
    setBusy(resolution);
    setNotice(null);
    try {
      // Server mapping: resolution 'mine' applies the RIGHT (incoming) version,
      // 'theirs' applies the LEFT (previous) version.
      await api.resolveConflict(auth.token, selected.id, resolution);
      await engine.refreshConflicts(auth.token);
      setNotice({
        tone: 'green',
        text: `Resolved ${selected.id} — kept version ${resolution === 'theirs' ? 'A (left)' : 'B (right)'}. The decision is recorded with actor, inputs and timestamp.`,
      });
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 0
          ? 'Cannot reach the server — reconnect to resolve. Resolutions are not queued.'
          : error instanceof Error
            ? error.message
            : 'Could not resolve the conflict';
      setNotice({ tone: 'red', text: message });
    } finally {
      setBusy(null);
    }
  }

  const leftText = selected ? prettyJson(selected.leftJson) : '';
  const rightText = selected ? prettyJson(selected.rightJson) : '';
  const diff = useMemo(
    () => (selected ? diffLines(leftText, rightText) : { left: [], right: [] }),
    [selected, leftText, rightText],
  );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="crumbs">
            <span className="eyebrow">Sync &amp; review</span>
            <span className="crumb-sep">/</span>
            <span className="crumbs-current">Review Inbox</span>
          </div>
          <div className="sync-title-row">
            <h1 className="page-title">Conflict Inbox</h1>
            <span className={`pill ${openConflicts.length > 0 ? 'red' : 'green'}`}>
              <span className="dot" aria-hidden="true" />
              {openConflicts.length} open
            </span>
            {resolvedConflicts.length > 0 ? (
              <span className="pill grey sm">{resolvedConflicts.length} resolved</span>
            ) : null}
          </div>
        </div>
        <div className="page-actions">
          <span className="tiny muted hint-inline">
            <Icon name="shield" size={13} /> Both revisions stay recoverable
          </span>
          <button type="button" className="btn" onClick={() => void handleRefresh()} disabled={!canResolve}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
          <button type="button" className="btn" onClick={() => navigate('sync')}>
            <Icon name="refresh" size={14} /> Sync Center
          </button>
        </div>
      </header>

      {notice ? (
        <Banner
          tone={notice.tone}
          icon={notice.tone === 'red' ? 'alertCircle' : notice.tone === 'green' ? 'checkCircle' : 'info'}
        >
          {notice.text}
        </Banner>
      ) : null}

      {offline ? (
        <Banner tone="amber" icon="cloudOff">
          <strong>Offline.</strong> Conflicts are read from the cached ledger. Resolving requires the
          server — the resolution action is deliberately not queued in this phase.
        </Banner>
      ) : null}

      {conflicts.length === 0 ? (
        <Card>
          <EmptyState
            icon="shield"
            title="Nothing contested — the merge ladder held"
            action={
              <button type="button" className="btn teal" onClick={() => navigate('sync')}>
                Open Sync Center <Icon name="arrowRight" size={13} />
              </button>
            }
          >
            Concurrent edits with different values are frozen as immutable artifacts and land here
            instead of being silently overwritten. Identical or causally ordered writes merge
            automatically (L0–L3). When a conflict appears, both versions are kept and a human picks
            the winner — nothing is discarded.
          </EmptyState>
        </Card>
      ) : (
        <div className="review-layout">
          <Card flush className="conflict-queue">
            <div className="queue-head">
              <div className="queue-head-left">
                <h2 className="h3">Queue</h2>
                <span className="pill red sm">{openConflicts.length}</span>
              </div>
              <div className="segmented" role="group" aria-label="Filter conflicts">
                <button
                  type="button"
                  className={cls('segment', filter === 'open' && 'active')}
                  onClick={() => setFilter('open')}
                >
                  Open
                </button>
                <button
                  type="button"
                  className={cls('segment', filter === 'all' && 'active')}
                  onClick={() => setFilter('all')}
                >
                  All
                </button>
              </div>
            </div>
            <div className="conflict-list" role="list">
              {visible.length === 0 ? (
                <EmptyState compact icon="checkCircle" title="No open conflicts">
                  Resolved items remain in history — never deleted.
                </EmptyState>
              ) : (
                visible.map((conflict) => (
                  <button
                    type="button"
                    key={conflict.id}
                    className={cls('conflict-item', conflict.id === selectedId && 'active')}
                    onClick={() => setSelectedId(conflict.id)}
                    aria-current={conflict.id === selectedId ? 'true' : undefined}
                    role="listitem"
                  >
                    <div className="conflict-item-top">
                      <span className="conflict-item-title">{conflictTitle(conflict)}</span>
                      <span className="tiny muted">{fmtAgo(new Date(conflict.createdAt).getTime())}</span>
                    </div>
                    <div className="conflict-item-sub tiny muted">
                      {conflict.field} · {conflict.leftLabel} vs {conflict.rightLabel}
                    </div>
                    <div className="conflict-item-foot">
                      <span className={`pill ${conflict.status === 'open' ? 'red' : 'green'} sm`}>
                        <span className="dot" aria-hidden="true" />
                        {conflict.status === 'open' ? 'Needs review' : 'Resolved'}
                      </span>
                      <span className="mono tiny muted">{conflict.id}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="conflict-queue-foot tiny muted">
              <Icon name="info" size={12} /> Resolved items are archived — never deleted. Every
              resolution writes an audit event.
            </div>
          </Card>

          <div className="conflict-main">
            {selected ? (
              <>
                <Card className="conflict-detail">
                  <div className="conflict-detail-head">
                    <div className="conflict-detail-title">
                      <span className="conflict-entity-icon" aria-hidden="true">
                        <Icon name={selected.entity === 'submission' ? 'fileText' : 'layers'} size={16} />
                      </span>
                      <div>
                        <h2 className="h3">{conflictTitle(selected)}</h2>
                        <div className="tiny muted">
                          Contested field <span className="mono">{selected.field}</span> · detected{' '}
                          {fmtDateTime(selected.createdAt)} · sync engine
                        </div>
                      </div>
                    </div>
                    <div className="conflict-detail-meta">
                      <span className={`pill ${selected.status === 'open' ? 'red' : 'green'} sm`}>
                        {selected.status === 'open' ? 'L4 · human decision' : 'Resolved'}
                      </span>
                      <span className="pill outline sm mono">{selected.id}</span>
                    </div>
                  </div>

                  <Banner tone="red" icon="warning" className="conflict-banner">
                    <strong>Contested edit.</strong> Both revisions were frozen as immutable artifacts
                    ({selected.leftLabel} and {selected.rightLabel}) — nothing was overwritten. Version A
                    is the earlier record held on the server; version B is the incoming edit. Pick a
                    resolution below; the unchosen version stays recoverable from history forever.
                  </Banner>

                  <div className="diff-panes">
                    <div className="diff-pane diff-pane-left">
                      <div className="diff-pane-head">
                        <span className="diff-side-label">Version A · left</span>
                        <span className="tiny muted">{selected.leftLabel}</span>
                        {parseRev(selected.leftJson) ? (
                          <span className="pill outline sm mono">{parseRev(selected.leftJson)}</span>
                        ) : null}
                      </div>
                      <pre className="diff-pane-body mono">
                        {diff.left.map((line, index) => (
                          <span key={index} className={cls('diff-line', line.kind === 'del' && 'del')}>
                            {line.text}
                            {'\n'}
                          </span>
                        ))}
                      </pre>
                    </div>
                    <div className="diff-pane diff-pane-right">
                      <div className="diff-pane-head">
                        <span className="diff-side-label">Version B · right</span>
                        <span className="tiny muted">{selected.rightLabel}</span>
                        {parseRev(selected.rightJson) ? (
                          <span className="pill outline sm mono">{parseRev(selected.rightJson)}</span>
                        ) : null}
                      </div>
                      <pre className="diff-pane-body mono">
                        {diff.right.map((line, index) => (
                          <span key={index} className={cls('diff-line', line.kind === 'add' && 'add')}>
                            {line.text}
                            {'\n'}
                          </span>
                        ))}
                      </pre>
                    </div>
                  </div>

                  <div className="resolve-bar">
                    <div className="resolve-copy">
                      <div className="resolve-title">
                        <Icon name="shield" size={14} /> {selected.status === 'open' ? 'Resolve this conflict' : 'Already resolved'}
                      </div>
                      <div className="tiny muted">
                        {canResolve
                          ? 'Your choice becomes current and is written to the audit ledger. Both versions remain in history.'
                          : 'Resolutions are not queued — reconnect to the server to choose.'}
                      </div>
                    </div>
                    <div className="resolve-actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void handleResolve('theirs')}
                        disabled={!canResolve || busy !== null || selected.status !== 'open'}
                        title="Keep version A (the earlier version on the server)"
                      >
                        <Icon name="check" size={14} />
                        {busy === 'theirs' ? 'Saving…' : 'Keep A (left)'}
                      </button>
                      <button
                        type="button"
                        className="btn teal"
                        onClick={() => void handleResolve('mine')}
                        disabled={!canResolve || busy !== null || selected.status !== 'open'}
                        title="Keep version B (the incoming edit)"
                      >
                        <Icon name="check" size={14} />
                        {busy === 'mine' ? 'Saving…' : 'Keep B (right)'}
                      </button>
                    </div>
                  </div>
                </Card>

                <Card className="retained-card">
                  <div className="retained-icon" aria-hidden="true">
                    <Icon name="shield" size={16} />
                  </div>
                  <div>
                    <div className="retained-title">Both versions are retained in history. Nothing was discarded.</div>
                    <div className="tiny muted">
                      {selected.id} · artifacts frozen at {fmtDateTime(selected.createdAt)} · resolution
                      writes an audit event (actor, inputs, timestamp).
                    </div>
                  </div>
                  <span className="pill teal sm">
                    <span className="dot" aria-hidden="true" />
                    no silent loss
                  </span>
                </Card>
              </>
            ) : (
              <Card>
                <EmptyState compact icon="inbox" title="Select a conflict">
                  Pick an item from the queue to compare the two frozen revisions.
                </EmptyState>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
