import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4317';
const routes = [
  { path: '/', name: 'landing' },
  { path: '/login', name: 'login' },
  { path: '/create', name: 'create' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });

for (const r of routes) {
  await page
    .goto(base + r.path, { waitUntil: 'networkidle', timeout: 30000 })
    .catch((e) => console.log('GOTO ERR', r.path, e.message));
  await page.waitForTimeout(1200);
  const out = `/tmp/letter_${r.name}.png`;
  await page.screenshot({ path: out, fullPage: true });
  console.log('SHOT', r.path, '->', out);
}

await browser.close();
