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

  it('4컬럼(0009) 시그니처로 두 1:1 컬럼이 누락돼도 false로 안전 폴백한다', async () => {
    // 0009(4컬럼)가 배포된 환경: viewer_has_connection/inviter_has_connection 컬럼이 없다.
    const legacyRow = {
      inviter_id: 'user-001',
      inviter_nickname: '초대한사람',
      is_self: false,
      already_connected: false,
    };
    const mock = makeRpcMock({ data: [legacyRow], error: null });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    const result = await getInvite('tok_abc');
    // undefined → false로 명시 매핑(=== true). 배타성이 조용히 꺼지지 않는다.
    expect(result.viewerHasConnection).toBe(false);
    expect(result.inviterHasConnection).toBe(false);
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

  it('ALREADY_CONNECTED(같은 상대 중복) 에러를 사용자 메시지로 정규화한다', async () => {
    const mock = makeRpcMock({
      data: null,
      error: new Error('ALREADY_CONNECTED'),
    });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(acceptInvite('tok_abc')).rejects.toThrow('이미 연결된 사이예요.');
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

    await disconnect('other-1');

    expect(mock.rpc).toHaveBeenCalledWith('disconnect_connection', { p_other_user: 'other-1' });
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('연결 해제 실패');
    const mock = makeRpcMock({ data: null, error: dbError });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(disconnect('other-1')).rejects.toThrow('연결 해제 실패');
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

  it('FORBIDDEN 에러를 사용자 메시지로 정규화한다', async () => {
    const mock = makeRpcMock({ data: null, error: new Error('FORBIDDEN') });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(sendToConnection('letter-1', 'recipient-1')).rejects.toThrow(
      '이 편지를 보낼 권한이 없어요.',
    );
  });

  it('NOT_CONNECTED 에러를 사용자 메시지로 정규화한다', async () => {
    const mock = makeRpcMock({ data: null, error: new Error('NOT_CONNECTED') });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(sendToConnection('letter-1', 'recipient-1')).rejects.toThrow(
      '연결된 사람이 아니에요. 먼저 연결해 주세요.',
    );
  });

  it('CANNOT_SEND_SELF 에러를 사용자 메시지로 정규화한다', async () => {
    const mock = makeRpcMock({ data: null, error: new Error('CANNOT_SEND_SELF') });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(sendToConnection('letter-1', 'recipient-1')).rejects.toThrow(
      '본인에게는 보낼 수 없어요.',
    );
  });

  it('TOKEN_INVALID 에러를 사용자 메시지로 정규화한다', async () => {
    const mock = makeRpcMock({ data: null, error: new Error('TOKEN_INVALID') });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(sendToConnection('letter-1', 'recipient-1')).rejects.toThrow(
      '발송에 실패했어요. 잠시 후 다시 시도해 주세요.',
    );
  });

  it('알 수 없는 RPC 오류는 내부 코드 비노출 메시지로 정규화한다', async () => {
    const mock = makeRpcMock({ data: null, error: new Error('INTERNAL_DB_ERROR_42P01') });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(sendToConnection('letter-1', 'recipient-1')).rejects.toThrow(
      '편지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
  });

  it('plain object 에러({message})도 코드 매칭해 정규화한다', async () => {
    // Supabase RPC 에러는 Error 인스턴스가 아닌 plain object로 올 수 있다.
    const mock = makeRpcMock({ data: null, error: { message: 'NOT_CONNECTED', code: 'P0001' } });
    mockGetSupabase.mockReturnValue(mock as unknown as ReturnType<typeof getSupabase>);

    await expect(sendToConnection('letter-1', 'recipient-1')).rejects.toThrow(
      '연결된 사람이 아니에요. 먼저 연결해 주세요.',
    );
  });
});
