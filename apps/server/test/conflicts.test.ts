import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { api, draftPayload, hlc, login, makeOp, pushOps, setup, stateHash, type TestServer } from './helpers';

interface ConflictJson {
  id: string;
  entity: string;
  entityId: string;
  field: string;
  leftJson: string;
  rightJson: string;
  leftLabel: string;
  rightLabel: string;
  status: string;
  createdAt: string;
}

async function seedDraftConflict(t: TestContext): Promise<{
  server: TestServer;
  tokenA: string;
  tokenB: string;
}> {
  const server = setup(t);
  const deviceA = await login(server.app, 'u_aarav', 'device-a');
  const deviceB = await login(server.app, 'u_aarav', 'device-b');

  await pushOps(server.app, deviceA.token, [
    makeOp({
      deviceId: 'device-a',
      entity: 'draft',
      entityId: 'a_3',
      hlc: hlc(5_000, 0, 'device-a'),
      payload: draftPayload('Device A answer', hlc(5_000, 0, 'device-a')),
    }),
  ]);

  const incomingHlc = hlc(6_000, 0, 'device-b');
  const result = await pushOps(server.app, deviceB.token, [
    makeOp({
      deviceId: 'device-b',
      entity: 'draft',
      entityId: 'a_3',
      hlc: incomingHlc,
      payload: draftPayload('Device B answer', incomingHlc, hlc(4_000, 0, 'device-a')),
    }),
  ]);
  assert.equal(result.results[0].status, 'conflict');

  return { server, tokenA: deviceA.token, tokenB: deviceB.token };
}

async function getConflict(app: FastifyInstance, token: string): Promise<ConflictJson> {
  const response = await api<{ conflicts: ConflictJson[] }>(app, token, 'GET', '/api/conflicts');
  assert.equal(response.status, 200);
  assert.equal(response.body.conflicts.length, 1);
  return response.body.conflicts[0];
}

test('GET /api/conflicts lists only the authenticated user open conflicts', async (t) => {
  const { server, tokenA } = await seedDraftConflict(t);
  const yuki = await login(server.app, 'u_yuki', 'device-yuki');

  const conflict = await getConflict(server.app, tokenA);
  assert.equal(conflict.entity, 'draft');
  assert.equal(conflict.entityId, 'a_3');
  assert.equal(conflict.status, 'open');
  assert.match(conflict.id, /^cfl_/);
  assert.ok(!Number.isNaN(Date.parse(conflict.createdAt)));
  assert.ok(conflict.leftLabel.length > 0 && conflict.rightLabel.length > 0);

  const yukiConflicts = await api<{ conflicts: unknown[] }>(server.app, yuki.token, 'GET', '/api/conflicts');
  assert.deepEqual(yukiConflicts.body.conflicts, [], 'conflicts are scoped per user');
});

test('resolving "mine" applies the right-hand version at a fresh server HLC', async (t) => {
  const { server, tokenA } = await seedDraftConflict(t);
  const conflict = await getConflict(server.app, tokenA);
  const rightAnswer = (JSON.parse(conflict.rightJson) as { answer: string }).answer;
  const hashBefore = await stateHash(server.app, tokenA);

  const resolved = await api<{ conflict: ConflictJson; applied: boolean }>(
    server.app,
    tokenA,
    'POST',
    `/api/conflicts/${conflict.id}/resolve`,
    { resolution: 'mine', note: 'Keep the latest paragraph' },
  );
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.applied, true);
  assert.equal(resolved.body.conflict.id, conflict.id);
  assert.equal(resolved.body.conflict.status, 'resolved');

  const row = server.app.db.prepare('SELECT * FROM conflicts WHERE id = ?').get(conflict.id) as {
    status: string;
    resolution: string;
    note: string;
    resolved_at: string;
  };
  assert.equal(row.status, 'resolved');
  assert.equal(row.resolution, 'mine');
  assert.equal(row.note, 'Keep the latest paragraph');
  assert.ok(!Number.isNaN(Date.parse(row.resolved_at)));

  const draft = server.app.db
    .prepare('SELECT * FROM drafts WHERE user_id = ? AND assignment_id = ?')
    .get('u_aarav', 'a_3') as { answer: string; rev: number; answer_hlc: string };
  assert.equal(draft.answer, rightAnswer);
  assert.equal(Number(draft.rev), 3, 'resolution bumps the entity rev');
  assert.match(draft.answer_hlc, /:srv$/, 'resolution is stamped with a fresh server HLC');

  // The decision is materialised for pull and the conflict feed shows the resolution.
  const pull = await api<{
    changes: { entity: string; payload: { answer: string; rev: number } }[];
    conflicts: ConflictJson[];
  }>(server.app, tokenA, 'POST', '/api/sync/pull', { sinceSeq: 0 });
  assert.equal(pull.body.changes.at(-1)?.payload.answer, rightAnswer);
  assert.equal(pull.body.changes.at(-1)?.payload.rev, 3);
  assert.equal(pull.body.conflicts[0].status, 'resolved');

  const hashAfter = await stateHash(server.app, tokenA);
  assert.notEqual(hashAfter.hash, hashBefore.hash);

  // Idempotent replay of the resolution: no second audit event.
  const replay = await api<{ conflict: ConflictJson; applied: boolean }>(
    server.app,
    tokenA,
    'POST',
    `/api/conflicts/${conflict.id}/resolve`,
    { resolution: 'mine' },
  );
  assert.equal(replay.status, 200);
  assert.equal(replay.body.applied, true);
  assert.equal(replay.body.conflict.status, 'resolved');
  const audit = server.app.db
    .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'conflict.resolve'")
    .get() as { count: number };
  assert.equal(Number(audit.count), 1);
});

test('resolving "theirs" applies the left-hand version', async (t) => {
  const { server, tokenA } = await seedDraftConflict(t);
  const conflict = await getConflict(server.app, tokenA);
  const leftAnswer = (JSON.parse(conflict.leftJson) as { answer: string }).answer;

  const resolved = await api<{ conflict: ConflictJson; applied: boolean }>(
    server.app,
    tokenA,
    'POST',
    `/api/conflicts/${conflict.id}/resolve`,
    { resolution: 'theirs' },
  );
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.conflict.status, 'resolved');

  const draft = server.app.db
    .prepare('SELECT * FROM drafts WHERE user_id = ? AND assignment_id = ?')
    .get('u_aarav', 'a_3') as { answer: string; rev: number };
  assert.equal(draft.answer, leftAnswer);
  assert.equal(Number(draft.rev), 3);
});

test('conflict resolution validates input and unknown ids', async (t) => {
  const { server, tokenA } = await seedDraftConflict(t);
  const conflict = await getConflict(server.app, tokenA);

  const invalid = await api<{ error: string }>(
    server.app,
    tokenA,
    'POST',
    `/api/conflicts/${conflict.id}/resolve`,
    { resolution: 'sideways' },
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'validation_error');

  const unknown = await api<{ error: string }>(
    server.app,
    tokenA,
    'POST',
    '/api/conflicts/cfl_missing/resolve',
    { resolution: 'mine' },
  );
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, 'conflict_not_found');

  const unauthenticated = await api(server.app, null, 'POST', `/api/conflicts/${conflict.id}/resolve`, {
    resolution: 'mine',
  });
  assert.equal(unauthenticated.status, 401);
});
