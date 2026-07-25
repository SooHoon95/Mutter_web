// QR Code 인코더 — Project Nayuki "QR Code generator library"(MIT License)에서 벤더링·적응.
// 출처: https://www.nayuki.io/page/qr-code-generator-library  (© Project Nayuki, MIT)
//
// npm 의존성 0을 위해 단일 파일로 내장한다($0·최소 번들·공급망 리스크 없음, CLAUDE.md 원칙).
// URL만 인코딩하면 되므로 세그먼트 로직은 바이트 모드(UTF-8) 하나로 축약했다.
// 단, 버전(1–40) 선택·4단계 ECC·마스크 자동선택·Reed-Solomon은 스펙 그대로 보존해
// 출력이 표준 준수(=실제 스캔되는) QR Code가 되게 한다.

/** 오류정정 레벨. 화면 표시용 QR은 대비가 크므로 기본 M으로 충분. */
export type Ecc = 'L' | 'M' | 'Q' | 'H';

const MIN_VERSION = 1;
const MAX_VERSION = 40;

// ECC 레벨 → 내부 서수(0..3). 아래 표들의 행 인덱스와 일치.
const ECL_ORDINAL: Record<Ecc, number> = { L: 0, M: 1, Q: 2, H: 3 };
// 포맷 정보에 쓰이는 2비트 값(서수 순서 L,M,Q,H).
const FORMAT_BITS = [1, 0, 3, 2];

// 마스크 페널티 가중치(스펙 상수).
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

// 블록당 ECC 코드워드 수 — [ecl서수][버전]. index 0(버전0)은 패딩용 불법값.
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// ECC 블록 수 — [ecl서수][버전].
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/** 정수 x의 i번째 비트(0/1 → boolean). */
function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

/** GF(2^8) 곱셈(원시다항식 0x11D). Reed-Solomon 계산의 핵심. */
function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** 주어진 차수의 Reed-Solomon 제수 다항식(생성 다항식) 계수. */
export function reedSolomonComputeDivisor(degree: number): number[] {
  if (degree < 1 || degree > 255) throw new RangeError('Degree out of range');
  // 계수 배열은 x^(degree-1) ... x^0 순서, 상수항(x^0)=1로 시작.
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  // (x - r^0)(x - r^1)…(x - r^(degree-1)) 를 누적, r = 0x02.
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

/** data를 divisor로 나눈 Reed-Solomon 나머지(=ECC 코드워드). */
function reedSolomonComputeRemainder(data: number[], divisor: number[]): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= reedSolomonMultiply(coef, factor);
    });
  }
  return result;
}

/** 버전의 원시(raw) 데이터 모듈 수(함수 패턴 제외). */
function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

/** 버전·ECC에서 실제 데이터 코드워드(바이트) 수. */
function getNumDataCodewords(ver: number, ecl: number): number {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver]
  );
}

/** 문자열 → UTF-8 바이트. TextEncoder 우선, 없으면 수동 인코딩. */
function utf8Bytes(str: string): number[] {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
  const out: number[] = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}

/** val의 하위 len비트를 MSB부터 bb(비트 배열)에 추가. */
function appendBits(val: number, len: number, bb: number[]): void {
  if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError('Value out of range');
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

/**
 * 텍스트를 정사각 boolean 매트릭스로 인코딩한다(true=검은 모듈).
 * 반환 매트릭스는 [행(y)][열(x)] 인덱싱.
 */
export function encodeToMatrix(text: string, ecc: Ecc = 'M'): boolean[][] {
  const ecl = ECL_ORDINAL[ecc];
  const dataBytes = utf8Bytes(text);
  const numChars = dataBytes.length;

  // 데이터가 들어가는 가장 작은 버전 선택.
  let version = 0;
  let dataCapacityBits = 0;
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    const ccBits = v <= 9 ? 8 : 16; // 바이트 모드 문자수 지시자 비트폭
    const usedBits = 4 + ccBits + 8 * numChars;
    const capacity = getNumDataCodewords(v, ecl) * 8;
    if (usedBits <= capacity) {
      version = v;
      dataCapacityBits = capacity;
      break;
    }
  }
  if (version === 0) throw new RangeError('Data too long for a QR Code');

  // 비트 버퍼 구성: 모드(0100) + 문자수 + 데이터 바이트 + 종료자 + 패딩.
  const bb: number[] = [];
  appendBits(0x4, 4, bb); // 바이트 모드 지시자
  appendBits(numChars, version <= 9 ? 8 : 16, bb);
  for (const b of dataBytes) appendBits(b, 8, bb);
  appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb); // 종료자
  appendBits(0, (8 - (bb.length % 8)) % 8, bb); // 바이트 경계 정렬
  for (let pad = 0xec; bb.length < dataCapacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bb);

  // 비트 → 데이터 코드워드(바이트).
  const dataCodewords: number[] = [];
  for (let i = 0; i < bb.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb[i + j];
    dataCodewords.push(byte);
  }

  return new QrCode(version, ecl, dataCodewords).modules;
}

/** 단일 QR Code 심볼. 생성자에서 함수 패턴·데이터·마스크까지 모두 그린다. */
class QrCode {
  readonly size: number;
  readonly modules: boolean[][] = [];
  private readonly isFunction: boolean[][] = [];

  constructor(
    private readonly version: number,
    private readonly ecl: number,
    dataCodewords: number[],
  ) {
    this.size = version * 4 + 17;
    for (let y = 0; y < this.size; y++) {
      const row: boolean[] = [];
      const frow: boolean[] = [];
      for (let x = 0; x < this.size; x++) {
        row.push(false);
        frow.push(false);
      }
      this.modules.push(row);
      this.isFunction.push(frow);
    }

    this.drawFunctionPatterns();
    this.drawCodewords(this.addEccAndInterleave(dataCodewords));

    // 마스크 8종 중 페널티 최소를 선택.
    let mask = -1;
    let minPenalty = Infinity;
    for (let i = 0; i < 8; i++) {
      this.applyMask(i);
      this.drawFormatBits(i);
      const penalty = this.getPenaltyScore();
      if (penalty < minPenalty) {
        mask = i;
        minPenalty = penalty;
      }
      this.applyMask(i); // XOR 두 번 → 원복
    }
    this.applyMask(mask);
    this.drawFormatBits(mask);
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  private drawFunctionPatterns(): void {
    // 타이밍 패턴
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    // 파인더 패턴 3개(우하단 제외)
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);
    // 정렬 패턴
    const pos = this.getAlignmentPatternPositions();
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // 세 파인더와 겹치는 모서리는 건너뜀
        if (!((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)))
          this.drawAlignmentPattern(pos[i], pos[j]);
      }
    }
    // 포맷/버전(더미 마스크 0 → 이후 덮어씀)
    this.drawFormatBits(0);
    this.drawVersion();
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy)); // 체비셰프 거리
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size)
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  private getAlignmentPatternPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign = Math.floor(this.version / 7) + 2;
    const step =
      this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result: number[] = [6];
    for (let p = this.size - 7; result.length < numAlign; p -= step) result.splice(1, 0, p);
    return result;
  }

  private drawFormatBits(mask: number): void {
    const data = (FORMAT_BITS[this.ecl] << 3) | mask; // 2비트 ecl + 3비트 마스크
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412; // 15비트(BCH)
    // 첫 번째 사본
    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));
    // 두 번째 사본
    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true); // 항상 검은 모듈
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem; // 18비트(BCH)
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }

  /** 데이터 코드워드 → ECC 부가 + 블록 인터리브. */
  private addEccAndInterleave(data: number[]): number[] {
    const ver = this.version;
    const ecl = this.ecl;
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
    const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: number[][] = [];
    const rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + datLen);
      k += datLen;
      const ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0); // 인터리브 정렬용 자리
      blocks.push(dat.concat(ecc));
    }

    const result: number[] = [];
    for (let i = 0; i < blocks[0].length; i++) {
      for (let j = 0; j < blocks.length; j++) {
        // 짧은 블록에 끼운 패딩(0) 자리는 건너뜀
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i]);
      }
    }
    return result;
  }

  /** 전체 코드워드를 지그재그 순서로 데이터 영역에 배치. */
  private drawCodewords(data: number[]): void {
    let i = 0; // 비트 인덱스
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // 세로 타이밍 열 건너뜀
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert = false;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = (((x * y) % 2) + ((x * y) % 3)) === 0; break;
          case 6: invert = ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0; break;
          case 7: invert = ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0; break;
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  private getPenaltyScore(): number {
    let result = 0;
    const size = this.size;
    const m = this.modules;

    // 규칙1(가로) + 규칙3(파인더 유사 패턴)
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runX = 0;
      const hist = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        if (m[y][x] === runColor) {
          runX++;
          if (runX === 5) result += PENALTY_N1;
          else if (runX > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runX, hist);
          if (!runColor) result += this.finderPenaltyCountPatterns(hist) * PENALTY_N3;
          runColor = m[y][x];
          runX = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, hist) * PENALTY_N3;
    }
    // 규칙1(세로) + 규칙3
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runY = 0;
      const hist = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        if (m[y][x] === runColor) {
          runY++;
          if (runY === 5) result += PENALTY_N1;
          else if (runY > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runY, hist);
          if (!runColor) result += this.finderPenaltyCountPatterns(hist) * PENALTY_N3;
          runColor = m[y][x];
          runY = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runY, hist) * PENALTY_N3;
    }
    // 규칙2 — 동색 2x2 블록
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += PENALTY_N2;
      }
    }
    // 규칙4 — 명암 균형
    let dark = 0;
    for (const row of m) for (const c of row) if (c) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }

  private finderPenaltyCountPatterns(hist: number[]): number {
    const n = hist[1];
    const core =
      n > 0 && hist[2] === n && hist[3] === n * 3 && hist[4] === n && hist[5] === n;
    return (
      (core && hist[0] >= n * 4 && hist[6] >= n ? 1 : 0) +
      (core && hist[6] >= n * 4 && hist[0] >= n ? 1 : 0)
    );
  }

  private finderPenaltyTerminateAndCount(
    currentRunColor: boolean,
    currentRunLength: number,
    hist: number[],
  ): number {
    if (currentRunColor) {
      this.finderPenaltyAddHistory(currentRunLength, hist);
      currentRunLength = 0;
    }
    currentRunLength += this.size; // 밝은 테두리 가정
    this.finderPenaltyAddHistory(currentRunLength, hist);
    return this.finderPenaltyCountPatterns(hist);
  }

  private finderPenaltyAddHistory(currentRunLength: number, hist: number[]): void {
    if (hist[0] === 0) currentRunLength += this.size; // 첫 런에 밝은 테두리 추가
    hist.pop();
    hist.unshift(currentRunLength);
  }
}
