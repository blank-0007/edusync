import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

/**
 * SQLite bootstrap for EduSync.
 *
 * The database is the single reconciliation spine: catalog tables (seeded), the
 * server-side op log (dedupe authority), the materialised per-user record state,
 * the per-user change feed (`changes` + `user_seq`) that `/api/sync/pull` pages
 * through, and the conflict ledger.
 *
 * Schema creation is idempotent and guarded by SQLite's `user_version`.
 */

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('student', 'instructor')),
  email       TEXT NOT NULL UNIQUE,
  initials    TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  code          TEXT NOT NULL,
  instructor_id TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id),
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL,
  body        TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  position    INTEGER NOT NULL,
  media_json  TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id),
  title       TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  points      INTEGER NOT NULL,
  due_at      TEXT NOT NULL,
  rubric_json TEXT NOT NULL DEFAULT '[]'
);

-- Immutable server attempts. Exactly-once = UNIQUE(submission_id) plus one MVP attempt per
-- (assignment, student). content_hash lets a revision be recognised as the same work.
CREATE TABLE IF NOT EXISTS submissions (
  id                  TEXT PRIMARY KEY,
  assignment_id       TEXT NOT NULL REFERENCES assignments(id),
  student_id          TEXT NOT NULL REFERENCES users(id),
  attempt_no          INTEGER NOT NULL,
  submission_id       TEXT NOT NULL UNIQUE,
  content_hash        TEXT NOT NULL,
  body                TEXT NOT NULL,
  client_submitted_at TEXT NOT NULL,
  server_received_at  TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'submitted',
  rev                 INTEGER NOT NULL DEFAULT 1,
  UNIQUE (assignment_id, student_id, attempt_no)
);

CREATE TABLE IF NOT EXISTS drafts (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id TEXT NOT NULL REFERENCES assignments(id),
  answer        TEXT NOT NULL,
  answer_hlc    TEXT NOT NULL,
  rev           INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, assignment_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id      TEXT NOT NULL REFERENCES lessons(id),
  percent        INTEGER NOT NULL,
  hlc            TEXT NOT NULL,
  rev            INTEGER NOT NULL DEFAULT 1,
  last_opened_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

-- Dedupe authority for the at-least-once transport. A row here means the opId was
-- already processed; replays return the original server_rev instead of re-applying.
CREATE TABLE IF NOT EXISTS op_log (
  op_id        TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  hlc          TEXT NOT NULL,
  entity       TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  base_rev     INTEGER NOT NULL DEFAULT 0,
  server_rev   INTEGER,
  status       TEXT NOT NULL,
  reason       TEXT,
  applied_at   TEXT NOT NULL
);

-- Per-user change feed. seq is allocated monotonically per user (user_seq below) so a
-- client can pull with a tiny integer cursor instead of a state vector.
CREATE TABLE IF NOT EXISTS changes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  entity       TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  rev          INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  UNIQUE (user_id, seq)
);

CREATE TABLE IF NOT EXISTS user_seq (
  user_id  TEXT PRIMARY KEY,
  next_seq INTEGER NOT NULL DEFAULT 0
);

-- Nothing is discarded: both sides of a contested value live here forever.
CREATE TABLE IF NOT EXISTS conflicts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  field       TEXT NOT NULL,
  left_json   TEXT NOT NULL,
  right_json  TEXT NOT NULL,
  left_label  TEXT NOT NULL,
  right_label TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  resolution  TEXT,
  note        TEXT,
  resolved_at TEXT,
  created_at  TEXT NOT NULL
);

-- Hash-chained audit trail (each row hashes the previous row's hash + its own content).
CREATE TABLE IF NOT EXISTS audit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  subject     TEXT NOT NULL,
  before_json TEXT,
  after_json  TEXT,
  prev_hash   TEXT NOT NULL,
  hash        TEXT NOT NULL,
  at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, position);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id, assignment_id);
CREATE INDEX IF NOT EXISTS idx_changes_user_seq ON changes(user_id, seq);
CREATE INDEX IF NOT EXISTS idx_conflicts_user_status ON conflicts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_op_log_user ON op_log(user_id);
`;

/** Default on-disk location: apps/server/data/edusync.db (independent of the cwd). */
export function defaultDbPath(): string {
  return fileURLToPath(new URL('../data/edusync.db', import.meta.url));
}

export function resolveDbPath(dbPath?: string): string {
  if (!dbPath || dbPath.trim() === '') return defaultDbPath();
  if (dbPath === ':memory:') return dbPath;
  return isAbsolute(dbPath) ? dbPath : resolve(process.cwd(), dbPath);
}

export function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  const version = Number(row?.user_version ?? 0);
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `database schema version ${version} is newer than this server supports (${SCHEMA_VERSION}); refusing to start`,
    );
  }
  db.exec(SCHEMA);
  if (version < SCHEMA_VERSION) {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

/** Open a database, apply pragmas and ensure the schema exists. */
export function openDb(dbPath?: string): DatabaseSync {
  const resolved = resolveDbPath(dbPath);
  if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Run `fn` in an IMMEDIATE transaction, rolling back on any throw. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* the transaction is already gone */
    }
    throw error;
  }
}
