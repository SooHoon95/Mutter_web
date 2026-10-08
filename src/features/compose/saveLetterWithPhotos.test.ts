// saveLetterWithPhotos 단위 테스트 — 설계 §5 저장 순서·실패 처리. 의존성 주입으로 라이브 Supabase 없이 검증.
import { describe, it, expect, vi } from 'vitest';
import { PhotoUploadError, saveLetterWithPhotos } from './saveLetterWithPhotos';
import { textBlock } from './letterBlocks';
import type { ComposeBlock, PhotoBlock } from './letterBlocks';
import type { SaveLetterDeps, SaveLetterInput } from './saveLetterWithPhotos';
import type { Letter } from '@/data/types';

function letter(id: string, paragraphs: Letter['paragraphs'] = []): Letter {
  return {
    id,
    ownerId: 'owner-1',
    title: 't',
    paragraphs,
    templateId: 'default',
    createdAt: '2026-10-07T00:00:00Z',
    updatedAt: '2026-10-07T00:00:00Z',
  };
}

function pending(id: string): PhotoBlock {
  return { kind: 'photo', id, width: 800, height: 600, file: new Blob([id]) };
}

function makeDeps(calls: string[]): SaveLetterDeps {
  let n = 0;
  return {
    createDraft: vi.fn(async (input) => {
      calls.push('create');
      return letter('L1', input.paragraphs);
    }),
    updateLetter: vi.fn(async (id, input) => {
      calls.push('update');
      return letter(id, input.paragraphs);
    }),
    newPhotoPath: vi.fn((owner, letterId) => `${owner}/${letterId}/u${(n += 1)}.jpg`),
    uploadPhoto: vi.fn(async (path) => {
      calls.push(`upload:${path}`);
    }),
    removePhotos: vi.fn(async (paths) => {
      calls.push(`remove:${paths.join(',')}`);
    }),
  };
}

function input(blocks: ComposeBlock[], over: Partial<SaveLetterInput> = {}): SaveLetterInput {
  return {
    letterId: null,
    ownerId: null,
    title: '제목',
    templateId: 'default',
    blocks,
    cue: undefined,
    previousPaths: [],
    ...over,
  };
}

describe('saveLetterWithPhotos', () => {
  it('새 편지 + 사진: 생성 → 업로드(소유자/편지 경로) → 갱신 순서, 생성 직후 onCreated', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls);
    const onCreated = vi.fn(() => calls.push('onCreated'));
    const result = await saveLetterWithPhotos(
      input([textBlock('글'), pending('p1'), pending('p2')]),
      deps,
      { onCreated },
    );

    expect(calls).toEqual([
      'create',
      'onCreated',
      'upload:owner-1/L1/u1.jpg',
      'upload:owner-1/L1/u2.jpg',
      'update',
    ]);
    // 생성 때는 업로드 전 사진을 빼고 글만 보낸다.
    expect(vi.mocked(deps.createDraft).mock.calls[0][0].paragraphs.map((p) => p.text)).toEqual(['글']);
    const updated = vi.mocked(deps.updateLetter).mock.calls[0][1].paragraphs;
    expect(updated.map((p) => p.photo?.path ?? p.text)).toEqual([
      '글',
      'owner-1/L1/u1.jpg',
      'owner-1/L1/u2.jpg',
    ]);
    expect(result.savedPaths).toEqual(['owner-1/L1/u1.jpg', 'owner-1/L1/u2.jpg']);
    expect(result.blocks.every((b) => b.kind === 'text' || !b.file)).toBe(true);
  });

  it('새 편지 + 사진 없음: 생성 한 번으로 끝난다', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls);
    await saveLetterWithPhotos(input([textBlock('글')]), deps);
    expect(calls).toEqual(['create']);
  });

  it('업로드가 실패하면 PhotoUploadError로 저장 실패 — 갱신하지 않고, 성공한 업로드만 알린다', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls);
    vi.mocked(deps.uploadPhoto)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('413'));
    const onPhotoUploaded = vi.fn();
    const onCreated = vi.fn();

    await expect(
      saveLetterWithPhotos(input([pending('p1'), pending('p2'), textBlock()]), deps, {
        onCreated,
        onPhotoUploaded,
      }),
    ).rejects.toBeInstanceOf(PhotoUploadError);

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onPhotoUploaded).toHaveBeenCalledTimes(1);
    expect(onPhotoUploaded).toHaveBeenCalledWith('p1', 'owner-1/L1/u1.jpg');
    expect(deps.updateLetter).not.toHaveBeenCalled();
    expect(deps.removePhotos).not.toHaveBeenCalled();
  });

  it('기존 편지: 생성 없이 업로드 → 갱신 → 더는 안 쓰는 이전 경로만 정리', async () => {
    const calls: string[] = [];
    const deps = makeDeps(calls);
    const kept: PhotoBlock = { kind: 'photo', id: 'k', width: 1, height: 1, path: 'owner-1/L9/keep.jpg' };
    await saveLetterWithPhotos(
      input([kept, pending('p'), textBlock('글')], {
        letterId: 'L9',
        ownerId: 'owner-1',
        previousPaths: ['owner-1/L9/keep.jpg', 'owner-1/L9/gone.jpg'],
      }),
      deps,
    );
    expect(calls).toEqual(['upload:owner-1/L9/u1.jpg', 'update', 'remove:owner-1/L9/gone.jpg']);
  });

  it('이전 사진 정리가 실패해도 저장은 성공한다(best effort)', async () => {
    const deps = makeDeps([]);
    vi.mocked(deps.removePhotos).mockRejectedValueOnce(new Error('denied'));
    const result = await saveLetterWithPhotos(
      input([textBlock('글')], { letterId: 'L9', ownerId: 'owner-1', previousPaths: ['owner-1/L9/x.jpg'] }),
      deps,
    );
    expect(result.letter.id).toBe('L9');
    expect(result.savedPaths).toEqual([]);
  });

  it('갱신이 실패하면 이전 경로를 지우지 않는다(저장된 편지가 아직 참조 중)', async () => {
    const deps = makeDeps([]);
    vi.mocked(deps.updateLetter).mockRejectedValueOnce(new Error('500'));
    await expect(
      saveLetterWithPhotos(
        input([textBlock('글')], { letterId: 'L9', ownerId: 'owner-1', previousPaths: ['owner-1/L9/x.jpg'] }),
        deps,
      ),
    ).rejects.toThrow('500');
    expect(deps.removePhotos).not.toHaveBeenCalled();
  });
});
