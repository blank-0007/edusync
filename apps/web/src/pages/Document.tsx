import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { DocSummary } from '@edusync/protocol';
import type { Page } from '../flags';
import { readFlags, writeDocParam } from '../flags';
import { useAuth, useSync } from '../state/useEngine';
import { useCatalog } from '../state/useCatalog';
import { Banner } from '../components/Banner';
import { Card, CardHead, MetaRow } from '../components/Card';
import { Icon } from '../components/Icon';
import {
  DEFAULT_DOC_ID,
  cachedDocSummaries,
  getDocSession,
  type DocSession,
} from '../docs/docStore';
import { cls, fmtAgo, fmtClock, wordCount } from '../lib/util';
import { api } from '../api';
import { ensureToken } from '../auth';

interface DocumentPageProps {
  navigate: (page: Page) => void;
}

export function DocumentPage({ navigate }: DocumentPageProps) {
  const auth = useAuth();
  const sync = useSync();
  const catalog = useCatalog();

  const [docId, setDocId] = useState<string>(() => {
    const flags = readFlags();
    return flags.doc ?? DEFAULT_DOC_ID;
  });

  const [availableDocs, setAvailableDocs] = useState<DocSummary[]>([]);
  const [docListLoaded, setDocListLoaded] = useState(false);

  const session: DocSession = useMemo(() => getDocSession(docId), [docId]);

  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);

  // Initialize session
  useEffect(() => {
    void session.init();
    return () => {
      // Keep session in memory for quick tab switching, flush pending changes
      void session.flush();
    };
  }, [session]);

  // Load available docs list
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const cached = await cachedDocSummaries();
        if (alive && cached.length > 0) setAvailableDocs(cached);
        const token = await ensureToken();
        if (token && alive) {
          const res = await api.docs(token);
          if (alive && res.docs) setAvailableDocs(res.docs);
        }
      } catch {
        /* fallback to cached docs */
      } finally {
        if (alive) setDocListLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Update URL param when docId changes
  function selectDoc(nextId: string) {
    if (nextId === docId) return;
    void session.flush();
    setDocId(nextId);
    writeDocParam(nextId);
  }

  // Count pending doc ops queued for this document
  const pendingDocOps = sync.ops.filter(
    (op) =>
      op.entity === 'doc_update' &&
      op.entityId === docId &&
      (op.status === 'queued' || op.status === 'retry'),
  ).length;

  const offline = sync.simulateOffline || !sync.browserOnline || snap.connection === 'offline';

  const statusLine = useMemo(() => {
    const parts: string[] = [];
    if (snap.lastSavedAt) parts.push(`Saved on device ${fmtClock(snap.lastSavedAt)}`);
    else if (snap.loaded) parts.push('Saved locally');

    if (pendingDocOps > 0) {
      parts.push(`${pendingDocOps} ${pendingDocOps === 1 ? 'doc op' : 'doc ops'} queued`);
      if (sync.retryInMs != null) parts.push(`retrying in ${Math.ceil(sync.retryInMs / 1000)}s`);
    } else if (snap.connection === 'live') {
      parts.push('live sync active');
    } else if (snap.connection === 'pull-only') {
      parts.push('pull catch-up active');
    } else if (offline) {
      parts.push('offline — edits queued on device');
    }
    return parts.join(' · ');
  }, [snap.lastSavedAt, snap.loaded, snap.connection, pendingDocOps, sync.retryInMs, offline]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    session.setText(e.target.value);
  }

  const course = catalog.course;
  const docTitle = snap.title || (availableDocs.find((d) => d.id === docId)?.title ?? 'Lab 3 — membrane data (shared)');

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="crumbs">
            <button type="button" className="back-link" onClick={() => navigate('library')}>
              <Icon name="arrowLeft" size={14} /> Courses
            </button>
            <span className="crumb-sep">/</span>
            <span className="crumbs-current">Shared documents</span>
            <span className="crumb-sep">/</span>
            <span className="crumbs-current">{docTitle}</span>
          </div>
          <h1 className="page-title">{docTitle}</h1>
        </div>

        <div className="page-actions">
          {snap.presence.count > 0 ? (
            <span className="pill green" title={snap.presence.members.map((m) => m.name).join(', ')}>
              <span className="dot" aria-hidden="true" />
              {snap.presence.count} {snap.presence.count === 1 ? 'collaborator' : 'collaborators'} online
            </span>
          ) : (
            <span className={`pill ${offline ? 'amber' : 'teal'}`}>
              <span className="dot" aria-hidden="true" />
              {offline ? 'Offline editing' : 'Connected'}
            </span>
          )}

          <button type="button" className="btn" onClick={() => navigate('sync')}>
            <Icon name="refresh" size={14} /> Sync Center
          </button>
        </div>
      </header>

      {snap.merge ? (
        <Banner
          tone="teal"
          icon="checkCircle"
          action={
            <button type="button" className="btn sm ghost" onClick={() => session.clearMerge()}>
              Dismiss
            </button>
          }
        >
          <strong>Merged offline edits cleanly.</strong> Integrated {snap.merge.updates}{' '}
          {snap.merge.updates === 1 ? 'update' : 'updates'}
          {snap.merge.authors.length > 0 ? ` from ${snap.merge.authors.join(', ')}` : ''} via Yjs CRDT.
          No keystrokes were discarded.
        </Banner>
      ) : null}

      {offline || pendingDocOps > 0 ? (
        <Banner
          tone="amber"
          icon="cloudOff"
          action={
            <button type="button" className="btn sm" onClick={() => void session.retry()}>
              Retry now
            </button>
          }
        >
          <strong>You're offline — edits are queued on this device.</strong> Keystrokes are recorded in
          the local Yjs document and will reconcile automatically when reconnected.
        </Banner>
      ) : (
        <Banner tone="teal" icon="checkCircle">
          <strong>CRDT synchronization active.</strong> Concurrent edits from multiple devices commute
          and merge losslessly by design.
        </Banner>
      )}

      {snap.error ? (
        <Banner tone="amber" icon="alertCircle" action={<button type="button" className="btn sm" onClick={() => void session.retry()}>Retry</button>}>
          {snap.error}
        </Banner>
      ) : null}

      <div className="content-grid assignment-grid">
        <div className="stack">
          <Card className="answer-card">
            <div className="answer-head">
              <div className="answer-head-left">
                <h2 className="h3">Shared Document Editor</h2>
                <span className={`pill ${snap.connection === 'live' ? 'green' : offline ? 'amber' : 'teal'} sm`}>
                  <span className="dot" aria-hidden="true" />
                  {snap.connection === 'live' ? 'Realtime (WebSocket)' : offline ? 'Local CRDT (Offline)' : 'Catching up'}
                </span>
              </div>
              <span className="tiny muted">
                Document: <code className="mono">{docId}</code>
              </span>
            </div>

            <div className="editor-shell">
              <label htmlFor="doc-content-textarea" className="visually-hidden">
                Shared collaborative document content
              </label>
              <div className="editor-toolbar" aria-hidden="true">
                <span className="toolbar-btn">B</span>
                <span className="toolbar-btn italic">I</span>
                <span className="toolbar-btn underline">U</span>
                <span className="toolbar-divider" />
                <span className="toolbar-btn">
                  <Icon name="fileText" size={13} />
                </span>
                <span className="toolbar-spacer" />
                <span className="tiny muted" id="doc-word-count">
                  {wordCount(snap.text)} words · {snap.text.length.toLocaleString()} characters
                </span>
                <span className="pill teal sm">
                  <span className="dot" aria-hidden="true" />
                  Yjs CRDT
                </span>
              </div>

              <textarea
                id="doc-content-textarea"
                ref={textareaRef}
                className="editor"
                value={snap.text}
                onChange={handleChange}
                placeholder="Start typing shared document notes…"
                aria-describedby="doc-word-count doc-status-line"
                spellCheck
                rows={16}
              />

              <div className="editor-status" id="doc-status-line" aria-live="polite">
                <span className="status-check" aria-hidden="true">
                  <Icon name="checkCircle" size={13} />
                </span>
                <span className="status-text">{statusLine}</span>
                <span className="status-right">
                  Commutative merge · no data loss
                </span>
              </div>
            </div>
          </Card>
        </div>

        <aside className="rail">
          {availableDocs.length > 1 ? (
            <Card className="rail-card">
              <CardHead title="Documents" icon="book" />
              <div className="rail-list">
                {availableDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className={cls('btn sm block', doc.id === docId && 'primary')}
                    onClick={() => selectDoc(doc.id)}
                    style={{ marginBottom: 6, textAlign: 'left', justifyContent: 'flex-start' }}
                  >
                    {doc.title}
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="rail-card">
            <CardHead
              title="Collaborators"
              icon="users"
              badge={
                <span className="pill outline sm">
                  {snap.presence.count} online
                </span>
              }
            />
            {snap.presence.members.length > 0 ? (
              <ul className="check-list" style={{ marginTop: 8 }}>
                {snap.presence.members.map((member) => (
                  <li key={`${member.userId}-${member.deviceId}`} className="done">
                    <Icon name="check" size={13} />
                    <span>
                      <strong>{member.name}</strong> <span className="tiny muted mono">({member.deviceId.slice(0, 8)}…)</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="tiny muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
                {offline
                  ? 'Collaborator presence is unavailable while offline. Your changes will sync when reconnected.'
                  : 'No other collaborators currently active on this document.'}
              </div>
            )}
          </Card>

          <Card className="rail-card">
            <CardHead title="Sync Status" icon="layers" />
            <div className="rail-list">
              <MetaRow label="Document ID" value={docId} mono />
              <MetaRow label="Server cursor" value={`seq ${snap.cursor}`} mono />
              <MetaRow label="Update count" value={`${snap.updateCount} updates`} />
              <MetaRow label="Queued ops" value={`${pendingDocOps} pending`} tone={pendingDocOps > 0 ? 'amber' : 'default'} />
              <MetaRow label="Last saved" value={snap.lastSavedAt ? fmtAgo(snap.lastSavedAt) : 'just now'} />
            </div>
            <div className="tiny muted rail-note">
              <strong>Lossless CRDT merge:</strong> edits to this document commute automatically upon
              reconnect; no keystrokes are overwritten.
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
