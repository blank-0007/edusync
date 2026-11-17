import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const chromePath = '/Users/blank/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const slidesHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: 16in 9in;
    margin: 0;
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #F8FAFC;
    color: #101828;
  }
  .slide {
    width: 16in;
    height: 9in;
    page-break-after: always;
    position: relative;
    padding: 0.6in 0.9in;
    overflow: hidden;
    background: #F8FAFC;
  }
  .slide.dark {
    background: #0F1B2D;
    color: #FFFFFF;
  }
  .header-cat {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #0E7C6B;
    margin-bottom: 6px;
  }
  .slide.dark .header-cat {
    color: #8FD1C6;
  }
  .slide-title {
    font-size: 34px;
    font-weight: 800;
    color: #0F1B2D;
    margin: 0 0 28px 0;
    line-height: 1.2;
  }
  .slide.dark .slide-title {
    color: #FFFFFF;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
    height: calc(100% - 110px);
  }
  .grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    height: calc(100% - 110px);
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    height: calc(100% - 110px);
  }
  .card {
    background: #FFFFFF;
    border: 1.5px solid #E4E7EC;
    border-radius: 18px;
    padding: 26px;
    box-shadow: 0 4px 14px rgba(16, 24, 40, 0.05);
    display: flex;
    flex-direction: column;
  }
  .card.dark {
    background: #17293F;
    border-color: #0E7C6B;
    color: #FFFFFF;
  }
  .card-title {
    font-size: 20px;
    font-weight: 750;
    margin-bottom: 14px;
    color: #0F1B2D;
  }
  .card.dark .card-title {
    color: #FFFFFF;
  }
  ul {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 15px;
    line-height: 1.45;
    color: #475467;
  }
  .card.dark ul {
    color: #E2E8F0;
  }
  li strong {
    color: #0F1B2D;
  }
  .card.dark li strong {
    color: #FFFFFF;
  }
  .badge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-teal { background: #E6F4F1; color: #0E7C6B; }
  .badge-blue { background: #EEF2FF; color: #3E63DD; }
  .badge-amber { background: #FEF3F2; color: #B42318; }
  .hero-pill {
    background: #0E7C6B;
    color: #FFFFFF;
    padding: 8px 18px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.08em;
    display: inline-block;
    margin-bottom: 20px;
  }
  .pipeline-banner {
    background: #0F1B2D;
    border: 1.5px solid #0E7C6B;
    border-radius: 16px;
    padding: 18px 26px;
    color: #FFFFFF;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .step-node {
    background: #17293F;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 14px;
    font-weight: 700;
  }
  .step-arrow { color: #8FD1C6; font-size: 20px; font-weight: 900; }
</style>
</head>
<body>

<!-- SLIDE 1: Title Slide -->
<div class="slide dark" style="display: flex; flex-direction: column; justify-content: center; padding: 1in 1.2in;">
  <div><span class="hero-pill">OFFLINE-FIRST LEARNING INFRASTRUCTURE</span></div>
  <h1 style="font-size: 72px; font-weight: 900; margin: 0 0 12px 0; color: #FFFFFF; letter-spacing: -0.02em;">EduSync</h1>
  <p style="font-size: 28px; color: #8FD1C6; margin: 0 0 36px 0; font-weight: 500;">
    Bulletproof Learning Infrastructure for Intermittent & Rural Connectivity
  </p>
  <div style="background: #17293F; border-left: 5px solid #0E7C6B; padding: 20px 28px; border-radius: 0 14px 14px 0; max-width: 1100px; margin-bottom: 40px;">
    <div style="font-size: 20px; font-weight: 750; color: #FFFFFF; margin-bottom: 6px;">
      "The device is the source of truth, the network is an optimization."
    </div>
    <div style="font-size: 16px; color: #CBD5E1; line-height: 1.45;">
      Zero data loss during abrupt network drops, local HLC-ordered op-logs, exactly-once submission receipts, and CRDT collaborative co-editing.
    </div>
  </div>
  <div style="font-size: 16px; color: #94A3B8; font-weight: 600; display: flex; gap: 32px;">
    <span>⚡ 108/108 Automated Tests Passing</span>
    <span>🌐 Cloudflare Global Edge Deployed</span>
    <span>♿ WCAG 2.2 AA Verified</span>
    <span>📦 github.com/blank-0007/edusync</span>
  </div>
</div>

<!-- SLIDE 2: The Problem -->
<div class="slide">
  <div class="header-cat">EDUSYNC · TECHNICAL PRESENTATION</div>
  <h2 class="slide-title">The Problem: Why Traditional LMS Fails in the Real World</h2>
  <div class="grid-3">
    <div class="card">
      <div class="card-title" style="color: #0F1B2D;">1. Connectivity Is Intermittent</div>
      <ul>
        <li><strong>Real-World Drops:</strong> In rural regions, connections cut during commutes, brownouts, or spotty cellular towers.</li>
        <li><strong>Synchronous Blocking:</strong> Traditional LMS platforms assume an always-on connection; requests block and fail.</li>
        <li><strong>navigator.onLine Falsehoods:</strong> Browsers claim "online" even behind dead captive portals or zero-throughput routers.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title" style="color: #D97706;">2. Devastating Data Loss</div>
      <ul>
        <li><strong>Lost Submissions:</strong> A student writes a 500-word exam, clicks submit during a signal dip, and the page reloads blank.</li>
        <li><strong>Duplicate Submissions:</strong> Anxious students spam the submit button, generating duplicate records or rate-limit bans.</li>
        <li><strong>Silent Overwrites:</strong> Concurrent edits clobber each other silently under standard naive Last-Write-Wins rules.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title" style="color: #B42318;">3. The 'False Optimism' Trap</div>
      <ul>
        <li><strong>Infinite Spinners:</strong> Interfaces freeze while waiting 30s for TCP timeouts, locking the student out of their notes.</li>
        <li><strong>Session Expiry:</strong> Auth tokens expire offline; on reconnect, uncommitted local text is wiped by login redirects.</li>
        <li><strong>Widening Divide:</strong> Learning halts when Wi-Fi flickers, penalizing students in low-connectivity areas.</li>
      </ul>
    </div>
  </div>
</div>

<!-- SLIDE 3: The Tech Stack -->
<div class="slide">
  <div class="header-cat">EDUSYNC · TECHNICAL PRESENTATION</div>
  <h2 class="slide-title">The Tech Stack: Purpose-Built for Zero Data Loss</h2>
  <div class="grid-4">
    <div class="card">
      <span class="badge badge-blue" style="margin-bottom: 12px; width: max-content;">CLIENT & UI</span>
      <div class="card-title" style="font-size: 17px; margin-bottom: 8px;">React 18 · TypeScript · Vite</div>
      <ul>
        <li><strong>TypeScript (Strict):</strong> Shared schemas across client and server.</li>
        <li><strong>React 18:</strong> Optimistic local state, 0ms input latency, 0 spinners.</li>
        <li><strong>Vite:</strong> Ultra-fast builds, optimized bundle splitting.</li>
        <li><strong>WCAG 2.2 AA:</strong> Full screen-reader live regions & keyboard navigation.</li>
      </ul>
    </div>
    <div class="card">
      <span class="badge badge-teal" style="margin-bottom: 12px; width: max-content;">OFFLINE ENGINE</span>
      <div class="card-title" style="font-size: 17px; margin-bottom: 8px;">IndexedDB · SW · Yjs</div>
      <ul>
        <li><strong>IndexedDB:</strong> Transactional persistence surviving browser restarts.</li>
        <li><strong>Service Worker:</strong> Cache-first app shell & lessons loaded with 0ms latency.</li>
        <li><strong>Append-Only Op-Log:</strong> Every edit written locally before network attempts.</li>
        <li><strong>Yjs CRDTs:</strong> Mathematically commutative collaborative document edits.</li>
      </ul>
    </div>
    <div class="card">
      <span class="badge" style="background: #E2E8F0; color: #0F1B2D; margin-bottom: 12px; width: max-content;">BACKEND & EDGE</span>
      <div class="card-title" style="font-size: 17px; margin-bottom: 8px;">Fastify · SQLite · D1</div>
      <ul>
        <li><strong>Fastify REST/WS:</strong> High-performance Node.js API with schema validation.</li>
        <li><strong>Cloudflare Workers & D1:</strong> Global edge serverless relational database.</li>
        <li><strong>HTTP/2 & WS Feed:</strong> Push updates with automatic SSE/polling fallbacks.</li>
        <li><strong>Idempotency Engine:</strong> Unique constraint on client ULID absorbs retries.</li>
      </ul>
    </div>
    <div class="card">
      <span class="badge badge-amber" style="margin-bottom: 12px; width: max-content;">TESTING & AUDIT</span>
      <div class="card-title" style="font-size: 17px; margin-bottom: 8px;">Vitest · Playwright · axe</div>
      <ul>
        <li><strong>Vitest (108 Tests):</strong> Full unit & integration testing suite.</li>
        <li><strong>Playwright E2E:</strong> Headless browser network drops & kill-test validation.</li>
        <li><strong>axe-core Auditing:</strong> 0 accessibility violations across all pages.</li>
        <li><strong>Automated Demo HUD:</strong> Headless video capture with animated cursor.</li>
      </ul>
    </div>
  </div>
</div>

<!-- SLIDE 4: Architecture -->
<div class="slide">
  <div class="header-cat">EDUSYNC · TECHNICAL PRESENTATION</div>
  <h2 class="slide-title">System Architecture: End-to-End Local-First Pipeline</h2>
  <div class="pipeline-banner">
    <div class="step-node">1. Student Action</div>
    <div class="step-arrow">➔</div>
    <div class="step-node">2. IndexedDB Op-Log</div>
    <div class="step-arrow">➔</div>
    <div class="step-node">3. Active State Machine</div>
    <div class="step-arrow">➔</div>
    <div class="step-node">4. Jittered Delta Sync</div>
    <div class="step-arrow">➔</div>
    <div class="step-node">5. Server Reconcile</div>
  </div>
  <div class="grid-3" style="height: calc(100% - 190px);">
    <div class="card">
      <div class="card-title" style="color: #0F1B2D;">Client: Local Durability</div>
      <ul>
        <li><strong>Instant 0ms Writes:</strong> Edits append to IndexedDB synchronously. No spinner locks the user interface.</li>
        <li><strong>Hybrid Logical Clocks (HLC):</strong> Monotonic clock counters resolve ordering independent of device clock drift.</li>
        <li><strong>Truthful State Machine:</strong> Explicitly reports OFFLINE, CONNECTING, SYNCING, or SYNCED.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title" style="color: #0E7C6B;">Transport: Resilient Drain</div>
      <ul>
        <li><strong>FIFO Delta Queue:</strong> Flushes pending changes sequentially upon verified ping recovery.</li>
        <li><strong>Full-Jitter Exponential Backoff:</strong> Prevents thundering herd server overload when a school reconnects.</li>
        <li><strong>Change Feed Cursors:</strong> Only syncs incremental differences; never re-downloads entire datasets.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title" style="color: #2563EB;">Server: Authoritative Reconcile</div>
      <ul>
        <li><strong>ACID Relational Storage:</strong> Fastify SQLite backend and Cloudflare D1 serverless edge database.</li>
        <li><strong>Idempotency Invariant:</strong> Duplicate network calls with identical ULID return original receipt.</li>
        <li><strong>Version Stamping:</strong> Rejects conflicting stale updates with HTTP 409 and full server state payload.</li>
      </ul>
    </div>
  </div>
</div>

<!-- SLIDE 5: Solving Hard Challenges -->
<div class="slide">
  <div class="header-cat">EDUSYNC · TECHNICAL PRESENTATION</div>
  <h2 class="slide-title">Solving the "Very Hard" Engineering Challenges</h2>
  <div style="display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 20px; height: calc(100% - 110px);">
    <div class="card" style="padding: 20px;">
      <div class="card-title" style="font-size: 17px; margin-bottom: 8px; color: #2563EB;">1. Exactly-Once Submission Under Drops</div>
      <div style="font-size: 14px; line-height: 1.45; color: #475467;">
        <strong>Problem:</strong> Connection cuts mid-flight during exam submit; student retries repeatedly.<br>
        <strong>Solution:</strong> Client generates a canonical submissionId (ULID). DB enforces unique constraint on (assignmentId, userId, submissionId).<br>
        <strong>Result:</strong> Retries are absorbed safely; student receives instant confirmed receipt.
      </div>
    </div>
    <div class="card" style="padding: 20px;">
      <div class="card-title" style="font-size: 17px; margin-bottom: 8px; color: #B42318;">2. The 'Kill Test' (Total Crash Durability)</div>
      <div style="font-size: 14px; line-height: 1.45; color: #475467;">
        <strong>Problem:</strong> Mobile OS kills background tabs or device battery dies suddenly.<br>
        <strong>Solution:</strong> Every keystroke appends synchronously to IndexedDB before memory update.<br>
        <strong>Result:</strong> 100% recovery. Device reboots preserve all drafts, queued ops, and receipts.
      </div>
    </div>
    <div class="card" style="padding: 20px;">
      <div class="card-title" style="font-size: 17px; margin-bottom: 8px; color: #0E7C6B;">3. Clock Skew & Causality (HLC)</div>
      <div style="font-size: 14px; line-height: 1.45; color: #475467;">
        <strong>Problem:</strong> Device system clocks may be manipulated, incorrect, or drift by hours.<br>
        <strong>Solution:</strong> Hybrid Logical Clocks merge physical wall-clock millis with logical counters.<br>
        <strong>Result:</strong> Guarantees strict causal ordering across distributed clients without NTP dependencies.
      </div>
    </div>
    <div class="card" style="padding: 20px;">
      <div class="card-title" style="font-size: 17px; margin-bottom: 8px; color: #D97706;">4. Resilient Exponential Backoff & Jitter</div>
      <div style="font-size: 14px; line-height: 1.45; color: #475467;">
        <strong>Problem:</strong> Simultaneous reconnection retries crash the server when network returns.<br>
        <strong>Solution:</strong> Full-jitter backoff: <code>sleep = min(max_backoff, base * 2^attempt) * random(0.5, 1.5)</code>.<br>
        <strong>Result:</strong> Smooth traffic distribution and reliable background synchronization.
      </div>
    </div>
  </div>
</div>

<!-- SLIDE 6: Conflict Resolution & CRDTs -->
<div class="slide">
  <div class="header-cat">EDUSYNC · TECHNICAL PRESENTATION</div>
  <h2 class="slide-title">Conflict Resolution & The CRDT Collaborative Twist</h2>
  <div class="grid-2">
    <div class="card">
      <div class="card-title" style="color: #0F1B2D;">Deterministic 3-Way Conflict Resolution</div>
      <ul>
        <li><strong>Base Version Tracking:</strong> Every client draft carries <code>baseVersion</code>. If server version > baseVersion, conflict is flagged.</li>
        <li><strong>HTTP 409 Conflict Payload:</strong> Server rejects stale writes safely, returning both the server truth and incoming draft.</li>
        <li><strong>Interactive Review Inbox:</strong> Surfaces a side-by-side visual diff (Local Draft vs. Server Version) directly in the UI.</li>
        <li><strong>Resolution Strategies:</strong> Students can choose "Keep Mine", "Accept Server", or "Merge Both" with zero accidental overwrites.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title" style="color: #2563EB;">The Advanced Twist: Yjs CRDT Co-Editing</div>
      <ul>
        <li><strong>Mathematical Commutativity:</strong> Operations commute (A * B = B * A). Concurrent edits converge deterministically.</li>
        <li><strong>Real-Time Peer Presence:</strong> Visual avatars and cursor tracking show peer edits live across the classroom.</li>
        <li><strong>Offline Peer Independence:</strong> Students edit shared documents offline; all changes merge cleanly upon reconnect.</li>
        <li><strong>Zero Lost Keystrokes:</strong> Eliminates the classic Google Docs "reconnecting... you have been disconnected" lockout.</li>
      </ul>
    </div>
  </div>
</div>

<!-- SLIDE 7: Accessibility -->
<div class="slide">
  <div class="header-cat">EDUSYNC · TECHNICAL PRESENTATION</div>
  <h2 class="slide-title">Inclusivity: Fully Accessible Under WCAG 2.2 AA</h2>
  <div class="grid-3">
    <div class="card">
      <div class="card-title" style="color: #0F1B2D;">Perceivable & Screen Readers</div>
      <ul>
        <li><strong>ARIA Live Regions:</strong> State transitions ("Offline", "Syncing 1/3", "Synced") announced automatically.</li>
        <li><strong>Accessible Forms:</strong> Explicit <code>aria-describedby</code> and rubric relationships on textareas.</li>
        <li><strong>High Contrast (7:1+):</strong> Strict WCAG AAA color contrast readable in bright outdoor sunlight.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title" style="color: #0E7C6B;">Operable & Keyboard Control</div>
      <ul>
        <li><strong>Full Keyboard Navigation:</strong> Every workflow accessible via Tab, Shift+Tab, and Enter with 3px focus rings.</li>
        <li><strong>Skip Navigation:</strong> Direct jump link bypasses navbars straight to main learning content.</li>
        <li><strong>Reduced Motion:</strong> Respects <code>prefers-reduced-motion</code> for users with vestibular sensitivities.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title" style="color: #2563EB;">Truthful & Audited UI</div>
      <ul>
        <li><strong>No False Spinners:</strong> Never traps users in loading screens; displays exact queue and retry countdowns.</li>
        <li><strong>Human Error Messaging:</strong> Actionable reassurance: "Your work is saved safely on this device."</li>
        <li><strong>Zero Audit Violations:</strong> Automated Playwright axe-core regression suite confirms 0 accessibility violations.</li>
      </ul>
    </div>
  </div>
</div>

<!-- SLIDE 8: Verification & Links -->
<div class="slide">
  <div class="header-cat">EDUSYNC · TECHNICAL PRESENTATION</div>
  <h2 class="slide-title">Verification, Production Deployment & Live Links</h2>
  <div style="background: #E6F4F1; border: 1.5px solid #0E7C6B; border-radius: 16px; padding: 18px 26px; margin-bottom: 24px;">
    <div style="font-size: 13px; font-weight: 800; color: #0E7C6B; text-transform: uppercase;">VERIFIED IMPACT & TEST RESULTS</div>
    <div style="font-size: 24px; font-weight: 800; color: #0F1B2D; margin: 4px 0;">108 / 108 Automated Tests Passing  |  0 Data Loss in Kill Tests  |  WCAG 2.2 AA Verified</div>
    <div style="font-size: 14px; color: #475467;">43 Protocol Tests (HLC, idempotency, schemas) · 33 Server Tests (Fastify & D1 sync engine) · 32 Client Integration Tests</div>
  </div>
  <div class="grid-3" style="height: calc(100% - 190px);">
    <div class="card">
      <div class="card-title" style="color: #2563EB;">Live Cloudflare Production</div>
      <div style="font-size: 16px; font-weight: 750; color: #0F1B2D; margin-bottom: 8px;">🌐 edusync-tus.pages.dev</div>
      <ul>
        <li>Deployed globally across 300+ Cloudflare edge nodes.</li>
        <li>Instant cold starts with HTTP/2 and Brotli compression.</li>
        <li>Built-in network simulator lets judges test offline mode live.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title" style="color: #0E7C6B;">2-Minute Demo Video</div>
      <div style="font-size: 16px; font-weight: 750; color: #0F1B2D; margin-bottom: 8px;">🎬 assets/EduSync-Demo.mp4</div>
      <ul>
        <li>105.6s 720p HD silent screen recording.</li>
        <li>Animated cursor highlights mouse clicks and hovers.</li>
        <li>Caption HUD explains offline invariants step-by-step.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title" style="color: #0F1B2D;">Open-Source Codebase</div>
      <div style="font-size: 16px; font-weight: 750; color: #0F1B2D; margin-bottom: 8px;">📦 github.com/blank-0007/edusync</div>
      <ul>
        <li>Clean monorepo: protocol, server, and web client.</li>
        <li>Complete reproduction: npm run dev, npm test, npm run verify.</li>
        <li>Includes PDF project proposal, presentation, and contract.</li>
      </ul>
    </div>
  </div>
</div>

<!-- SLIDE 9: Conclusion -->
<div class="slide dark" style="display: flex; flex-direction: column; justify-content: center; padding: 1in 1.2in;">
  <div class="header-cat" style="color: #8FD1C6;">EDUSYNC · TECHNICAL PRESENTATION</div>
  <h2 style="font-size: 56px; font-weight: 900; margin: 0 0 12px 0; color: #FFFFFF;">The Future of Offline-First Learning</h2>
  <p style="font-size: 24px; color: #CBD5E1; margin: 0 0 40px 0;">Education should never halt when connectivity drops.</p>
  <div class="grid-3" style="height: 260px; margin-bottom: 40px;">
    <div class="card dark" style="border-color: #0E7C6B;">
      <div class="card-title" style="color: #8FD1C6; font-size: 18px;">Zero Data Loss Guarantee</div>
      <p style="font-size: 14px; line-height: 1.45; color: #E2E8F0; margin: 0;">Every edit commits locally to IndexedDB before touching the wire. Survives browser crashes and device death.</p>
    </div>
    <div class="card dark" style="border-color: #3E63DD;">
      <div class="card-title" style="color: #93C5FD; font-size: 18px;">Idempotent & Commutative</div>
      <p style="font-size: 14px; line-height: 1.45; color: #E2E8F0; margin: 0;">Client ULIDs absorb network retries safely; Yjs CRDTs guarantee mathematical convergence across offline collaborators.</p>
    </div>
    <div class="card dark" style="border-color: #D97706;">
      <div class="card-title" style="color: #FCD34D; font-size: 18px;">Production & WCAG Ready</div>
      <p style="font-size: 14px; line-height: 1.45; color: #E2E8F0; margin: 0;">108/108 tests passing, WCAG 2.2 AA compliant, globally edge-deployed on Cloudflare Pages, ready for students today.</p>
    </div>
  </div>
  <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 24px;">
    <div style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-bottom: 6px;">THANK YOU! QUESTIONS & FEEDBACK</div>
    <div style="font-size: 15px; color: #94A3B8;">Live App: edusync-tus.pages.dev  |  Codebase: github.com/blank-0007/edusync</div>
  </div>
</div>

</body>
</html>
`;

async function main() {
  const htmlPath = path.join(process.cwd(), 'docs', 'PRESENTATION_SLIDES.html');
  const pdfArtifactPath = path.join(process.cwd(), 'artifacts', 'EduSync-Presentation.pdf');
  const pdfDocsPath = path.join(process.cwd(), 'docs', 'EduSync-Presentation.pdf');
  const pdfAssetsPath = path.join(process.cwd(), 'assets', 'EduSync-Presentation.pdf');

  fs.writeFileSync(htmlPath, slidesHtml, 'utf8');
  console.log(`📄 Wrote HTML slides to ${htmlPath}`);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
  await page.pdf({
    path: pdfArtifactPath,
    width: '16in',
    height: '9in',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });

  await browser.close();

  fs.copyFileSync(pdfArtifactPath, pdfDocsPath);
  fs.copyFileSync(pdfArtifactPath, pdfAssetsPath);

  const stats = fs.statSync(pdfArtifactPath);
  console.log(`✅ Presentation PDF ready at ${pdfArtifactPath} (${(stats.size / 1024).toFixed(1)} KB)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
