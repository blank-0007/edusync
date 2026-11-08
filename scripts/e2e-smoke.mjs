#!/usr/bin/env node
/**
 * EduSync end-to-end acceptance harness (HTTP level).
 *
 * Boots the real server on a throwaway DB, then drives the API exactly like the
 * web client would: login, catalog, op-log push with dedupe, HLC out-of-order,
 * L4 conflict, exactly-once submission, pull cursors, and a convergence test
 * across two independent server instances fed the same ops in different orders.
 *
 * Run: npm run e2e        (from the repo root)
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ulid, HybridClock } from '@edusync/protocol';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.E2E_PORT ?? 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
let failures = 0;

function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  if (cond) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    if (detail !== undefined) console.log('    ' + JSON.stringify(detail).slice(0, 600));
  }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, ok ? undefined : { actual, expected });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer(dbPath) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), EDU_DB_PATH: dbPath, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`server exited early (${child.exitCode}):\n${log}`);
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return { child, log: () => log };
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  child.kill('SIGKILL');
  throw new Error(`server did not become healthy:\n${log}`);
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
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

async function login(userId, platform = 'e2e') {
  const deviceId = ulid();
  const res = await api('/api/auth/login', { method: 'POST', body: { userId, deviceId, platform } });
  if (res.status !== 200) throw new Error(`login failed for ${userId}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, deviceId, user: res.body.user, clock: new HybridClock(deviceId) };
}

function draftOp(session, { answer, baseAnswerHlc, rev = 0, hlc } = {}) {
  const stamp = hlc ?? session.clock.now();
  return {
    opId: ulid(),
    deviceId: session.deviceId,
    hlc: stamp,
    entity: 'draft',
    entityId: 'a_3',
    type: 'update',
    baseRev: rev,
    payload: { assignmentId: 'a_3', answer, answerHlc: stamp, baseAnswerHlc },
  };
}

function progressOp(session, lessonId, percent) {
  const stamp = session.clock.now();
  return {
    opId: ulid(),
    deviceId: session.deviceId,
    hlc: stamp,
    entity: 'lesson_progress',
    entityId: lessonId,
    type: 'update',
    baseRev: 0,
    payload: { lessonId, percent, lastOpenedAt: new Date().toISOString() },
  };
}

function submissionOp(session, submissionId, body) {
  const stamp = session.clock.now();
  return {
    opId: ulid(),
    deviceId: session.deviceId,
    hlc: stamp,
    entity: 'submission',
    entityId: submissionId,
    type: 'create',
    baseRev: 0,
    payload: {
      assignmentId: 'a_3',
      submissionId,
      contentHash: sha256(body),
      body,
      clientSubmittedAt: new Date().toISOString(),
    },
  };
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function pullAll(token, sinceSeq = 0) {
  const res = await api('/api/sync/pull', { method: 'POST', token, body: { sinceSeq } });
  return res;
}

// ---------------------------------------------------------------- scenarios

async function catalogScenario() {
  console.log('\nsession: catalog + auth');
  const a = await login('u_aarav');
  const bad = await api('/api/me');
  check('unauthenticated request is rejected', bad.status === 401, bad);
  const me = await api('/api/me', { token: a.token });
  eq('/api/me returns the seeded user', me.body.user?.id, 'u_aarav');
  check('role is student', me.body.user?.role === 'student', me.body);

  const courses = await api('/api/courses', { token: a.token });
  check('course list has c_bio201', Array.isArray(courses.body.courses) && courses.body.courses.some((c) => c.id === 'c_bio201'), courses.body);
  const course = await api('/api/courses/c_bio201', { token: a.token });
  eq('course has the 6 seeded lessons', course.body.course?.lessons?.length, 6);
  check('lesson bodies are non-empty (offline readable)', (course.body.course?.lessons ?? []).every((l) => (l.body ?? '').length > 80), course.body.course?.lessons?.map((l) => l.body?.length));

  const assignment = await api('/api/assignments/a_3', { token: a.token });
  eq('assignment rubric has 4 criteria', assignment.body.assignment?.rubric?.length, 4);
  eq('assignment is worth 14 points', assignment.body.assignment?.points, 14);
  return a;
}

async function pushScenario(session) {
  console.log('\nsession: op-log push, dedupe, HLC ordering');
  const d1 = draftOp(session, { answer: 'First draft', baseAnswerHlc: null });
  const first = await api('/api/sync/push', { method: 'POST', token: session.token, body: { ops: [d1] } });
  eq('first draft op is applied', first.body.results?.[0]?.status, 'applied');

  const before = (await api('/api/sync/state-hash', { token: session.token })).body;
  const replay = await api('/api/sync/push', { method: 'POST', token: session.token, body: { ops: [d1] } });
  eq('same opId replayed is a duplicate', replay.body.results?.[0]?.status, 'duplicate');
  eq('duplicate returns the original serverRev', replay.body.results?.[0]?.serverRev, first.body.results?.[0]?.serverRev);
  const after = (await api('/api/sync/state-hash', { token: session.token })).body;
  check('duplicate push does not change state hash', after.hash === before.hash, { before, after });
  check('duplicate push does not advance the change feed', after.seq === before.seq, { before, after });

  // Two sequential edits delivered newest-first in one batch: server must sort by HLC.
  const oldHlc = session.clock.now();
  const newHlc = session.clock.now();
  const oldOp = draftOp(session, { answer: 'Second draft', baseAnswerHlc: 'First draft' /* placeholder, replaced below */, hlc: oldHlc, rev: 1 });
  const newOp = draftOp(session, { answer: 'Third draft', baseAnswerHlc: oldHlc, hlc: newHlc, rev: 1 });
  // fix base chain: oldOp builds on the currently applied "First draft"
  const pulled = await pullAll(session.token, 0);
  const firstDraft = pulled.body.changes.find((c) => c.entity === 'draft');
  oldOp.payload.baseAnswerHlc = firstDraft?.payload?.answerHlc ?? null;

  const batch = await api('/api/sync/push', { method: 'POST', token: session.token, body: { ops: [newOp, oldOp] } });
  eq('out-of-order batch: both applied', (batch.body.results ?? []).map((r) => r.status), ['applied', 'applied']);
  const afterOrder = await pullAll(session.token, 0);
  const draft = afterOrder.body.changes.filter((c) => c.entity === 'draft').at(-1);
  eq('out-of-order batch converges on the HLC winner', draft?.payload?.answer, 'Third draft');
  check('no conflict raised for a sequential out-of-order delivery', (afterOrder.body.conflicts ?? []).length === 0, afterOrder.body.conflicts);
  return { draftRecord: draft, pull: afterOrder.body };
}

async function conflictScenario() {
  console.log('\nsession: advanced twist — concurrent offline edits');
  const a = await login('u_aarav');
  const b = await login('u_aarav'); // same student, second device
  const baseline = (await pullAll(a.token, 0)).body.changes.filter((c) => c.entity === 'draft').at(-1);
  const baseHlc = baseline?.payload?.answerHlc ?? null;

  const sideA = draftOp(a, { answer: 'Side A: the pump is electrogenic', baseAnswerHlc: baseHlc });
  const sideB = draftOp(b, { answer: 'Side B: three Na out, two K in', baseAnswerHlc: baseHlc });
  const ra = await api('/api/sync/push', { method: 'POST', token: a.token, body: { ops: [sideA] } });
  const rb = await api('/api/sync/push', { method: 'POST', token: b.token, body: { ops: [sideB] } });
  eq('device A write applies', ra.body.results?.[0]?.status, 'applied');
  eq('device B concurrent write is flagged as conflict', rb.body.results?.[0]?.status, 'conflict');

  const conflicts = await api('/api/conflicts', { token: a.token });
  const open = (conflicts.body.conflicts ?? []).filter((c) => c.status === 'open');
  check('a conflict item is open in the inbox', open.length >= 1, conflicts.body);
  const item = open[0];
  check('conflict keeps both versions', !!item?.leftJson && !!item?.rightJson && item.leftJson !== item.rightJson, item);
  const parsedLeft = item ? JSON.parse(item.leftJson) : {};
  const parsedRight = item ? JSON.parse(item.rightJson) : {};
  check('neither version was discarded', [parsedLeft.answer, parsedRight.answer].includes('Side A: the pump is electrogenic') && [parsedLeft.answer, parsedRight.answer].includes('Side B: three Na out, two K in'), { parsedLeft, parsedRight });

  const resolved = await api(`/api/conflicts/${item.id}/resolve`, { method: 'POST', token: a.token, body: { resolution: 'mine', note: 'e2e' } });
  eq('conflict resolves', resolved.status, 200);
  const afterResolve = await api('/api/conflicts', { token: a.token });
  check('conflict marked resolved', (afterResolve.body.conflicts ?? []).every((c) => c.id !== item.id || c.status === 'resolved'), afterResolve.body);
}

async function submissionScenario() {
  console.log('\nsession: exactly-once submission (HTTP path)');
  const s = await login('u_yuki');
  const body = 'The Na⁺/K⁺ ATPase moves three Na⁺ out for two K⁺ in per cycle, so each cycle exports one net positive charge.';
  const submissionId = `sub_${ulid()}`;

  const first = await api('/api/submissions', { method: 'POST', token: s.token, body: { assignmentId: 'a_3', submissionId, contentHash: sha256(body), body, clientSubmittedAt: new Date().toISOString() } });
  eq('first submission accepted', first.status, 200);
  eq('first submission is not deduped', first.body.deduped, false);
  const repeats = [];
  for (let i = 0; i < 4; i++) {
    const r = await api('/api/submissions', { method: 'POST', token: s.token, body: { assignmentId: 'a_3', submissionId, contentHash: sha256(body), body, clientSubmittedAt: new Date().toISOString() } });
    repeats.push({ status: r.status, deduped: r.body?.deduped });
  }
  check('4 retries are absorbed as duplicates', repeats.every((r) => r.status === 200 && r.deduped === true), repeats);

  const mine = await api('/api/submissions/mine', { token: s.token });
  eq('exactly one submission exists after 5 attempts', mine.body.submissions?.length, 1);

  const other = await api('/api/submissions', { method: 'POST', token: s.token, body: { assignmentId: 'a_3', submissionId: `sub_${ulid()}`, contentHash: sha256('different'), body: 'different', clientSubmittedAt: new Date().toISOString() } });
  check('a second distinct submission is rejected (409), not silently accepted', other.status === 409, { status: other.status, body: other.body });
  const mine2 = await api('/api/submissions/mine', { token: s.token });
  eq('still exactly one canonical attempt', mine2.body.submissions?.length, 1);

  console.log('\nsession: exactly-once submission (op-log path)');
  const a = await login('u_aarav');
  const subId = `sub_${ulid()}`;
  const text = 'Op-log submission body about the electrogenic pump.';
  const ops = Array.from({ length: 5 }, () => submissionOp(a, subId, text));
  const pushed = await api('/api/sync/push', { method: 'POST', token: a.token, body: { ops } });
  const statuses = (pushed.body.results ?? []).map((r) => r.status);
  const applied = statuses.filter((x) => x === 'applied').length;
  const duplicated = statuses.filter((x) => x === 'duplicate').length;
  eq('op-log submission: 1 applied + 4 duplicate', `${applied}:${duplicated}`, '1:4');
  const mineA = await api('/api/submissions/mine', { token: a.token });
  eq('op-log path leaves exactly one submission', mineA.body.submissions?.length, 1);
}

async function cursorScenario() {
  console.log('\nsession: pull cursor');
  const s = await login('u_priya');
  const ops = [progressOp(s, 'l_1', 10), progressOp(s, 'l_2', 20), progressOp(s, 'l_3', 30)];
  const pushed = await api('/api/sync/push', { method: 'POST', token: s.token, body: { ops } });
  check('three progress ops applied', (pushed.body.results ?? []).every((r) => r.status === 'applied'), pushed.body);
  const first = await pullAll(s.token, 0);
  eq('pull since 0 returns all changes', first.body.changes?.length, 3);
  const second = await pullAll(s.token, first.body.nextSeq);
  eq('pull from nextSeq returns nothing new', second.body.changes?.length, 0);
  eq('nextSeq is stable when there is nothing new', second.body.nextSeq, first.body.nextSeq);
}

// Two independent servers are fed the SAME op set (identical opIds + HLCs) in
// different delivery orders; the observable state and hash must be identical.
async function convergenceScenario() {
  console.log('\nsession: convergence across delivery orders');
  const dir = mkdtempSync(join(tmpdir(), 'edusync-conv-'));
  const DEVICE = '01J9Z6K3Q8R2V7M4X1N5B0T6AC';
  const clock = new HybridClock(DEVICE);

  const d1 = draftOp({ deviceId: DEVICE, clock }, { answer: 'v1: pump moves 3 Na out', baseAnswerHlc: null });
  const d2 = draftOp({ deviceId: DEVICE, clock }, { answer: 'v2: pump moves 3 Na out, 2 K in', baseAnswerHlc: d1.payload.answerHlc });
  const d3 = draftOp({ deviceId: DEVICE, clock }, { answer: 'v3: and it is electrogenic', baseAnswerHlc: d2.payload.answerHlc });

  const run = async (dbPath, batches) => {
    const { child } = await startServer(dbPath);
    try {
      const token = (
        await api('/api/auth/login', { method: 'POST', body: { userId: 'u_aarav', deviceId: DEVICE, platform: 'e2e-conv' } })
      ).body.token;
      for (const batch of batches) {
        const res = await api('/api/sync/push', { method: 'POST', token, body: { ops: batch } });
        if (res.status !== 200) throw new Error(`push failed: ${JSON.stringify(res.body)}`);
        const bad = (res.body.results ?? []).filter((r) => r.status === 'rejected');
        if (bad.length) throw new Error(`ops rejected: ${JSON.stringify(bad)}`);
      }
      const pulled = await pullAll(token, 0);
      const hash = await api('/api/sync/state-hash', { token });
      const drafts = (pulled.body.changes ?? [])
        .filter((c) => c.entity === 'draft')
        .map((c) => ({ assignmentId: c.payload.assignmentId, answer: c.payload.answer, rev: c.payload.rev }));
      return { drafts, hash: hash.body.hash, seq: hash.body.seq, conflicts: (pulled.body.conflicts ?? []).length };
    } finally {
      await stopServer(child);
    }
  };

  const a = await run(join(dir, 'a.db'), [[d1], [d2], [d3]]);
  const b = await run(join(dir, 'b.db'), [[d3, d2, d1]]);
  eq('same final draft state regardless of delivery order', b.drafts, a.drafts);
  check('both delivery orders end with the same state hash', a.hash === b.hash, { a, b });
  eq('same conflict ledger in both orders', [a.conflicts, b.conflicts], [0, 0]);
  eq('same change-feed length in both orders', b.seq, a.seq);
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------- runner

async function main() {
  console.log('\x1b[1mEduSync end-to-end acceptance\x1b[0m');
  const dir = mkdtempSync(join(tmpdir(), 'edusync-e2e-'));
  const dbPath = join(dir, 'main.db');
  let server;
  try {
    server = await startServer(dbPath);
    const a = await catalogScenario();
    await pushScenario(a);
    await conflictScenario();
    await submissionScenario();
    await cursorScenario();
    await stopServer(server.child);
    server = null;
    await convergenceScenario();
  } catch (err) {
    failures++;
    console.error('\n\x1b[31mFATAL\x1b[0m', err?.message ?? err);
    if (server?.log) console.error(server.log().slice(-2500));
  } finally {
    if (server) await stopServer(server.child);
    rmSync(dir, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n\x1b[1m${failures === 0 ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m ${passed}/${results.length} checks`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
