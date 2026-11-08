/**
 * Offline catalog: the course, lesson bodies and assignment/rubric are prefetched
 * into IndexedDB so the Library and Assignment pages open without the network.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { SEED, type Assignment, type Course, type Lesson } from '@edusync/protocol';
import * as db from '../db';
import { api } from '../api';
import { ensureToken } from '../auth';
import { engine } from '../sync/engine';
import { useAuth } from './useEngine';

export interface CatalogSnapshot {
  course: Course | null;
  lessons: Lesson[];
  assignments: Assignment[];
  assignment: Assignment | null;
  ready: boolean;
  refreshing: boolean;
  lastFetchedAt: number | null;
  lastError: string | null;
}

const initial: CatalogSnapshot = {
  course: null,
  lessons: [],
  assignments: [],
  assignment: null,
  ready: false,
  refreshing: false,
  lastFetchedAt: null,
  lastError: null,
};

let snapshot: CatalogSnapshot = initial;
const listeners = new Set<() => void>();
let refreshPromise: Promise<void> | null = null;

function setSnapshot(patch: Partial<CatalogSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCatalogSnapshot(): CatalogSnapshot {
  return snapshot;
}

export async function loadCatalogFromDb(): Promise<void> {
  const [storedCourse, storedLessons, storedAssignments, storedAssignment] = await Promise.all([
    db.getCatalog<Course>(`course:${SEED.courseId}`),
    db.getCatalog<Lesson[]>('lessons'),
    db.getCatalog<Assignment[]>('assignments'),
    db.getCatalog<Assignment>(`assignment:${SEED.assignmentId}`),
  ]);
  const assignments = storedAssignments ?? [];
  setSnapshot({
    course: storedCourse,
    lessons: storedLessons ?? storedCourse?.lessons ?? [],
    assignments,
    assignment:
      storedAssignment ?? assignments.find((item) => item.id === SEED.assignmentId) ?? null,
    ready: true,
  });
}

/** Pull the catalog from the server and cache it for offline use. */
export async function refreshCatalog(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  // The connection simulator gates every network call, including the catalog prefetch.
  if (engine.isSimulateOffline()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const token = await ensureToken();
  if (!token) return;

  setSnapshot({ refreshing: true, lastError: null });
  refreshPromise = (async () => {
    try {
      const [, courseResponse, assignmentsResponse] = await Promise.all([
        api.courses(token),
        api.course(token, SEED.courseId),
        api.assignments(token),
      ]);
      const course = courseResponse.course;
      const assignments = assignmentsResponse.assignments ?? [];
      let primary = assignments.find((item) => item.id === SEED.assignmentId) ?? null;
      if (!primary) {
        try {
          primary = (await api.assignment(token, SEED.assignmentId)).assignment;
        } catch {
          primary = null;
        }
      }

      await Promise.all([
        db.putCatalog(`course:${course.id}`, course),
        db.putCatalog('lessons', course.lessons),
        db.putCatalog('assignments', assignments),
        ...assignments.map((assignment) =>
          db.putCatalog(`assignment:${assignment.id}`, assignment),
        ),
      ]);
      if (primary) await db.putCatalog(`assignment:${primary.id}`, primary);

      setSnapshot({
        course,
        lessons: course.lessons,
        assignments,
        assignment: primary,
        ready: true,
        lastFetchedAt: Date.now(),
        lastError: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not download the offline course catalog';
      setSnapshot({ lastError: message });
    } finally {
      refreshPromise = null;
      setSnapshot({ refreshing: false });
    }
  })();

  return refreshPromise;
}

export interface CatalogState extends CatalogSnapshot {
  refresh: () => Promise<void>;
  /** True when the course body is cached on this device. */
  cached: boolean;
  storageKb: number;
}

export function useCatalog(): CatalogState {
  const snap = useSyncExternalStore(subscribeCatalog, getCatalogSnapshot, getCatalogSnapshot);
  const auth = useAuth();

  useEffect(() => {
    if (!snap.ready) void loadCatalogFromDb();
  }, [snap.ready]);

  useEffect(() => {
    if (auth.status !== 'signed-in' || !auth.token || !snap.ready) return;
    const fresh = snap.lastFetchedAt !== null && Date.now() - snap.lastFetchedAt < 60_000;
    if (fresh || snapshot.refreshing) return;
    void refreshCatalog();
  }, [auth.status, auth.token, snap.ready, snap.lastFetchedAt]);

  let kb = 0;
  try {
    kb = snap.course ? Math.max(1, Math.round(JSON.stringify(snap.course).length / 1024)) : 0;
  } catch {
    kb = 0;
  }

  return {
    ...snap,
    refresh: refreshCatalog,
    cached: snap.course !== null,
    storageKb: kb,
  };
}
