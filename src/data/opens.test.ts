// opens.ts 단위 테스트 — getMyLetterOpens RPC 매핑. getSupabase 모킹.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from './supabase';
import { getMyLetterOpens } from './opens';

const mockGetSupabase = vi.mocked(getSupabase);

function makeSupabaseMock(rpcResult: unknown) {
  return {
    rpc: vi.fn(() => Promise.resolve(rpcResult)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getMyLetterOpens', () => {
  it('RPC get_my_letter_opens를 호출하고 요약으로 매핑한다', async () => {
    const sb = makeSupabaseMock({
      data: [{ letter_id: 'L1', open_count: 3, last_opened_at: '2026-06-22T00:00:00Z' }],
      error: null,
    });
    mockGetSupabase.mockReturnValue(sb as unknown as ReturnType<typeof getSupabase>);

    const rows = await getMyLetterOpens();

    expect(sb.rpc).toHaveBeenCalledWith('get_my_letter_opens');
    expect(rows).toEqual([
      { letterId: 'L1', openCount: 3, lastOpenedAt: '2026-06-22T00:00:00Z' },
    ]);
  });

  it('bigint가 문자열로 와도 openCount를 숫자로 변환한다', async () => {
    const sb = makeSupabaseMock({
      data: [{ letter_id: 'L1', open_count: '5', last_opened_at: '2026-06-22T00:00:00Z' }],
      error: null,
    });
    mockGetSupabase.mockReturnValue(sb as unknown as ReturnType<typeof getSupabase>);

    const rows = await getMyLetterOpens();
    expect(rows[0].openCount).toBe(5);
  });

  it('데이터가 없으면 빈 배열을 반환한다', async () => {
    const sb = makeSupabaseMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(sb as unknown as ReturnType<typeof getSupabase>);

    expect(await getMyLetterOpens()).toEqual([]);
  });

  it('RPC 오류 시 throw한다', async () => {
    const sb = makeSupabaseMock({ data: null, error: new Error('AUTH_REQUIRED') });
    mockGetSupabase.mockReturnValue(sb as unknown as ReturnType<typeof getSupabase>);

    await expect(getMyLetterOpens()).rejects.toThrow('AUTH_REQUIRED');
  });
});
