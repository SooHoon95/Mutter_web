import { describe, it, expect } from 'vitest';
import { generateToken, assertTokenEntropy, TOKEN_BYTES } from './token';

describe('generateToken', () => {
  it('기본 토큰은 >=128bit 엔트로피(>=22 url-safe 글자)를 가진다', () => {
    const t = generateToken();
    expect(t.length).toBeGreaterThanOrEqual(22);
    expect(() => assertTokenEntropy(t)).not.toThrow();
  });

  it('url-safe 문자만 포함한다 (+ / = 없음)', () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('충돌 없이 유일한 토큰을 생성한다', () => {
    const set = new Set(Array.from({ length: 1000 }, () => generateToken()));
    expect(set.size).toBe(1000);
  });

  it('128bit 미만 엔트로피 요청은 거부한다', () => {
    expect(() => generateToken(TOKEN_BYTES - 1)).toThrow();
  });
});

describe('assertTokenEntropy', () => {
  it('너무 짧은 토큰을 거부한다', () => {
    expect(() => assertTokenEntropy('short')).toThrow();
  });

  it('url-safe 하지 않은 토큰을 거부한다', () => {
    expect(() => assertTokenEntropy('a'.repeat(20) + '+/==')).toThrow();
  });
});
