/** Wire contract shared by server and client. Keep this file dependency-free. */

export type Role = 'student' | 'instructor';

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
  initials: string;
}

export interface Device {
  id: string;
  userId: string;
  platform: string;
  lastSeenAt: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  summary: string;
  body: string;
  durationMin: number;
  position: number;
  media: { kind: 'video' | 'pdf' | 'audio'; label: string; sizeKb: number }[];
}

export interface Course {
  id: string;
  title: string;
  code: string;
  instructorId: string;
  instructorName: string;
  lessons: Lesson[];
}

export interface RubricCriterion {
  id: string;
  label: string;
  points: number;
  hint: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  prompt: string;
  points: number;
  dueAt: string;
  rubric: RubricCriterion[];
}

export type OpEntity = 'draft' | 'lesson_progress' | 'submission' | 'doc_update';

export interface DraftPayload {
  assignmentId: string;
  answer: string;
  /** HLC of the answer value the client is writing (for per-field ordering). */
  answerHlc: string;
  /** HLC of the answer value the client last saw from the server (stale-write detection). */
  baseAnswerHlc: string | null;
}

export interface LessonProgressPayload {
  lessonId: string;
  percent: number;
  lastOpenedAt: string;
}

export interface SubmissionPayload {
  assignmentId: string;
  /** Client-generated once, reused on every retry: the exactly-once key. */
  submissionId: string;
  contentHash: string;
  body: string;
  clientSubmittedAt: string;
}

export interface DocUpdatePayload {
  docId: string;
  /** base64 of a Yjs update (Y.encodeStateAsUpdate delta). */
  updateB64: string;
}

export type OpPayload = DraftPayload | LessonProgressPayload | SubmissionPayload | DocUpdatePayload;

export interface Op {
  opId: string;
  deviceId: string;
  hlc: string;
  entity: OpEntity;
  entityId: string;
  /** 'append' is used by CRDT document updates; record entities use create/update/delete. */
  type: 'create' | 'update' | 'delete' | 'append';
  baseRev: number;
  payload: OpPayload;
}

export type OpStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected';

export interface OpResult {
  opId: string;
  status: OpStatus;
  serverRev: number;
  reason?: string;
}

export interface SyncPushRequest {
  ops: Op[];
}

export interface SyncPushResponse {
  results: OpResult[];
  serverHlc: string;
  seq: number;
}

/** Materialised server records, delivered to clients by /sync/pull. */
export interface DraftRecord {
  assignmentId: string;
  answer: string;
  answerHlc: string;
  rev: number;
}

export interface LessonProgressRecord {
  lessonId: string;
  percent: number;
  hlc: string;
  rev: number;
}

export interface SubmissionRecord {
  id: string;
  assignmentId: string;
  studentId: string;
  attemptNo: number;
  submissionId: string;
  contentHash: string;
  body: string;
  clientSubmittedAt: string;
  serverReceivedAt: string;
  status: 'submitted';
}

export interface ChangeRow {
  seq: number;
  entity: OpEntity;
  entityId: string;
  rev: number;
  payload: DraftRecord | LessonProgressRecord | SubmissionRecord;
}

export interface SyncPullRequest {
  sinceSeq: number;
  /** Per-document cursors: the last per-doc seq the client has applied. */
  docCursors?: Record<string, number>;
}

export interface DocSummary {
  id: string;
  title: string;
  courseId: string;
  updatedAt: string;
  updateCount: number;
}

export interface DocSnapshotResponse {
  doc: DocSummary;
  /** base64 of a full Yjs state update. */
  snapshotB64: string;
  /** Latest per-document seq included in the snapshot. */
  cursor: number;
  stateVectorB64: string;
}

export interface DocUpdateRecord {
  docId: string;
  seq: number;
  updateB64: string;
  authorUserId: string;
  authorDeviceId: string;
  createdAt: string;
}

export interface SyncPullResponse {
  changes: ChangeRow[];
  conflicts: ConflictRecord[];
  nextSeq: number;
  docUpdates: DocUpdateRecord[];
  nextDocCursors: Record<string, number>;
  serverHlc: string;
}

/** WebSocket messages for live document collaboration (see docs/CONTRACT.md §D5). */
export type DocWsClientMessage =
  | { type: 'hello'; docId: string }
  | { type: 'ping' };

export interface DocWsPresenceMember {
  userId: string;
  name: string;
  deviceId: string;
}

export type DocWsServerMessage =
  | { type: 'hello_ok'; docId: string; cursor: number }
  | { type: 'presence'; docId: string; count: number; members: DocWsPresenceMember[] }
  | {
      type: 'doc_update';
      docId: string;
      seq: number;
      updateB64: string;
      authorUserId: string;
      authorName: string;
      authorDeviceId: string;
    };

export interface ConflictRecord {
  id: string;
  entity: OpEntity;
  entityId: string;
  field: string;
  leftJson: string;
  rightJson: string;
  leftLabel: string;
  rightLabel: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface SubmissionsResponse {
  submission: SubmissionRecord;
  deduped: boolean;
}

export interface LoginResponse {
  user: User;
  token: string;
  serverTime: string;
}

export interface StateHashResponse {
  seq: number;
  hash: string;
}

export const SEED = {
  courseId: 'c_bio201',
  assignmentId: 'a_3',
  users: {
    instructor: 'u_priya',
    studentA: 'u_aarav',
    studentB: 'u_yuki',
  },
} as const;
