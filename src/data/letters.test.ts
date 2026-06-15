// letters CRUD 단위 테스트. getSupabase 모킹으로 라이브 크리덴셜 없이 검증.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Letter, Paragraph } from './types';

// ---------------------------------------------------------------------------
// getSupabase 모킹
// ---------------------------------------------------------------------------

// supabase 모듈을 모킹해 라이브 DB 없이 테스트한다.
vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from './supabase';
import { createDraft, updateLetter, getLetter, listMyLetters } from './letters';

const mockGetSupabase = vi.mocked(getSupabase);

// DB row 형태 샘플
const sampleRow = {
  id: 'letter-001',
  owner_id: 'user-abc',
  title: '첫 번째 편지',
  paragraphs: [
    { id: 'p-1', order: 0, text: '안녕하세요.' },
  ] as Paragraph[],
  template_id: 'default',
  created_at: '2026-06-16T00:00:00Z',
  updated_at: '2026-06-16T00:00:00Z',
};

// domain Letter 형태 (row 매핑 기대값)
const expectedLetter: Letter = {
  id: 'letter-001',
  ownerId: 'user-abc',
  title: '첫 번째 편지',
  paragraphs: [{ id: 'p-1', order: 0, text: '안녕하세요.' }],
  templateId: 'default',
  createdAt: '2026-06-16T00:00:00Z',
  updatedAt: '2026-06-16T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Supabase 체이닝 빌더 헬퍼
// ---------------------------------------------------------------------------

/**
 * Supabase의 빌더 패턴을 모킹한다.
 * `.from()` → `.insert/update/select()` → `.eq()` → `.order()` → `.single/maybeSingle/returns()`
 * 각 메서드는 자기 자신을 반환하고, 마지막 터미널 메서드만 실제 결과를 resolve한다.
 */
function makeChain(terminal: { single?: unknown; maybeSingle?: unknown; returns?: unknown }) {
  const chain: Record<string, unknown> = {};

  const self = () => chain;

  chain['insert'] = vi.fn(self);
  chain['update'] = vi.fn(self);
  chain['select'] = vi.fn(self);
  chain['eq'] = vi.fn(self);
  chain['order'] = vi.fn(self);

  chain['single'] = vi.fn(() =>
    Promise.resolve(terminal.single ?? { data: null, error: null }),
  );
  chain['maybeSingle'] = vi.fn(() =>
    Promise.resolve(terminal.maybeSingle ?? { data: null, error: null }),
  );
  chain['returns'] = vi.fn(() =>
    Promise.resolve(terminal.returns ?? { data: [], error: null }),
  );

  return chain;
}

function makeSupabaseMock(opts: {
  userId?: string;
  sessionError?: Error;
  terminal?: { single?: unknown; maybeSingle?: unknown; returns?: unknown };
}) {
  const sessionData = opts.userId
    ? { session: { user: { id: opts.userId } } }
    : { session: null };

  const chain = makeChain(opts.terminal ?? {});

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: sessionData,
        error: opts.sessionError ?? null,
      }),
    },
    from: vi.fn(() => chain),
  };
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createDraft', () => {
  it('새 초안을 생성하고 domain Letter를 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        userId: 'user-abc',
        terminal: { single: { data: sampleRow, error: null } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const result = await createDraft({ title: '첫 번째 편지' });
    expect(result).toEqual(expectedLetter);
  });

  it('세션 없으면 throw한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({ userId: undefined }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(createDraft({ title: '제목' })).rejects.toThrow(/세션/);
  });

  it('Supabase 오류 시 throw한다', async () => {
    const dbError = new Error('DB 오류');
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        userId: 'user-abc',
        terminal: { single: { data: null, error: dbError } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    await expect(createDraft({ title: '제목' })).rejects.toThrow('DB 오류');
  });
});

describe('updateLetter', () => {
  it('편지를 업데이트하고 domain Letter를 반환한다', async () => {
    const updatedRow = { ...sampleRow, title: '수정된 제목', updated_at: '2026-06-16T01:00:00Z' };
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        userId: 'user-abc',
        terminal: { single: { data: updatedRow, error: null } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const result = await updateLetter('letter-001', { title: '수정된 제목' });
    expect(result.title).toBe('수정된 제목');
    expect(result.id).toBe('letter-001');
  });
});

describe('getLetter', () => {
  it('id로 편지를 조회해 domain Letter를 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        userId: 'user-abc',
        terminal: { maybeSingle: { data: sampleRow, error: null } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const result = await getLetter('letter-001');
    expect(result).toEqual(expectedLetter);
  });

  it('존재하지 않는 편지는 null 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        userId: 'user-abc',
        terminal: { maybeSingle: { data: null, error: null } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const result = await getLetter('nonexistent');
    expect(result).toBeNull();
  });
});

describe('listMyLetters', () => {
  it('현재 사용자 편지 목록을 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        userId: 'user-abc',
        terminal: { returns: { data: [sampleRow], error: null } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const result = await listMyLetters();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expectedLetter);
  });

  it('편지가 없으면 빈 배열 반환한다', async () => {
    mockGetSupabase.mockReturnValue(
      makeSupabaseMock({
        userId: 'user-abc',
        terminal: { returns: { data: [], error: null } },
      }) as unknown as ReturnType<typeof getSupabase>,
    );

    const result = await listMyLetters();
    expect(result).toEqual([]);
  });
});
