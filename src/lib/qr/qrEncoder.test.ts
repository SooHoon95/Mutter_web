import { describe, it, expect } from 'vitest';
import { encodeToMatrix, reedSolomonComputeDivisor } from './qrEncoder';

// GF(256) antilog(α^exp) — 본 구현과 독립적인 반복-더블링 경로.
// 잘 알려진 QR 생성 다항식의 "지수(exponent) 표"를 정수 계수로 바꿔 교차검증한다.
function alpha(exp: number): number {
  let x = 1;
  for (let i = 0; i < exp; i++) {
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  return x;
}

describe('reedSolomonComputeDivisor', () => {
  // 생성 다항식의 계수 지수(α^n)는 공표된 표준값 — GF 곱셈·제수 계산의 정확성을 고정한다.
  it('차수 7 생성 다항식이 표준 지수표(정수 변환)와 일치한다', () => {
    const exps = [87, 229, 146, 149, 238, 102, 21];
    expect(reedSolomonComputeDivisor(7)).toEqual(exps.map(alpha));
  });

  it('차수 10 생성 다항식이 표준 지수표(정수 변환)와 일치한다', () => {
    const exps = [251, 67, 46, 61, 118, 70, 64, 94, 32, 45];
    expect(reedSolomonComputeDivisor(10)).toEqual(exps.map(alpha));
  });
});

describe('encodeToMatrix', () => {
  const url = 'https://mutter.example.com/download';

  it('정사각·홀수 크기 매트릭스를 낸다(버전 = 4n+17)', () => {
    const m = encodeToMatrix(url);
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect((m.length - 17) % 4).toBe(0); // 유효 버전 크기
    for (const row of m) expect(row.length).toBe(m.length); // 정사각
  });

  it('세 모서리에 파인더 패턴(7x7)을 배치한다', () => {
    const m = encodeToMatrix(url);
    const s = m.length;
    // 파인더 중심(각 7x7 블록의 정중앙)은 검은 모듈.
    expect(m[3][3]).toBe(true); // 좌상단
    expect(m[3][s - 4]).toBe(true); // 우상단
    expect(m[s - 4][3]).toBe(true); // 좌하단
    // 좌상단 파인더의 외곽/내부 링 특징(모서리 검정, 그 안쪽 흰 링)
    expect(m[0][0]).toBe(true);
    expect(m[0][6]).toBe(true);
    expect(m[1][1]).toBe(false);
  });

  it('ECC 레벨이 달라도 유효한 매트릭스를 낸다', () => {
    for (const ecc of ['L', 'M', 'Q', 'H'] as const) {
      const m = encodeToMatrix(url, ecc);
      expect(m.length).toBeGreaterThanOrEqual(21);
    }
  });

  it('빈 문자열도 처리한다(가장 작은 버전)', () => {
    const m = encodeToMatrix('');
    expect(m.length).toBe(21); // 버전 1
  });
});
