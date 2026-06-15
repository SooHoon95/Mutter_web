/**
 * scripts/gen-icons.mjs
 *
 * 외부 의존성 없이 Node 내장 zlib로 단색 PNG 파일을 생성한다.
 * 브랜드 배경 #1a1a1a에 흰 편지 심볼(envelope 윤곽선)을 그린다.
 *
 * PWA가 요구하는 4가지 크기를 한 번에 생성:
 *   public/icon-192.png
 *   public/icon-512.png
 *   public/icon-512-maskable.png  ← safe-zone 안에 동일 심볼
 *   public/apple-touch-icon.png   ← 180×180
 *
 * 실행: node scripts/gen-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

// ── PNG 인코딩 헬퍼 ─────────────────────────────────────────────────────────

/** CRC-32 테이블 (PNG chunk 무결성 검증용) */
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

/**
 * RGBA 픽셀 배열(Uint8Array, width*height*4바이트)로부터 PNG Buffer를 반환한다.
 * 색상 타입 6 (RGBA, 8-bit per channel).
 */
function encodePng(width, height, rgba) {
  // PNG 시그니처
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace: none

  // IDAT: 각 행 앞에 filter byte(0=None) 추가 후 deflate
  const rowSize = width * 4;
  const raw = Buffer.allocUnsafe(height * (rowSize + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowSize + 1)] = 0; // filter: None
    rgba.copy(raw, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }
  const compressed = deflateSync(raw, { level: 9 });

  // IEND chunk
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 아이콘 그리기 ────────────────────────────────────────────────────────────

/**
 * size×size RGBA 픽셀 배열을 생성한다.
 * 배경: #1a1a1a, 심볼: 흰 편지 봉투 형태(단순 윤곽선).
 *
 * maskable=true 이면 safe-zone(중앙 80%)에 심볼을 위치시킨다.
 */
function drawIcon(size, maskable = false) {
  const rgba = Buffer.alloc(size * size * 4);

  // 배경 채우기 (#1a1a1a)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4 + 0] = 0x1a; // R
    rgba[i * 4 + 1] = 0x1a; // G
    rgba[i * 4 + 2] = 0x1a; // B
    rgba[i * 4 + 3] = 0xff; // A
  }

  // safe-zone: maskable은 safe-zone(40% 여백 포함, 중앙 72%) 안에 그림
  // 일반 아이콘: 16% 여백(중앙 68%)
  const margin = maskable ? Math.round(size * 0.14) : Math.round(size * 0.16);

  // 편지 봉투 사각형
  const x0 = margin;
  const y0 = Math.round(size * (maskable ? 0.22 : 0.24));
  const x1 = size - margin;
  const y1 = Math.round(size * (maskable ? 0.78 : 0.76));
  const lineW = Math.max(2, Math.round(size * 0.025));

  /**
   * (px, py) 픽셀에 흰색을 칠한다.
   * alpha를 받아서 anti-aliasing 없이 단순 on/off.
   */
  function setPixel(px, py, alpha = 255) {
    if (px < 0 || px >= size || py < 0 || py >= size) return;
    const idx = (py * size + px) * 4;
    rgba[idx + 0] = 0xff;
    rgba[idx + 1] = 0xff;
    rgba[idx + 2] = 0xff;
    rgba[idx + 3] = alpha;
  }

  // 굵은 선 그리기 (수평선: y 고정, x 범위)
  function hLine(y, xa, xb, w = lineW) {
    const half = Math.floor(w / 2);
    for (let dy = -half; dy <= half; dy++) {
      for (let x = xa; x <= xb; x++) setPixel(x, y + dy);
    }
  }

  // 굵은 선 그리기 (수직선: x 고정, y 범위)
  function vLine(x, ya, yb, w = lineW) {
    const half = Math.floor(w / 2);
    for (let dx = -half; dx <= half; dx++) {
      for (let y = ya; y <= yb; y++) setPixel(x + dx, y);
    }
  }

  // 대각선 (브레젠험)
  function dLine(x0d, y0d, x1d, y1d, w = lineW) {
    let dx = Math.abs(x1d - x0d);
    let dy = Math.abs(y1d - y0d);
    let sx = x0d < x1d ? 1 : -1;
    let sy = y0d < y1d ? 1 : -1;
    let err = dx - dy;
    let cx = x0d, cy = y0d;
    const half = Math.floor(w / 2);
    while (true) {
      for (let bx = -half; bx <= half; bx++) {
        for (let by = -half; by <= half; by++) {
          setPixel(cx + bx, cy + by);
        }
      }
      if (cx === x1d && cy === y1d) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }

  const mx = Math.round((x0 + x1) / 2);

  // 봉투 외곽선 4변
  hLine(y0, x0, x1);
  hLine(y1, x0, x1);
  vLine(x0, y0, y1);
  vLine(x1, y0, y1);

  // 봉투 V자 플랩 (왼쪽 상단 모서리 → 중앙 상단 지점)
  const flapY = Math.round(y0 + (y1 - y0) * 0.45);
  dLine(x0, y0, mx, flapY);
  dLine(x1, y0, mx, flapY);

  return rgba;
}

// ── 생성 ─────────────────────────────────────────────────────────────────────

const icons = [
  { name: 'icon-192.png',          size: 192, maskable: false },
  { name: 'icon-512.png',          size: 512, maskable: false },
  { name: 'icon-512-maskable.png', size: 512, maskable: true  },
  { name: 'apple-touch-icon.png',  size: 180, maskable: false },
];

for (const { name, size, maskable } of icons) {
  const rgba = drawIcon(size, maskable);
  const png = encodePng(size, size, rgba);
  const dest = join(publicDir, name);
  writeFileSync(dest, png);
  console.log(`generated ${dest} (${png.length} bytes)`);
}

console.log('done.');
