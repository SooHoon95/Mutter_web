/**
 * useLetterDraft 동작 테스트.
 *
 * 데이터 레이어(letters·letterPhotos)와 사진 축소(photoResize)를 모킹해 라이브 Supabase·캔버스 없이 검증한다.
 * 컴포즈 모델은 블록(텍스트 칸·사진 카드) + 편지 1곡(cue)이며, 저장 시점에만 paragraphs로 변환한다.
 *
 * 핵심 AC:
 *  - [P0] 편집 진입(letterId) 시 getLetter로 기존 편지를 로드해 블록·cue를 복원한다(빈 초안으로 덮어쓰지 않음).
 *  - [P0] 저장 시 텍스트 칸을 빈 줄 기준으로 paragraphs[]로 변환한다(빈 단락 제거).
 *  - [P0] cue 1곡은 첫 텍스트 단락에만 부착된다. 무음 허용.
 *  - [P0] 앱에서 넣은 사진은 같은 자리에 열리고, 고쳐 저장해도 그대로 남는다.
 *  - [P0] 사진은 편지당 5장까지. 업로드 실패 시 저장 실패 + 재시도해도 편지가 중복 생성되지 않는다.
 *  - [P1] 빈 제목은 저장을 차단한다.
 *
 * react-query 훅이므로 QueryClientProvider로 감싸 렌더한다.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
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
vi.mock('@/data/letterPhotos', () => ({
  fetchLetterPhotoUrls: vi.fn(),
  newLetterPhotoPath: vi.fn(),
  uploadLetterPhoto: vi.fn(),
  removeLetterPhotos: vi.fn(),
}));
// 캔버스 축소는 jsdom에서 못 하므로 크기만 돌려주는 가짜로 바꾼다(PhotoDecodeError는 실제 클래스 유지).
vi.mock('./photoResize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./photoResize')>();
  return { ...actual, resizePhotoToJpeg: vi.fn() };
});

import { createDraft, updateLetter, getLetter } from '@/data/letters';
import {
  fetchLetterPhotoUrls,
  newLetterPhotoPath,
  uploadLetterPhoto,
  removeLetterPhotos,
} from '@/data/letterPhotos';
import { PhotoDecodeError, resizePhotoToJpeg } from './photoResize';
import { useLetterDraft } from './useLetterDraft';
import type { TextBlock } from './letterBlocks';

const mockCreateDraft = vi.mocked(createDraft);
const mockUpdateLetter = vi.mocked(updateLetter);
const mockGetLetter = vi.mocked(getLetter);
const mockFetchUrls = vi.mocked(fetchLetterPhotoUrls);
const mockNewPath = vi.mocked(newLetterPhotoPath);
const mockUpload = vi.mocked(uploadLetterPhoto);
const mockRemove = vi.mocked(removeLetterPhotos);
const mockResize = vi.mocked(resizePhotoToJpeg);

// jsdom에는 object URL API가 없다 — 미리보기 URL 생성·해제를 추적할 수 있게 심는다.
const revoked: string[] = [];
beforeAll(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${(n += 1)}`);
  URL.revokeObjectURL = vi.fn((u: string) => {
    revoked.push(u);
  });
});

// react-query 래퍼 — retry off로 실패 케이스가 빠르게 끝나게 한다.
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function echoCreate(id = 'new-letter') {
  mockCreateDraft.mockImplementation(async (input) => ({
    id,
    ownerId: 'user-1',
    title: input.title,
    paragraphs: input.paragraphs ?? [],
    templateId: input.templateId ?? 'default',
    createdAt: '2026-06-18T00:00:00Z',
    updatedAt: '2026-06-18T00:00:00Z',
  }));
}

function echoUpdate(base: Letter) {
  mockUpdateLetter.mockImplementation(async (id, input) => ({
    ...base,
    id,
    paragraphs: input.paragraphs ?? [],
  }));
}

function file(name: string): File {
  return new File(['x'], name, { type: 'image/jpeg' });
}

function textBlocks(blocks: { kind: string }[]): TextBlock[] {
  return blocks.filter((b): b is TextBlock => b.kind === 'text');
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
  revoked.length = 0;
  mockFetchUrls.mockResolvedValue({});
  let n = 0;
  mockNewPath.mockImplementation((owner, letter) => `${owner}/${letter}/u${(n += 1)}.jpg`);
  mockUpload.mockResolvedValue(undefined);
  mockRemove.mockResolvedValue(undefined);
  mockResize.mockResolvedValue({ jpeg: new Blob(['j']), width: 1536, height: 2048 });
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
    // 연속 텍스트 단락은 텍스트 칸 하나로 합쳐진다(빈 줄로 이음).
    expect(result.current.draft.blocks).toHaveLength(1);
    expect(textBlocks(result.current.draft.blocks)[0].text).toBe('기존 첫 단락\n\n기존 둘째 단락');
    // cue = 첫 텍스트 단락의 cue.
    expect(result.current.draft.cue?.ref).toBe('https://api.soundcloud.com/tracks/42');
    expect(mockGetLetter).toHaveBeenCalledWith('letter-xyz');
    // 사진이 없으면 서명 URL을 받지 않는다.
    expect(mockFetchUrls).not.toHaveBeenCalled();
  });

  it('신규 작성(letterId 없음)이면 getLetter를 호출하지 않고 빈 텍스트 칸 하나로 시작한다', async () => {
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.draft.title).toBe('');
    expect(result.current.draft.blocks).toEqual([
      { kind: 'text', id: expect.any(String), text: '' },
    ]);
    expect(result.current.draft.cue).toBeUndefined();
    expect(result.current.remainingPhotos).toBe(5);
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
// [P0] 저장 시 블록 → paragraphs 변환 · 무음 허용
// ---------------------------------------------------------------------------

describe('useLetterDraft — 저장 시 본문→단락 변환', () => {
  it('텍스트 칸을 빈 줄 기준으로 paragraphs[]로 변환해 저장한다', async () => {
    echoCreate();
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setTitle('제목 있음');
      result.current.setBlockText(result.current.draft.blocks[0].id, '첫 단락\n\n둘째 단락');
    });
    await act(async () => {
      await result.current.save();
    });

    const sentInput = mockCreateDraft.mock.calls[0][0];
    expect(sentInput.paragraphs?.map((p) => p.text)).toEqual(['첫 단락', '둘째 단락']);
    // 사진이 없으면 생성 한 번으로 끝난다(update·업로드 없음).
    expect(mockUpdateLetter).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(result.current.draft.letterId).toBe('new-letter');
  });

  it('cue가 없으면 음악 없는 편지로 저장한다(CC0 자동첨부 안 함)', async () => {
    echoCreate();
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.setTitle('제목 있음');
      result.current.setBlockText(result.current.draft.blocks[0].id, '본문');
    });
    let saveResult: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      saveResult = await result.current.save();
    });

    expect(saveResult?.ok).toBe(true);
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockCreateDraft.mock.calls[0][0].paragraphs?.[0].cue).toBeUndefined();
  });

  it('cue가 있으면 사용자 cue를 첫 단락에만 부착한다', async () => {
    echoCreate();
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
      result.current.setBlockText(result.current.draft.blocks[0].id, '첫 단락\n\n둘째 단락');
      result.current.setCue(userCue);
    });
    await act(async () => {
      await result.current.save();
    });

    const sentInput = mockCreateDraft.mock.calls[0][0];
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

// ---------------------------------------------------------------------------
// 편지 사진(0034) — 앱에서 넣은 사진 로드·보존
// ---------------------------------------------------------------------------

const CUE = { sourceType: 'soundcloud' as const, ref: 'https://api.soundcloud.com/tracks/42', startMs: 0 };
const PHOTO_A = { path: 'user-1/letter-ph/a.jpg', width: 1536, height: 2048 };
const PHOTO_B = { path: 'user-1/letter-ph/b.jpg', width: 2048, height: 1536 };

// iOS가 저장한 형태: 사진으로 시작하는 편지는 큐를 실을 빈 텍스트 단락이 맨 앞에 온다.
const letterWithPhotos: Letter = {
  id: 'letter-ph',
  ownerId: 'user-1',
  title: '사진 편지',
  paragraphs: [
    { id: 'lead', order: 0, text: '', cue: CUE },
    { id: 'ph-0', order: 1, text: '', photo: PHOTO_A },
    { id: 't-1', order: 2, text: '첫 글' },
    { id: 'ph-2', order: 3, text: '', photo: PHOTO_B },
    { id: 't-3', order: 4, text: '둘째 글' },
  ],
  templateId: 'classic-serif',
  createdAt: '2026-10-07T00:00:00Z',
  updatedAt: '2026-10-07T00:00:00Z',
};

describe('useLetterDraft — 사진이 있는 기존 편지', () => {
  it('사진을 같은 자리의 카드로 열고 소유자 모드 서명 URL을 받는다', async () => {
    mockGetLetter.mockResolvedValue(letterWithPhotos);
    mockFetchUrls.mockResolvedValue({ [PHOTO_A.path]: 'https://signed/a' });

    const { result } = renderHook(() => useLetterDraft('letter-ph', 'default'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // 빈 리드 단락은 건너뛰고, 사진 → 글 → 사진 → 글 순서 그대로.
    expect(
      result.current.draft.blocks.map((b) => (b.kind === 'photo' ? b.path : b.text)),
    ).toEqual([PHOTO_A.path, '첫 글', PHOTO_B.path, '둘째 글']);
    expect(result.current.draft.cue).toEqual(CUE);
    expect(result.current.remainingPhotos).toBe(3);

    await waitFor(() => expect(result.current.photoUrls[PHOTO_A.path]).toBe('https://signed/a'));
    expect(mockFetchUrls).toHaveBeenCalledWith({ letterId: 'letter-ph' });
  });

  it('고치지 않고 저장해도 사진 위치·id·큐가 그대로 남고 업로드·삭제는 없다', async () => {
    mockGetLetter.mockResolvedValue(letterWithPhotos);
    echoUpdate(letterWithPhotos);

    const { result } = renderHook(() => useLetterDraft('letter-ph', 'default'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.save();
    });

    const sent = mockUpdateLetter.mock.calls[0][1].paragraphs ?? [];
    expect(sent.map((p) => p.photo?.path ?? p.text)).toEqual([
      PHOTO_A.path,
      '첫 글',
      PHOTO_B.path,
      '둘째 글',
    ]);
    expect(sent.filter((p) => p.photo).map((p) => p.id)).toEqual(['ph-0', 'ph-2']);
    // 큐는 첫 텍스트 단락에 하나만.
    expect(sent[1].cue).toEqual(CUE);
    expect(sent.filter((p) => p.cue)).toHaveLength(1);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('사진을 빼고 저장하면 맞닿은 글이 합쳐지고, 뺀 사진 객체를 정리한다', async () => {
    mockGetLetter.mockResolvedValue(letterWithPhotos);
    echoUpdate(letterWithPhotos);

    const { result } = renderHook(() => useLetterDraft('letter-ph', 'default'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.removePhoto('ph-2');
    });
    expect(
      result.current.draft.blocks.map((b) => (b.kind === 'photo' ? b.path : b.text)),
    ).toEqual([PHOTO_A.path, '첫 글\n\n둘째 글']);

    await act(async () => {
      await result.current.save();
    });

    expect(mockRemove).toHaveBeenCalledWith([PHOTO_B.path]);
    const sent = mockUpdateLetter.mock.calls[0][1].paragraphs ?? [];
    expect(sent.map((p) => p.photo?.path ?? p.text)).toEqual([PHOTO_A.path, '첫 글', '둘째 글']);
  });
});

// ---------------------------------------------------------------------------
// 사진 넣기 — 5장 제한 · 형식 오류 · 업로드 실패 재시도
// ---------------------------------------------------------------------------

describe('useLetterDraft — 사진 넣기', () => {
  it('마지막으로 포커스된 텍스트 칸 뒤에 사진과 빈 텍스트 칸을 넣는다', async () => {
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });
    const firstId = result.current.draft.blocks[0].id;

    act(() => {
      result.current.setBlockText(firstId, '앞 글');
      result.current.focusTextBlock(firstId);
    });
    await act(async () => {
      await result.current.addPhotos([file('a.jpg')]);
    });

    const blocks = result.current.draft.blocks;
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'photo', 'text']);
    expect(blocks[1]).toMatchObject({ width: 1536, height: 2048, previewUrl: expect.stringMatching(/^blob:/) });
    expect(result.current.remainingPhotos).toBe(4);
  });

  it('5장을 넘기면 앞의 남은 장수만 넣고 안내하며, 다 차면 더 넣지 않는다', async () => {
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.addPhotos([1, 2, 3, 4, 5, 6, 7].map((i) => file(`${i}.jpg`)));
    });
    expect(mockResize).toHaveBeenCalledTimes(5);
    expect(result.current.draft.blocks.filter((b) => b.kind === 'photo')).toHaveLength(5);
    expect(result.current.remainingPhotos).toBe(0);
    expect(result.current.photoError).toContain('5장까지');

    await act(async () => {
      await result.current.addPhotos([file('8.jpg')]);
    });
    expect(mockResize).toHaveBeenCalledTimes(5);
    expect(result.current.draft.blocks.filter((b) => b.kind === 'photo')).toHaveLength(5);
  });

  it('브라우저가 열 수 없는 사진(HEIC 등)은 건너뛰고 친절한 안내를 띄운다', async () => {
    mockResize
      .mockRejectedValueOnce(new PhotoDecodeError())
      .mockResolvedValueOnce({ jpeg: new Blob(['j']), width: 800, height: 600 });
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.addPhotos([file('a.heic'), file('b.jpg')]);
    });

    expect(result.current.draft.blocks.filter((b) => b.kind === 'photo')).toHaveLength(1);
    expect(result.current.photoError).toContain('브라우저에서 열 수 없어요');
  });

  it('사진을 빼면 로컬 미리보기 URL을 해제한다', async () => {
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });
    await act(async () => {
      await result.current.addPhotos([file('a.jpg')]);
    });
    const photo = result.current.draft.blocks.find((b) => b.kind === 'photo');
    act(() => {
      result.current.removePhoto(photo?.id ?? '');
    });
    expect(revoked).toContain(photo?.kind === 'photo' ? photo.previewUrl : '');
    expect(result.current.draft.blocks.map((b) => b.kind)).toEqual(['text']);
  });

  it('새 편지: 생성 → 업로드 → 갱신 순서로 저장하고 사진 path를 단락에 넣는다', async () => {
    echoCreate('L-new');
    echoUpdate({ ...existingLetter, id: 'L-new' });
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });
    act(() => {
      result.current.setTitle('사진 편지');
    });
    await act(async () => {
      await result.current.addPhotos([file('a.jpg')]);
    });
    await act(async () => {
      await result.current.save();
    });

    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith('user-1/L-new/u1.jpg', expect.any(Blob));
    const createdOrder = mockCreateDraft.mock.invocationCallOrder[0];
    expect(mockUpload.mock.invocationCallOrder[0]).toBeGreaterThan(createdOrder);
    expect(mockUpdateLetter.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockUpload.mock.invocationCallOrder[0],
    );
    const sent = mockUpdateLetter.mock.calls[0][1].paragraphs ?? [];
    // 사진만 있는 편지 — 큐 자리용 빈 텍스트 단락이 맨 앞.
    expect(sent.map((p) => p.photo?.path ?? p.text)).toEqual(['', 'user-1/L-new/u1.jpg']);
  });

  it('업로드가 실패하면 저장 실패를 알리고, 다시 저장해도 편지를 새로 만들지 않는다', async () => {
    echoCreate('L-new');
    echoUpdate({ ...existingLetter, id: 'L-new' });
    mockUpload.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useLetterDraft(null, 'default'), {
      wrapper: makeWrapper(),
    });
    act(() => {
      result.current.setTitle('사진 편지');
    });
    await act(async () => {
      await result.current.addPhotos([file('a.jpg')]);
    });

    let first: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      first = await result.current.save();
    });
    expect(first?.ok).toBe(false);
    expect(result.current.saveError?.message).toContain('사진을 올리지 못했어요');
    expect(result.current.draft.letterId).toBe('L-new');
    expect(mockUpdateLetter).not.toHaveBeenCalled();

    let second: Awaited<ReturnType<typeof result.current.save>> | undefined;
    await act(async () => {
      second = await result.current.save();
    });
    expect(second?.ok).toBe(true);
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockUpdateLetter).toHaveBeenCalledWith('L-new', expect.anything());
  });
});
