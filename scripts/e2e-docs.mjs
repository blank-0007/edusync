#!/usr/bin/env node
/**
 * EduSync phase-2 acceptance: Yjs document co-editing.
 *
 * Boots the real server on a throwaway DB and proves the CRDT half of the twist:
 * two editors make disjoint offline edits to the same document, push in either
 * order, pull each other's updates, and converge byte-identically with BOTH edits
 * present. Also checks doc-op dedupe, corrupt-update rejection, snapshot catch-up,
 * live WebSocket broadcasts and presence.
 *
 * Run: npm run e2e:docs    (from the repo root)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { ulid, HybridClock } from '@edusync/protocol';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_DOCS_PORT ?? 8798);
const BASE = `http://127.0.0.1:${PORT}`;
const DOC_ID = 'd_group2';
const results = [];
let failures = 0;

function check(name, cond, detail) {
  results.push({ name, ok: !!cond });
  if (cond) console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  else {
    failures++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    if (detail !== undefined) console.log('    ' + String(detail).slice(0, 700));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

const docText = (doc) => doc.getText('content').toString();

async function startServer(dbPath) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), EDU_DB_PATH: dbPath, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`server exited early (${child.exitCode}):\n${log.slice(-2000)}`);
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return { child, log: () => log };
    } catch { /* not up yet */ }
    await sleep(150);
  }
  child.kill('SIGKILL');
  throw new Error(`server did not become healthy:\n${log.slice(-2000)}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) return;
    await sleep(50);
  }
  child.kill('SIGKILL');
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(userId) {
  const deviceId = ulid();
  const res = await api('/api/auth/login', { method: 'POST', body: { userId, deviceId, platform: 'e2e-docs' } });
  if (res.status !== 200) throw new Error(`login ${userId}: ${res.status}`);
  return { token: res.body.token, deviceId, user: res.body.user, clock: new HybridClock(deviceId) };
}

/** A local editor: a Y.Doc plus the deltas produced while "offline". */
function makeEditor(snapshotB64) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, unb64(snapshotB64));
  const pending = [];
  doc.on('update', (update) => pending.push(b64(update)));
  return { doc, pending };
}

function docOp(session, updateB64) {
  return {
    opId: ulid(),
    deviceId: session.deviceId,
    hlc: session.clock.now(),
    entity: 'doc_update',
    entityId: DOC_ID,
    type: 'append',
    baseRev: 0,
    payload: { docId: DOC_ID, updateB64 },
  };
}

async function pushOps(session, ops) {
  return api('/api/sync/push', { method: 'POST', token: session.token, body: { ops } });
}

async function pullDoc(session, docCursors = {}) {
  return api('/api/sync/pull', { method: 'POST', token: session.token, body: { sinceSeq: 0, docCursors } });
}

function applyUpdates(doc, updates) {
  for (const u of updates) Y.applyUpdate(doc, unb64(u.updateB64));
}

function openSocket(session, docId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(session.token)}&docId=${docId}`);
    const messages = [];
    ws.on('message', (raw) => {
      try { messages.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
    });
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('ws open timeout')), 5000);
  });
}

async function waitFor(fn, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = fn();
    if (value) return value;
    await sleep(100);
  }
  return null;
}

async function main() {
  console.log('\x1b[1mEduSync document sync acceptance (Yjs)\x1b[0m');
  const dir = mkdtempSync(join(tmpdir(), 'edusync-docs-'));
  let server;
  try {
    server = await startServer(join(dir, 'docs.db'));

    // ---------------------------------------------------------------- catalog
    console.log('\nsession: document catalog + snapshot');
    const a = await login('u_aarav');
    const b = await login('u_yuki');

    const docs = await api('/api/docs', { token: a.token });
    check('document catalog lists the seeded shared document', (docs.body.docs ?? []).some((d) => d.id === DOC_ID), JSON.stringify(docs.body).slice(0, 300));

    const snapA = await api(`/api/docs/${DOC_ID}`, { token: a.token });
    check('snapshot endpoint returns a base64 Yjs state', typeof snapA.body.snapshotB64 === 'string' && snapA.body.snapshotB64.length > 20, JSON.stringify(snapA.body).slice(0, 300));
    check('snapshot carries a cursor and state vector', typeof snapA.body.cursor === 'number' && typeof snapA.body.stateVectorB64 === 'string');

    const editorA = makeEditor(snapA.body.snapshotB64);
    const editorB = makeEditor(snapA.body.snapshotB64);
    const original = docText(editorA.doc);
    check('seeded document has the lab text', original.includes('Lab 3 — membrane data') && original.includes('osmotic gradient'), original.slice(0, 200));

    // -------------------------------------------------- offline disjoint edits
    console.log('\nsession: two editors edit the same document while offline');
    const editA = '\nAarav (offline): the pellet cleared within 60 s, so lysis had already happened before centrifugation.';
    const editB = '\nYuki (offline): the 0.30 M NaCl tube showed no volume change under the control conditions, so tonicity was the driver.';
    editorA.doc.getText('content').insert(original.length, editA);
    editorB.doc.getText('content').insert(original.length, editB);
    check('each editor produced one local update while offline', editorA.pending.length >= 1 && editorB.pending.length >= 1, `A=${editorA.pending.length} B=${editorB.pending.length}`);
    check('offline texts differ before syncing', docText(editorA.doc) !== docText(editorB.doc));

    // -------------------------------------------------- push both, pull both
    console.log('\nsession: reconnect — push both sides, pull each other');
    const pushA = await pushOps(a, editorA.pending.map((u) => docOp(a, u)));
    const pushB = await pushOps(b, editorB.pending.map((u) => docOp(b, u)));
    check('device A document updates applied', (pushA.body.results ?? []).every((r) => r.status === 'applied'), JSON.stringify(pushA.body).slice(0, 300));
    check('device B document updates applied', (pushB.body.results ?? []).every((r) => r.status === 'applied'), JSON.stringify(pushB.body).slice(0, 300));

    const pullA = await pullDoc(a, {});
    const pullB = await pullDoc(b, {});
    check('pull returns document updates with per-doc cursors', Array.isArray(pullA.body.docUpdates) && Object.keys(pullA.body.nextDocCursors ?? {}).includes(DOC_ID), JSON.stringify(pullA.body).slice(0, 400));

    applyUpdates(editorA.doc, pullA.body.docUpdates ?? []);
    applyUpdates(editorB.doc, pullB.body.docUpdates ?? []);
    const mergedA = docText(editorA.doc);
    const mergedB = docText(editorB.doc);

    check('both editors converge to byte-identical text', mergedA === mergedB, `lenA=${mergedA.length} lenB=${mergedB.length}`);
    check('BOTH offline edits survived the merge', mergedA.includes('Aarav (offline)') && mergedA.includes('Yuki (offline)'), mergedA.slice(-400));
    check('no keystrokes lost: original text still intact', mergedA.includes(original.trim().slice(0, 60)), mergedA.slice(0, 300));

    // -------------------------------------------------- server snapshot truth
    console.log('\nsession: server snapshot matches the merged client state');
    const snapAfter = await api(`/api/docs/${DOC_ID}`, { token: a.token });
    const fresh = new Y.Doc();
    Y.applyUpdate(fresh, unb64(snapAfter.body.snapshotB64));
    check('a fresh client loading the snapshot sees the merged text', docText(fresh) === mergedA, `server=${docText(fresh).length} client=${mergedA.length}`);
    check('server cursor advanced past zero', snapAfter.body.cursor > 0, JSON.stringify(snapAfter.body.cursor));

    // pull again from the caught-up cursor: nothing new
    const caughtUpA = await pullDoc(a, pullA.body.nextDocCursors);
    check('pull from the caught-up cursor returns no document updates', (caughtUpA.body.docUpdates ?? []).length === 0, JSON.stringify(caughtUpA.body.docUpdates?.length));

    // -------------------------------------------------- dedupe + corruption
    console.log('\nsession: doc-op dedupe and corrupt-update rejection');
    const firstOp = docOp(a, editorA.pending[0]);
    const applied = await pushOps(a, [firstOp]);
    const replayed = await pushOps(a, [firstOp]);
    check('first doc op applies', applied.body.results?.[0]?.status === 'applied', JSON.stringify(applied.body).slice(0, 200));
    check('replaying the same doc opId is a duplicate', replayed.body.results?.[0]?.status === 'duplicate', JSON.stringify(replayed.body).slice(0, 200));
    const cursorAfterReplay = (await api(`/api/docs/${DOC_ID}`, { token: a.token })).body.cursor;
    check('duplicate doc op does not advance the document cursor', cursorAfterReplay === snapAfter.body.cursor, `${cursorAfterReplay} vs ${snapAfter.body.cursor}`);

    const corrupt = docOp(a, 'not-a-valid-yjs-update');
    const corruptRes = await pushOps(a, [corrupt]);
    check('a corrupt update is rejected, not fatal', corruptRes.status === 200 && corruptRes.body.results?.[0]?.status === 'rejected', JSON.stringify(corruptRes.body).slice(0, 300));

    // -------------------------------------------------- live WebSocket
    console.log('\nsession: live collaboration over WebSocket');
    const watcher = await openSocket(b, DOC_ID);
    await waitFor(() => watcher.messages.find((m) => m.type === 'hello_ok'));
    check('subscriber receives hello_ok with a cursor', !!watcher.messages.find((m) => m.type === 'hello_ok'), JSON.stringify(watcher.messages).slice(0, 300));

    const joiner = await openSocket(a, DOC_ID);
    const presenceTwo = await waitFor(() => watcher.messages.filter((m) => m.type === 'presence').find((m) => m.count === 2));
    check('presence reports 2 collaborators', !!presenceTwo, JSON.stringify(watcher.messages.filter((m) => m.type === 'presence')).slice(0, 300));
    check('presence lists the member names', (presenceTwo?.members ?? []).length === 2, JSON.stringify(presenceTwo).slice(0, 300));

    const liveEdit = '\nLive edit over the socket.';
    editorB.doc.getText('content').insert(docText(editorB.doc).length, liveEdit);
    const liveUpdate = editorB.pending.at(-1);
    await pushOps(b, [docOp(b, liveUpdate)]);
    const broadcast = await waitFor(() => watcher.messages.find((m) => m.type === 'doc_update'));
    check('live doc_update broadcast reaches the subscriber', !!broadcast, JSON.stringify(watcher.messages.slice(-3)).slice(0, 400));
    check('broadcast carries author identity', !!broadcast?.authorUserId && !!broadcast?.authorName, JSON.stringify(broadcast).slice(0, 300));
    if (broadcast) {
      Y.applyUpdate(editorA.doc, unb64(broadcast.updateB64));
      check('the broadcast update merges into the other editor', docText(editorA.doc).includes('Live edit over the socket'));
    }

    joiner.ws.close();
    const presenceOne = await waitFor(() => watcher.messages.filter((m) => m.type === 'presence').find((m) => m.count === 1));
    check('presence drops back to 1 when a collaborator leaves', !!presenceOne, JSON.stringify(watcher.messages.filter((m) => m.type === 'presence').slice(-2)).slice(0, 300));
    watcher.ws.close();

    // -------------------------------------------------- final convergence
    console.log('\nsession: final convergence check');
    const finalA = await api(`/api/docs/${DOC_ID}`, { token: a.token });
    const finalClient = new Y.Doc();
    Y.applyUpdate(finalClient, unb64(finalA.body.snapshotB64));
    const hashA = await api('/api/sync/state-hash', { token: a.token });
    const hashB = await api('/api/sync/state-hash', { token: b.token });
    check('state hash includes the document (shifts after edits)', typeof hashA.body.hash === 'string' && hashA.body.hash.length === 64);
    check('both students observe the same state hash for the shared document', hashA.body.hash === hashB.body.hash, `${hashA.body.hash?.slice(0, 12)} vs ${hashB.body.hash?.slice(0, 12)}`);
    check('the server text contains every edit from every editor', ['Aarav (offline)', 'Yuki (offline)', 'Live edit over the socket'].every((m) => docText(finalClient).includes(m)), docText(finalClient).slice(-400));
  } catch (err) {
    failures++;
    console.error('\n\x1b[31mFATAL\x1b[0m', err?.message ?? err);
    if (server?.log) console.error(server.log().slice(-1500));
  } finally {
    if (server) await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n\x1b[1m${failures === 0 ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m ${passed}/${results.length} document-sync checks`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
