// inbox 단위 테스트. getSupabase 모킹으로 라이브 크리덴셜 없이 검증.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// getSupabase 모킹
// ---------------------------------------------------------------------------

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from './supabase';
import { saveToInbox, getMyInbox } from './inbox';

const mockGetSupabase = vi.mocked(getSupabase);

// RPC 응답 샘플
const sampleRows = [
  {
    letter_id: 'letter-001',
    token: 'tok_abc',
    title: '첫 번째 편지',
    saved_at: '2026-06-16T00:00:00Z',
  },
  {
    letter_id: 'letter-002',
    token: 'tok_def',
    title: '두 번째 편지',
    saved_at: '2026-06-15T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Supabase rpc 모킹 헬퍼
// ---------------------------------------------------------------------------

function makeRpcMock(result: { data: unknown; error: unknown }) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  };
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveToInbox', () => {
  it('토큰으로 save_to_inbox RPC를 호출한다', async () => {
    const mock = makeRpcMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await saveToInbox('tok_abc');

    expect(mock.rpc).toHaveBeenCalledWith('save_to_inbox', { p_token: 'tok_abc' });
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('RPC 오류');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(saveToInbox('tok_abc')).rejects.toThrow('RPC 오류');
  });
});

describe('getMyInbox', () => {
  it('get_my_inbox RPC 결과를 domain InboxItem 배열로 반환한다', async () => {
    const mock = makeRpcMock({ data: sampleRows, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getMyInbox();

    expect(mock.rpc).toHaveBeenCalledWith('get_my_inbox');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      letterId: 'letter-001',
      token: 'tok_abc',
      title: '첫 번째 편지',
      savedAt: '2026-06-16T00:00:00Z',
    });
    expect(result[1]).toEqual({
      letterId: 'letter-002',
      token: 'tok_def',
      title: '두 번째 편지',
      savedAt: '2026-06-15T00:00:00Z',
    });
  });

  it('빈 결과 시 빈 배열을 반환한다', async () => {
    const mock = makeRpcMock({ data: [], error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getMyInbox();

    expect(result).toEqual([]);
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('조회 실패');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(getMyInbox()).rejects.toThrow('조회 실패');
  });

  it('data가 null이면 빈 배열을 반환한다', async () => {
    const mock = makeRpcMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getMyInbox();

    expect(result).toEqual([]);
  });
});
