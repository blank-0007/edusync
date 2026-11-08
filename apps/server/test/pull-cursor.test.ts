import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ulid } from '@edusync/protocol';
import {
  api,
  draftPayload,
  hlc,
  login,
  makeOp,
  progressPayload,
  pushOps,
  setup,
  stateHash,
  submissionPayload,
} from './helpers';

interface PullBody {
  changes: {
    seq: number;
    entity: string;
    entityId: string;
    rev: number;
    payload: { answer?: string; percent?: number; submissionId?: string; id?: string };
  }[];
  conflicts: { id: string }[];
  nextSeq: number;
  serverHlc: string;
}

test('pull pages the per-user change feed with a monotonic seq cursor', async (t) => {
  const { app } = setup(t);
  const { token, deviceId } = await login(app);
  const submissionId = ulid();

  const pushed = await pushOps(app, token, [
    makeOp({
      deviceId,
      entity: 'draft',
      entityId: 'a_3',
      hlc: hlc(1_000, 0, deviceId),
      payload: draftPayload('autosaved draft', hlc(1_000, 0, deviceId)),
    }),
    makeOp({
      deviceId,
      entity: 'lesson_progress',
      entityId: 'l_1',
      hlc: hlc(1_100, 0, deviceId),
      payload: progressPayload('l_1', 40),
    }),
    makeOp({
      deviceId,
      entity: 'submission',
      entityId: submissionId,
      hlc: hlc(1_200, 0, deviceId),
      payload: submissionPayload(submissionId),
    }),
  ]);
  assert.deepEqual(
    pushed.results.map((result) => result.status),
    ['applied', 'applied', 'applied'],
  );
  assert.equal(pushed.seq, 3);

  const first = await api<PullBody>(app, token, 'POST', '/api/sync/pull', { sinceSeq: 0 });
  assert.equal(first.status, 200);
  assert.equal(first.body.changes.length, 3);
  assert.deepEqual(
    first.body.changes.map((change) => change.seq),
    [1, 2, 3],
  );
  assert.deepEqual(
    first.body.changes.map((change) => change.entity),
    ['draft', 'lesson_progress', 'submission'],
  );
  assert.equal(first.body.nextSeq, 3);
  assert.deepEqual(first.body.conflicts, []);
  assert.match(first.body.serverHlc, /^\d{13}:\d{5}:srv$/);

  // Records are materialised current state, ready to be applied blindly by the client.
  assert.equal(first.body.changes[0].payload.answer, 'autosaved draft');
  assert.equal(first.body.changes[0].entityId, 'a_3');
  assert.equal(first.body.changes[1].payload.percent, 40);
  assert.equal(first.body.changes[1].rev, 1);
  assert.equal(first.body.changes[2].payload.submissionId, submissionId);
  assert.equal(first.body.changes[2].payload.id, `sub_${submissionId}`);

  const caughtUp = await api<PullBody>(app, token, 'POST', '/api/sync/pull', { sinceSeq: 3 });
  assert.deepEqual(caughtUp.body.changes, []);
  assert.equal(caughtUp.body.nextSeq, 3);

  const partial = await api<PullBody>(app, token, 'POST', '/api/sync/pull', { sinceSeq: 1 });
  assert.deepEqual(
    partial.body.changes.map((change) => change.seq),
    [2, 3],
  );
  assert.equal(partial.body.nextSeq, 3);

  // Direct DB assertions: contiguous per-user seqs and the cursor table.
  const changeRows = app.db
    .prepare('SELECT user_id, seq FROM changes WHERE user_id = ? ORDER BY seq ASC')
    .all('u_aarav') as { user_id: string; seq: number }[];
  assert.deepEqual(
    changeRows.map((row) => Number(row.seq)),
    [1, 2, 3],
  );
  const cursor = app.db.prepare('SELECT next_seq FROM user_seq WHERE user_id = ?').get('u_aarav') as {
    next_seq: number;
  };
  assert.equal(Number(cursor.next_seq), 3);
  // seq is unique per user, not global.
  const unique = app.db
    .prepare('SELECT COUNT(DISTINCT seq) AS count FROM changes WHERE user_id = ?')
    .get('u_aarav') as { count: number };
  assert.equal(Number(unique.count), 3);
});

test('pull cursors and seq allocation are per user', async (t) => {
  const { app } = setup(t);
  const aarav = await login(app, 'u_aarav', 'device-aarav');
  const yuki = await login(app, 'u_yuki', 'device-yuki');

  await pushOps(app, aarav.token, [
    makeOp({
      deviceId: 'device-aarav',
      entity: 'lesson_progress',
      entityId: 'l_1',
      hlc: hlc(2_000, 0, 'device-aarav'),
      payload: progressPayload('l_1', 10),
    }),
  ]);

  const aaravPull = await api<PullBody>(app, aarav.token, 'POST', '/api/sync/pull', { sinceSeq: 0 });
  assert.equal(aaravPull.body.changes.length, 1);
  assert.equal(aaravPull.body.nextSeq, 1);

  const yukiBefore = await api<PullBody>(app, yuki.token, 'POST', '/api/sync/pull', { sinceSeq: 0 });
  assert.deepEqual(yukiBefore.body.changes, []);
  assert.equal(yukiBefore.body.nextSeq, 0);

  const yukiPush = await pushOps(app, yuki.token, [
    makeOp({
      deviceId: 'device-yuki',
      entity: 'lesson_progress',
      entityId: 'l_2',
      hlc: hlc(2_100, 0, 'device-yuki'),
      payload: progressPayload('l_2', 20),
    }),
  ]);
  assert.equal(yukiPush.seq, 1, 'per-user seq starts at 1 for a new user');

  const yukiAfter = await api<PullBody>(app, yuki.token, 'POST', '/api/sync/pull', { sinceSeq: 0 });
  assert.equal(yukiAfter.body.changes.length, 1);
  assert.deepEqual(
    yukiAfter.body.changes.map((change) => [change.seq, change.entityId]),
    [[1, 'l_2']],
  );

  const aaravCaughtUp = await api<PullBody>(app, aarav.token, 'POST', '/api/sync/pull', { sinceSeq: 1 });
  assert.deepEqual(aaravCaughtUp.body.changes, [], 'one user cannot observe another user changes');
});

test('lesson progress is LWW by HLC: stale writes are acked without effect', async (t) => {
  const { app } = setup(t);
  const { token, deviceId } = await login(app);

  const newer = makeOp({
    deviceId,
    entity: 'lesson_progress',
    entityId: 'l_1',
    hlc: hlc(3_000, 0, deviceId),
    payload: progressPayload('l_1', 40),
  });
  const stale = makeOp({
    deviceId,
    entity: 'lesson_progress',
    entityId: 'l_1',
    hlc: hlc(2_500, 0, deviceId),
    payload: progressPayload('l_1', 10),
  });

  const first = await pushOps(app, token, [newer]);
  assert.equal(first.results[0].status, 'applied');
  assert.equal(first.results[0].serverRev, 1);

  const replay = await pushOps(app, token, [stale]);
  assert.equal(replay.results[0].status, 'applied');
  assert.equal(replay.results[0].serverRev, 1, 'stale op is acknowledged at the current rev');

  let progress = app.db
    .prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?')
    .get('u_aarav', 'l_1') as { percent: number; hlc: string; rev: number };
  assert.equal(Number(progress.percent), 40);
  assert.equal(Number(progress.rev), 1);

  const later = makeOp({
    deviceId,
    entity: 'lesson_progress',
    entityId: 'l_1',
    hlc: hlc(3_100, 0, deviceId),
    payload: progressPayload('l_1', 75),
  });
  const applied = await pushOps(app, token, [later]);
  assert.equal(applied.results[0].status, 'applied');
  assert.equal(applied.results[0].serverRev, 2);

  progress = app.db
    .prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?')
    .get('u_aarav', 'l_1') as { percent: number; hlc: string; rev: number };
  assert.equal(Number(progress.percent), 75);
  assert.equal(Number(progress.rev), 2);

  const pull = await api<PullBody>(app, token, 'POST', '/api/sync/pull', { sinceSeq: 0 });
  assert.deepEqual(
    pull.body.changes.map((change) => change.payload.percent),
    [40, 75],
  );
});

test('state-hash seq tracks the change feed and is stable for an empty user', async (t) => {
  const { app } = setup(t);
  const { token, deviceId } = await login(app);

  const empty = await stateHash(app, token);
  assert.equal(empty.seq, 0);
  assert.match(empty.hash, /^[0-9a-f]{64}$/);

  const pushed = await pushOps(app, token, [
    makeOp({
      deviceId,
      entity: 'lesson_progress',
      entityId: 'l_1',
      hlc: hlc(4_000, 0, deviceId),
      payload: progressPayload('l_1', 25),
    }),
  ]);
  const after = await stateHash(app, token);
  assert.equal(after.seq, pushed.seq);
  assert.equal(after.seq, 1);
  assert.notEqual(after.hash, empty.hash);
});
