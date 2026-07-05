import { describe, it, expect } from 'vitest';
import { validateSchedule } from './validateSchedule';

// 기준 현재 시각 고정(2026-07-05T00:00:00Z) — now 주입으로 시간 의존성 제거.
const NOW = Date.parse('2026-07-05T00:00:00Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const HOUR = 3_600_000;

describe('validateSchedule', () => {
  it('만료·공개 모두 미설정이면 유효(null)', () => {
    expect(validateSchedule({ now: NOW })).toBeNull();
  });

  it('미래 만료는 유효', () => {
    expect(validateSchedule({ expiresAt: iso(HOUR), now: NOW })).toBeNull();
  });

  it('과거 만료는 차단 — born-dead 링크 방지(이 버그의 회귀 가드)', () => {
    const msg = validateSchedule({ expiresAt: iso(-HOUR), now: NOW });
    expect(msg).toMatch(/발급되자마자 만료/);
  });

  it('현재와 동일한 만료(경계)도 차단', () => {
    expect(validateSchedule({ expiresAt: iso(0), now: NOW })).not.toBeNull();
  });

  it('공개가 만료보다 뒤/같으면 차단 — 열리기 전 만료 방지', () => {
    const msg = validateSchedule({ expiresAt: iso(HOUR), revealAt: iso(2 * HOUR), now: NOW });
    expect(msg).toMatch(/열리기 전에 만료/);
  });

  it('공개 < 만료면 유효', () => {
    expect(
      validateSchedule({ revealAt: iso(HOUR), expiresAt: iso(2 * HOUR), now: NOW }),
    ).toBeNull();
  });

  it('과거 공개(즉시 공개와 동일)는 만료가 없으면 무해 → 유효', () => {
    expect(validateSchedule({ revealAt: iso(-HOUR), now: NOW })).toBeNull();
  });

  it('잘못된 형식은 형식 오류 메시지', () => {
    expect(validateSchedule({ expiresAt: 'not-a-date', now: NOW })).toMatch(/형식/);
  });
});
