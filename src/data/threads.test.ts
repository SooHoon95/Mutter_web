// threads 데이터 레이어 단위 테스트. getSupabase 모킹으로 라이브 크리덴셜 없이 검증.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// getSupabase 모킹
// ---------------------------------------------------------------------------

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from './supabase';
import { getCounterparts, getThread, getMySentWithRecipients } from './threads';

const mockGetSupabase = vi.mocked(getSupabase);

// ---------------------------------------------------------------------------
// RPC 응답 샘플
// ---------------------------------------------------------------------------

const counterpartRows = [
  {
    counterpart_id: 'cp-001',
    nickname: '상대일',
    letter_count: 3,
    last_at: '2026-06-16T00:00:00Z',
  },
  {
    counterpart_id: 'cp-002',
    nickname: null,
    letter_count: 1,
    last_at: '2026-06-15T00:00:00Z',
  },
];

const threadRows = [
  {
    letter_id: 'letter-001',
    token: 'tok_abc',
    title: '받은 편지',
    direction: 'received',
    at: '2026-06-16T00:00:00Z',
  },
  {
    letter_id: 'letter-002',
    token: null,
    title: '보낸 편지',
    direction: 'sent',
    at: '2026-06-15T00:00:00Z',
  },
];

const sentRows = [
  {
    letter_id: 'letter-100',
    title: '여러 수신자 편지',
    created_at: '2026-06-16T00:00:00Z',
    recipient_id: 'rcp-001',
    recipient_nickname: '받은이일',
    saved_at: '2026-06-16T01:00:00Z',
  },
  {
    letter_id: 'letter-101',
    title: '아직 안 받은 편지',
    created_at: '2026-06-15T00:00:00Z',
    recipient_id: null,
    recipient_nickname: null,
    saved_at: null,
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

describe('getCounterparts', () => {
  it('get_counterparts RPC 결과를 domain Counterpart 배열로 반환한다', async () => {
    const mock = makeRpcMock({ data: counterpartRows, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getCounterparts();

    expect(mock.rpc).toHaveBeenCalledWith('get_counterparts');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      counterpartId: 'cp-001',
      nickname: '상대일',
      letterCount: 3,
      lastAt: '2026-06-16T00:00:00Z',
    });
    expect(result[1]).toEqual({
      counterpartId: 'cp-002',
      nickname: null,
      letterCount: 1,
      lastAt: '2026-06-15T00:00:00Z',
    });
  });

  it('data가 null이면 빈 배열을 반환한다', async () => {
    const mock = makeRpcMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    expect(await getCounterparts()).toEqual([]);
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('상대 조회 실패');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(getCounterparts()).rejects.toThrow('상대 조회 실패');
  });
});

describe('getThread', () => {
  it('counterpartId로 get_thread RPC를 호출하고 domain ThreadLetter 배열로 반환한다', async () => {
    const mock = makeRpcMock({ data: threadRows, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getThread('cp-001');

    expect(mock.rpc).toHaveBeenCalledWith('get_thread', { p_counterpart: 'cp-001' });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      letterId: 'letter-001',
      token: 'tok_abc',
      title: '받은 편지',
      direction: 'received',
      at: '2026-06-16T00:00:00Z',
    });
    expect(result[1]).toEqual({
      letterId: 'letter-002',
      token: null,
      title: '보낸 편지',
      direction: 'sent',
      at: '2026-06-15T00:00:00Z',
    });
  });

  it('data가 null이면 빈 배열을 반환한다', async () => {
    const mock = makeRpcMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    expect(await getThread('cp-001')).toEqual([]);
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('스레드 조회 실패');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(getThread('cp-001')).rejects.toThrow('스레드 조회 실패');
  });
});

describe('getMySentWithRecipients', () => {
  it('get_my_sent_with_recipients RPC 결과를 domain SentWithRecipient 배열로 반환한다', async () => {
    const mock = makeRpcMock({ data: sentRows, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getMySentWithRecipients();

    expect(mock.rpc).toHaveBeenCalledWith('get_my_sent_with_recipients');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      letterId: 'letter-100',
      title: '여러 수신자 편지',
      createdAt: '2026-06-16T00:00:00Z',
      recipientId: 'rcp-001',
      recipientNickname: '받은이일',
      savedAt: '2026-06-16T01:00:00Z',
    });
    expect(result[1]).toEqual({
      letterId: 'letter-101',
      title: '아직 안 받은 편지',
      createdAt: '2026-06-15T00:00:00Z',
      recipientId: null,
      recipientNickname: null,
      savedAt: null,
    });
  });

  it('data가 null이면 빈 배열을 반환한다', async () => {
    const mock = makeRpcMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    expect(await getMySentWithRecipients()).toEqual([]);
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('보낸 편지 조회 실패');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(getMySentWithRecipients()).rejects.toThrow('보낸 편지 조회 실패');
  });
});
