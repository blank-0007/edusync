import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as Y from 'yjs';
import { HybridClock, ulid } from '@edusync/protocol';
import { buildApp } from '../src/app';
import { clearDocCache } from '../src/docs';

const b64 = (u8: Uint8Array) => Buffer.from(u8).toString('base64');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

test('seed document d_group2 exists and has expected text', async (t) => {
  clearDocCache();
  const app = buildApp({ dbPath: ':memory:' });
  t.after(() => app.close());

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { userId: 'u_aarav', deviceId: 'dev_1', platform: 'test' },
  });
  const token = loginRes.json<{ token: string }>().token;

  const docsRes = await app.inject({
    method: 'GET',
    url: '/api/docs',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(docsRes.statusCode, 200);
  const docs = docsRes.json<{ docs: { id: string; title: string }[] }>().docs;
  assert.ok(docs.some((d) => d.id === 'd_group2'));

  const snapRes = await app.inject({
    method: 'GET',
    url: '/api/docs/d_group2',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(snapRes.statusCode, 200);
  const snap = snapRes.json<{ snapshotB64: string; cursor: number }>();
  assert.equal(snap.cursor, 0);

  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, unb64(snap.snapshotB64));
  const text = ydoc.getText('content').toString();
  assert.ok(text.includes('Lab 3 — membrane data (group 2)'));
  assert.ok(text.includes('osmotic gradient alone'));
});

test('push doc_update op advances snapshot and pull returns update', async (t) => {
  clearDocCache();
  const app = buildApp({ dbPath: ':memory:' });
  t.after(() => app.close());

  const loginA = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { userId: 'u_aarav', deviceId: 'dev_a', platform: 'test' },
  });
  const tokenA = loginA.json<{ token: string }>().token;

  const snapRes = await app.inject({
    method: 'GET',
    url: '/api/docs/d_group2',
    headers: { authorization: `Bearer ${tokenA}` },
  });
  const snapA = snapRes.json<{ snapshotB64: string }>();
  const clientA = new Y.Doc();
  Y.applyUpdate(clientA, unb64(snapA.snapshotB64));

  const updates: string[] = [];
  clientA.on('update', (u: Uint8Array) => updates.push(b64(u)));
  clientA.getText('content').insert(clientA.getText('content').length, '\nAarav edit');

  const opId = ulid();
  const clock = new HybridClock('dev_a');
  const pushRes = await app.inject({
    method: 'POST',
    url: '/api/sync/push',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      ops: [
        {
          opId,
          deviceId: 'dev_a',
          hlc: clock.now(),
          entity: 'doc_update',
          entityId: 'd_group2',
          type: 'update',
          baseRev: 0,
          payload: { docId: 'd_group2', updateB64: updates[0] },
        },
      ],
    },
  });
  assert.equal(pushRes.statusCode, 200);
  const pushJson = pushRes.json<{ results: { status: string; serverRev: number }[] }>();
  assert.equal(pushJson.results[0].status, 'applied');
  assert.equal(pushJson.results[0].serverRev, 1);

  // Pull with empty docCursors
  const pullRes = await app.inject({
    method: 'POST',
    url: '/api/sync/pull',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { sinceSeq: 0, docCursors: { d_group2: 0 } },
  });
  assert.equal(pullRes.statusCode, 200);
  const pullJson = pullRes.json<{
    docUpdates: { docId: string; seq: number; updateB64: string }[];
    nextDocCursors: Record<string, number>;
  }>();
  assert.equal(pullJson.docUpdates.length, 1);
  assert.equal(pullJson.docUpdates[0].seq, 1);
  assert.equal(pullJson.nextDocCursors.d_group2, 1);

  // Pull again from cursor 1: nothing new
  const pullAgain = await app.inject({
    method: 'POST',
    url: '/api/sync/pull',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: { sinceSeq: 0, docCursors: { d_group2: 1 } },
  });
  assert.equal(pullAgain.json<{ docUpdates: unknown[] }>().docUpdates.length, 0);

  // Replay same opId -> duplicate
  const replayRes = await app.inject({
    method: 'POST',
    url: '/api/sync/push',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      ops: [
        {
          opId,
          deviceId: 'dev_a',
          hlc: clock.now(),
          entity: 'doc_update',
          entityId: 'd_group2',
          type: 'update',
          baseRev: 0,
          payload: { docId: 'd_group2', updateB64: updates[0] },
        },
      ],
    },
  });
  assert.equal(replayRes.json<{ results: { status: string }[] }>().results[0].status, 'duplicate');
});

test('corrupt doc update is rejected gracefully without breaking batch', async (t) => {
  clearDocCache();
  const app = buildApp({ dbPath: ':memory:' });
  t.after(() => app.close());

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { userId: 'u_aarav', deviceId: 'dev_1', platform: 'test' },
  });
  const token = login.json<{ token: string }>().token;
  const clock = new HybridClock('dev_1');

  const res = await app.inject({
    method: 'POST',
    url: '/api/sync/push',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      ops: [
        {
          opId: ulid(),
          deviceId: 'dev_1',
          hlc: clock.now(),
          entity: 'doc_update',
          entityId: 'd_group2',
          type: 'update',
          baseRev: 0,
          payload: { docId: 'd_group2', updateB64: 'invalid-base64-!!!' },
        },
      ],
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json<{ results: { status: string }[] }>().results[0].status, 'rejected');
});
