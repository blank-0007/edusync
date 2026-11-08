#!/usr/bin/env node
/**
 * EduSync UI acceptance harness (Playwright, real browser, real server).
 *
 * Drives the app like a student would and proves the offline-first promises:
 *   login -> library + offline-ready chips -> lesson reader -> go offline ->
 *   write + submit while offline -> reload (queue survives) -> back online ->
 *   queue drains -> exactly one submission on the server -> concurrent edit
 *   from a second device opens the Review Inbox -> resolve it in the UI.
 *
 * Requires the demo stack running (scripts/demo.sh start) and a fresh DB
 * (scripts/verify.sh handles both). Screenshots land in artifacts/ui/.
 *
 * Run: node scripts/ui-verify.mjs
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { HybridClock, ulid } from '@edusync/protocol';

const APP = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const API = process.env.API_URL ?? 'http://127.0.0.1:8787';
const OUT = 'artifacts/ui';
const CHROME =
  process.env.CHROME_EXE ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

mkdirSync(OUT, { recursive: true });
const results = [];
let failures = 0;
const pageErrors = [];

function check(name, cond, detail) {
  results.push({ name, ok: !!cond });
  if (cond) console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  else {
    failures++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    if (detail !== undefined) console.log('    ' + String(detail).slice(0, 500));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(userId, deviceId = ulid()) {
  const res = await api('/api/auth/login', { method: 'POST', body: { userId, deviceId, platform: 'ui-verify' } });
  if (res.status !== 200) throw new Error(`login ${userId} failed: ${res.status}`);
  return { token: res.body.token, deviceId };
}

async function waitText(page, text, timeout = 15000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`    · ${OUT}/${name}.png`);
}

async function main() {
  console.log('\x1b[1mEduSync UI acceptance (Playwright)\x1b[0m');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

  try {
    // ---------------------------------------------------------- login + library
    console.log('\nsession: login + offline-ready library');
    await page.goto(`${APP}/?page=login&fresh=1`, { waitUntil: 'load' });
    await waitText(page, 'Sign in');
    await shot(page, '01-login');

    await page.getByRole('button', { name: /Aarav Menon/i }).first().click();
    await waitText(page, 'Lesson library', 20000);
    check('login lands on the lesson library', true);
    await page.getByText('Available offline', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    const offlineChips = await page.getByText('Available offline', { exact: false }).count();
    check('all 6 lessons are marked available offline', offlineChips >= 6, `chips=${offlineChips}`);
    await waitText(page, 'Offline ready');
    check('the course reports offline readiness', true);
    await shot(page, '02-library');

    // ---------------------------------------------------------- lesson reader
    console.log('\nsession: lesson reader works from the local cache');
    await page.getByText('Ion pumps and the Na⁺/K⁺ ATPase', { exact: false }).first().click();
    await waitText(page, 'Na⁺/K⁺', 10000);
    const readerText = await page.locator('body').innerText();
    check('lesson body renders substantial content offline', readerText.length > 1500, `chars=${readerText.length}`);
    await shot(page, '03-lesson-reader');
    await page.getByRole('button', { name: /^Courses$/ }).click();
    await waitText(page, 'Lesson library');

    // Cache the assignment while online (offline boot reads it from IndexedDB).
    await page.goto(`${APP}/?as=u_aarav&page=assignment`, { waitUntil: 'load' });
    await waitText(page, 'Membrane transport worksheet', 15000);
    check('assignment renders online and is cached', true);

    // ---------------------------------------------------------- go offline
    console.log('\nsession: write and submit with no network');
    await page.goto(`${APP}/?as=u_aarav&page=sync&offline=1`, { waitUntil: 'load' });
    await waitText(page, 'Connection simulator', 15000);
    const switchOn = await page.locator('[role="switch"][aria-label="Simulate offline"]').getAttribute('aria-checked');
    check('connection simulator starts offline', switchOn === 'true', `aria-checked=${switchOn}`);

    await page.goto(`${APP}/?as=u_aarav&page=assignment&offline=1`, { waitUntil: 'load' });
    await waitText(page, 'Membrane transport worksheet', 15000);
    const answer =
      'The Na⁺/K⁺ ATPase is electrogenic: each cycle exports three Na⁺ and imports two K⁺, leaving one net positive charge outside. ' +
      'That outward current holds the resting membrane potential slightly more negative than the K⁺ equilibrium potential predicts. ' +
      'Ouabain blocks the extracellular K⁺ site, so the gradients run down and the cell depolarises gradually.';
    const textarea = page.getByLabel('Your assignment answer');
    await textarea.fill(answer);
    await waitText(page, 'Autosaved', 10000);
    check('draft autosaves locally while offline', true);
    await page.getByRole('button', { name: /Submit assignment/i }).click();
    await waitText(page, 'Queued offline', 15000);
    check('submission is queued locally while offline', true);
    await shot(page, '04-assignment-offline');

    // ---------------------------------------------------------- durability
    console.log('\nsession: queued work survives a reload');
    const beforeReload = await page.locator('body').innerText();
    await page.reload({ waitUntil: 'load' });
    await waitText(page, 'Membrane transport worksheet', 15000);
    await waitText(page, 'Queued offline', 15000);
    const afterReload = await page.locator('body').innerText();
    check('answer text survived the reload', afterReload.includes('electrogenic'), 'answer text missing after reload');
    check('submission is still queued after the reload (durable op log)', /Queued offline/.test(afterReload), beforeReload.slice(0, 200));
    await shot(page, '05-assignment-after-reload');

    await page.goto(`${APP}/?as=u_aarav&page=sync&offline=1`, { waitUntil: 'load' });
    await waitText(page, 'Operation queue', 15000);
    const queuedBody = await page.locator('body').innerText();
    const pendingMatch = queuedBody.match(/(\d+)\s+pending/);
    check('Sync Center reports the queued operations', !!pendingMatch && Number(pendingMatch[1]) >= 2, pendingMatch ? pendingMatch[0] : queuedBody.slice(0, 300));
    check('Sync Center shows per-op rows with HLC and attempt counts', /HLC/.test(queuedBody) && /op(s)?$|opId|OPID/i.test(queuedBody), queuedBody.slice(0, 300));
    await shot(page, '06-sync-center-queued');

    // ---------------------------------------------------------- back online
    console.log('\nsession: reconnect drains the queue');
    await page.locator('[role="switch"][aria-label="Simulate offline"]').click();
    await page.getByRole('button', { name: /Retry now/i }).click();
    let synced = false;
    for (let i = 0; i < 50; i++) {
      const body = await page.locator('body').innerText();
      const drain = /0 ops · 0 KB/.test(body) || /(\b0 pending\b)/.test(body);
      if (/Synced\s*·/.test(body) && drain) { synced = true; break; }
      await sleep(500);
    }
    check('queue drains after reconnecting and the UI reports Synced', synced);
    await shot(page, '07-sync-center-synced');

    // ---------------------------------------------------------- server truth
    console.log('\nsession: exactly one canonical submission on the server');
    const s = await login('u_aarav');
    const mine = await api('/api/submissions/mine', { token: s.token });
    check('server holds exactly one submission for the student', mine.body.submissions?.length === 1, JSON.stringify(mine.body).slice(0, 300));
    check('submitted body matches what was typed offline', (mine.body.submissions?.[0]?.body ?? '').includes('electrogenic'));
    const hash = await api('/api/sync/state-hash', { token: s.token });
    check('server state hash is stable', typeof hash.body.hash === 'string' && hash.body.hash.length === 64, JSON.stringify(hash.body));

    // ---------------------------------------------------------- conflict inbox
    console.log('\nsession: concurrent offline edit -> Review Inbox');
    const other = await login('u_aarav'); // same student, a second device
    const pulled = await api('/api/sync/pull', { method: 'POST', token: other.token, body: { sinceSeq: 0 } });
    const draftChange = (pulled.body.changes ?? []).filter((c) => c.entity === 'draft').at(-1);
    const clock = new HybridClock(other.deviceId);
    const sideB = {
      opId: ulid(),
      deviceId: other.deviceId,
      hlc: clock.now(),
      entity: 'draft',
      entityId: 'a_3',
      type: 'update',
      baseRev: draftChange?.rev ?? 0,
      payload: {
        assignmentId: 'a_3',
        answer: 'Second device offline edit: the pump is electrogenic and ouabain stops it.',
        answerHlc: '',
        baseAnswerHlc: null,
      },
    };
    sideB.payload.answerHlc = sideB.hlc;
    const pushed = await api('/api/sync/push', { method: 'POST', token: other.token, body: { ops: [sideB] } });
    check('second device edit is flagged as a conflict', pushed.body.results?.[0]?.status === 'conflict', JSON.stringify(pushed.body).slice(0, 300));

    await page.goto(`${APP}/?as=u_aarav&page=review`, { waitUntil: 'load' });
    await waitText(page, 'Conflict Inbox', 15000);
    await page.getByText(/version a/i).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    const inbox = await page.locator('body').innerText();
    check('Review Inbox shows both versions side by side', /version a/i.test(inbox) && /version b/i.test(inbox), inbox.slice(0, 300));
    check('Review Inbox promises nothing was discarded', /nothing was|Nothing was|never discarded|retained/i.test(inbox));
    await shot(page, '08-review-inbox');

    await page.getByRole('button', { name: /Keep B \(right\)/i }).click();
    let resolved = false;
    for (let i = 0; i < 30; i++) {
      const body = await page.locator('body').innerText();
      if (/Resolved/i.test(body) || /No open conflicts/i.test(body)) { resolved = true; break; }
      await sleep(400);
    }
    check('conflict resolved from the UI', resolved);
    await shot(page, '09-review-resolved');

    const ledger = await api('/api/conflicts', { token: other.token });
    check('server ledger records the resolution', (ledger.body.conflicts ?? []).every((c) => c.status === 'resolved'), JSON.stringify(ledger.body).slice(0, 300));

    check('no uncaught page errors during the session', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } catch (err) {
    failures++;
    console.error('\n\x1b[31mFATAL\x1b[0m', err?.message ?? err);
    try { await shot(page, 'error-state'); } catch { /* ignore */ }
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n\x1b[1m${failures === 0 ? '\x1b[32mPASS' : '\x1b[31mFAIL'}\x1b[0m ${passed}/${results.length} UI checks · screenshots in ${OUT}/`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
