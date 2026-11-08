import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ulid } from '@edusync/protocol';
import { api, hlc, login, makeOp, pushOps, setup, stateHash, submissionPayload } from './helpers';

test('the same submissionId submitted 5x creates exactly one attempt (HTTP)', async (t) => {
  const { app } = setup(t);
  const { token } = await login(app);
  const submissionId = ulid();
  const payload = submissionPayload(submissionId);

  const ids: string[] = [];
  const deduped: boolean[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await api<{ submission: { id: string; submissionId: string; attemptNo: number }; deduped: boolean }>(
      app,
      token,
      'POST',
      '/api/submissions',
      payload,
    );
    assert.equal(response.status, 200, `attempt ${attempt + 1} succeeds`);
    ids.push(response.body.submission.id);
    deduped.push(response.body.deduped);
  }
  assert.deepEqual(deduped, [false, true, true, true, true]);
  assert.equal(new Set(ids).size, 1, 'every response carries the same canonical attempt');

  const rows = app.db.prepare('SELECT * FROM submissions').all() as {
    submission_id: string;
    attempt_no: number;
    status: string;
  }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].submission_id, submissionId);
  assert.equal(Number(rows[0].attempt_no), 1);
  assert.equal(rows[0].status, 'submitted');

  const mine = await api<{ submissions: { submissionId: string; attemptNo: number }[] }>(
    app,
    token,
    'GET',
    '/api/submissions/mine',
  );
  assert.equal(mine.body.submissions.length, 1);
  assert.equal(mine.body.submissions[0].attemptNo, 1);

  // The retry storm is auditable: one create + four absorbed duplicate deliveries.
  const auditRows = app.db
    .prepare('SELECT action, COUNT(*) AS count FROM audit_events GROUP BY action ORDER BY action')
    .all() as { action: string; count: number }[];
  const audit = Object.fromEntries(auditRows.map((row) => [row.action, Number(row.count)]));
  assert.equal(audit['submission.create'], 1);
  assert.equal(audit['submission.duplicate'], 4);
});

test('a different submissionId is rejected with 409 and never creates a second attempt', async (t) => {
  const { app } = setup(t);
  const { token } = await login(app);
  const firstId = ulid();
  const secondId = ulid();

  const first = await api<{ submission: { submissionId: string } }>(
    app,
    token,
    'POST',
    '/api/submissions',
    submissionPayload(firstId),
  );
  assert.equal(first.status, 200);

  const second = await api<{
    error: string;
    existing: { submissionId: string };
    conflictId: string;
  }>(app, token, 'POST', '/api/submissions', submissionPayload(secondId));
  assert.equal(second.status, 409);
  assert.equal(second.body.error, 'already_submitted');
  assert.equal(second.body.existing.submissionId, firstId);
  assert.match(second.body.conflictId, /^cfl_/);

  const count = app.db.prepare('SELECT COUNT(*) AS count FROM submissions').get() as { count: number };
  assert.equal(Number(count.count), 1, 'still exactly one attempt row');

  const conflicts = await api<{
    conflicts: { id: string; entity: string; entityId: string; status: string; leftJson: string; rightJson: string }[];
  }>(app, token, 'GET', '/api/conflicts');
  assert.equal(conflicts.status, 200);
  assert.equal(conflicts.body.conflicts.length, 1);
  const conflict = conflicts.body.conflicts[0];
  assert.equal(conflict.id, second.body.conflictId);
  assert.equal(conflict.entity, 'submission');
  assert.equal(conflict.entityId, secondId);
  assert.equal(conflict.status, 'open');
  assert.equal((JSON.parse(conflict.leftJson) as { submissionId: string }).submissionId, firstId);
  assert.equal((JSON.parse(conflict.rightJson) as { submissionId: string }).submissionId, secondId);
});

test('sync push: same submissionId with 5 distinct opIds -> 1 applied + 4 duplicate', async (t) => {
  const { app } = setup(t);
  const { token, deviceId } = await login(app);
  const submissionId = ulid();

  const ops = Array.from({ length: 5 }, (_value, index) =>
    makeOp({
      deviceId,
      entity: 'submission',
      entityId: submissionId,
      hlc: hlc(30_000 + index, 0, deviceId),
      payload: submissionPayload(submissionId),
    }),
  );

  const pushed = await pushOps(app, token, ops);
  assert.deepEqual(
    pushed.results.map((result) => result.status),
    ['applied', 'duplicate', 'duplicate', 'duplicate', 'duplicate'],
  );
  assert.ok(pushed.results.every((result) => result.serverRev === 1));

  const submissionCount = app.db.prepare('SELECT COUNT(*) AS count FROM submissions').get() as { count: number };
  assert.equal(Number(submissionCount.count), 1);

  const opLog = app.db
    .prepare('SELECT status, COUNT(*) AS count FROM op_log GROUP BY status')
    .all() as { status: string; count: number }[];
  const byStatus = Object.fromEntries(opLog.map((row) => [row.status, Number(row.count)]));
  assert.equal(byStatus.applied, 1);
  assert.equal(byStatus.duplicate, 4);

  // The materialised submission is pulled exactly once, no matter the retries.
  const pulled = await api<{ changes: { entity: string; entityId: string; payload: { id: string } }[] }>(
    app,
    token,
    'POST',
    '/api/sync/pull',
    { sinceSeq: 0 },
  );
  assert.equal(pulled.body.changes.length, 1);
  assert.equal(pulled.body.changes[0].entity, 'submission');
  assert.equal(pulled.body.changes[0].entityId, submissionId);
  assert.equal(pulled.body.changes[0].payload.id, `sub_${submissionId}`);

  const hash = await stateHash(app, token);
  const replay = await pushOps(app, token, [ops[0]]);
  assert.equal(replay.results[0].status, 'duplicate');
  assert.deepEqual(await stateHash(app, token), hash);
});

test('sync push: a different submissionId becomes a conflict op, not a second attempt', async (t) => {
  const { app } = setup(t);
  const { token, deviceId } = await login(app);
  const firstId = ulid();
  const secondId = ulid();

  const first = await pushOps(app, token, [
    makeOp({
      deviceId,
      entity: 'submission',
      entityId: firstId,
      hlc: hlc(31_000, 0, deviceId),
      payload: submissionPayload(firstId),
    }),
  ]);
  assert.equal(first.results[0].status, 'applied');

  const second = await pushOps(app, token, [
    makeOp({
      deviceId,
      entity: 'submission',
      entityId: secondId,
      hlc: hlc(31_100, 0, deviceId),
      payload: submissionPayload(secondId),
    }),
  ]);
  assert.equal(second.results[0].status, 'conflict');
  assert.match(second.results[0].reason ?? '', /^already_submitted:sub_/);

  const count = app.db.prepare('SELECT COUNT(*) AS count FROM submissions').get() as { count: number };
  assert.equal(Number(count.count), 1);

  const conflicts = await api<{ conflicts: { entity: string; status: string }[] }>(
    app,
    token,
    'GET',
    '/api/conflicts',
  );
  assert.equal(conflicts.body.conflicts.length, 1);
  assert.equal(conflicts.body.conflicts[0].entity, 'submission');
});

test('GET /api/assignments/:id includes my latest submission', async (t) => {
  const { app } = setup(t);
  const { token } = await login(app);
  const submissionId = ulid();
  const created = await api<{ submission: { id: string } }>(
    app,
    token,
    'POST',
    '/api/submissions',
    submissionPayload(submissionId),
  );
  assert.equal(created.status, 200);

  const detail = await api<{ submission: { id: string; submissionId: string } | null }>(
    app,
    token,
    'GET',
    '/api/assignments/a_3',
  );
  assert.ok(detail.body.submission);
  assert.equal(detail.body.submission.id, created.body.submission.id);
  assert.equal(detail.body.submission.submissionId, submissionId);
});

test('POST /api/submissions validates the body and unknown assignments', async (t) => {
  const { app } = setup(t);
  const { token } = await login(app);

  const missingField = await api<{ error: string }>(app, token, 'POST', '/api/submissions', {
    assignmentId: 'a_3',
    submissionId: 'sub_1',
  });
  assert.equal(missingField.status, 400);
  assert.equal(missingField.body.error, 'validation_error');

  const unknownAssignment = await api<{ error: string }>(
    app,
    token,
    'POST',
    '/api/submissions',
    submissionPayload(ulid(), { assignmentId: 'a_missing' }),
  );
  assert.equal(unknownAssignment.status, 404);
  assert.equal(unknownAssignment.body.error, 'assignment_not_found');
});
