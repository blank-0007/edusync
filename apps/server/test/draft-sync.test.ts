import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, draftPayload, hlc, login, makeOp, pushOps, setup, stateHash } from './helpers';

test('duplicate op is absorbed (duplicate + original serverRev) and state-hash is unchanged', async (t) => {
  const { app } = setup(t);
  const { token, deviceId } = await login(app);

  const op = makeOp({
    deviceId,
    entity: 'draft',
    entityId: 'a_3',
    hlc: hlc(1_000, 0, deviceId),
    payload: draftPayload('First save of my worksheet answer.', hlc(1_000, 0, deviceId)),
  });

  const first = await pushOps(app, token, [op]);
  assert.equal(first.results.length, 1);
  assert.equal(first.results[0].status, 'applied');
  assert.equal(first.results[0].serverRev, 1);

  const hashAfterFirst = await stateHash(app, token);

  const duplicate = await pushOps(app, token, [op]);
  assert.equal(duplicate.results[0].status, 'duplicate');
  assert.equal(duplicate.results[0].serverRev, 1);

  const hashAfterDuplicate = await stateHash(app, token);
  assert.deepEqual(hashAfterDuplicate, hashAfterFirst, 'a duplicate push must not move state');

  // The duplicate is also absorbed inside one batch (same opId twice).
  const inBatch = await pushOps(app, token, [op, op]);
  assert.deepEqual(
    inBatch.results.map((result) => result.status),
    ['duplicate', 'duplicate'],
  );

  // Exactly one op_log row, one change row, one draft row.
  const opLogCount = app.db.prepare('SELECT COUNT(*) AS count FROM op_log').get() as { count: number };
  assert.equal(Number(opLogCount.count), 1);
  const changeCount = app.db.prepare('SELECT COUNT(*) AS count FROM changes').get() as { count: number };
  assert.equal(Number(changeCount.count), 1);

  const draft = app.db.prepare('SELECT * FROM drafts WHERE user_id = ? AND assignment_id = ?').get('u_aarav', 'a_3') as {
    answer: string;
    rev: number;
  };
  assert.equal(draft.answer, 'First save of my worksheet answer.');
  assert.equal(Number(draft.rev), 1);
});

test('out-of-HLC-order batch applies in HLC order: winner wins, no conflict', async (t) => {
  const { app } = setup(t);
  const { token, deviceId } = await login(app);

  const low = makeOp({
    deviceId,
    entity: 'draft',
    entityId: 'a_3',
    hlc: hlc(2_000, 0, deviceId),
    payload: draftPayload('version 1', hlc(2_000, 0, deviceId)),
  });
  const high = makeOp({
    deviceId,
    entity: 'draft',
    entityId: 'a_3',
    hlc: hlc(3_000, 0, deviceId),
    payload: draftPayload('version 2', hlc(3_000, 0, deviceId)),
  });

  // Deliberately pushed newest-first: the server must sort by HLC before applying.
  const pushed = await pushOps(app, token, [high, low]);
  // Results are returned in request order: high was applied second (rev 2), low first (rev 1).
  assert.deepEqual(
    pushed.results.map((result) => ({ status: result.status, serverRev: result.serverRev })),
    [
      { status: 'applied', serverRev: 2 },
      { status: 'applied', serverRev: 1 },
    ],
  );

  const draft = app.db.prepare('SELECT * FROM drafts WHERE user_id = ? AND assignment_id = ?').get('u_aarav', 'a_3') as {
    answer: string;
    rev: number;
  };
  assert.equal(draft.answer, 'version 2', 'HLC winner is the final answer');
  assert.equal(Number(draft.rev), 2);

  const conflicts = await api<{ conflicts: unknown[] }>(app, token, 'GET', '/api/conflicts');
  assert.deepEqual(conflicts.body.conflicts, []);

  const pulled = await api<{ changes: { seq: number; payload: { answer: string; rev: number } }[] }>(
    app,
    token,
    'POST',
    '/api/sync/pull',
    { sinceSeq: 0 },
  );
  assert.equal(pulled.body.changes.length, 2);
  assert.deepEqual(
    pulled.body.changes.map((change) => change.payload.answer),
    ['version 1', 'version 2'],
  );
});

test('out-of-order pushes across requests converge on the HLC winner without a conflict', async (t) => {
  const { app } = setup(t);
  const { token, deviceId } = await login(app);

  const newer = makeOp({
    deviceId,
    entity: 'draft',
    entityId: 'a_3',
    hlc: hlc(5_000, 0, deviceId),
    payload: draftPayload('newer text', hlc(5_000, 0, deviceId)),
  });
  const older = makeOp({
    deviceId,
    entity: 'draft',
    entityId: 'a_3',
    hlc: hlc(4_000, 0, deviceId),
    payload: draftPayload('older text', hlc(4_000, 0, deviceId)),
  });

  const first = await pushOps(app, token, [newer]);
  assert.equal(first.results[0].status, 'applied');
  assert.equal(first.results[0].serverRev, 1);

  // A stale flush arrives later: acknowledged, but the newer value is retained.
  const stale = await pushOps(app, token, [older]);
  assert.equal(stale.results[0].status, 'applied');
  assert.equal(stale.results[0].serverRev, 1);

  const draft = app.db.prepare('SELECT * FROM drafts WHERE user_id = ? AND assignment_id = ?').get('u_aarav', 'a_3') as {
    answer: string;
    rev: number;
  };
  assert.equal(draft.answer, 'newer text');
  assert.equal(Number(draft.rev), 1, 'stale op does not bump the entity rev');

  const conflicts = await api<{ conflicts: unknown[] }>(app, token, 'GET', '/api/conflicts');
  assert.deepEqual(conflicts.body.conflicts, []);
});

test('L4 stale draft opens a conflict with both versions while applying the HLC winner', async (t) => {
  const { app } = setup(t);
  const deviceA = await login(app, 'u_aarav', 'device-a');
  const deviceB = await login(app, 'u_aarav', 'device-b');

  const base = hlc(5_000, 0, 'device-a');
  const first = makeOp({
    deviceId: 'device-a',
    entity: 'draft',
    entityId: 'a_3',
    hlc: base,
    payload: draftPayload('Server-side version', base),
  });
  const applied = await pushOps(app, deviceA.token, [first]);
  assert.equal(applied.results[0].status, 'applied');

  const hashBeforeConflict = await stateHash(app, deviceA.token);

  // Device B edits against an older value it saw (base is older than the server's rev 1).
  const staleBase = hlc(4_000, 0, 'device-a');
  const incomingHlc = hlc(6_000, 0, 'device-b');
  const stale = makeOp({
    deviceId: 'device-b',
    entity: 'draft',
    entityId: 'a_3',
    hlc: incomingHlc,
    payload: draftPayload('Device B version', incomingHlc, staleBase),
  });
  const pushed = await pushOps(app, deviceB.token, [stale]);
  assert.equal(pushed.results[0].status, 'conflict');

  // Winner (later HLC) is materialised; nothing was discarded.
  const draft = app.db.prepare('SELECT * FROM drafts WHERE user_id = ? AND assignment_id = ?').get('u_aarav', 'a_3') as {
    answer: string;
    rev: number;
    answer_hlc: string;
  };
  assert.equal(draft.answer, 'Device B version');
  assert.equal(draft.answer_hlc, incomingHlc);
  assert.equal(Number(draft.rev), 2);

  const conflicts = await api<{
    conflicts: {
      id: string;
      entity: string;
      entityId: string;
      field: string;
      status: string;
      leftJson: string;
      rightJson: string;
      leftLabel: string;
      rightLabel: string;
    }[];
  }>(app, deviceA.token, 'GET', '/api/conflicts');
  assert.equal(conflicts.status, 200);
  assert.equal(conflicts.body.conflicts.length, 1);
  const conflict = conflicts.body.conflicts[0];
  assert.equal(conflict.entity, 'draft');
  assert.equal(conflict.entityId, 'a_3');
  assert.equal(conflict.field, 'answer');
  assert.equal(conflict.status, 'open');
  assert.equal((JSON.parse(conflict.leftJson) as { answer: string }).answer, 'Server-side version');
  assert.equal((JSON.parse(conflict.rightJson) as { answer: string }).answer, 'Device B version');
  assert.ok(conflict.leftLabel.length > 0 && conflict.rightLabel.length > 0);

  // The pull feed materialises the new winner, and the conflict ledger is part of state.
  const pulled = await api<{ changes: { payload: { answer: string } }[]; conflicts: { id: string }[] }>(
    app,
    deviceA.token,
    'POST',
    '/api/sync/pull',
    { sinceSeq: 0 },
  );
  assert.equal(pulled.body.changes.at(-1)?.payload.answer, 'Device B version');
  assert.deepEqual(
    pulled.body.conflicts.map((row) => row.id),
    [conflict.id],
  );
  const hashAfterConflict = await stateHash(app, deviceA.token);
  assert.notEqual(hashAfterConflict.hash, hashBeforeConflict.hash);

  // The loser survives in the audit trail.
  const audit = app.db
    .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'conflict.open'")
    .get() as { count: number };
  assert.equal(Number(audit.count), 1);
});

test('equivalent op sets pushed in different orders converge to the same state-hash', async (t) => {
  const serverA = setup(t);
  const serverB = setup(t);
  const deviceId = 'convergence-device';
  const loginA = await login(serverA.app, 'u_aarav', deviceId);
  const loginB = await login(serverB.app, 'u_aarav', deviceId);

  const ops = [
    makeOp({
      deviceId,
      entity: 'draft',
      entityId: 'a_3',
      hlc: hlc(10_000, 0, deviceId),
      payload: draftPayload('first draft text', hlc(10_000, 0, deviceId)),
    }),
    makeOp({
      deviceId,
      entity: 'lesson_progress',
      entityId: 'l_1',
      hlc: hlc(10_100, 0, deviceId),
      payload: { lessonId: 'l_1', percent: 40, lastOpenedAt: '2026-01-01T00:00:00.000Z' },
      type: 'update',
    }),
    makeOp({
      deviceId,
      entity: 'draft',
      entityId: 'a_3',
      hlc: hlc(10_200, 0, deviceId),
      payload: draftPayload('second draft text', hlc(10_200, 0, deviceId)),
    }),
    makeOp({
      deviceId,
      entity: 'lesson_progress',
      entityId: 'l_3',
      hlc: hlc(10_300, 0, deviceId),
      payload: { lessonId: 'l_3', percent: 100, lastOpenedAt: '2026-01-02T00:00:00.000Z' },
    }),
  ];

  const inOrder = await pushOps(serverA.app, loginA.token, ops);
  assert.ok(inOrder.results.every((result) => result.status === 'applied'));

  const reversed = [...ops].reverse();
  const outOfOrder = await pushOps(serverB.app, loginB.token, reversed);
  assert.ok(outOfOrder.results.every((result) => result.status === 'applied'));

  const hashA = await stateHash(serverA.app, loginA.token);
  const hashB = await stateHash(serverB.app, loginB.token);
  assert.equal(hashA.hash, hashB.hash, 'arrival order must not affect the converged state');
  assert.equal(hashA.seq, 4);
  assert.equal(hashB.seq, 4);

  // Duplicate replay does not change the hash either.
  await pushOps(serverA.app, loginA.token, [ops[0]]);
  const hashAfterReplay = await stateHash(serverA.app, loginA.token);
  assert.equal(hashAfterReplay.hash, hashA.hash);
});

test('rejected ops are recorded and replayed deterministically', async (t) => {
  const { app } = setup(t);
  const { token, deviceId } = await login(app);

  const unknownAssignment = makeOp({
    deviceId,
    entity: 'draft',
    entityId: 'a_missing',
    hlc: hlc(9_000, 0, deviceId),
    payload: draftPayload('text', hlc(9_000, 0, deviceId), null, 'a_missing'),
  });
  const first = await pushOps(app, token, [unknownAssignment]);
  assert.equal(first.results[0].status, 'rejected');
  assert.equal(first.results[0].reason, 'unknown_assignment');

  const replay = await pushOps(app, token, [unknownAssignment]);
  assert.equal(replay.results[0].status, 'rejected', 'a rejected op stays rejected');
  assert.equal(replay.results[0].reason, 'unknown_assignment');

  const badPayload = makeOp({
    deviceId,
    entity: 'lesson_progress',
    entityId: 'l_1',
    hlc: hlc(9_100, 0, deviceId),
    payload: { lessonId: 'l_1', percent: 250 },
  });
  const bad = await pushOps(app, token, [badPayload]);
  assert.equal(bad.results[0].status, 'rejected');
  assert.equal(bad.results[0].reason, 'invalid_payload');

  const badHlc = makeOp({
    deviceId,
    entity: 'draft',
    entityId: 'a_3',
    hlc: 'not-an-hlc',
    payload: draftPayload('x', hlc(9_200, 0, deviceId)),
  });
  const broken = await pushOps(app, token, [badHlc]);
  assert.equal(broken.results[0].status, 'rejected');
  assert.equal(broken.results[0].reason, 'invalid_hlc');
});

test('push rejects batches larger than 200 ops and malformed bodies', async (t) => {
  const { app } = setup(t);
  const { token, deviceId } = await login(app);

  const tooMany = Array.from({ length: 201 }, (_value, index) =>
    makeOp({
      deviceId,
      entity: 'lesson_progress',
      entityId: 'l_1',
      hlc: hlc(20_000 + index, 0, deviceId),
      payload: { lessonId: 'l_1', percent: index % 100, lastOpenedAt: '2026-01-01T00:00:00.000Z' },
    }),
  );
  const oversized = await api<{ error: string }>(app, token, 'POST', '/api/sync/push', { ops: tooMany });
  assert.equal(oversized.status, 400);
  assert.equal(oversized.body.error, 'validation_error');

  const empty = await api<{ error: string }>(app, token, 'POST', '/api/sync/push', { ops: [] });
  assert.equal(empty.status, 400);
});
