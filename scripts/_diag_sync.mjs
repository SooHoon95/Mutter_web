import { chromium } from '@playwright/test';

const url = process.argv[2];
const browser = await chromium.launch();
// 모바일 뷰포트(작은 화면)에서 스크롤이 단락 전환을 일으키게 한다.
const page = await browser.newContext({ viewport: { width: 390, height: 740 } }).then((c) => c.newPage());

const scPlayerReqs = [];
const logs = [];
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('w.soundcloud.com/player')) {
    const m = u.match(/tracks(?:%2F|\/)(\d+)/);
    scPlayerReqs.push(m ? m[1] : u.slice(0, 80));
  }
});
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`.slice(0, 160)));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
const gate = page.getByRole('button', { name: /편지 열기/ });
await gate.waitFor({ timeout: 8000 }).catch(() => logs.push('NO_GATE'));
await gate.click().catch(() => logs.push('GATE_CLICK_FAIL'));
await page.waitForTimeout(1500);
console.log('▶ 클릭 후 SC player 트랙:', JSON.stringify(scPlayerReqs));

// 단락 2로 스크롤 (여러 단계로 천천히 — IntersectionObserver 발화 유도)
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.5));
  await page.waitForTimeout(400);
}
await page.waitForTimeout(1500);

console.log('스크롤 후 SC player 트랙(누적):', JSON.stringify(scPlayerReqs));
console.log('distinct 트랙 수:', new Set(scPlayerReqs).size);
const activeCue = await page.locator('[class*="cueActive"]').count().catch(() => -1);
console.log('cueActive 요소 수(현재 활성 단락 표시):', activeCue);
console.log('관련 로그:', JSON.stringify(logs.filter((l) => /sync|fallback|sound|error|fail/i.test(l)).slice(0, 8)));
await browser.close();
