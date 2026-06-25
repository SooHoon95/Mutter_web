import { chromium } from '@playwright/test';

const url = process.argv[2];
const tag = process.argv[3] ?? 'ext';
const browser = await chromium.launch();

// 데스크탑
const d = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
d.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
await d.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => errs.push('GOTO ' + e.message));
await d.waitForTimeout(2500);
const title = await d.title().catch(() => '');
const bodyText = await d.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '');
await d.screenshot({ path: `/tmp/${tag}_desktop.png` });
await d.screenshot({ path: `/tmp/${tag}_desktop_full.png`, fullPage: true });
await d.close();

// 모바일
const m = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
await m.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await m.waitForTimeout(2000);
await m.screenshot({ path: `/tmp/${tag}_mobile_full.png`, fullPage: true });
await m.close();

console.log('TITLE:', JSON.stringify(title));
console.log('BODY :', JSON.stringify(bodyText));
console.log('ERRS :', errs.length ? errs.slice(0, 6).join(' | ') : '(none)');
console.log('SHOTS: /tmp/' + tag + '_desktop.png, _desktop_full.png, _mobile_full.png');
await browser.close();
