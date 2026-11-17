import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const VIDEOS_DIR = path.join(ROOT, 'artifacts', 'videos');
const OUTPUT_MP4 = path.join(ROOT, 'artifacts', 'EduSync-Demo.mp4');

fs.mkdirSync(VIDEOS_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function record() {
  const chromePath = '/Users/blank/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  console.log(`🎬 Launching Chromium (${chromePath}) for automated screen-recorded demo...`);
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: VIDEOS_DIR,
      size: { width: 1280, height: 720 }
    }
  });

  const page = await context.newPage();

  // Helper for human-paced smooth typing
  async function typeSlowly(selector, text, delayMs = 35) {
    await page.focus(selector);
    for (const char of text) {
      await page.keyboard.type(char);
      await sleep(delayMs);
    }
  }

  console.log('📌 Scene 1: Cold start & Lesson Library (Offline prefetching)...');
  await page.goto('http://127.0.0.1:5173/?as=u_aarav&page=library', { waitUntil: 'networkidle' });
  await sleep(2500);

  // Scroll down slightly to show lessons and offline chips
  await page.evaluate(() => window.scrollBy({ top: 150, behavior: 'smooth' }));
  await sleep(2000);
  await page.evaluate(() => window.scrollBy({ top: -150, behavior: 'smooth' }));
  await sleep(1500);

  console.log('📌 Scene 2: Severing connectivity via Sync Center Simulator...');
  // Click on Sync Center in navigation
  const syncNav = page.locator('nav a, a[href*="sync"]').filter({ hasText: /Sync/i }).first();
  if (await syncNav.isVisible()) {
    await syncNav.click();
  } else {
    await page.goto('http://127.0.0.1:5173/?as=u_aarav&page=sync', { waitUntil: 'networkidle' });
  }
  await sleep(2000);

  // Toggle connection simulator
  const toggleBtn = page.locator('button, input[type="checkbox"]').filter({ hasText: /simulate|offline|disconnect/i }).first();
  if (await toggleBtn.isVisible()) {
    await toggleBtn.click();
  } else {
    // Try finding by role or label
    const simCheckbox = page.locator('input[type="checkbox"]').first();
    if (await simCheckbox.isVisible()) {
      await simCheckbox.click();
    }
  }
  await sleep(2500); // Let viewer see the status pill flip to Offline

  console.log('📌 Scene 3: Writing an assignment offline & exactly-once submit...');
  const assignNav = page.locator('nav a, a[href*="assignment"]').filter({ hasText: /Assignment/i }).first();
  if (await assignNav.isVisible()) {
    await assignNav.click();
  } else {
    await page.goto('http://127.0.0.1:5173/?as=u_aarav&page=assignment', { waitUntil: 'networkidle' });
  }
  await sleep(2000);

  const textarea = page.locator('textarea').first();
  if (await textarea.isVisible()) {
    await textarea.click();
    await sleep(500);
    await typeSlowly('textarea', 'Photosynthesis transforms light energy into chemical energy stored in glucose. Even while completely offline, this draft autosaves locally to an immutable HLC operation log in IndexedDB.', 25);
  }
  await sleep(2000);

  // Click Submit Assignment
  const submitBtn = page.locator('button').filter({ hasText: /Submit/i }).first();
  if (await submitBtn.isVisible()) {
    console.log('👉 Submitting assignment offline (multiple retries)...');
    await submitBtn.click();
    await sleep(800);
    // Click again to simulate impatient user retrying during network drop
    if (await submitBtn.isEnabled()) {
      await submitBtn.click();
      await sleep(800);
    }
  }
  await sleep(3000); // Show receipt banner and status

  console.log('📌 Scene 4: Surviving the Browser Kill/Reload test...');
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500); // Verify draft and receipt survive intact

  console.log('📌 Scene 5: Reconnection & Background Queue Drain...');
  if (await syncNav.isVisible()) {
    await syncNav.click();
  } else {
    await page.goto('http://127.0.0.1:5173/?as=u_aarav&page=sync', { waitUntil: 'networkidle' });
  }
  await sleep(2000);

  // Toggle simulator off to reconnect
  const reconnectToggle = page.locator('input[type="checkbox"]').first();
  if (await reconnectToggle.isVisible()) {
    await reconnectToggle.click();
  }
  await sleep(1000);

  const retryBtn = page.locator('button').filter({ hasText: /Retry|Sync Now/i }).first();
  if (await retryBtn.isVisible()) {
    await retryBtn.click();
  }
  await sleep(3500); // Watch queue drain and turn green

  console.log('📌 Scene 6: The Advanced Twist (Collaborative CRDT Document)...');
  const docNav = page.locator('nav a, a[href*="doc"]').filter({ hasText: /Doc/i }).first();
  if (await docNav.isVisible()) {
    await docNav.click();
  } else {
    await page.goto('http://127.0.0.1:5173/?as=u_aarav&page=doc', { waitUntil: 'networkidle' });
  }
  await sleep(2500);

  const docTextarea = page.locator('textarea').first();
  if (await docTextarea.isVisible()) {
    await docTextarea.focus();
    await page.keyboard.press('End');
    await sleep(500);
    await typeSlowly('textarea', '\n\n[Collaborative CRDT Update]: Both offline edits merged without losing a single keystroke.', 25);
  }
  await sleep(3000);

  console.log('📌 Scene 7: Conflict Resolution Inbox...');
  const reviewNav = page.locator('nav a, a[href*="review"]').filter({ hasText: /Review|Conflict/i }).first();
  if (await reviewNav.isVisible()) {
    await reviewNav.click();
  } else {
    await page.goto('http://127.0.0.1:5173/?as=u_aarav&page=review', { waitUntil: 'networkidle' });
  }
  await sleep(3500);

  console.log('🏁 Closing page and flushing video recording...');
  await context.close();
  await browser.close();

  // Find the recorded webm file
  const files = fs.readdirSync(VIDEOS_DIR).filter(f => f.endsWith('.webm'));
  if (files.length === 0) {
    throw new Error('No webm video recorded!');
  }
  // Get latest webm
  const latestWebm = files.map(f => ({
    name: f,
    time: fs.statSync(path.join(VIDEOS_DIR, f)).mtimeMs
  })).sort((a, b) => b.time - a.time)[0].name;

  const inputWebm = path.join(VIDEOS_DIR, latestWebm);
  console.log(`🎥 Raw video recorded: ${inputWebm}`);

  console.log('⚙️ Converting to high-quality MP4 using ffmpeg (no audio)...');
  const ffmpegCmd = `/opt/homebrew/bin/ffmpeg -y -i "${inputWebm}" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -an "${OUTPUT_MP4}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });

  const stats = fs.statSync(OUTPUT_MP4);
  console.log(`✅ Demo video ready at: ${OUTPUT_MP4} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
}

record().catch(err => {
  console.error('Recording failed:', err);
  process.exit(1);
});
