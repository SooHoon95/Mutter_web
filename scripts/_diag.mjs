import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'https://yeonchul-letter.netlify.app/';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText ?? '')));

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => errors.push('GOTO: ' + e.message));
await page.waitForTimeout(1500);

const rootHtml = await page.$eval('#root', (el) => el.innerHTML).catch(() => '(no #root)');
const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');

console.log('URL          :', url);
console.log('ROOT_HTML_LEN:', rootHtml.length);
console.log('ROOT_PREVIEW :', rootHtml.slice(0, 200).replace(/\n/g, ' '));
console.log('BODY_TEXT    :', JSON.stringify(bodyText.slice(0, 200)));
console.log('ERRORS       :', errors.length === 0 ? '(none)' : '');
for (const e of errors.slice(0, 12)) console.log('  -', e);

await browser.close();
