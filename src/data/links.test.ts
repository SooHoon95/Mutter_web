// delivery_links 단위 테스트. getSupabase 모킹으로 라이브 크리덴셜 없이 검증.
// capability-links AC:
//   - 토큰 엔트로피 >=128bit (issueLink → generateToken 경유)
//   - revoke/expiry 거부 (RPC 위임)
//   - 암호 서버 비교 설계 (openByToken이 평문을 RPC에만 전달)
// 보안 수정 검증:
//   H-1: revokeLink가 rpc('revoke_link') 호출 (직접 UPDATE 아님)
//   M-3: revokedAt이 revoked_at 컬럼에서 매핑됨 (claimed_at 아님)
//   L-3: openByToken이 내부 코드를 사용자 메시지로 정규화
// 마이그레이션 0011: claim-and-bind 제거 — openByToken에서 deviceId 파라미터 삭제.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// getSupabase 모킹
// ---------------------------------------------------------------------------

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

// generateToken 모킹 — 엔트로피 검증은 token.test.ts에 있으므로 여기서는 고정값 사용
vi.mock('../lib/token', () => ({
  generateToken: vi.fn(() => 'test_token_32chars_AAAAAAAAAAAA'),
}));

import { getSupabase } from './supabase';
import {
  issueLink,
  listLinks,
  revokeLink,
  openByToken,
  recordLetterOpen,
  LinkNotYetError,
} from './links';

const mockGetSupabase = vi.mocked(getSupabase);

// ---------------------------------------------------------------------------
// Supabase 체이닝 빌더 헬퍼
// ---------------------------------------------------------------------------

/**
 * rpc 호출과 빌더 패턴(.from().select()...)을 모두 지원하는 mock을 반환한다.
 */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;

  chain['select'] = vi.fn(self);
  chain['eq'] = vi.fn(self);
  chain['order'] = vi.fn(self);
  chain['update'] = vi.fn(self);
  chain['returns'] = vi.fn(() => Promise.resolve(result));
  chain['then'] = undefined; // chain 자체는 thenable이 아님

  return chain;
}

function makeSupabaseMock(opts: {
  rpcResult?: unknown;
  chainResult?: unknown;
}) {
  const chain = makeChain(opts.chainResult ?? { data: [], error: null });

  return {
    rpc: vi.fn(() => Promise.resolve(opts.rpcResult ?? { data: null, error: null })),
    from: vi.fn(() => chain),
  };
}

// ---------------------------------------------------------------------------
// 샘플 데이터
// ---------------------------------------------------------------------------

// listLinks 전용 샘플 row: has_password boolean (password_hash 원문 없음, 0011 이후)
const sampleRow = {
  id: 'link-001',
  letter_id: 'letter-abc',
  owner_id: 'user-xyz',
  token: 'test_token_32chars_AAAAAAAAAAAA',
  has_password: true, // password_hash IS NOT NULL 표현식 결과
  expires_at: null,
  revoked: false,
  revoked_at: null, // M-3: 새 컬럼
  created_at: '2026-06-16T00:00:00Z',
  reveal_at: null, // 0018: 예약 공개
};

// issueLink RPC 전용 샘플 row: password_hash 원문 포함 (RPC 서버 반환)
const sampleRpcRow = {
  id: 'link-001',
  letter_id: 'letter-abc',
  owner_id: 'user-xyz',
  token: 'test_token_32chars_AAAAAAAAAAAA',
  password_hash: '$2a$10$hashedvalue',
  expires_at: null,
  revoked: false,
  revoked_at: null,
  created_at: '2026-06-16T00:00:00Z',
  reveal_at: null, // 0018: 예약 공개
};

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ── issueLink ──────────────────────────────────────────────────────────────

describe('issueLink', () => {
  it('RPC issue_link을 호출하고 DeliveryLink를 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: { data: sampleRpcRow, error: null },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const link = await issueLink('letter-abc', { password: 'secret' });

    expect(link.token).toBe('test_token_32chars_AAAAAAAAAAAA');
    expect(link.letterId).toBe('letter-abc');
    expect(link.hasPassword).toBe(true);
  });

  it('암호 없이 발급하면 hasPassword = false', async () => {
    const rowNoPass = { ...sampleRpcRow, password_hash: null };
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: { data: rowNoPass, error: null },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const link = await issueLink('letter-abc', {});
    expect(link.hasPassword).toBe(false);
  });

  it('RPC 오류 시 throw한다', async () => {
    const dbError = new Error('RPC 실패');
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: { data: null, error: dbError },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(issueLink('letter-abc', {})).rejects.toThrow('RPC 실패');
  });

  it('클라이언트는 토큰을 generateToken으로 생성해 RPC에 넘긴다 (해시 클라이언트 불처리 확인)', async () => {
    const sbMock = makeSupabaseMock({
      rpcResult: { data: sampleRpcRow, error: null },
    });
    mockGetSupabase.mockReturnValue(
      sbMock as unknown as ReturnType<typeof getSupabase>,
    );

    await issueLink('letter-abc', { password: 'mypassword' });

    // 예약 미설정이면 p_reveal_at은 아예 전송하지 않는다(하위호환 — 4-arg 매칭).
    expect(sbMock.rpc).toHaveBeenCalledWith('issue_link', {
      p_letter_id: 'letter-abc',
      p_token: 'test_token_32chars_AAAAAAAAAAAA',
      p_password: 'mypassword', // 평문 — 서버 RPC가 해시 처리
      p_expires_at: null,
    });
  });

  it('0018: revealAt(예약 공개)을 p_reveal_at으로 전달한다', async () => {
    const sbMock = makeSupabaseMock({
      rpcResult: { data: sampleRpcRow, error: null },
    });
    mockGetSupabase.mockReturnValue(
      sbMock as unknown as ReturnType<typeof getSupabase>,
    );

    await issueLink('letter-abc', { revealAt: '2026-06-25T00:00:00Z' });

    expect(sbMock.rpc).toHaveBeenCalledWith('issue_link', {
      p_letter_id: 'letter-abc',
      p_token: 'test_token_32chars_AAAAAAAAAAAA',
      p_password: null,
      p_expires_at: null,
      p_reveal_at: '2026-06-25T00:00:00Z',
    });
  });
});

// ── listLinks ──────────────────────────────────────────────────────────────

describe('listLinks', () => {
  it('편지 id에 속한 링크 목록을 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        chainResult: { data: [sampleRow], error: null },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const links = await listLinks('letter-abc');
    expect(links).toHaveLength(1);
    expect(links[0].token).toBe('test_token_32chars_AAAAAAAAAAAA');
  });

  it('링크가 없으면 빈 배열을 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        chainResult: { data: [], error: null },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const links = await listLinks('letter-abc');
    expect(links).toEqual([]);
  });
});

// ── 0018: 예약 공개 — listLinks reveal_at 매핑 ──────────────────────────────

describe('listLinks 예약 공개 매핑(0018)', () => {
  it('reveal_at을 revealAt으로 매핑한다', async () => {
    const rowScheduled = { ...sampleRow, reveal_at: '2026-06-25T00:00:00Z' };
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        chainResult: { data: [rowScheduled], error: null },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const links = await listLinks('letter-abc');
    expect(links[0].revealAt).toBe('2026-06-25T00:00:00Z');
  });

  it('reveal_at이 null이면 revealAt은 undefined', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        chainResult: { data: [sampleRow], error: null },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const links = await listLinks('letter-abc');
    expect(links[0].revealAt).toBeUndefined();
  });
});

// ── revokeLink ─────────────────────────────────────────────────────────────

describe('revokeLink', () => {
  // H-1: 직접 .update().eq() 대신 RPC revoke_link를 호출하는지 검증
  it('H-1: RPC revoke_link를 호출한다 (직접 UPDATE 아님)', async () => {
    const sbMock = makeSupabaseMock({
      rpcResult: { data: null, error: null },
    });
    mockGetSupabase.mockReturnValue(
      sbMock as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(revokeLink('some_token')).resolves.toBeUndefined();

    // RPC revoke_link 호출 확인
    expect(sbMock.rpc).toHaveBeenCalledWith('revoke_link', {
      p_token: 'some_token',
    });
    // 직접 from/update 호출이 없어야 함
    expect(sbMock.from).not.toHaveBeenCalled();
  });

  it('RPC 오류 시 throw한다', async () => {
    const rpcError = new Error('FORBIDDEN');
    const sbMock = makeSupabaseMock({
      rpcResult: { data: null, error: rpcError },
    });
    mockGetSupabase.mockReturnValue(
      sbMock as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(revokeLink('bad_token')).rejects.toThrow('FORBIDDEN');
  });
});

// ── M-3: revokedAt 매핑 ────────────────────────────────────────────────────

describe('M-3: revokedAt 매핑', () => {
  it('revoked=true이면 revoked_at 컬럼 값을 revokedAt으로 반환한다', async () => {
    const revokedRow = {
      ...sampleRow,
      revoked: true,
      revoked_at: '2026-06-16T12:00:00Z',
    };
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        chainResult: { data: [revokedRow], error: null },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const links = await listLinks('letter-abc');
    expect(links[0].revokedAt).toBe('2026-06-16T12:00:00Z'); // revoked_at 값
    expect(links[0].revokedAt).not.toBe('2026-06-15T10:00:00Z'); // claimed_at 아님
  });

  it('revoked=false이면 revokedAt은 undefined다', async () => {
    const activeRow = { ...sampleRow, revoked: false, revoked_at: null };
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        chainResult: { data: [activeRow], error: null },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const links = await listLinks('letter-abc');
    expect(links[0].revokedAt).toBeUndefined();
  });
});

// ── openByToken ────────────────────────────────────────────────────────────

describe('openByToken', () => {
  const letterPayload = {
    id: 'letter-abc',
    title: '테스트 편지',
    paragraphs: [{ id: 'p1', order: 0, text: '안녕' }],
    template_id: 'default',
    cues: [],
  };

  it('RPC get_letter_by_token을 호출하고 편지 페이로드를 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: { data: letterPayload, error: null },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const result = await openByToken('tok', 'pass');
    expect(result.id).toBe('letter-abc');
    expect(result.title).toBe('테스트 편지');
    expect(result.templateId).toBe('default');
  });

  it('password를 RPC에 전달한다 (암호 서버 비교 설계 확인)', async () => {
    const sbMock = makeSupabaseMock({
      rpcResult: { data: letterPayload, error: null },
    });
    mockGetSupabase.mockReturnValue(
      sbMock as unknown as ReturnType<typeof getSupabase>,
    );

    await openByToken('my_token', 'my_password');

    expect(sbMock.rpc).toHaveBeenCalledWith('get_letter_by_token', {
      p_token: 'my_token',
      p_password: 'my_password',
    });
  });

  it('암호 없이 열 때 p_password는 null로 전달한다', async () => {
    const sbMock = makeSupabaseMock({
      rpcResult: { data: letterPayload, error: null },
    });
    mockGetSupabase.mockReturnValue(
      sbMock as unknown as ReturnType<typeof getSupabase>,
    );

    await openByToken('tok', undefined);

    expect(sbMock.rpc).toHaveBeenCalledWith('get_letter_by_token', {
      p_token: 'tok',
      p_password: null,
    });
  });

  it('데이터가 null이면 "편지를 찾을 수 없습니다" 오류를 던진다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: { data: null, error: null },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(openByToken('tok', undefined)).rejects.toThrow('편지를 찾을 수 없습니다');
  });

  // ── L-3: 에러 정규화 테스트 ───────────────────────────────────────────────

  it('L-3: LINK_REVOKED 에러를 사용자 메시지로 정규화한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: { data: null, error: new Error('LINK_REVOKED') },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(openByToken('tok', 'pass')).rejects.toThrow(
      '이 링크는 발신자에 의해 무효화되었습니다.',
    );
  });

  it('L-3: LINK_EXPIRED 에러를 사용자 메시지로 정규화한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: { data: null, error: new Error('LINK_EXPIRED') },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(openByToken('tok', 'pass')).rejects.toThrow(
      '링크가 만료되었습니다.',
    );
  });

  it('L-3: WRONG_PASSWORD 에러를 사용자 메시지로 정규화한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: { data: null, error: new Error('WRONG_PASSWORD') },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(openByToken('tok', 'wrong')).rejects.toThrow(
      '암호가 올바르지 않습니다.',
    );
  });

  // DEVICE_MISMATCH 테스트 삭제: 마이그레이션 0011로 claim-and-bind 제거,
  // 서버가 이 에러 코드를 더 이상 반환하지 않는다.

  it('L-3: TOKEN_NOT_FOUND 에러를 사용자 메시지로 정규화한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: { data: null, error: new Error('TOKEN_NOT_FOUND') },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(openByToken('invalid', undefined)).rejects.toThrow(
      '링크를 찾을 수 없습니다.',
    );
  });

  it('L-3: 알 수 없는 에러는 내부 코드 비노출 메시지로 정규화한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: { data: null, error: new Error('INTERNAL_DB_ERROR_42P01') },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(openByToken('tok', undefined)).rejects.toThrow(
      '편지를 불러올 수 없습니다.',
    );
  });

  // ── 0018: 예약 공개 — NOT_YET_REVEALED → LinkNotYetError(revealAt 파싱) ───────

  it('0018: NOT_YET_REVEALED:<ISO>를 LinkNotYetError로 변환하고 revealAt을 파싱한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        rpcResult: {
          data: null,
          error: new Error('NOT_YET_REVEALED:2026-06-25T00:00:00Z'),
        },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(openByToken('tok', undefined)).rejects.toBeInstanceOf(LinkNotYetError);

    // revealAt 값까지 확인
    try {
      await openByToken('tok', undefined);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LinkNotYetError);
      expect((err as LinkNotYetError).revealAt).toBe('2026-06-25T00:00:00Z');
    }
  });
});

// ── 0017: 읽음 확인 기록 — recordLetterOpen ─────────────────────────────────

describe('recordLetterOpen(0017)', () => {
  it('RPC record_letter_open을 토큰과 함께 호출한다', async () => {
    const sbMock = makeSupabaseMock({ rpcResult: { data: null, error: null } });
    mockGetSupabase.mockReturnValue(sbMock as unknown as ReturnType<typeof getSupabase>);

    await recordLetterOpen('my_token');

    expect(sbMock.rpc).toHaveBeenCalledWith('record_letter_open', {
      p_token: 'my_token',
    });
  });

  it('RPC 오류가 나도 throw하지 않는다(fire-and-forget — 수신 경험 보호)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sbMock = makeSupabaseMock({
      rpcResult: { data: null, error: new Error('boom') },
    });
    mockGetSupabase.mockReturnValue(sbMock as unknown as ReturnType<typeof getSupabase>);

    await expect(recordLetterOpen('tok')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('getSupabase가 throw해도 삼킨다(수신 경험 보호)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetSupabase.mockImplementation(() => {
      throw new Error('no client');
    });

    await expect(recordLetterOpen('tok')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
