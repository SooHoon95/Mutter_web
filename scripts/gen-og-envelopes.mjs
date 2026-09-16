// OG 봉투 이미지 생성 — public/og/envelope-<templateId>.png ×7 + envelope-sealed.png + envelope-default.png (1200×630).
//
// 왜 스크립트인가: 디자인 토큰(테마 Bg/Fg/Accent)이 바뀌면 9장을 손으로 다시 그리지 않고 재생성한다.
// 렌더러는 이미 devDependency인 Playwright(Chromium 스크린샷)를 쓴다 — 추가 의존성 0.
// 실행: node scripts/gen-og-envelopes.mjs   (크로미움이 없으면 `npx playwright install chromium`)
// 이미지를 바꾸면 src/lib/ogPreview.ts의 OG_IMAGE_VERSION을 올려 카카오 캐시를 무효화한다.

import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'og');

// features/templates/templates.ts의 7종과 같은 색(iOS Colors.xcassets 실측값과 동일).
const THEMES = [
  { id: 'classic-serif', bg: '#FAF8F3', fg: '#2C2416', accent: '#8B6914' },
  { id: 'modern-minimal', bg: '#FFFFFF', fg: '#111111', accent: '#0066CC' },
  { id: 'warm-craft', bg: '#F5EDE0', fg: '#3B2A1A', accent: '#C0550A' },
  { id: 'night-sky', bg: '#0D1B2A', fg: '#E8DFC8', accent: '#C8A24A' },
  { id: 'spring-day', bg: '#FFF7F8', fg: '#2D1A1F', accent: '#D4587A' },
  { id: 'vintage-typewriter', bg: '#F8F4EC', fg: '#1C1C1C', accent: '#444033' },
  { id: 'pure-space', bg: '#F9F9F9', fg: '#222222', accent: '#222222' },
  // 봉인(암호·예약·무효 공용)과 사이트 기본은 브랜드 토큰(Ivory/Ink/모브 액센트).
  { id: 'sealed', bg: '#FFFDF2', fg: '#221D14', accent: '#C77BAE', sealed: true },
  { id: 'default', bg: '#FFFDF2', fg: '#221D14', accent: '#C77BAE', brand: true },
];

function html({ bg, fg, accent, sealed, brand }, logoSvg) {
  // 텍스트 없음(워드마크 제외) — 카드의 제목·설명이 텍스트를 맡는다.
  // 봉인: 봉투 앞판 중앙(그룹 좌표계)에 액센트 원 + 안쪽 링. 잠금·예약·무효 토큰이 모두 이 한 장을 쓴다.
  const seal = sealed
    ? `<g transform="translate(0 110)"><circle r="46" fill="${accent}"/><circle r="30" fill="none" stroke="${bg}" stroke-opacity="0.85" stroke-width="5"/></g>`
    : '';
  const wordmarkScale = brand ? 1.9 : 1.15;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:${bg}}
    .grain{position:absolute;inset:0;background:
      radial-gradient(circle at 20% 30%, rgba(255,255,255,.35), transparent 45%),
      radial-gradient(circle at 80% 70%, rgba(0,0,0,.06), transparent 50%);}
    .logo{position:absolute;right:56px;bottom:44px;transform:scale(${wordmarkScale});transform-origin:right bottom;opacity:.92}
    .logo svg{height:40px;width:auto;display:block}
  </style></head><body>
  <div class="grain"></div>
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <!-- 편지지: 살짝 기울인 종이 두 장(그림자 → 본지) -->
    <g transform="translate(600 300) rotate(-3)">
      <rect x="-250" y="-160" width="500" height="320" rx="14" fill="${fg}" opacity="0.10"/>
      <rect x="-240" y="-170" width="500" height="320" rx="14" fill="${bg}" stroke="${fg}" stroke-opacity="0.22" stroke-width="3"/>
      <!-- 글줄(읽을 수 없는 선) -->
      <g stroke="${fg}" stroke-opacity="0.28" stroke-width="6" stroke-linecap="round">
        <line x1="-180" y1="-100" x2="60" y2="-100"/>
        <line x1="-180" y1="-58" x2="180" y2="-58"/>
        <line x1="-180" y1="-16" x2="140" y2="-16"/>
        <line x1="-180" y1="26" x2="190" y2="26"/>
        <line x1="-180" y1="68" x2="40" y2="68"/>
      </g>
      <!-- 음표 한 개 = 음악 한 곡 -->
      <g transform="translate(150 -105)" fill="${accent}">
        <circle cx="0" cy="26" r="16"/>
        <rect x="12" y="-40" width="7" height="66" rx="3"/>
        <path d="M19 -40 q34 6 30 40 q-4 -18 -30 -22z"/>
      </g>
    </g>
    <!-- 봉투 하단(앞판) -->
    <g transform="translate(600 330)">
      <path d="M-330 20 L0 240 L330 20 L330 190 Q330 220 300 220 L-300 220 Q-330 220 -330 190 Z" fill="${accent}" opacity="0.92"/>
      <path d="M-330 20 L0 240 L330 20" fill="none" stroke="${bg}" stroke-opacity="0.6" stroke-width="6"/>
      ${seal}
    </g>
  </svg>
  <div class="logo">${logoSvg}</div>
  </body></html>`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const logoSvg = await readFile(path.join(ROOT, 'public', 'mutter-logo.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const theme of THEMES) {
    await page.setContent(html(theme, logoSvg), { waitUntil: 'load' });
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
    const file = path.join(OUT, `envelope-${theme.id}.png`);
    await writeFile(file, png);
    console.log('wrote', path.relative(ROOT, file), `${(png.length / 1024).toFixed(0)}KB`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
