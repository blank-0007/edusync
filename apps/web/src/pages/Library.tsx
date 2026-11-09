import { useEffect, useMemo, useState } from 'react';
import { SEED, ulid, type Lesson, type LessonProgressRecord } from '@edusync/protocol';
import type { Page } from '../flags';
import { useAuth, useSync } from '../state/useEngine';
import { useCatalog } from '../state/useCatalog';
import * as db from '../db';
import { engine } from '../sync/engine';
import { Banner } from '../components/Banner';
import { Card, CardHead, MetaRow, SectionHead } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import {
  fmtAgo,
  fmtClock,
  fmtDateTime,
  fmtRetryIn,
  mediaLabel,
  plural,
  shortId,
  storageKb,
} from '../lib/util';

type ProgressMap = Record<string, { percent: number; lastOpenedAt: string }>;

interface LibraryPageProps {
  navigate: (page: Page) => void;
}

function mediaKinds(lesson: Lesson): string {
  const kinds = [...new Set((lesson.media ?? []).map((media) => mediaLabel(media.kind)))];
  return kinds.length > 0 ? kinds.join(' + ') : 'Reading';
}

function lessonMeta(lesson: Lesson): string {
  return [mediaKinds(lesson), `${lesson.durationMin} min`].join(' · ');
}

function primaryMediaLabel(lesson: Lesson): string {
  const media = lesson.media?.[0];
  if (!media) return 'Reading';
  return media.kind === 'video' ? 'Video' : media.kind === 'pdf' ? 'PDF' : 'Audio';
}

async function enqueueProgress(lesson: Lesson, percent: number, deviceId: string): Promise<void> {
  const hlc = engine.nowHlc();
  await engine.enqueue({
    opId: ulid(),
    deviceId,
    hlc,
    entity: 'lesson_progress',
    entityId: lesson.id,
    type: 'update',
    baseRev: 0,
    payload: {
      lessonId: lesson.id,
      percent,
      lastOpenedAt: new Date().toISOString(),
    },
  });
}

export function LibraryPage({ navigate }: LibraryPageProps) {
  const auth = useAuth();
  const sync = useSync();
  const catalog = useCatalog();
  const [progress, setProgress] = useState<ProgressMap>({});
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hasDraftRecord, setHasDraftRecord] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const lessons = catalog.lessons;
  const course = catalog.course;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [rows, draft] = await Promise.all([
        db.listRecords(),
        db.getRecordRow('draft', SEED.assignmentId),
      ]);
      if (!alive) return;
      const map: ProgressMap = {};
      for (const row of rows) {
        if (row.entity === 'lesson_progress') {
          const payload = row.payload as LessonProgressRecord;
          map[payload.lessonId] = {
            percent: payload.percent,
            // Materialised records don't carry lastOpenedAt; updatedAt approximates it.
            lastOpenedAt: new Date(row.updatedAt).toISOString(),
          };
        }
      }
      setProgress(map);
      setHasDraftRecord(Boolean(draft));
    })();
    return () => {
      alive = false;
    };
  }, [sync.recordsRev]);

  const filteredLessons = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return lessons;
    return lessons.filter(
      (lesson) =>
        lesson.title.toLowerCase().includes(term) || lesson.summary.toLowerCase().includes(term),
    );
  }, [lessons, query]);

  const continueLesson = useMemo(() => {
    if (lessons.length === 0) return null;
    const ordered = [...lessons].sort((a, b) => a.position - b.position);
    const inProgress = ordered
      .filter((lesson) => progress[lesson.id] && progress[lesson.id].percent < 100)
      .sort((a, b) => {
        const aTime = progress[a.id]?.lastOpenedAt ?? '';
        const bTime = progress[b.id]?.lastOpenedAt ?? '';
        return bTime.localeCompare(aTime);
      });
    if (inProgress.length > 0) return inProgress[0];
    const next = ordered.find((lesson) => !progress[lesson.id] || progress[lesson.id].percent < 100);
    return next ?? ordered[0];
  }, [lessons, progress]);

  const continuePercent = continueLesson ? Math.round(progress[continueLesson.id]?.percent ?? 0) : 0;
  const completedCount = lessons.filter((lesson) => (progress[lesson.id]?.percent ?? 0) >= 100).length;

  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId) ?? null;
  const offline = sync.simulateOffline || !sync.browserOnline || sync.state === 'offline';
  const retryIn = fmtRetryIn(sync.retryInMs);
  const draftQueued =
    sync.ops.some((op) => op.entity === 'draft' && op.entityId === SEED.assignmentId) || hasDraftRecord;

  async function handleOpenLesson(lesson: Lesson) {
    setSelectedLessonId(lesson.id);
    setNotice(null);
    if (!progress[lesson.id] && auth.deviceId) {
      // First open marks the lesson as started, locally and durably.
      setProgress((current) => ({
        ...current,
        [lesson.id]: { percent: 10, lastOpenedAt: new Date().toISOString() },
      }));
      await enqueueProgress(lesson, 10, auth.deviceId);
    }
  }

  async function handleMarkComplete(lesson: Lesson) {
    if (!auth.deviceId) return;
    setProgress((current) => ({
      ...current,
      [lesson.id]: { percent: 100, lastOpenedAt: new Date().toISOString() },
    }));
    await enqueueProgress(lesson, 100, auth.deviceId);
    setNotice(`Marked “${lesson.title}” complete — saved on this device.`);
  }

  async function handlePrefetch() {
    setNotice(null);
    await catalog.refresh();
  }

  if (selectedLesson) {
    return (
      <div className="page">
        <ReaderHeader
          lesson={selectedLesson}
          courseCode={course?.code ?? 'BIOL 201'}
          onBack={() => setSelectedLessonId(null)}
        />
        {notice ? <Banner tone="teal" icon="checkCircle">{notice}</Banner> : null}
        <LessonReader
          lesson={selectedLesson}
          percent={Math.round(progress[selectedLesson.id]?.percent ?? 0)}
          onComplete={() => void handleMarkComplete(selectedLesson)}
          onBack={() => setSelectedLessonId(null)}
        />
      </div>
    );
  }

  const cachedKb = storageKb(course ?? lessons);
  const readyBanner =
    offline || sync.pending > 0 || sync.state === 'degraded' ? (
      <Banner
        tone="amber"
        icon="cloudOff"
        action={
          <button type="button" className="btn sm" onClick={() => navigate('sync')}>
            {retryIn ? `Retrying in ${retryIn}` : 'Open Sync Center'}
          </button>
        }
      >
        <strong>You're offline — nothing is blocked.</strong>{' '}
        {course
          ? 'This course is cached on this device; edits queue automatically and sync when the connection returns.'
          : 'The course is not cached yet. Reconnect to prefetch BIOL 201 for offline use.'}
        {sync.pending > 0 ? ` ${plural(sync.pending, 'change')} queued.` : ''}
      </Banner>
    ) : catalog.cached ? (
      <Banner
        tone="teal"
        icon="download"
        action={
          <span className="pill green">
            <span className="dot" aria-hidden="true" />
            Offline ready
          </span>
        }
      >
        <strong>This course is fully available offline</strong> — lessons, lesson bodies and the
        assignment rubric are cached on this device.
      </Banner>
    ) : (
      <Banner
        tone="amber"
        icon="cloudOff"
        action={
          <button type="button" className="btn sm" onClick={() => void handlePrefetch()}>
            Prefetch now
          </button>
        }
      >
        Nothing is cached yet. Connect to the server to prefetch BIOL 201.
      </Banner>
    );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="crumbs">
            <span className="eyebrow">{course ? `${course.code} · ${course.title}` : 'BIOL 201 · Cell Biology'}</span>
            <span className="crumb-sep">/</span>
            <span className="crumbs-current">Lessons</span>
          </div>
          <h1 className="page-title">Lesson library</h1>
        </div>
        <div className="page-actions">
          <label className="search">
            <Icon name="search" size={15} />
            <span className="sr-only">Search lessons</span>
            <input
              type="search"
              value={query}
              placeholder={lessons.length > 0 ? `Search ${lessons.length} lessons` : 'Search lessons'}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button type="button" className="btn" onClick={() => void handlePrefetch()} disabled={catalog.refreshing}>
            <Icon name="download" size={14} />
            {catalog.refreshing ? 'Prefetching…' : 'Prefetch course'}
          </button>
          <button type="button" className="btn primary" onClick={() => navigate('sync')}>
            Sync Center
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </header>

      {notice ? (
        <Banner tone="teal" icon="checkCircle">
          {notice}
        </Banner>
      ) : null}
      {readyBanner}

      {continueLesson ? (
        <section className="hero" aria-label="Continue learning">
          <div className="hero-play" aria-hidden="true">
            <Icon name="play" size={26} />
          </div>
          <div className="hero-main">
            <div className="eyebrow hero-eyebrow">Continue learning</div>
            <h2 className="hero-title">{continueLesson.title}</h2>
            <div className="hero-meta">
              Lesson {continueLesson.position} · {mediaKinds(continueLesson)} ·{' '}
              {continueLesson.durationMin} min · {continuePercent}% complete
            </div>
            <div className="hero-sub">
              <span className="hero-sub-item">
                <Icon name="clock" size={13} />{' '}
                {Math.max(1, Math.round((continueLesson.durationMin * (100 - continuePercent)) / 100))} min left
              </span>
              <span className="hero-sub-item">
                <Icon name="checkCircle" size={13} /> {catalog.cached ? 'Cached for offline' : 'Not cached'}
              </span>
            </div>
          </div>
          <div className="hero-right">
            <div className="hero-progress-label" id="lesson-progress-label">
              <span>Lesson progress</span>
              <span>{continuePercent}%</span>
            </div>
            <div
              className="meter hero-meter"
              role="progressbar"
              aria-labelledby="lesson-progress-label"
              aria-valuenow={continuePercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${Math.max(2, continuePercent)}%` }} />
            </div>
            <button type="button" className="btn hero-resume" onClick={() => void handleOpenLesson(continueLesson)}>
              Resume
              <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </section>
      ) : null}

      <div className="content-grid">
        <div className="stack">
          <SectionHead
            title="Lessons"
            count={lessons.length}
            actions={
              <span className="tiny muted">
                {course ? `${lessons.length} of ${lessons.length} available offline` : 'Waiting for catalog'}
              </span>
            }
          />

          {filteredLessons.length === 0 ? (
            <Card>
              {lessons.length === 0 ? (
                <EmptyState
                  icon="cloudOff"
                  title="The offline catalog is empty"
                  action={
                    <button type="button" className="btn teal" onClick={() => void handlePrefetch()}>
                      <Icon name="download" size={14} /> Prefetch course
                    </button>
                  }
                >
                  This browser profile has not downloaded BIOL 201 yet. Start the server and reconnect —
                  the catalog will be cached for offline use. Nothing else is blocked.
                </EmptyState>
              ) : (
                <EmptyState icon="search" title="No lessons match your search">
                  Try a different term, or clear the search to see all {lessons.length} lessons.
                </EmptyState>
              )}
            </Card>
          ) : (
            <div className="lesson-grid">
              {filteredLessons.map((lesson) => {
                const percent = Math.round(progress[lesson.id]?.percent ?? 0);
                const position = lesson.position ?? lessons.indexOf(lesson) + 1;
                return (
                  <button
                    type="button"
                    key={lesson.id}
                    className="lesson-card"
                    onClick={() => void handleOpenLesson(lesson)}
                    aria-label={`Open lesson ${position}: ${lesson.title}`}
                  >
                    <div className="lesson-card-top">
                      <span className="lesson-icon" aria-hidden="true">
                        <Icon name={primaryMediaLabel(lesson) === 'Reading' ? 'fileText' : 'play'} size={17} />
                      </span>
                      <div className="lesson-card-text">
                        <div className="lesson-title">{lesson.title}</div>
                        <div className="lesson-meta">
                          Lesson {position} · {mediaKinds(lesson)} · {lesson.durationMin} min
                        </div>
                      </div>
                      {percent > 0 ? (
                        <span className={`pill ${percent >= 100 ? 'green' : 'indigo'} sm`}>
                          {percent >= 100 ? 'Complete' : `${percent}%`}
                        </span>
                      ) : null}
                    </div>
                    <div className="lesson-summary">{lesson.summary}</div>
                    <div className="lesson-card-foot">
                      <span className={`pill ${catalog.cached ? 'teal' : 'grey'} sm`}>
                        <span className="dot" aria-hidden="true" />
                        {catalog.cached ? 'Available offline' : 'Needs network'}
                      </span>
                      <span className="lesson-foot-right">
                        {percent > 0 && percent < 100 ? (
                          <span className="mini-meter" aria-hidden="true">
                            <span style={{ width: `${percent}%` }} />
                          </span>
                        ) : null}
                        <span className="tiny muted">{lesson.durationMin} min</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {catalog.assignment ? (
          <Card className="due-card">
            <CardHead
              title="Due this week"
              icon="fileText"
              badge={<span className="pill amber sm">1 item</span>}
              actions={
                <button type="button" className="btn sm" onClick={() => navigate('assignment')}>
                  Open assignment <Icon name="arrowRight" size={13} />
                </button>
              }
            />
            <div className="due-row">
              <span className="lesson-icon" aria-hidden="true">
                <Icon name="fileText" size={17} />
              </span>
              <div className="due-text">
                <div className="due-title">
                  {catalog.assignment?.title ?? 'Membrane transport worksheet'}
                </div>
                <div className="tiny muted">
                  Due {fmtDateTime(catalog.assignment.dueAt)} · {catalog.assignment.points} pts ·{' '}
                  {catalog.assignment.rubric.length} rubric criteria
                </div>
              </div>
              <span className={`pill ${draftQueued ? 'amber' : 'grey'} sm`}>
                {draftQueued ? 'Draft saved on device' : 'Not started'}
              </span>
            </div>
          </Card>
          ) : null}
        </div>

        <aside className="rail" aria-label="Course and sync details">
          <Card className="rail-card">
            <CardHead title="Course" eyebrow="BIOL 201" icon="book" />
            <div className="rail-course-name">{course?.title ?? 'Cell Biology'}</div>
            <div className="small muted rail-course-meta">
              Section A · {course?.instructorName ?? 'Dr. Priya Nair'}
            </div>
            <div className="rail-chips">
              <span className={`pill ${catalog.cached ? 'teal' : 'grey'}`}>
                <span className="dot" aria-hidden="true" />
                {catalog.cached ? 'Ready offline' : 'Not cached'}
              </span>
              <span className="pill outline">{lessons.length} lessons</span>
            </div>
            <div className="rail-meter">
              <div className="meter">
                <span style={{ width: catalog.cached ? '100%' : '8%' }} />
              </div>
              <div className="tiny muted">
                {catalog.cached ? `${cachedKb} KB cached of the full course` : 'Nothing cached yet — connect to prefetch'}
              </div>
            </div>
            <div className="rail-list">
              <MetaRow label="Lesson bodies" value={catalog.cached ? `${lessons.length} cached` : 'not cached'} />
              <MetaRow label="Assignment rubric" value={catalog.assignment ? 'cached' : 'not cached'} />
              <MetaRow label="Last prefetch" value={catalog.lastFetchedAt ? fmtAgo(catalog.lastFetchedAt) : 'never'} />
            </div>
          </Card>

          <Card className="rail-card">
            <CardHead
              title="Sync"
              icon="refresh"
              badge={
                <span className={`pill ${sync.pending > 0 ? 'amber' : 'green'} sm`}>
                  {sync.pending > 0 ? `${sync.pending} queued` : 'up to date'}
                </span>
              }
            />
            <div className="rail-list">
              <MetaRow label="Last successful sync" value={sync.lastSyncAt ? fmtAgo(sync.lastSyncAt) : 'never'} />
              <MetaRow
                label="Next retry"
                value={retryIn ? `in ${retryIn}` : sync.state === 'degraded' ? 'soon' : '—'}
                tone={sync.state === 'degraded' ? 'amber' : 'default'}
              />
              <MetaRow label="Pending upload" value={`${plural(sync.pending, 'op')}`} />
              <MetaRow label="State" value={sync.state} />
            </div>
            <button type="button" className="btn block" onClick={() => navigate('sync')}>
              Open Sync Center <Icon name="arrowRight" size={13} />
            </button>
          </Card>

          <Card className="rail-card">
            <CardHead
              title="Offline readiness"
              icon="shield"
              badge={
                <span className={`pill ${catalog.cached ? 'green' : 'grey'} sm`}>
                  <span className="dot" aria-hidden="true" />
                  {catalog.cached ? 'Ready' : 'Partial'}
                </span>
              }
            />
            <ul className="check-list">
              <li className={catalog.cached ? 'done' : ''}>
                <Icon name="check" size={13} /> {lessons.length} lessons cached
              </li>
              <li className={catalog.assignment ? 'done' : ''}>
                <Icon name="check" size={13} /> Assignment + rubric cached
              </li>
              <li className={catalog.cached ? 'done' : ''}>
                <Icon name="check" size={13} /> Lesson bodies readable offline
              </li>
              <li>
                <Icon name="info" size={13} /> Queued ops are never evicted
              </li>
            </ul>
          </Card>

          <Card className="rail-card">
            <CardHead title="This week" icon="clock" badge={<span className="pill grey sm">Wk 5</span>} />
            <div className="rail-list">
              <MetaRow label="Lessons completed" value={`${completedCount} of ${lessons.length || 6}`} />
            </div>
            <div className="meter">
              <span style={{ width: `${lessons.length ? (completedCount / lessons.length) * 100 : 0}%` }} />
            </div>
            <div className="tiny muted rail-week-note">
              {completedCount === 0
                ? 'Open a lesson to start tracking progress — it saves on this device first.'
                : 'Progress is written locally as lesson_progress ops and merged by HLC.'}
            </div>
            <div className="tiny muted rail-week-device">
              Signed in as {auth.user?.name ?? '—'} · this device {shortId(auth.deviceId, 10)}
            </div>
            <div className="tiny muted">Last local autosave {fmtClock(sync.lastSyncAt)}</div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ reader */

function ReaderHeader({
  lesson,
  courseCode,
  onBack,
}: {
  lesson: Lesson;
  courseCode: string;
  onBack: () => void;
}) {
  return (
    <header className="page-head reader-head">
      <div>
        <div className="crumbs">
          <button type="button" className="back-link" onClick={onBack}>
            <Icon name="arrowLeft" size={14} /> Lesson library
          </button>
          <span className="crumb-sep">/</span>
          <span className="crumbs-current">
            {courseCode} · Lesson {lesson.position}
          </span>
        </div>
        <h1 className="page-title">{lesson.title}</h1>
        <div className="reader-meta small muted">
          {lesson.durationMin} min · {lesson.summary}
        </div>
      </div>
      <div className="page-actions">
        <span className="pill teal">
          <span className="dot" aria-hidden="true" />
          Available offline
        </span>
        <button type="button" className="btn" onClick={onBack}>
          Back to library
        </button>
      </div>
    </header>
  );
}

function LessonReader({
  lesson,
  percent,
  onComplete,
  onBack,
}: {
  lesson: Lesson;
  percent: number;
  onComplete: () => void;
  onBack: () => void;
}) {
  const paragraphs = lesson.body.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0);
  return (
    <div className="reader-layout">
      <Card className="reader-card">
        <div className="reader-body">
          <div className="reader-lesson-meta">
            <span className="pill outline">Lesson {lesson.position}</span>
            {lesson.media.map((media) => (
              <span className="pill grey sm" key={`${media.kind}-${media.label}`}>
                {mediaLabel(media.kind)} · {media.label}
              </span>
            ))}
            <span className={`pill ${percent >= 100 ? 'green' : 'indigo'} sm`}>{percent}% complete</span>
          </div>
          {paragraphs.map((paragraph, index) => (
            <p className="reader-paragraph" key={index}>
              {paragraph}
            </p>
          ))}
          <div className="reader-end">
            <span className="tiny muted">
              Cached on this device · read offline, progress queues for sync
            </span>
            <div className="reader-end-actions">
              <button type="button" className="btn" onClick={onBack}>
                Continue later
              </button>
              <button type="button" className="btn teal" onClick={onComplete}>
                <Icon name="check" size={14} /> Mark complete
              </button>
            </div>
          </div>
        </div>
      </Card>
      <aside className="rail">
        <Card className="rail-card">
          <CardHead title="Lesson progress" icon="clock" />
          <div className="meter">
            <span style={{ width: `${Math.max(2, percent)}%` }} />
          </div>
          <div className="tiny muted reader-progress-note">
            Progress is a `lesson_progress` op merged by HLC. Marking complete is a local write first.
          </div>
        </Card>
        <Card className="rail-card">
          <CardHead title="In this lesson" icon="list" />
          <ul className="check-list">
            <li className="done">
              <Icon name="file" size={13} /> {lesson.summary}
            </li>
            {lesson.media.map((media) => (
              <li key={media.label}>
                <Icon name="download" size={13} /> {mediaLabel(media.kind)} {media.label}
                {media.sizeKb ? ` · ${media.sizeKb} KB` : ''}
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}
