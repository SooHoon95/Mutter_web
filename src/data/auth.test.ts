/**
 * src/data/auth.test.ts
 *
 * getSupabase()를 모킹해 인증 래퍼 함수들을 단위 테스트한다.
 * Supabase 실제 크리덴셜 없이도 로직 정확성을 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// getSupabase 모킹 — supabase.ts 전체를 가짜로 교체
vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from './supabase';
import { sendMagicLink, signOut, getCurrentSession, onAuthChange } from './auth';

const mockGetSupabase = vi.mocked(getSupabase);

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendMagicLink', () => {
  it('signInWithOtp를 올바른 이메일 인자로 호출한다', async () => {
    const client = makeClient();
    mockGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);

    await sendMagicLink('user@example.com');

    expect(client.auth.signInWithOtp).toHaveBeenCalledOnce();
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
    );
  });

  it('Supabase 오류를 throw한다', async () => {
    const supabaseError = new Error('rate limited');
    const client = makeClient({
      signInWithOtp: vi.fn().mockResolvedValue({ error: supabaseError }),
    });
    mockGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);

    await expect(sendMagicLink('user@example.com')).rejects.toThrow('rate limited');
  });
});

describe('signOut', () => {
  it('auth.signOut()을 호출한다', async () => {
    const client = makeClient();
    mockGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);

    await signOut();

    expect(client.auth.signOut).toHaveBeenCalledOnce();
  });

  it('오류를 throw한다', async () => {
    const client = makeClient({
      signOut: vi.fn().mockResolvedValue({ error: new Error('network error') }),
    });
    mockGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);

    await expect(signOut()).rejects.toThrow('network error');
  });
});

describe('getCurrentSession', () => {
  it('세션이 없으면 null을 반환한다', async () => {
    const client = makeClient();
    mockGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);

    const result = await getCurrentSession();

    expect(result).toBeNull();
  });

  it('세션이 있으면 세션 객체를 반환한다', async () => {
    const fakeSession = { user: { id: 'uid-123' }, access_token: 'tok' };
    const client = makeClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: fakeSession }, error: null }),
    });
    mockGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);

    const result = await getCurrentSession();

    expect(result).toBe(fakeSession);
  });

  it('오류를 throw한다', async () => {
    const client = makeClient({
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: new Error('auth error') }),
    });
    mockGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);

    await expect(getCurrentSession()).rejects.toThrow('auth error');
  });
});

describe('onAuthChange', () => {
  it('onAuthStateChange에 콜백을 등록하고 unsubscribe 함수를 반환한다', () => {
    const unsubscribeMock = vi.fn();
    const client = makeClient({
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: unsubscribeMock } },
      }),
    });
    mockGetSupabase.mockReturnValue(client as unknown as ReturnType<typeof getSupabase>);

    const cb = vi.fn();
    const cleanup = onAuthChange(cb);

    expect(client.auth.onAuthStateChange).toHaveBeenCalledWith(cb);

    // cleanup 호출 시 subscription.unsubscribe()가 실행돼야 한다
    cleanup();
    expect(unsubscribeMock).toHaveBeenCalledOnce();
  });
});
