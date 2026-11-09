/**
 * Typed client for the EduSync server (see docs/CONTRACT.md §2).
 * Base URL: VITE_API_BASE, defaulting to the local dev server.
 */
import type {
  Assignment,
  ConflictRecord,
  Course,
  DocSnapshotResponse,
  DocSummary,
  LoginResponse,
  Op,
  OpResult,
  StateHashResponse,
  SubmissionPayload,
  SubmissionRecord,
  SubmissionsResponse,
  SyncPullResponse,
  SyncPushResponse,
  User,
} from '@edusync/protocol';

export const API_BASE: string = (
  import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8787'
).replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, message: string, payload: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

interface RequestOptions {
  token?: string | null;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
}

function errorMessageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
  }
  if (typeof payload === 'string' && payload.trim()) return payload;
  return fallback;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    window.clearTimeout(timeout);
    const message =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'The server did not respond in time'
        : 'Cannot reach the EduSync server';
    throw new ApiError(0, message, { reason: 'network' });
  }
  window.clearTimeout(timeout);

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      errorMessageFrom(payload, `Request failed with HTTP ${response.status}`),
      payload,
    );
  }
  return payload as T;
}

/* --------------------------------------------------------------- payloads */

export interface HealthResponse {
  ok: boolean;
  time: string;
  serverHlc: string;
}

export interface CourseSummary {
  id: string;
  code: string;
  title: string;
  lessonCount: number;
}

export interface CoursesResponse {
  courses: CourseSummary[];
}

export interface CourseResponse {
  course: Course;
}

export interface AssignmentsResponse {
  assignments: Assignment[];
}

export interface AssignmentResponse {
  assignment: Assignment;
  submission: SubmissionRecord | null;
}

export interface MeResponse {
  user: User;
}

export interface ConflictsResponse {
  conflicts: ConflictRecord[];
}

export interface ResolveConflictResponse {
  conflict: ConflictRecord;
  applied: boolean;
}

export interface MySubmissionsResponse {
  submissions: SubmissionRecord[];
}

export interface PushResultRow extends OpResult {}

/* -------------------------------------------------- shared documents (§D3) */

export interface DocsResponse {
  docs: DocSummary[];
}

export type DocDetailResponse = DocSnapshotResponse;

/** WebSocket URL for the live document channel (`§D5`), derived from the HTTP base. */
export function docWsUrl(token: string, docId: string): string {
  const url = new URL(API_BASE);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.searchParams.set('token', token);
  url.searchParams.set('docId', docId);
  return url.toString();
}

/* ------------------------------------------------------------------- api */

export const api = {
  health(): Promise<HealthResponse> {
    return request<HealthResponse>('/api/health', { timeoutMs: 2500 });
  },

  login(userId: string, deviceId: string, platform = 'web'): Promise<LoginResponse> {
    return request<LoginResponse>('/api/auth/login', {
      body: { userId, deviceId, platform },
      timeoutMs: 5000,
    });
  },

  me(token: string): Promise<MeResponse> {
    return request<MeResponse>('/api/me', { token });
  },

  courses(token: string): Promise<CoursesResponse> {
    return request<CoursesResponse>('/api/courses', { token });
  },

  course(token: string, courseId: string): Promise<CourseResponse> {
    return request<CourseResponse>(`/api/courses/${encodeURIComponent(courseId)}`, { token });
  },

  assignments(token: string): Promise<AssignmentsResponse> {
    return request<AssignmentsResponse>('/api/assignments', { token });
  },

  assignment(token: string, assignmentId: string): Promise<AssignmentResponse> {
    return request<AssignmentResponse>(`/api/assignments/${encodeURIComponent(assignmentId)}`, {
      token,
    });
  },

  mySubmissions(token: string): Promise<MySubmissionsResponse> {
    return request<MySubmissionsResponse>('/api/submissions/mine', { token });
  },

  createSubmission(token: string, payload: SubmissionPayload): Promise<SubmissionsResponse> {
    return request<SubmissionsResponse>('/api/submissions', { token, body: payload });
  },

  push(token: string, ops: Op[]): Promise<SyncPushResponse> {
    return request<SyncPushResponse>('/api/sync/push', { token, body: { ops } });
  },

  pull(
    token: string,
    sinceSeq: number,
    docCursors?: Record<string, number>,
  ): Promise<SyncPullResponse> {
    const body: { sinceSeq: number; docCursors?: Record<string, number> } = { sinceSeq };
    if (docCursors && Object.keys(docCursors).length > 0) body.docCursors = docCursors;
    return request<SyncPullResponse>('/api/sync/pull', { token, body });
  },

  docs(token: string): Promise<DocsResponse> {
    return request<DocsResponse>('/api/docs', { token });
  },

  docSnapshot(token: string, docId: string): Promise<DocDetailResponse> {
    return request<DocDetailResponse>(`/api/docs/${encodeURIComponent(docId)}`, { token });
  },

  stateHash(token: string): Promise<StateHashResponse> {
    return request<StateHashResponse>('/api/sync/state-hash', { token });
  },

  conflicts(token: string): Promise<ConflictsResponse> {
    return request<ConflictsResponse>('/api/conflicts', { token });
  },

  resolveConflict(
    token: string,
    conflictId: string,
    resolution: 'mine' | 'theirs',
    note?: string,
  ): Promise<ResolveConflictResponse> {
    return request<ResolveConflictResponse>(
      `/api/conflicts/${encodeURIComponent(conflictId)}/resolve`,
      { token, body: note ? { resolution, note } : { resolution } },
    );
  },
};

export { ApiError as HttpError };
