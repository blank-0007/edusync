import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const chromePath = '/Users/blank/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const archHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 30px;
    width: 1600px;
    height: 900px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0B1426;
    color: #FFFFFF;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid rgba(255,255,255,0.1);
    padding-bottom: 16px;
  }
  .title { font-size: 28px; font-weight: 900; color: #FFFFFF; }
  .title span { color: #14B8A6; }
  .badge { background: #13223C; border: 1.5px solid #14B8A6; color: #14B8A6; padding: 6px 16px; border-radius: 999px; font-size: 13px; font-weight: 800; }
  
  .layers-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
    margin-top: 18px;
  }
  .layer {
    background: #13223C;
    border-radius: 14px;
    border-left: 6px solid;
    padding: 16px 22px;
    display: flex;
    align-items: center;
    gap: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  }
  .layer-title-box {
    width: 220px;
    flex: 0 0 auto;
  }
  .layer-icon { font-size: 26px; }
  .layer-name { font-size: 17px; font-weight: 800; color: #FFFFFF; }
  .layer-sub { font-size: 12px; color: #94A3B8; margin-top: 2px; }
  
  .layer-blocks {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    flex: 1;
  }
  .block {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 10px 14px;
  }
  .block-title { font-size: 13.5px; font-weight: 800; color: #FFFFFF; display: flex; align-items: center; gap: 6px; }
  .block-desc { font-size: 11.5px; color: #CBD5E1; margin-top: 4px; line-height: 1.35; }

  .footer {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #94A3B8;
    border-top: 1px solid rgba(255,255,255,0.1);
    padding-top: 12px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="title">EduSync <span>System Architecture</span></div>
    <div class="badge">OFFLINE-FIRST DISTRIBUTED SYSTEM</div>
  </div>

  <div class="layers-container">
    <!-- Layer 1 -->
    <div class="layer" style="border-left-color: #3B82F6;">
      <div class="layer-title-box">
        <div class="layer-icon">📱</div>
        <div class="layer-name">1. Client Layer</div>
        <div class="layer-sub">Browser / Mobile Device</div>
      </div>
      <div class="layer-blocks">
        <div class="block">
          <div class="block-title" style="color: #60A5FA;">⚡ React 18 UI</div>
          <div class="block-desc">Optimistic rendering; 0ms local response without blocking spinners.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #60A5FA;">🛡️ TypeScript</div>
          <div class="block-desc">Strict type safety & shared contract schemas across workspaces.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #60A5FA;">📊 State Machine</div>
          <div class="block-desc">Truthful indicators: OFFLINE, SYNCING, or SYNCED.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #60A5FA;">♿ WCAG 2.2 AA</div>
          <div class="block-desc">ARIA live regions, 7:1+ contrast & 100% keyboard control.</div>
        </div>
      </div>
    </div>

    <!-- Layer 2 -->
    <div class="layer" style="border-left-color: #14B8A6;">
      <div class="layer-title-box">
        <div class="layer-icon">💾</div>
        <div class="layer-name">2. Local Storage</div>
        <div class="layer-sub">Tamper-Proof Device Vault</div>
      </div>
      <div class="layer-blocks">
        <div class="block">
          <div class="block-title" style="color: #2DD4BF;">🔒 IndexedDB Vault</div>
          <div class="block-desc">Durable local database; survives browser reboots & dead batteries.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #2DD4BF;">📜 Append-Only Log</div>
          <div class="block-desc">Every keystroke appends synchronously as an immutable operation.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #2DD4BF;">⏰ Hybrid Clock (HLC)</div>
          <div class="block-desc">Merges physical time & logical count; eliminates device clock drift.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #2DD4BF;">📚 Service Worker</div>
          <div class="block-desc">Pre-caches curriculum & app shell for instant 0ms offline access.</div>
        </div>
      </div>
    </div>

    <!-- Layer 3 -->
    <div class="layer" style="border-left-color: #F59E0B;">
      <div class="layer-title-box">
        <div class="layer-icon">🔄</div>
        <div class="layer-name">3. Sync Transport</div>
        <div class="layer-sub">Resilient Network Bridge</div>
      </div>
      <div class="layer-blocks">
        <div class="block">
          <div class="block-title" style="color: #FBBF24;">🎲 Jittered Backoff</div>
          <div class="block-desc">min(30s, 500ms · 2^n) ± 25% prevents school Wi-Fi stampedes.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #FBBF24;">📡 Active Probing</div>
          <div class="block-desc">Lightweight ping tests real throughput behind captive portals.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #FBBF24;">🗂️ FIFO Delta Queue</div>
          <div class="block-desc">Sends changes in strict sequential order on verified reconnect.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #FBBF24;">📦 Delta Cursors</div>
          <div class="block-desc">Only transmits edited word diffs, conserving mobile cellular data.</div>
        </div>
      </div>
    </div>

    <!-- Layer 4 -->
    <div class="layer" style="border-left-color: #8B5CF6;">
      <div class="layer-title-box">
        <div class="layer-icon">☁️</div>
        <div class="layer-name">4. Server & Edge</div>
        <div class="layer-sub">Cloudflare Edge & SQLite</div>
      </div>
      <div class="layer-blocks">
        <div class="block">
          <div class="block-title" style="color: #C084FC;">🌐 Cloudflare D1</div>
          <div class="block-desc">Global serverless SQLite database on 300+ edge locations.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #C084FC;">🚀 Fastify API</div>
          <div class="block-desc">High-throughput Node.js backend with native schema validation.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #C084FC;">🛡️ ULID Dedup</div>
          <div class="block-desc">Database unique constraint safely absorbs repeated submit clicks.</div>
        </div>
        <div class="block">
          <div class="block-title" style="color: #C084FC;">👥 Yjs CRDTs</div>
          <div class="block-desc">Mathematical commutativity merges concurrent edits automatically.</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>EduSync Architecture · Created by Kaushal</span>
    <span>Live Prototype: edusync-tus.pages.dev</span>
    <span>108/108 Tests Passing</span>
  </div>
</body>
</html>
`;

const pipeHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 30px;
    width: 1600px;
    height: 900px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0B1426;
    color: #FFFFFF;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid rgba(255,255,255,0.1);
    padding-bottom: 16px;
  }
  .title { font-size: 28px; font-weight: 900; color: #FFFFFF; }
  .title span { color: #3B82F6; }
  .badge { background: #13223C; border: 1.5px solid #3B82F6; color: #60A5FA; padding: 6px 16px; border-radius: 999px; font-size: 13px; font-weight: 800; }
  
  .pipeline-flow {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 16px;
    align-items: stretch;
    margin: 24px 0;
    flex: 1;
  }
  .step-card {
    background: #13223C;
    border: 2px solid;
    border-radius: 16px;
    padding: 22px 18px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-shadow: 0 6px 24px rgba(0,0,0,0.35);
    position: relative;
  }
  .step-num {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 4px 10px;
    border-radius: 999px;
    width: max-content;
    margin-bottom: 12px;
  }
  .step-icon { font-size: 38px; margin-bottom: 12px; }
  .step-title { font-size: 18px; font-weight: 800; color: #FFFFFF; margin-bottom: 8px; }
  .step-desc { font-size: 12.5px; color: #CBD5E1; line-height: 1.45; }
  .step-metric {
    margin-top: 14px;
    background: rgba(255,255,255,0.06);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 11px;
    font-weight: 750;
    color: #94A3B8;
  }

  .banner-explanation {
    background: rgba(20, 184, 166, 0.12);
    border: 1.5px solid #14B8A6;
    border-radius: 12px;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .banner-icon { font-size: 26px; }
  .banner-text { font-size: 13.5px; color: #CCFBF1; line-height: 1.4; }
  .banner-text strong { color: #FFFFFF; }

  .footer {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #94A3B8;
    border-top: 1px solid rgba(255,255,255,0.1);
    padding-top: 12px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="title">EduSync <span>Data Synchronization Pipeline</span></div>
    <div class="badge">END-TO-END DATA FLOW</div>
  </div>

  <div class="pipeline-flow">
    <!-- Step 1 -->
    <div class="step-card" style="border-color: #3B82F6;">
      <div>
        <div class="step-num" style="background: rgba(59, 130, 246, 0.2); color: #60A5FA;">STAGE 1</div>
        <div class="step-icon">✍️</div>
        <div class="step-title">Student Action</div>
        <div class="step-desc">Student writes essay or clicks Submit Assignment. React updates screen instantly.</div>
      </div>
      <div class="step-metric">⚡ 0ms Input Latency · Zero Spinners</div>
    </div>

    <!-- Step 2 -->
    <div class="step-card" style="border-color: #14B8A6;">
      <div>
        <div class="step-num" style="background: rgba(20, 184, 166, 0.2); color: #2DD4BF;">STAGE 2</div>
        <div class="step-icon">🔒</div>
        <div class="step-title">Local Op-Log</div>
        <div class="step-desc">Keystroke writes synchronously to IndexedDB on phone disk before touching the wire.</div>
      </div>
      <div class="step-metric">💾 Survives Browser Kill & Dead Battery</div>
    </div>

    <!-- Step 3 -->
    <div class="step-card" style="border-color: #F59E0B;">
      <div>
        <div class="step-num" style="background: rgba(245, 158, 11, 0.2); color: #FBBF24;">STAGE 3</div>
        <div class="step-icon">🏷️</div>
        <div class="step-title">State & Receipt</div>
        <div class="step-desc">Mints client-side ULID token; displays confirmed offline receipt and queued count.</div>
      </div>
      <div class="step-metric">🧾 Instant Official Receipt with 0 Wi-Fi</div>
    </div>

    <!-- Step 4 -->
    <div class="step-card" style="border-color: #8B5CF6;">
      <div>
        <div class="step-num" style="background: rgba(139, 92, 246, 0.2); color: #C084FC;">STAGE 4</div>
        <div class="step-icon">📡</div>
        <div class="step-title">Jittered Drain</div>
        <div class="step-desc">Phone detects Wi-Fi; flushes queue with randomized backoff so routers don't crash.</div>
      </div>
      <div class="step-metric">🎲 Prevents 50-Student Network Crashes</div>
    </div>

    <!-- Step 5 -->
    <div class="step-card" style="border-color: #10B981;">
      <div>
        <div class="step-num" style="background: rgba(16, 185, 129, 0.2); color: #34D399;">STAGE 5</div>
        <div class="step-icon">☁️</div>
        <div class="step-title">D1 Reconcile</div>
        <div class="step-desc">Cloudflare D1 verifies ULID, absorbs retries, checks 409 diffs, and marks "All Synced".</div>
      </div>
      <div class="step-metric">✅ 100% Convergence · 0 Duplicates</div>
    </div>
  </div>

  <div class="banner-explanation">
    <div class="banner-icon">💡</div>
    <div class="banner-text">
      <strong>Core Invariant:</strong> "The device is the source of truth, the network is an optimization." Even if connection drops permanently, every word is safely preserved on the device and can be audited.
    </div>
  </div>

  <div class="footer">
    <span>EduSync Pipeline · Created by Kaushal</span>
    <span>Live Prototype: edusync-tus.pages.dev</span>
    <span>108/108 Tests Passing</span>
  </div>
</body>
</html>
`;

async function main() {
  const archHtmlPath = path.join(process.cwd(), 'docs', 'shots', 'architecture.html');
  const pipeHtmlPath = path.join(process.cwd(), 'docs', 'shots', 'pipeline.html');
  const archPngPath = path.join(process.cwd(), 'assets', 'architecture-diagram.png');
  const pipePngPath = path.join(process.cwd(), 'assets', 'pipeline-diagram.png');
  const archDocsPath = path.join(process.cwd(), 'docs', 'shots', 'architecture-diagram.png');
  const pipeDocsPath = path.join(process.cwd(), 'docs', 'shots', 'pipeline-diagram.png');

  fs.writeFileSync(archHtmlPath, archHtml);
  fs.writeFileSync(pipeHtmlPath, pipeHtml);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--window-size=1600,900']
  });

  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  // Render Architecture Diagram
  await page.goto('file://' + archHtmlPath);
  await page.screenshot({ path: archPngPath });
  fs.copyFileSync(archPngPath, archDocsPath);
  console.log('✅ Generated architecture-diagram.png');

  // Render Pipeline Diagram
  await page.goto('file://' + pipeHtmlPath);
  await page.screenshot({ path: pipePngPath });
  fs.copyFileSync(pipePngPath, pipeDocsPath);
  console.log('✅ Generated pipeline-diagram.png');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
