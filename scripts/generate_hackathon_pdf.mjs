import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const chromePath = '/Users/blank/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

async function main() {
  const htmlPath = path.join(process.cwd(), 'docs', 'PRESENTATION_SLIDES.html');
  const pdfArtifactPath = path.join(process.cwd(), 'artifacts', 'EduSync-Presentation.pdf');
  const pdfDocsPath = path.join(process.cwd(), 'docs', 'EduSync-Presentation.pdf');
  const pdfAssetsPath = path.join(process.cwd(), 'assets', 'EduSync-Presentation.pdf');

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML slides file not found at ${htmlPath}`);
  }

  console.log(`📄 Rendering Hackathon PDF from ${htmlPath}...`);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
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
  console.log(`✅ Hackathon Presentation PDF ready at ${pdfArtifactPath} (${(stats.size / 1024).toFixed(1)} KB)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
