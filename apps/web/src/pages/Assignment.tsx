import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SEED,
  ulid,
  type Assignment,
  type DraftPayload,
  type DraftRecord,
  type SubmissionPayload,
  type SubmissionRecord,
} from '@edusync/protocol';
import type { Page } from '../flags';
import { getAuthState } from '../auth';
import { useAuth, useSync } from '../state/useEngine';
import { useCatalog } from '../state/useCatalog';
import * as db from '../db';
import { engine } from '../sync/engine';
import { Banner } from '../components/Banner';
import { Card, CardHead, MetaRow } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import {
  cls,
  daysUntil,
  fmtAgo,
  fmtClock,
  fmtDateTime,
  sha256Hex,
  shortId,
  wordCount,
} from '../lib/util';

const ASSIGNMENT_ID = SEED.assignmentId;

interface LocalReceipt {
  submissionId: string;
  assignmentId: string;
  clientSubmittedAt: string;
  contentHash: string;
}

interface PageNotice {
  tone: 'teal' | 'amber' | 'red' | 'green';
  text: string;
}

interface AssignmentPageProps {
  navigate: (page: Page) => void;
}

function sortOps(ops: ReturnType<typeof engine.getSnapshot>['ops']) {
  return [...ops].sort((a, b) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : 0));
}

export function AssignmentPage({ navigate }: AssignmentPageProps) {
  const auth = useAuth();
  const sync = useSync();
  const catalog = useCatalog();
  const assignment: Assignment | null = catalog.assignment;

  const [answer, setAnswer] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<LocalReceipt | null>(null);
  const [submission, setSubmission] = useState<SubmissionRecord | null>(null);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draftRecord, setDraftRecord] = useState<DraftRecord | null>(null);

  const answerRef = useRef('');
  const lastSavedRef = useRef('');
  const saveTimerRef = useRef<number | null>(null);
  const submittedRef = useRef(false);
  const initializedRef = useRef(false);

  const submitted = Boolean(receipt || submission);
  submittedRef.current = submitted;

  const pendingDraftOps = sync.ops.filter(
    (op) =>
      op.entity === 'draft' &&
      op.entityId === ASSIGNMENT_ID &&
      (op.status === 'queued' || op.status === 'retry'),
  );
  const pendingDraft = sortOps(pendingDraftOps).at(-1) ?? null;

  /* -------------------------------------------------- load local state */

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [draftRow, receiptMeta, rows, autosavedMeta] = await Promise.all([
        db.getRecordRow('draft', ASSIGNMENT_ID),
        db.getMeta<LocalReceipt>(`receipt:${ASSIGNMENT_ID}`),
        db.listRecords(),
        db.getMeta<number>(`draftAutosavedAt:${ASSIGNMENT_ID}`),
      ]);
      if (!alive) return;
      const record = (draftRow?.payload as DraftRecord | undefined) ?? null;
      const latestPending = sortOps(
        engine
          .getSnapshot()
          .ops.filter(
            (op) =>
              op.entity === 'draft' &&
              op.entityId === ASSIGNMENT_ID &&
              (op.status === 'queued' || op.status === 'retry'),
          ),
      ).at(-1);
      const localAnswer = latestPending
        ? ((latestPending.payload as DraftPayload).answer ?? record?.answer ?? '')
        : (record?.answer ?? '');
      const confirmed =
        rows
          .filter((row) => row.entity === 'submission')
          .map((row) => row.payload as SubmissionRecord)
          .find((row) => row.assignmentId === ASSIGNMENT_ID) ?? null;

      setDraftRecord(record);
      setReceipt(receiptMeta);
      setSubmission(confirmed);
      if (!initializedRef.current) {
        initializedRef.current = true;
        answerRef.current = localAnswer;
        lastSavedRef.current = localAnswer;
        setAnswer(localAnswer);
        if (autosavedMeta ?? latestPending ?? record) setLastAutosavedAt(autosavedMeta ?? Date.now());
        setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
    // Only on mount: later server pulls are handled by the recordsRev effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------- adopt server state when idle */

  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    void (async () => {
      const [draftRow, receiptMeta, rows] = await Promise.all([
        db.getRecordRow('draft', ASSIGNMENT_ID),
        db.getMeta<LocalReceipt>(`receipt:${ASSIGNMENT_ID}`),
        db.listRecords(),
      ]);
      if (!alive) return;
      const record = (draftRow?.payload as DraftRecord | undefined) ?? null;
      setDraftRecord(record ?? null);
      setReceipt(receiptMeta);

      const confirmed =
        rows
          .filter((row) => row.entity === 'submission')
          .map((row) => row.payload as SubmissionRecord)
          .find((row) => row.assignmentId === ASSIGNMENT_ID) ?? null;
      setSubmission(confirmed);

      const pending = engine
        .getSnapshot()
        .ops.some(
          (op) =>
            op.entity === 'draft' &&
            op.entityId === ASSIGNMENT_ID &&
            (op.status === 'queued' || op.status === 'retry'),
        );
      // Never clobber unsaved local keystrokes with a server pull.
      if (
        record &&
        !pending &&
        !submittedRef.current &&
        answerRef.current === lastSavedRef.current &&
        answerRef.current !== record.answer
      ) {
        answerRef.current = record.answer;
        lastSavedRef.current = record.answer;
        setAnswer(record.answer);
        setLastAutosavedAt(Date.now());
      }

      if (confirmed && receiptMeta && confirmed.submissionId !== receiptMeta.submissionId) {
        setNotice({
          tone: 'red',
          text: 'A different attempt already existed on the server. Both versions are preserved in the Review Inbox.',
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [sync.recordsRev, loaded]);

  /* ---------------------------------------------------------- autosave */

  async function persistDraft(value: string, force = false): Promise<void> {
    if (!force && value === lastSavedRef.current) return;
    const authState = getAuthState();
    if (authState.status !== 'signed-in' || !authState.deviceId) return;

    // Base HLC = the latest value this device knows about: our own pending chain
    // first, then the last server-acknowledged draft. This keeps sequential
    // autosaves L2 (sequential), not L4 (concurrent).
    const pending = sortOps(
      engine
        .getSnapshot()
        .ops.filter(
          (op) =>
            op.entity === 'draft' &&
            op.entityId === ASSIGNMENT_ID &&
            (op.status === 'queued' || op.status === 'retry'),
        ),
    );
    const ownChain = pending.at(-1);
    let baseAnswerHlc: string | null = ownChain
      ? ((ownChain.payload as DraftPayload).answerHlc ?? null)
      : null;
    if (!baseAnswerHlc) {
      const row = await db.getRecordRow('draft', ASSIGNMENT_ID);
      baseAnswerHlc = row ? ((row.payload as DraftRecord).answerHlc ?? null) : null;
    }

    const hlc = engine.nowHlc();
    const payload: DraftPayload = {
      assignmentId: ASSIGNMENT_ID,
      answer: value,
      answerHlc: hlc,
      baseAnswerHlc,
    };
    await engine.enqueue({
      opId: ulid(),
      deviceId: authState.deviceId,
      hlc,
      entity: 'draft',
      entityId: ASSIGNMENT_ID,
      type: 'update',
      baseRev: 0,
      payload,
    });
    lastSavedRef.current = value;
    const savedAt = Date.now();
    setLastAutosavedAt(savedAt);
    await db.setMeta(`draftAutosavedAt:${ASSIGNMENT_ID}`, savedAt);
  }

  function handleChange(value: string) {
    answerRef.current = value;
    setAnswer(value);
    if (submittedRef.current) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistDraft(answerRef.current);
    }, 400);
  }

  function flushPendingAutosave() {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!submittedRef.current && answerRef.current !== lastSavedRef.current) {
      void persistDraft(answerRef.current);
    }
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  /* ------------------------------------------------------------ submit */

  async function handleSubmit() {
    if (submitted || submitting) return;
    if (!answerRef.current.trim()) {
      setNotice({ tone: 'amber', text: 'Write an answer before submitting — the draft is saved on this device.' });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      // Persist the latest keystrokes first so nothing is lost even if submit fails.
      if (answerRef.current !== lastSavedRef.current) {
        await persistDraft(answerRef.current, true);
      }
      const authState = getAuthState();
      if (authState.status !== 'signed-in' || !authState.deviceId) {
        throw new Error('No signed-in device session');
      }

      // The submissionId is generated ONCE and persisted: every retry reuses it,
      // so the server's unique index gives exactly-once effects.
      const storedId = await db.getMeta<string>(`submissionId:${ASSIGNMENT_ID}`);
      const submissionId = storedId ?? ulid();
      await db.setMeta(`submissionId:${ASSIGNMENT_ID}`, submissionId);

      const body = answerRef.current;
      const contentHash = await sha256Hex(body.trim());
      const clientSubmittedAt = new Date().toISOString();
      const localReceipt: LocalReceipt = {
        submissionId,
        assignmentId: ASSIGNMENT_ID,
        clientSubmittedAt,
        contentHash,
      };
      await db.setMeta(`receipt:${ASSIGNMENT_ID}`, localReceipt);
      setReceipt(localReceipt);

      const alreadyQueued = engine
        .getSnapshot()
        .ops.some((op) => op.entity === 'submission' && op.entityId === submissionId);
      if (!alreadyQueued) {
        const hlc = engine.nowHlc();
        const payload: SubmissionPayload = {
          assignmentId: ASSIGNMENT_ID,
          submissionId,
          contentHash,
          body,
          clientSubmittedAt,
        };
        await engine.enqueue({
          opId: ulid(),
          deviceId: authState.deviceId,
          hlc,
          entity: 'submission',
          entityId: submissionId,
          type: 'create',
          baseRev: 0,
          payload,
        });
      }
      setNotice({
        tone: 'amber',
        text: 'Submission queued on this device. It will send automatically; reloads and retries reuse the same submissionId.',
      });
    } catch (error) {
      setNotice({
        tone: 'red',
        text: error instanceof Error ? error.message : 'Could not submit',
      });
    } finally {
      setSubmitting(false);
    }
  }

  /* -------------------------------------------------------- rendering */

  const retryIn =
    sync.retryInMs != null ? Math.max(0, Math.ceil(sync.retryInMs / 1000)) : null;
  const offline = sync.simulateOffline || !sync.browserOnline || sync.state === 'offline';

  const statusLine = useMemo(() => {
    const parts: string[] = [];
    if (lastAutosavedAt) parts.push(`Autosaved ${fmtClock(lastAutosavedAt)}`);
    else if (loaded) parts.push('Autosaved —');
    if (submitted) {
      parts.push(submission ? 'confirmed by server' : 'submitted · queued');
    } else if (sync.pending > 0) {
      parts.push(`${sync.pending} ${sync.pending === 1 ? 'op' : 'ops'} queued`);
      if (retryIn !== null) parts.push(`retrying in ${retryIn}s`);
    } else if (sync.state === 'synced' || sync.lastSyncAt) {
      parts.push('synced');
    } else if (offline) {
      parts.push('offline — saved on device');
    }
    return parts.join(' · ');
  }, [lastAutosavedAt, loaded, submitted, submission, sync.pending, sync.state, sync.lastSyncAt, retryIn, offline]);

  const rubricPoints = assignment?.rubric.reduce((sum, criterion) => sum + criterion.points, 0) ?? 14;

  if (!assignment) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <div className="crumbs">
              <span className="eyebrow">Assignments</span>
              <span className="crumb-sep">/</span>
              <span className="crumbs-current">Assignment 3</span>
            </div>
            <h1 className="page-title">Membrane transport worksheet</h1>
          </div>
        </header>
        <Card>
          <EmptyState
            icon="cloudOff"
            title="This assignment is not cached yet"
            action={
              <button type="button" className="btn teal" onClick={() => navigate('library')}>
                <Icon name="download" size={14} /> Prefetch from Library
              </button>
            }
          >
            The prompt and rubric download with the course catalog. Your local draft and submission
            queue are never blocked — they are stored on this device regardless.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const days = daysUntil(assignment.dueAt);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="crumbs">
            <button type="button" className="back-link" onClick={() => navigate('library')}>
              <Icon name="arrowLeft" size={14} /> Assignments
            </button>
            <span className="crumb-sep">/</span>
            <span className="crumbs-current">Assignment 3</span>
          </div>
          <h1 className="page-title">{assignment.title}</h1>
        </div>
        <div className="page-actions">
          <span className={`pill ${submitted ? 'green' : 'teal'}`}>
            <span className="dot" aria-hidden="true" />
            {submitted ? (submission ? 'Confirmed on server' : 'Saved on device') : 'Saved on device'}
          </span>
          <button type="button" className="btn" onClick={() => navigate('sync')}>
            <Icon name="refresh" size={14} /> Sync Center
          </button>
        </div>
      </header>

      {offline || pendingDraftOps.length > 0 || retryIn !== null ? (
        <Banner
          tone="amber"
          icon="cloudOff"
          action={<span className="tiny mono">{retryIn !== null ? `Auto-retry in ${retryIn}s` : 'Autosave on'}</span>}
        >
          <strong>You're {offline ? 'offline' : 'syncing'} — nothing is blocked.</strong> This answer is
          written to the device first and queues for automatic sync; no spinner, no lost keystrokes.
        </Banner>
      ) : (
        <Banner tone="teal" icon="checkCircle">
          <strong>Synced.</strong> The draft on this device matches the server; autosave keeps both in
          step.
        </Banner>
      )}

      {notice ? (
        <Banner tone={notice.tone} icon={notice.tone === 'red' ? 'alertCircle' : 'info'}>
          {notice.text}
        </Banner>
      ) : null}

      <div className="content-grid assignment-grid">
        <div className="stack">
          <Card className="answer-card">
            <div className="answer-head">
              <div className="answer-head-left">
                <h2 className="h3">Answer</h2>
                <span className={`pill ${submitted ? 'green' : 'amber'} sm`}>
                  <span className="dot" aria-hidden="true" />
                  {submitted ? 'Submitted' : 'Draft · not submitted'}
                </span>
              </div>
              <span className="tiny muted">
                Assignment 3 · {assignment.points} pts · {rubricPoints} rubric marks
              </span>
            </div>

            <div className="prompt-box">
              <span className="prompt-badge" aria-hidden="true">
                Q3
              </span>
              <div className="prompt-content">
                <p className="prompt-text">{assignment.prompt}</p>
                <div className="prompt-meta">
                  <span className="pill grey sm">{assignment.points} pts</span>
                  <span className="pill grey sm">Rubric · {assignment.rubric.length} criteria</span>
                  <span className="pill grey sm">
                    <Icon name="download" size={11} /> Prompt + rubric cached
                  </span>
                </div>
              </div>
            </div>

            <div className="editor-shell">
              <div className="editor-toolbar" aria-hidden="true">
                <span className="toolbar-btn">B</span>
                <span className="toolbar-btn italic">I</span>
                <span className="toolbar-btn underline">U</span>
                <span className="toolbar-divider" />
                <span className="toolbar-btn">
                  <Icon name="list" size={13} />
                </span>
                <span className="toolbar-btn">
                  <Icon name="fileText" size={13} />
                </span>
                <span className="toolbar-spacer" />
                <span className="tiny muted">
                  {wordCount(answer)} words · {answer.length.toLocaleString()} characters
                </span>
                <span className={`pill ${submitted ? 'green' : 'teal'} sm`}>
                  <span className="dot" aria-hidden="true" />
                  {submitted ? 'Locked after submit' : 'Autosave on'}
                </span>
              </div>
              <textarea
                className={cls('editor', submitted && 'editor-readonly')}
                value={answer}
                onChange={(event) => handleChange(event.target.value)}
                onBlur={() => flushPendingAutosave()}
                readOnly={submitted}
                placeholder="Explain how the Na⁺/K⁺ ATPase establishes the resting membrane potential, and predict the effect of ouabain…"
                aria-label="Your assignment answer"
                spellCheck
              />
              <div className="editor-status" aria-live="polite">
                <span className="status-check" aria-hidden="true">
                  <Icon name="checkCircle" size={13} />
                </span>
                <span className="status-text">{statusLine || 'Autosave on'}</span>
                <span className="status-right">
                  Queue survives reload · this device only
                </span>
              </div>
            </div>
          </Card>

          {receipt || submission ? (
            <Card className="receipt-card">
              <CardHead
                title="Receipt · 1 canonical attempt; retries safe"
                icon="shield"
                badge={
                  <span className={`pill ${submission ? 'green' : 'amber'} sm`}>
                    <span className="dot" aria-hidden="true" />
                    {submission ? 'Confirmed' : 'Queued offline'}
                  </span>
                }
              />
              <div className="receipt-grid">
                <div className="receipt-row">
                  <span className="receipt-label">submissionId</span>
                  <span className="mono receipt-value">
                    {submission?.submissionId ?? receipt?.submissionId ?? '—'}
                  </span>
                </div>
                {submission ? (
                  <div className="receipt-row">
                    <span className="receipt-label">server id</span>
                    <span className="mono receipt-value">{submission.id}</span>
                  </div>
                ) : null}
                <div className="receipt-row">
                  <span className="receipt-label">clientSubmittedAt</span>
                  <span className="mono receipt-value">
                    {fmtDateTime(submission?.clientSubmittedAt ?? receipt?.clientSubmittedAt)}
                  </span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">contentHash</span>
                  <span className="mono receipt-value">
                    {shortId(submission?.contentHash ?? receipt?.contentHash ?? '', 20)}
                  </span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">status</span>
                  <span className="receipt-value">
                    {submission
                      ? `submitted · attempt ${submission.attemptNo} · received ${fmtAgo(new Date(submission.serverReceivedAt).getTime())}`
                      : 'on this device, waiting for an acknowledgement'}
                  </span>
                </div>
              </div>
              <div className="receipt-foot tiny muted">
                <Icon name="info" size={12} /> Duplicate deliveries are absorbed by the server's unique
                index — this receipt is the single canonical attempt.
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="rail">
          <Card className="rail-card rubric-card">
            <CardHead
              title="Rubric"
              icon="list"
              badge={<span className="pill outline sm">{rubricPoints} marks</span>}
            />
            <ul className="rubric-list">
              {assignment.rubric.map((criterion) => (
                <li key={criterion.id} className="rubric-item">
                  <span className="rubric-check" aria-hidden="true">
                    <Icon name="check" size={12} />
                  </span>
                  <div className="rubric-text">
                    <div className="rubric-label">{criterion.label}</div>
                    <div className="rubric-hint tiny muted">{criterion.hint}</div>
                  </div>
                  <span className="rubric-points">{criterion.points}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="rail-card">
            <CardHead
              title="Deadline"
              icon="clock"
              badge={
                <span className={cls('pill', days !== null && days <= 3 ? 'amber' : 'grey', 'sm')}>
                  {days === null ? '—' : days <= 0 ? 'due now' : `${days} days left`}
                </span>
              }
            />
            <div className="rail-list">
              <MetaRow label="Due" value={fmtDateTime(assignment.dueAt)} />
              <MetaRow label="Points" value={`${assignment.points} pts · one attempt`} />
              <MetaRow
                label="Device stamp"
                value={fmtDateTime(new Date().toISOString())}
                mono
              />
            </div>
            <div className="tiny muted rail-note">
              Late and offline work carries both the device timestamp and the server receipt time —
              no silent penalty.
            </div>
          </Card>

          <Card className="rail-card submit-card">
            <CardHead
              title="Submit"
              icon="uploadCloud"
              badge={
                <span className={`pill ${submission ? 'green' : submitted ? 'amber' : 'grey'} sm`}>
                  {submission ? 'Confirmed' : submitted ? 'Queued offline' : 'One attempt'}
                </span>
              }
            />
            <p className="tiny muted submit-copy">
              Submitting queues <strong>one</strong> attempt with a client-generated submissionId. It
              sends automatically on reconnect and every retry reuses the same key.
            </p>
            <button
              type="button"
              className="btn primary block submit-button"
              onClick={() => void handleSubmit()}
              disabled={submitted || submitting || !answer.trim()}
            >
              <Icon name={submitted ? 'checkCircle' : 'uploadCloud'} size={15} />
              {submitted ? (submission ? 'Submitted · confirmed' : 'Submitted · queued') : submitting ? 'Queuing submission…' : 'Submit assignment'}
            </button>
            <div className="tiny muted submit-foot">
              <Icon name="shield" size={12} /> Receipt = 1 canonical attempt; retries safe
            </div>
          </Card>

          <Card className="rail-card">
            <CardHead title="Version history" icon="layers" />
            <div className="rail-list">
              <MetaRow
                label="Server draft"
                value={draftRecord ? `rev ${draftRecord.rev} · ${fmtAgo(sync.lastSyncAt)}` : 'not on server yet'}
              />
              <MetaRow
                label="Local draft"
                value={pendingDraft ? 'pending · queued' : lastAutosavedAt ? `saved ${fmtClock(lastAutosavedAt)}` : 'not saved yet'}
                tone={pendingDraft ? 'amber' : 'default'}
              />
              <MetaRow label="Confirmed attempt" value={submission ? `#${submission.attemptNo}` : 'none yet'} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
