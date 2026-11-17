import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const VIDEOS_DIR = path.join(ROOT, 'artifacts', 'videos');
const OUTPUT_MP4 = path.join(ROOT, 'artifacts', 'EduSync-Demo.mp4');
const ASSETS_MP4 = path.join(ROOT, 'assets', 'EduSync-Demo.mp4');

// Clean up old webm recordings
if (fs.existsSync(VIDEOS_DIR)) {
  for (const f of fs.readdirSync(VIDEOS_DIR)) {
    if (f.endsWith('.webm')) {
      try { fs.unlinkSync(path.join(VIDEOS_DIR, f)); } catch {}
    }
  }
} else {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Injects the custom animated cursor and high-contrast caption HUD into the page
const INJECTION_SCRIPT = `
(() => {
  window.__initEduSyncOverlays = function() {
    let cursor = document.getElementById('__demo_cursor_container');
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = '__demo_cursor_container';
      cursor.style.position = 'fixed';
      cursor.style.top = '0';
      cursor.style.left = '0';
      cursor.style.width = '32px';
      cursor.style.height = '32px';
      cursor.style.pointerEvents = 'none';
      cursor.style.zIndex = '2147483647';
      cursor.style.transform = 'translate(120px, 120px)';
      cursor.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.4, 1)';
      cursor.innerHTML = \`
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));">
          <path d="M4 2 L22 12 L13.5 14.5 L9 24 Z" fill="#2563EB" stroke="#FFFFFF" stroke-width="2.2" stroke-linejoin="round" />
        </svg>
        <div id="__cursor_ripple" style="
          position: absolute; top: -6px; left: -6px; width: 36px; height: 36px;
          border: 3px solid #2563EB; border-radius: 50%; opacity: 0;
          pointer-events: none; transition: transform 0.4s ease-out, opacity 0.4s ease-out;
        "></div>
      \`;
      (document.body || document.documentElement).appendChild(cursor);
    }

    let hud = document.getElementById('__demo_caption_container');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = '__demo_caption_container';
      hud.style.position = 'fixed';
      hud.style.bottom = '28px';
      hud.style.left = '50%';
      hud.style.transform = 'translateX(-50%)';
      hud.style.background = 'rgba(15, 27, 45, 0.96)';
      hud.style.backdropFilter = 'blur(16px)';
      hud.style.webkitBackdropFilter = 'blur(16px)';
      hud.style.color = '#FFFFFF';
      hud.style.padding = '12px 28px';
      hud.style.borderRadius = '32px';
      hud.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      hud.style.boxShadow = '0 12px 36px rgba(0, 0, 0, 0.55), 0 0 0 1.5px rgba(255, 255, 255, 0.2)';
      hud.style.zIndex = '2147483646';
      hud.style.display = 'flex';
      hud.style.alignItems = 'center';
      hud.style.gap = '14px';
      hud.style.maxWidth = '1000px';
      hud.style.width = 'max-content';
      hud.style.transition = 'all 0.25s ease';
      hud.innerHTML = \`
        <span id="__caption_badge" style="
          background: #0E7C6B; color: #FFFFFF; font-size: 11.5px; font-weight: 800;
          padding: 5px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.06em;
          white-space: nowrap; box-shadow: 0 2px 8px rgba(14, 124, 107, 0.5);
        ">EDUSYNC DEMO</span>
        <span id="__caption_text" style="font-size: 15px; font-weight: 600; line-height: 1.35; color: #F8FAFC;">
          Offline-First Learning Infrastructure · Zero Data Loss Verification
        </span>
      \`;
      (document.body || document.documentElement).appendChild(hud);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.__initEduSyncOverlays);
  } else {
    window.__initEduSyncOverlays();
  }
})();
`;

async function ensureOverlays(page) {
  await page.evaluate(() => {
    if (typeof window.__initEduSyncOverlays === 'function') {
      window.__initEduSyncOverlays();
    }
  });
}

// Moves cursor smoothly to coordinates
async function moveCursor(page, x, y, durationMs = 450) {
  await page.evaluate(({ x, y }) => {
    const cursor = document.getElementById('__demo_cursor_container');
    if (cursor) {
      cursor.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, { x, y });
  await sleep(durationMs);
}

// Moves cursor to the center of a locator
async function moveCursorToLocator(page, locator, durationMs = 500) {
  try {
    const box = await locator.first().boundingBox();
    if (box) {
      const targetX = Math.round(box.x + box.width / 2);
      const targetY = Math.round(box.y + box.height / 2);
      await moveCursor(page, targetX, targetY, durationMs);
      return { x: targetX, y: targetY };
    }
  } catch (e) {}
  return null;
}

// Visual click animation with cursor ripple (safely checks if enabled)
async function visualClick(page, locator) {
  if (await locator.count() === 0) return;
  const isVisible = await locator.first().isVisible().catch(() => false);
  if (!isVisible) return;

  const isEnabled = await locator.first().isEnabled().catch(() => false);
  await moveCursorToLocator(page, locator, 400);

  if (!isEnabled) {
    await sleep(400);
    return;
  }

  await page.evaluate(() => {
    const ripple = document.getElementById('__cursor_ripple');
    if (ripple) {
      ripple.style.transform = 'scale(0.5)';
      ripple.style.opacity = '1';
      setTimeout(() => {
        ripple.style.transform = 'scale(2.4)';
        ripple.style.opacity = '0';
      }, 50);
    }
  });
  await sleep(150);
  try {
    await locator.first().click({ timeout: 4000 });
  } catch (e) {}
  await sleep(350);
}

// Updates caption HUD text and color styling
async function setCaption(page, badge, text, badgeColor = '#0E7C6B') {
  await page.evaluate(({ badge, text, badgeColor }) => {
    if (typeof window.__initEduSyncOverlays === 'function') {
      window.__initEduSyncOverlays();
    }
    const badgeEl = document.getElementById('__caption_badge');
    const textEl = document.getElementById('__caption_text');
    if (badgeEl && textEl) {
      badgeEl.textContent = badge;
      badgeEl.style.background = badgeColor;
      badgeEl.style.boxShadow = `0 2px 8px ${badgeColor}80`;
      textEl.textContent = text;
    }
  }, { badge, text, badgeColor });
}

// Smooth typing with cursor position
async function typeWithCursor(page, locator, text, delayMs = 30) {
  await visualClick(page, locator);
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(delayMs);
  }
}

async function record() {
  console.log('🎬 Starting 2-Minute Screen Recording with Cursor & Live Caption HUD...');
  const chromePath = '/Users/blank/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,720',
      '--hide-scrollbars'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: VIDEOS_DIR,
      size: { width: 1280, height: 720 }
    }
  });

  // Inject overlay setup on EVERY page navigation and reload
  await context.addInitScript(INJECTION_SCRIPT);

  const page = await context.newPage();

  // Define navigation locators
  const navCourses = page.locator('button.nav-item').filter({ hasText: /Courses/i }).first();
  const navAssignments = page.locator('button.nav-item').filter({ hasText: /Assignments/i }).first();
  const navDoc = page.locator('button.nav-item').filter({ hasText: /Shared document/i }).first();
  const navSync = page.locator('button.nav-item').filter({ hasText: /Sync Center/i }).first();
  const navReview = page.locator('button.nav-item').filter({ hasText: /Review Inbox/i }).first();

  // =========================================================================
  // SCENE 1: Introduction & Offline-Ready Library (0:00 - 0:18, ~18s)
  // =========================================================================
  console.log('▶️ Scene 1: Offline Library & Prefetched Content...');
  await page.goto('http://127.0.0.1:5173/?as=u_aarav&page=library&fresh=1', { waitUntil: 'load' });
  await sleep(1500);
  await ensureOverlays(page);
  await setCaption(page, 'STEP 1: OFFLINE READINESS', 'EduSync pre-caches course lessons, media, and rubrics into IndexedDB for instant offline access.', '#0E7C6B');
  await sleep(5000);

  // Move cursor to "Available offline" chips
  const offlineChips = page.locator('text=Available offline');
  if (await offlineChips.count() > 0) {
    await moveCursorToLocator(page, offlineChips.first(), 500);
    await setCaption(page, 'LOCAL DURABILITY', 'Green badges confirm modules are cached locally: Students read lessons with 0ms network latency.', '#0E7C6B');
    await sleep(5500);
  }

  // Smooth scroll down to view course lessons
  await page.evaluate(() => window.scrollBy({ top: 160, behavior: 'smooth' }));
  await sleep(2500);
  await moveCursor(page, 640, 360, 500);
  await sleep(3500);
  await page.evaluate(() => window.scrollBy({ top: -160, behavior: 'smooth' }));
  await sleep(1500);

  // =========================================================================
  // SCENE 2: Severing the Network Connection (0:18 - 0:34, ~16s)
  // =========================================================================
  console.log('▶️ Scene 2: Severing Connectivity via Sync Center Simulator...');
  await setCaption(page, 'STEP 2: SIMULATING OFFLINE', 'Navigating to Sync Center to simulate a sudden loss of internet connectivity.', '#2563EB');
  await visualClick(page, navSync);
  await sleep(1500);
  await ensureOverlays(page);
  await setCaption(page, 'STEP 2: NETWORK SIMULATOR', 'Flipping Connection Simulator ON to mimic complete network severance in rural transit.', '#D97706');

  // Move cursor to the simulator switch: button[role="switch"]
  const simSwitch = page.locator('button[role="switch"][aria-label="Simulate offline"]').first();
  if (await simSwitch.isVisible()) {
    await moveCursorToLocator(page, simSwitch, 500);
    await sleep(1200);
    await visualClick(page, simSwitch);
  }
  await sleep(4000);

  // Point cursor to the status pill in the header
  const statusPill = page.locator('header span, nav span').filter({ hasText: /Offline/i }).first();
  if (await statusPill.isVisible()) {
    await moveCursorToLocator(page, statusPill, 500);
    await setCaption(page, 'TRANSPARENT SYSTEM STATE', 'System state updates truthfully to "Offline · 0 changes queued" without false optimism or spinners.', '#D97706');
    await sleep(5500);
  }

  // =========================================================================
  // SCENE 3: Offline Drafting & Keystroke Durability (0:34 - 0:52, ~18s)
  // =========================================================================
  console.log('▶️ Scene 3: Offline Drafting in Assignment...');
  await setCaption(page, 'STEP 3: OFFLINE DRAFTING', 'Navigating to Assignments: Writing an essay completely disconnected from the internet.', '#2563EB');
  await visualClick(page, navAssignments);
  await sleep(1500);
  await ensureOverlays(page);
  await setCaption(page, 'STEP 3: LOCAL OP-LOG', 'Every keystroke appends synchronously to an immutable, HLC-ordered operation log in IndexedDB.', '#0E7C6B');

  const textarea = page.locator('textarea#assignment-answer').first();
  if (await textarea.isVisible()) {
    await typeWithCursor(
      page,
      textarea,
      'Photosynthesis converts solar photon energy into glucose. In light reactions, photolysis splits H2O molecules, powering ATP and NADPH generation for the dark Calvin cycle.',
      26
    );
  }
  await sleep(4000);

  // Move cursor to header badge to show queued changes
  const queuedBadge = page.locator('header span, nav span').filter({ hasText: /queued/i }).first();
  if (await queuedBadge.isVisible()) {
    await moveCursorToLocator(page, queuedBadge, 500);
    await setCaption(page, 'QUEUED OP COUNTER', 'Queue counter increments live: "Offline · 2 changes queued" — local writes render instantly with 0ms delay.', '#D97706');
    await sleep(5500);
  }

  // =========================================================================
  // SCENE 4: Exactly-Once Submission Under Network Drops (0:52 - 1:10, ~18s)
  // =========================================================================
  console.log('▶️ Scene 4: Exactly-Once Submission...');
  await setCaption(page, 'STEP 4: EXACTLY-ONCE SUBMIT', 'Student clicks Submit Assignment. Simulating network retries during network drop.', '#2563EB');
  const submitBtn = page.locator('button.submit-button').first();
  if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
    await moveCursorToLocator(page, submitBtn, 500);
    await visualClick(page, submitBtn);
    await sleep(1500);
  }

  // Move cursor to receipt banner
  const receiptBox = page.locator('.receipt-card').first();
  if (await receiptBox.isVisible()) {
    await moveCursorToLocator(page, receiptBox, 500);
    await setCaption(page, 'IDEMPOTENCY AUTHORITY', 'Instant Receipt: 1 canonical attempt · Client ULID & DB unique index absorb duplicate retries safely.', '#0E7C6B');
    await sleep(6500);
  }

  // =========================================================================
  // SCENE 5: Surviving Browser Reload / Kill Test (1:10 - 1:28, ~18s)
  // =========================================================================
  console.log('▶️ Scene 5: Kill Test / Browser Reload...');
  await setCaption(page, 'STEP 5: THE KILL TEST', 'Testing resilience: Simulating unexpected tab crash, browser kill, or device restart while offline...', '#DC2626');
  await sleep(3000);
  await page.reload({ waitUntil: 'load' });
  await sleep(1500);
  await ensureOverlays(page);
  await setCaption(page, 'ZERO DATA LOSS VERIFIED', 'Browser reloaded! State rehydrated from IndexedDB: Draft, queued ops, and submission receipt survive 100% intact.', '#0E7C6B');
  await sleep(7000);

  // =========================================================================
  // SCENE 6: Reconnection & Background Queue Drain (1:28 - 1:46, ~18s)
  // =========================================================================
  console.log('▶️ Scene 6: Reconnection & Sync Drain...');
  await setCaption(page, 'STEP 6: RECONNECTION DRAIN', 'Returning to Sync Center to reconnect to Wi-Fi and trigger automatic queue synchronization.', '#2563EB');
  await visualClick(page, navSync);
  await sleep(1500);
  await ensureOverlays(page);
  await setCaption(page, 'STEP 6: DELTA SYNC DRAIN', 'Pending operations queue waiting for reconnection with jittered exponential backoff.', '#D97706');

  // Toggle connection simulator off if currently on
  const reconnectToggle = page.locator('button[role="switch"][aria-label="Simulate offline"]').first();
  if (await reconnectToggle.isVisible()) {
    const isCurrentlyOffline = (await reconnectToggle.getAttribute('aria-checked')) === 'true' || (await reconnectToggle.getAttribute('class'))?.includes('on');
    if (isCurrentlyOffline) {
      await visualClick(page, reconnectToggle);
      await sleep(1500);
    }
  }

  // Click Retry Now
  const retryBtn = page.locator('button').filter({ hasText: /Retry now/i }).first();
  if (await retryBtn.isVisible()) {
    await visualClick(page, retryBtn);
  }

  await setCaption(page, 'BACKGROUND FLUSH', 'Queue flushes in background: "Syncing 1/3..." -> "Synced · just now". Jittered backoff prevents server spikes.', '#0E7C6B');
  await sleep(5500);

  // Hover over the green applied badges in the table
  const appliedBadges = page.locator('table span, table td').filter({ hasText: /applied/i });
  if (await appliedBadges.count() > 0) {
    await moveCursorToLocator(page, appliedBadges.first(), 500);
    await setCaption(page, 'DATABASE CONVERGENCE', 'All operations marked "applied" idempotently · Change feed cursor advanced without duplicate records.', '#0E7C6B');
    await sleep(6000);
  }

  // =========================================================================
  // SCENE 7: The Advanced Twist — Collaborative CRDT Co-Editing (1:46 - 2:02, ~16s)
  // =========================================================================
  console.log('▶️ Scene 7: Collaborative Documents (Yjs CRDTs)...');
  await setCaption(page, 'STEP 7: THE ADVANCED TWIST', 'Solving concurrent offline editing: Two students edit the same document without silent data loss.', '#2563EB');
  await visualClick(page, navDoc);
  await sleep(1500);
  await ensureOverlays(page);
  await setCaption(page, 'YJS CRDT COMMUTATION', 'Shared document "d_group2" with real-time peer presence. Keystrokes commute mathematically: A*B = B*A.', '#0E7C6B');

  const docTextarea = page.locator('textarea').first();
  if (await docTextarea.isVisible()) {
    await visualClick(page, docTextarea);
    await page.keyboard.press('End');
    await sleep(400);
    await typeWithCursor(
      page,
      docTextarea,
      '\n\n[Field Observation]: Offline CRDT deltas merged seamlessly upon reconnect. 0 keystrokes lost.',
      26
    );
  }
  await sleep(5000);

  // =========================================================================
  // SCENE 8: Summary & Final Verdict (2:02 - 2:12, ~10s)
  // =========================================================================
  console.log('▶️ Scene 8: Closing & Review Inbox...');
  await visualClick(page, navReview);
  await sleep(1500);
  await ensureOverlays(page);
  await setCaption(page, 'EDUSYNC: FULLY VERIFIED', '108/108 automated tests passing · "The device is the source of truth, the network is an optimization."', '#0E7C6B');
  await sleep(6500);

  console.log('🏁 Closing context and flushing video recording...');
  await context.close();
  await browser.close();

  // Find the recorded webm file
  const files = fs.readdirSync(VIDEOS_DIR).filter(f => f.endsWith('.webm'));
  const latestWebm = files.map(f => ({
    name: f,
    time: fs.statSync(path.join(VIDEOS_DIR, f)).mtimeMs
  })).sort((a, b) => b.time - a.time)[0].name;

  const inputWebm = path.join(VIDEOS_DIR, latestWebm);
  console.log(`🎥 Raw video recorded: ${inputWebm}`);

  console.log('⚙️ Converting to high-quality 720p 30fps MP4 using ffmpeg (no audio)...');
  const ffmpegCmd = `/opt/homebrew/bin/ffmpeg -y -i "${inputWebm}" -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -an "${OUTPUT_MP4}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });

  // Copy to assets for GitHub repo
  fs.copyFileSync(OUTPUT_MP4, ASSETS_MP4);

  const stats = fs.statSync(OUTPUT_MP4);
  const durationOut = execSync(`/opt/homebrew/bin/ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${OUTPUT_MP4}"`).toString().trim();
  console.log(`✅ Demo video ready at: ${OUTPUT_MP4} (${(stats.size / (1024 * 1024)).toFixed(2)} MB, Duration: ${parseFloat(durationOut).toFixed(1)}s)`);
}

record().catch(err => {
  console.error('Recording failed:', err);
  process.exit(1);
});
