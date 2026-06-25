// profiles CRUD 단위 테스트. getSupabase 모킹으로 라이브 크리덴셜 없이 검증.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// getSupabase 모킹
// ---------------------------------------------------------------------------

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from './supabase';
import { getMyProfile, upsertNickname, deleteMyAccount } from './profiles';

const mockGetSupabase = vi.mocked(getSupabase);

// DB row 형태 샘플
const sampleRow = {
  id: 'user-abc',
  nickname: '테스트닉네임',
  created_at: '2026-06-16T00:00:00Z',
  updated_at: '2026-06-16T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Supabase 체이닝 빌더 헬퍼
// ---------------------------------------------------------------------------

/**
 * Supabase 빌더 패턴 모킹.
 * `.from()` → `.select/update()` → `.single/maybeSingle()` 체인을 지원한다.
 * 캐스팅은 반드시 `as unknown as ReturnType<typeof getSupabase>`로 한다(tsc -b 통과).
 */
function makeChain(terminal: { single?: unknown; maybeSingle?: unknown; rpc?: unknown }) {
  const chain: Record<string, unknown> = {};

  const self = () => chain;

  chain['select'] = vi.fn(self);
  chain['update'] = vi.fn(self);
  chain['upsert'] = vi.fn(self);
  chain['eq'] = vi.fn(self);
  chain['single'] = vi.fn(() =>
    Promise.resolve(terminal.single ?? { data: null, error: null }),
  );
  chain['maybeSingle'] = vi.fn(() =>
    Promise.resolve(terminal.maybeSingle ?? { data: null, error: null }),
  );

  return chain;
}

function makeSupabaseMock(opts: {
  terminal?: { single?: unknown; maybeSingle?: unknown };
  rpcResult?: { data: null; error: Error | null };
}) {
  const chain = makeChain(opts.terminal ?? {});

  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(() =>
      Promise.resolve(opts.rpcResult ?? { data: null, error: null }),
    ),
  };
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getMyProfile', () => {
  it('프로필이 있으면 domain Profile을 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        terminal: { maybeSingle: { data: sampleRow, error: null } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const result = await getMyProfile('user-abc');
    expect(result).toEqual({
      id: 'user-abc',
      nickname: '테스트닉네임',
      createdAt: '2026-06-16T00:00:00Z',
      updatedAt: '2026-06-16T00:00:00Z',
    });
  });

  it('프로필이 없으면 null을 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        terminal: { maybeSingle: { data: null, error: null } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const result = await getMyProfile('user-abc');
    expect(result).toBeNull();
  });

  it('Supabase 오류 시 throw한다', async () => {
    const dbError = new Error('DB 오류');
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        terminal: { maybeSingle: { data: null, error: dbError } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(getMyProfile('user-abc')).rejects.toThrow('DB 오류');
  });
});

describe('upsertNickname', () => {
  it('닉네임을 upsert하고 domain Profile을 반환한다', async () => {
    const updatedRow = { ...sampleRow, nickname: '새닉네임', updated_at: '2026-06-16T01:00:00Z' };
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        terminal: { single: { data: updatedRow, error: null } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const result = await upsertNickname('user-abc', '새닉네임');
    expect(result.nickname).toBe('새닉네임');
    expect(result.id).toBe('user-abc');
  });

  it('Supabase 오류 시 throw한다', async () => {
    const dbError = new Error('upsert 실패');
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        terminal: { single: { data: null, error: dbError } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(upsertNickname('user-abc', '닉네임')).rejects.toThrow('upsert 실패');
  });
});

describe('deleteMyAccount', () => {
  it('delete_my_account RPC를 호출한다', async () => {
    const mock = makeSupabaseMock({});
    mockGetSupabase.mockReturnValue(
      mock as unknown as ReturnType<typeof getSupabase>,
    );

    await deleteMyAccount();
    expect(mock.rpc).toHaveBeenCalledWith('delete_my_account');
  });

  it('RPC 오류 시 throw한다', async () => {
    const rpcError = new Error('rpc 실패');
    const mock = makeSupabaseMock({
      rpcResult: { data: null, error: rpcError },
    });
    mockGetSupabase.mockReturnValue(
      mock as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(deleteMyAccount()).rejects.toThrow('rpc 실패');
  });
});
