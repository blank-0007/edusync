import type { DatabaseSync } from 'node:sqlite';
import type {
  Assignment,
  ConflictRecord,
  Course,
  Lesson,
  Role,
  SubmissionRecord,
  User,
} from '@edusync/protocol';

/** Raw row shapes (snake_case) mirroring src/db.ts. */

export interface UserRow {
  id: string;
  name: string;
  role: Role;
  email: string;
  initials: string;
  created_at: string;
}

export interface DeviceRow {
  id: string;
  user_id: string;
  platform: string;
  last_seen_at: string;
  created_at: string;
}

export interface CourseRow {
  id: string;
  title: string;
  code: string;
  instructor_id: string;
  instructor_name?: string;
}

export interface LessonRow {
  id: string;
  course_id: string;
  title: string;
  summary: string;
  body: string;
  duration_min: number;
  position: number;
  media_json: string;
}

export interface AssignmentRow {
  id: string;
  course_id: string;
  title: string;
  prompt: string;
  points: number;
  due_at: string;
  rubric_json: string;
}

export interface SubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  attempt_no: number;
  submission_id: string;
  content_hash: string;
  body: string;
  client_submitted_at: string;
  server_received_at: string;
  status: string;
  rev: number;
}

export interface DraftRow {
  user_id: string;
  assignment_id: string;
  answer: string;
  answer_hlc: string;
  rev: number;
  updated_at: string;
}

export interface LessonProgressRow {
  user_id: string;
  lesson_id: string;
  percent: number;
  hlc: string;
  rev: number;
  last_opened_at: string;
}

export interface OpLogRow {
  op_id: string;
  user_id: string;
  device_id: string;
  hlc: string;
  entity: string;
  entity_id: string;
  type: string;
  payload_json: string;
  base_rev: number;
  server_rev: number | null;
  status: string;
  reason: string | null;
  applied_at: string;
}

export interface ConflictRow {
  id: string;
  user_id: string;
  entity: string;
  entity_id: string;
  field: string;
  left_json: string;
  right_json: string;
  left_label: string;
  right_label: string;
  status: string;
  resolution: string | null;
  note: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** ---- wire mappers ---- */

export function userToWire(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    initials: row.initials,
  };
}

export function lessonToWire(row: LessonRow): Lesson {
  let media: Lesson['media'] = [];
  try {
    const parsed: unknown = JSON.parse(row.media_json);
    if (Array.isArray(parsed)) media = parsed as Lesson['media'];
  } catch {
    media = [];
  }
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    durationMin: Number(row.duration_min),
    position: Number(row.position),
    media,
  };
}

export function assignmentToWire(row: AssignmentRow): Assignment {
  let rubric: Assignment['rubric'] = [];
  try {
    const parsed: unknown = JSON.parse(row.rubric_json);
    if (Array.isArray(parsed)) rubric = parsed as Assignment['rubric'];
  } catch {
    rubric = [];
  }
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    prompt: row.prompt,
    points: Number(row.points),
    dueAt: row.due_at,
    rubric,
  };
}

export function submissionToWire(row: SubmissionRow): SubmissionRecord {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    attemptNo: Number(row.attempt_no),
    submissionId: row.submission_id,
    contentHash: row.content_hash,
    body: row.body,
    clientSubmittedAt: row.client_submitted_at,
    serverReceivedAt: row.server_received_at,
    status: 'submitted',
  };
}

export function conflictToWire(row: ConflictRow): ConflictRecord {
  return {
    id: row.id,
    entity: row.entity as ConflictRecord['entity'],
    entityId: row.entity_id,
    field: row.field,
    leftJson: row.left_json,
    rightJson: row.right_json,
    leftLabel: row.left_label,
    rightLabel: row.right_label,
    status: row.status === 'resolved' ? 'resolved' : 'open',
    createdAt: row.created_at,
  };
}

/** ---- lookups ---- */

export function getUser(db: DatabaseSync, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getCourseRow(db: DatabaseSync, id: string): CourseRow | undefined {
  return db
    .prepare(
      `SELECT c.*, u.name AS instructor_name
         FROM courses c JOIN users u ON u.id = c.instructor_id
        WHERE c.id = ?`,
    )
    .get(id) as CourseRow | undefined;
}

export function listLessonRows(db: DatabaseSync, courseId: string): LessonRow[] {
  return db
    .prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY position ASC')
    .all(courseId) as unknown as LessonRow[];
}

export function getLessonRow(db: DatabaseSync, id: string): LessonRow | undefined {
  return db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as LessonRow | undefined;
}

export function getAssignmentRow(db: DatabaseSync, id: string): AssignmentRow | undefined {
  return db.prepare('SELECT * FROM assignments WHERE id = ?').get(id) as AssignmentRow | undefined;
}

export function listAssignmentRows(db: DatabaseSync): AssignmentRow[] {
  return db.prepare('SELECT * FROM assignments ORDER BY due_at ASC, id ASC').all() as unknown as AssignmentRow[];
}

/** Course with lessons (bodies included — this is the web app's offline catalog cache). */
export function getCourse(db: DatabaseSync, id: string): Course | null {
  const row = getCourseRow(db, id);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    code: row.code,
    instructorId: row.instructor_id,
    instructorName: row.instructor_name ?? '',
    lessons: listLessonRows(db, row.id).map(lessonToWire),
  };
}

export function listCourses(db: DatabaseSync): { id: string; code: string; title: string; lessonCount: number }[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.code, c.title,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count
         FROM courses c ORDER BY c.code ASC`,
    )
    .all() as { id: string; code: string; title: string; lesson_count: number }[];
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    lessonCount: Number(r.lesson_count),
  }));
}

export function getDraftRow(db: DatabaseSync, userId: string, assignmentId: string): DraftRow | undefined {
  return db
    .prepare('SELECT * FROM drafts WHERE user_id = ? AND assignment_id = ?')
    .get(userId, assignmentId) as DraftRow | undefined;
}

export function listDraftRows(db: DatabaseSync, userId: string): DraftRow[] {
  return db
    .prepare('SELECT * FROM drafts WHERE user_id = ? ORDER BY assignment_id ASC')
    .all(userId) as unknown as DraftRow[];
}

export function getProgressRow(
  db: DatabaseSync,
  userId: string,
  lessonId: string,
): LessonProgressRow | undefined {
  return db
    .prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?')
    .get(userId, lessonId) as LessonProgressRow | undefined;
}

export function listProgressRows(db: DatabaseSync, userId: string): LessonProgressRow[] {
  return db
    .prepare('SELECT * FROM lesson_progress WHERE user_id = ? ORDER BY lesson_id ASC')
    .all(userId) as unknown as LessonProgressRow[];
}

export function getSubmissionBySubmissionId(
  db: DatabaseSync,
  submissionId: string,
): SubmissionRow | undefined {
  return db.prepare('SELECT * FROM submissions WHERE submission_id = ?').get(submissionId) as
    | SubmissionRow
    | undefined;
}

export function getSubmissionForAssignment(
  db: DatabaseSync,
  studentId: string,
  assignmentId: string,
): SubmissionRow | undefined {
  return db
    .prepare(
      'SELECT * FROM submissions WHERE student_id = ? AND assignment_id = ? ORDER BY attempt_no ASC LIMIT 1',
    )
    .get(studentId, assignmentId) as SubmissionRow | undefined;
}

export function listSubmissionRows(db: DatabaseSync, studentId: string): SubmissionRow[] {
  return db
    .prepare('SELECT * FROM submissions WHERE student_id = ? ORDER BY server_received_at DESC, id ASC')
    .all(studentId) as unknown as SubmissionRow[];
}

export function getOpLog(db: DatabaseSync, opId: string): OpLogRow | undefined {
  return db.prepare('SELECT * FROM op_log WHERE op_id = ?').get(opId) as OpLogRow | undefined;
}

export function getConflictRow(db: DatabaseSync, id: string): ConflictRow | undefined {
  return db.prepare('SELECT * FROM conflicts WHERE id = ?').get(id) as ConflictRow | undefined;
}

export function listConflictRows(db: DatabaseSync, userId: string): ConflictRow[] {
  return db
    .prepare(
      `SELECT * FROM conflicts WHERE user_id = ?
        ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at ASC, id ASC`,
    )
    .all(userId) as unknown as ConflictRow[];
}
