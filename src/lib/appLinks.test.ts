import { describe, it, expect, afterEach, vi } from 'vitest';
import { APP_SCHEME, appConnectUrl, appLetterUrl, inviteFromApp } from './appLinks';

describe('appLinks 스킴 빌더', () => {
  it('APP_SCHEME은 mutter다', () => {
    expect(APP_SCHEME).toBe('mutter');
  });

  it('appConnectUrl은 mutter://connect/<token>을 만든다', () => {
    expect(appConnectUrl('abc123')).toBe('mutter://connect/abc123');
  });

  it('appLetterUrl은 mutter://l/<token>을 만든다', () => {
    expect(appLetterUrl('abc123')).toBe('mutter://l/abc123');
  });
});

describe('inviteFromApp — 초대 링크 출처 판별(미설치 폴백 store vs web)', () => {
  it('?from=app → true (앱 발급 → App Store 폴백)', () => {
    expect(inviteFromApp('?from=app')).toBe(true);
    expect(inviteFromApp('?from=app&x=1')).toBe(true);
  });

  it('?from=web → false (웹 발급 → 웹 폴백)', () => {
    expect(inviteFromApp('?from=web')).toBe(false);
  });

  it('누락/무관 파라미터 → false (안전 기본값 = 웹 폴백)', () => {
    expect(inviteFromApp('')).toBe(false);
    expect(inviteFromApp('?foo=bar')).toBe(false);
  });

  it('app 정확 일치만 true (대소문자·부분일치 배제)', () => {
    expect(inviteFromApp('?from=APP')).toBe(false);
    expect(inviteFromApp('?from=application')).toBe(false);
  });
});

// HANDOFF_ENABLED / APP_STORE_URL은 import.meta.env를 모듈 로드 시점에 읽는 상수다.
// env를 stub한 뒤 모듈 레지스트리를 리셋하고 동적 import해 재평가 결과를 검증한다.
describe('HANDOFF_ENABLED / APP_STORE_URL 파생', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('env 미설정이면 APP_STORE_URL=null, HANDOFF_ENABLED=false(오늘 동작)', async () => {
    vi.stubEnv('VITE_IOS_APP_STORE_URL', '');
    vi.stubEnv('VITE_ENABLE_HANDOFF', '');
    vi.resetModules();
    const m = await import('./appLinks');
    expect(m.APP_STORE_URL).toBeNull();
    expect(m.HANDOFF_ENABLED).toBe(false);
  });

  it('스토어 URL이 있으면 HANDOFF_ENABLED=true', async () => {
    vi.stubEnv('VITE_IOS_APP_STORE_URL', 'https://apps.apple.com/app/id0000000000');
    vi.resetModules();
    const m = await import('./appLinks');
    expect(m.APP_STORE_URL).toBe('https://apps.apple.com/app/id0000000000');
    expect(m.HANDOFF_ENABLED).toBe(true);
  });

  it('스토어 URL이 없어도 VITE_ENABLE_HANDOFF=true면 HANDOFF_ENABLED=true(프리뷰 검증)', async () => {
    vi.stubEnv('VITE_IOS_APP_STORE_URL', '');
    vi.stubEnv('VITE_ENABLE_HANDOFF', 'true');
    vi.resetModules();
    const m = await import('./appLinks');
    expect(m.APP_STORE_URL).toBeNull();
    expect(m.HANDOFF_ENABLED).toBe(true);
  });
});
