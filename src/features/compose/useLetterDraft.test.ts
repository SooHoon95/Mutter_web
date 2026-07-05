/**
 * useLetterDraft 동작 테스트.
 *
 * 데이터 레이어(createDraft·updateLetter·getLetter)를 모킹해 라이브 Supabase 없이 검증한다.
 * 컴포즈 모델은 단일 본문(body) + 편지 1곡(cue)이며, 저장 시점에만 paragraphs로 변환한다.
 *
 * 핵심 AC:
 *  - [P0] 편집 진입(letterId) 시 getLetter로 기존 편지를 로드해 body·cue를 복원한다(빈 초안으로 덮어쓰지 않음).
 *  - [P0] 저장 시 body를 빈 줄 기준으로 paragraphs[]로 변환한다(빈 단락 제거·최소 1개).
 *  - [P0] cue 1곡은 paragraphs[0]에만 부착된다.
 *  - [P0] "무음 편지 0": cue가 없으면 저장 시 기본 CC0 큐를 첫 단락에 자동 부착한다.
 *  - [P1] 빈 제목은 저장을 차단한다.
 *
 * react-query 훅이므로 QueryClientProvider로 감싸 렌더한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Letter } from '@/data/types';

// 데이터 레이어 모킹 — 라이브 DB 없이 검증.
vi.mock('@/data/letters', () => ({
  createDraft: vi.fn(),
  updateLetter: vi.fn(),
  getLetter: vi.fn(),
}));

import { createDraft, updateLetter, getLetter } from '@/data/letters';
import { useLetterDraft, bodyToParagraphs, paragraphsToBody } from './useLetterDraft';

const mockCreateDraft = vi.mocked(createDraft);
const mockUpdateLetter = vi.mocked(updateLetter);
const mockGetLetter = vi.mocked(getLetter);

// react-query 래퍼 — retry off로 실패 케이스가 빠르게 끝나게 한다.
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

const existingLetter: Letter = {
  id: 'letter-xyz',
  ownerId: 'user-1',
  title: '저장돼 있던 제목',
  paragraphs: [
    {
      id: 'p-a',
      order: 0,
      text: '기존 첫 단락',
      cue: { sourceType: 'soundcloud', ref: 'https://api.soundcloud.com/tracks/42', startMs: 0 },
    },
    { id: 'p-b', order: 1, text: '기존 둘째 단락' },
  ],
  templateId: 'classic-serif',
  createdAt: '2026-06-16T00:00:00Z',
  updatedAt: '2026-06-16T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// [unit] body ↔ paragraphs 변환
// ---------------------------------------------------------------------------

describe('bodyToParagraphs / paragraphsToBody — 본문↔단락 변환', () => {
  it('빈 줄(\\n\\n) 기준으로 본문을 단락으로 분리하고 order를 부여한다', () => {
    const result = bodyToParagraphs('첫 단락\n\n둘째 단락\n\n셋째 단락', undefined);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.text)).toEqual(['첫 단락', '둘째 단락', '셋째 단락']);
    expect(result.map((p) => p.order)).toEqual([0, 1, 2]);
  });

  it('빈 단락(공백·연속 빈 줄)은 제거한다', () => {
    const result = bodyToParagraphs('첫 단락\n\n\n\n   \n\n둘째 단락', undefined);
    expect(result.map((p) => p.text)).toEqual(['첫 단락', '둘째 단락']);
  });

  it('본문이 비어 있어도 최소 1개 단락을 보장한다', () => {
    const result = bodyToParagraphs('   \n\n   ', undefined);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('');
  });

  it('cue는 첫 단락에만 부착되고 나머지 단락엔 없다', () => {
    const cue = { sourceType: 'hosted' as const, ref: 'track-1', startMs: 0 };
    const result = bodyToParagraphs('A\n\nB\n\nC', cue);
    expect(result[0].cue).toEqual(cue);
    expect(result[1].cue).toBeUndefined();
    expect(result[2].cue).toBeUndefined();
  });

  it('paragraphsToBody는 단락 text를 \\n\\n로 join해 본문을 복원한다', () => {
    const body = paragraphsToBody([
      { id: 'p-a', order: 0, text: 'A' },
      { id: 'p-b', order: 1, text: 'B' },
    ]);
    expect(body).toBe('A\n\nB');
  });
});

// ---------------------------------------------------------------------------
// [P0] 편집 진입 — 기존 편지 로드
// ---------------------------------------------------------------------------

describe('useLetterDraft — 기존 편지 로드(편집 진입)', () => {
  it('letterId가 주어지면 getLetter로 로드해 제목·템플릿·본문·cue를 복원한다', async () => {
    mockGetLetter.mockResolvedValue(existingLetter);

    const { result } = renderHook(() => useLetterDraft('letter-xyz', 'default'), {
      wrapper: makeWrapper(),
    });

    // 로드 완료 전까지는 빈 디폴트 — 로딩 상태
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.draft.letterId).toBe('letter-xyz');
    expect(result.current.draft.title).toBe('저장돼 있던 제목');
    expect(result.current.draft.templateId).toBe('classic-serif');
    // paragraphs → body 복원: 두 단락이 \n\n로 join된다.
    expect(result.current.draft.body).toBe('기존 첫 단락\n\n기존 둘째 단락');
    // cue = 첫 번째로 발견되는 paragraph.cue.
    expect(result.current.draft.cue?.sourceType).toBe('soundcloud');
    expect(result.current.draft.cue?.ref).toBe('https://api.soundcloud.com/tracks/42');
    expect(mockGetLetter).toHaveBeenCalledWith('letter-xyz');
  });

  it('신규 작성(letterId 없음)이면 getLetter를 호출하지 않고 빈 초안으로 시작한다', async () => {
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.draft.title).toBe('');
    expect(result.current.draft.body).toBe('');
    expect(result.current.draft.cue).toBeUndefined();
    expect(mockGetLetter).not.toHaveBeenCalled();
  });

  it('로드가 끝나기 전 save()는 기존 편지를 빈 초안으로 덮어쓰지 않는다', async () => {
    // 영원히 resolve되지 않는 getLetter — 로딩 상태 고정
    mockGetLetter.mockReturnValue(new Promise<Letter>(() => {}));

    const { result } = renderHook(() => useLetterDraft('letter-xyz', 'default'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    // 로딩 중 저장은 차단되고 updateLetter는 호출되지 않아야 한다.
    expect(saveResult?.ok).toBe(false);
    expect(mockUpdateLetter).not.toHaveBeenCalled();
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// [P0] 저장 시 body → paragraphs 변환
// ---------------------------------------------------------------------------

describe('useLetterDraft — 저장 시 본문→단락 변환', () => {
  it('body를 빈 줄 기준으로 paragraphs[]로 변환해 저장한다', async () => {
    mockCreateDraft.mockImplementation(async (input) => ({
      id: 'new-letter',
      ownerId: 'user-1',
      title: input.title,
      paragraphs: input.paragraphs ?? [],
      templateId: input.templateId ?? 'default',
      createdAt: '2026-06-18T00:00:00Z',
      updatedAt: '2026-06-18T00:00:00Z',
    }));

    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setTitle('제목 있음');
      result.current.setBody('첫 단락\n\n둘째 단락');
    });

    await act(async () => {
      await result.current.save();
    });

    const sentInput = mockCreateDraft.mock.calls[0][0];
    expect(sentInput.paragraphs).toHaveLength(2);
    expect(sentInput.paragraphs?.map((p) => p.text)).toEqual(['첫 단락', '둘째 단락']);
  });
});

// ---------------------------------------------------------------------------
// 무음 허용 — cue 없으면 음악 없는 편지(CC0 자동첨부 제거, 앱과 동일)
// ---------------------------------------------------------------------------

describe('useLetterDraft — 무음 허용(CC0 자동첨부 제거)', () => {
  it('cue가 없으면 음악 없는 편지로 저장한다(CC0 자동첨부 안 함)', async () => {
    mockCreateDraft.mockImplementation(async (input) => ({
      id: 'new-letter',
      ownerId: 'user-1',
      title: input.title,
      paragraphs: input.paragraphs ?? [],
      templateId: input.templateId ?? 'default',
      createdAt: '2026-06-18T00:00:00Z',
      updatedAt: '2026-06-18T00:00:00Z',
    }));

    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setTitle('제목 있음');
      result.current.setBody('본문');
    });

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult?.ok).toBe(true);
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);

    // cue를 안 골랐으면 첫 단락에 어떤 큐도 부착되지 않는다(앱과 동일 — 무음 허용).
    const sentInput = mockCreateDraft.mock.calls[0][0];
    const firstParagraph = sentInput.paragraphs?.[0];
    expect(firstParagraph?.cue).toBeUndefined();
  });

  it('cue가 있으면 자동 부착하지 않고 사용자 cue를 첫 단락에만 부착한다', async () => {
    mockCreateDraft.mockImplementation(async (input) => ({
      id: 'new-letter',
      ownerId: 'user-1',
      title: input.title,
      paragraphs: input.paragraphs ?? [],
      templateId: input.templateId ?? 'default',
      createdAt: '2026-06-18T00:00:00Z',
      updatedAt: '2026-06-18T00:00:00Z',
    }));

    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    const userCue = {
      sourceType: 'soundcloud' as const,
      ref: 'https://api.soundcloud.com/tracks/999',
      startMs: 0,
    };

    act(() => {
      result.current.setTitle('제목');
      result.current.setBody('첫 단락\n\n둘째 단락');
      result.current.setCue(userCue);
    });

    await act(async () => {
      await result.current.save();
    });

    const sentInput = mockCreateDraft.mock.calls[0][0];
    // 사용자가 지정한 SC 큐가 첫 단락에만 유지된다(덮어쓰기 없음, 둘째 단락엔 없음).
    expect(sentInput.paragraphs?.[0].cue).toEqual(userCue);
    expect(sentInput.paragraphs?.[1].cue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// [P1] 빈 제목 차단
// ---------------------------------------------------------------------------

describe('useLetterDraft — 빈 제목 차단', () => {
  it('제목이 비어 있으면 저장을 차단하고 empty-title 사유를 반환한다', async () => {
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult).toEqual({ ok: false, reason: 'empty-title' });
    expect(result.current.saveError).not.toBeNull();
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it('공백만 있는 제목도 차단한다', async () => {
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setTitle('   ');
    });

    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult?.ok).toBe(false);
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });
});
