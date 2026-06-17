// connections 데이터 레이어 단위 테스트. getSupabase / generateToken 모킹으로
// 라이브 크리덴셜 없이 RPC 호출·매핑·에러 전파를 검증한다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// 모킹: getSupabase는 RPC만, generateToken은 고정 토큰을 반환하도록 한다.
// ---------------------------------------------------------------------------

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

vi.mock('@/lib/token', () => ({
  generateToken: vi.fn(() => 'GENERATED_TOKEN'),
}));

import { getSupabase } from './supabase';
import { generateToken } from '@/lib/token';
import {
  createInvite,
  getInvite,
  acceptInvite,
  getMyConnections,
  sendToConnection,
  disconnect,
} from './connections';

const mockGetSupabase = vi.mocked(getSupabase);
const mockGenerateToken = vi.mocked(generateToken);

// ---------------------------------------------------------------------------
// RPC 응답 샘플
// ---------------------------------------------------------------------------

// 독점 1:1 필드(viewer_has_connection, inviter_has_connection) 포함
const inviteRows = [
  {
    inviter_id: 'user-001',
    inviter_nickname: '초대한사람',
    is_self: false,
    already_connected: false,
    viewer_has_connection: false,
    inviter_has_connection: false,
  },
];

const connectionRows = [
  {
    user_id: 'conn-001',
    nickname: '연결된사람',
    connected_at: '2026-06-16T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Supabase rpc 모킹 헬퍼 — 캐스팅은 반드시 as unknown as ReturnType<typeof getSupabase>.
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
  mockGenerateToken.mockReturnValue('GENERATED_TOKEN');
});

describe('createInvite', () => {
  it('generateToken으로 토큰을 만들어 create_connect_invite RPC에 넘기고 토큰을 반환한다', async () => {
    const mock = makeRpcMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const token = await createInvite();

    expect(mockGenerateToken).toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith('create_connect_invite', {
      p_token: 'GENERATED_TOKEN',
    });
    expect(token).toBe('GENERATED_TOKEN');
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('초대 생성 실패');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(createInvite()).rejects.toThrow('초대 생성 실패');
  });
});

describe('getInvite', () => {
  it('get_connect_invite RPC 결과(배열 첫 행)를 domain ConnectInvite로 매핑한다', async () => {
    const mock = makeRpcMock({ data: inviteRows, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getInvite('tok_abc');

    expect(mock.rpc).toHaveBeenCalledWith('get_connect_invite', { p_token: 'tok_abc' });
    expect(result).toEqual({
      inviterId: 'user-001',
      inviterNickname: '초대한사람',
      isSelf: false,
      alreadyConnected: false,
      viewerHasConnection: false,
      inviterHasConnection: false,
    });
  });

  it('단일 객체(비배열) 응답도 매핑한다', async () => {
    const mock = makeRpcMock({ data: inviteRows[0], error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getInvite('tok_abc');
    expect(result.inviterId).toBe('user-001');
    expect(result.viewerHasConnection).toBe(false);
    expect(result.inviterHasConnection).toBe(false);
  });

  it('viewerHasConnection=true, inviterHasConnection=true인 행을 올바르게 매핑한다', async () => {
    const blockedRow = {
      ...inviteRows[0],
      viewer_has_connection: true,
      inviter_has_connection: true,
    };
    const mock = makeRpcMock({ data: [blockedRow], error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getInvite('tok_abc');
    expect(result.viewerHasConnection).toBe(true);
    expect(result.inviterHasConnection).toBe(true);
  });

  it('빈 결과면 throw한다', async () => {
    const mock = makeRpcMock({ data: [], error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(getInvite('tok_abc')).rejects.toThrow('초대를 찾을 수 없습니다.');
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('초대 조회 실패');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(getInvite('tok_abc')).rejects.toThrow('초대 조회 실패');
  });
});

describe('acceptInvite', () => {
  it('accept_connect_invite RPC를 토큰과 함께 호출한다', async () => {
    const mock = makeRpcMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await acceptInvite('tok_abc');

    expect(mock.rpc).toHaveBeenCalledWith('accept_connect_invite', { p_token: 'tok_abc' });
  });

  it('ALREADY_CONNECTED_SELF 에러를 사용자 메시지로 정규화한다', async () => {
    const mock = makeRpcMock({
      data: null,
      error: new Error('ALREADY_CONNECTED_SELF'),
    });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(acceptInvite('tok_abc')).rejects.toThrow(
      '이미 다른 사람과 연결돼 있어요. 연결을 해제한 뒤 다시 시도하세요.',
    );
  });

  it('ALREADY_CONNECTED_OTHER 에러를 사용자 메시지로 정규화한다', async () => {
    const mock = makeRpcMock({
      data: null,
      error: new Error('ALREADY_CONNECTED_OTHER'),
    });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(acceptInvite('tok_abc')).rejects.toThrow(
      '상대가 이미 다른 사람과 연결돼 있어요.',
    );
  });

  it('CANNOT_CONNECT_SELF 에러를 사용자 메시지로 정규화한다', async () => {
    const mock = makeRpcMock({
      data: null,
      error: new Error('CANNOT_CONNECT_SELF'),
    });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(acceptInvite('tok_abc')).rejects.toThrow('본인은 연결할 수 없어요.');
  });

  it('INVITE_NOT_FOUND 에러를 사용자 메시지로 정규화한다', async () => {
    const mock = makeRpcMock({
      data: null,
      error: new Error('INVITE_NOT_FOUND'),
    });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(acceptInvite('tok_abc')).rejects.toThrow('초대를 찾을 수 없어요.');
  });

  it('알 수 없는 RPC 오류는 원본 메시지로 throw한다', async () => {
    const mock = makeRpcMock({ data: null, error: new Error('수락 실패') });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(acceptInvite('tok_abc')).rejects.toThrow('수락 실패');
  });
});

describe('getMyConnections', () => {
  it('get_my_connections RPC 결과를 domain Connection 배열로 반환한다', async () => {
    const mock = makeRpcMock({ data: connectionRows, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getMyConnections();

    expect(mock.rpc).toHaveBeenCalledWith('get_my_connections');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      userId: 'conn-001',
      nickname: '연결된사람',
      connectedAt: '2026-06-16T00:00:00Z',
    });
  });

  it('data가 null이면 빈 배열을 반환한다', async () => {
    const mock = makeRpcMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    expect(await getMyConnections()).toEqual([]);
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('연결 목록 조회 실패');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(getMyConnections()).rejects.toThrow('연결 목록 조회 실패');
  });
});

describe('disconnect', () => {
  it('disconnect_connection RPC를 호출한다', async () => {
    const mock = makeRpcMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await disconnect();

    expect(mock.rpc).toHaveBeenCalledWith('disconnect_connection');
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('연결 해제 실패');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(disconnect()).rejects.toThrow('연결 해제 실패');
  });
});

describe('sendToConnection', () => {
  it('generateToken으로 토큰을 만들어 send_to_connection RPC에 letterId/recipientId와 함께 넘긴다', async () => {
    const mock = makeRpcMock({ data: null, error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await sendToConnection('letter-1', 'recipient-1');

    expect(mockGenerateToken).toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith('send_to_connection', {
      p_letter_id: 'letter-1',
      p_recipient: 'recipient-1',
      p_token: 'GENERATED_TOKEN',
    });
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('발송 실패');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(sendToConnection('letter-1', 'recipient-1')).rejects.toThrow('발송 실패');
  });
});
