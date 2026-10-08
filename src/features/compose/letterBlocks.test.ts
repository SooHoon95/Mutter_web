// letterBlocks 단위 테스트 — 블록 ↔ paragraphs 코덱(iOS·Android와 같은 규칙)과 편집 연산.
import { describe, it, expect } from 'vitest';
import {
  MAX_PHOTOS,
  blocksToParagraphs,
  cueFromParagraphs,
  editableBlocks,
  insertPhotoBlocks,
  paragraphsToBlocks,
  removePhotoBlock,
  textBlock,
} from './letterBlocks';
import type { ComposeBlock, PhotoBlock } from './letterBlocks';
import type { Paragraph } from '@/data/types';

const CUE = { sourceType: 'soundcloud' as const, ref: 'https://api.soundcloud.com/tracks/42', startMs: 0 };
const PHOTO_A = { path: 'o/l/a.jpg', width: 1536, height: 2048 };
const PHOTO_B = { path: 'o/l/b.jpg', width: 2048, height: 1536 };

function shape(blocks: ComposeBlock[]): string[] {
  return blocks.map((b) => (b.kind === 'photo' ? `[${b.path ?? 'pending'}]` : b.text));
}

function pendingPhoto(id: string): PhotoBlock {
  return { kind: 'photo', id, width: 10, height: 10, file: new Blob(['x']) };
}

describe('paragraphsToBlocks — 로드', () => {
  it('연속 텍스트 단락은 빈 줄로 이어 텍스트 칸 하나로 합친다', () => {
    const blocks = paragraphsToBlocks([
      { id: 'a', order: 0, text: 'A', cue: CUE },
      { id: 'b', order: 1, text: 'B' },
    ]);
    expect(shape(blocks)).toEqual(['A\n\nB']);
  });

  it('iOS·Android가 쓴 사진 단락을 order 순 같은 자리에 둔다(order 뒤섞인 배열도)', () => {
    const paragraphs: Paragraph[] = [
      { id: 't3', order: 3, text: '둘째 글' },
      { id: 'lead', order: 0, text: '', cue: CUE },
      { id: 'ph2', order: 2, text: '', photo: PHOTO_B },
      { id: 'ph1', order: 1, text: '', photo: PHOTO_A },
    ];
    const blocks = paragraphsToBlocks(paragraphs);
    expect(shape(blocks)).toEqual([`[${PHOTO_A.path}]`, `[${PHOTO_B.path}]`, '둘째 글']);
    expect(blocks[0]).toEqual({ kind: 'photo', id: 'ph1', ...PHOTO_A });
    expect(cueFromParagraphs(paragraphs)).toEqual(CUE);
  });

  it('빈·공백 텍스트 단락은 건너뛴다(사진 사이를 가르지 않는다)', () => {
    const blocks = paragraphsToBlocks([
      { id: 'a', order: 0, text: 'A' },
      { id: 'e', order: 1, text: '   ' },
      { id: 'b', order: 2, text: 'B' },
    ]);
    expect(shape(blocks)).toEqual(['A\n\nB']);
  });

  it('editableBlocks는 사진으로 끝나거나 비면 이어 쓸 빈 텍스트 칸을 붙인다', () => {
    expect(shape(editableBlocks([]))).toEqual(['']);
    expect(shape(editableBlocks(paragraphsToBlocks([{ id: 'p', order: 0, text: '', photo: PHOTO_A }])))).toEqual([
      `[${PHOTO_A.path}]`,
      '',
    ]);
    const textOnly = paragraphsToBlocks([{ id: 't', order: 0, text: 'x' }]);
    expect(editableBlocks(textOnly)).toBe(textOnly);
  });
});

describe('blocksToParagraphs — 저장', () => {
  it('텍스트 칸을 빈 줄로 나눠 trim·빈 것 제거하고 order를 0..n-1로 매긴다', () => {
    const paragraphs = blocksToParagraphs([textBlock('  첫 단락 \n\n\n\n   \n\n둘째 단락\n')], undefined);
    expect(paragraphs.map((p) => [p.order, p.text])).toEqual([
      [0, '첫 단락'],
      [1, '둘째 단락'],
    ]);
  });

  it('cue는 첫 텍스트 단락에만 붙고 사진 단락엔 없다', () => {
    const blocks: ComposeBlock[] = [
      { kind: 'photo', id: 'ph', ...PHOTO_A },
      textBlock('A\n\nB'),
    ];
    const paragraphs = blocksToParagraphs(blocks, CUE);
    expect(paragraphs.map((p) => p.photo?.path ?? p.text)).toEqual([PHOTO_A.path, 'A', 'B']);
    expect(paragraphs[0]).toEqual({ id: 'ph', order: 0, text: '', photo: PHOTO_A });
    expect(paragraphs[1].cue).toEqual(CUE);
    expect(paragraphs.filter((p) => p.cue)).toHaveLength(1);
  });

  it('사진만 있는 편지는 큐를 실을 빈 텍스트 단락을 맨 앞에 둔다', () => {
    const paragraphs = blocksToParagraphs([{ kind: 'photo', id: 'ph', ...PHOTO_A }, textBlock('  ')], CUE);
    expect(paragraphs.map((p) => p.photo?.path ?? p.text)).toEqual(['', PHOTO_A.path]);
    expect(paragraphs[0].cue).toEqual(CUE);
  });

  it('빈 본문은 빈 텍스트 단락 하나로 저장한다', () => {
    const paragraphs = blocksToParagraphs([textBlock('')], undefined);
    expect(paragraphs).toEqual([{ id: expect.any(String), order: 0, text: '' }]);
  });

  it('업로드 전(path 없는) 사진은 건너뛴다', () => {
    const paragraphs = blocksToParagraphs([textBlock('A'), pendingPhoto('p'), textBlock('B')], undefined);
    expect(paragraphs.map((p) => p.text)).toEqual(['A', 'B']);
  });

  it('다른 플랫폼이 쓴 편지를 로드→저장해도 구조가 그대로다(왕복)', () => {
    const fromIos: Paragraph[] = [
      { id: 'lead', order: 0, text: '', cue: CUE },
      { id: 'ph-0', order: 1, text: '', photo: PHOTO_A },
      { id: 't-1', order: 2, text: '첫 글' },
      { id: 't-2', order: 3, text: '첫 글 둘째 문단' },
      { id: 'ph-2', order: 4, text: '', photo: PHOTO_B },
    ];
    const blocks = editableBlocks(paragraphsToBlocks(fromIos));
    const saved = blocksToParagraphs(blocks, cueFromParagraphs(fromIos));
    expect(saved.map((p) => p.photo?.path ?? p.text)).toEqual([
      PHOTO_A.path,
      '첫 글',
      '첫 글 둘째 문단',
      PHOTO_B.path,
    ]);
    expect(saved.filter((p) => p.photo).map((p) => p.id)).toEqual(['ph-0', 'ph-2']);
    expect(saved[1].cue).toEqual(CUE);
    // 다시 읽어도 같은 블록 구조.
    expect(shape(paragraphsToBlocks(saved))).toEqual(shape(paragraphsToBlocks(fromIos)));
  });
});

describe('insertPhotoBlocks / removePhotoBlock — 편집 연산', () => {
  it('포커스된 텍스트 칸 뒤에 넣고, 바로 뒤가 텍스트가 아니면 빈 텍스트 칸을 덧붙인다', () => {
    const a = textBlock('A');
    const out = insertPhotoBlocks([a], a.id, [pendingPhoto('p1'), pendingPhoto('p2')]);
    expect(out.map((b) => b.kind)).toEqual(['text', 'photo', 'photo', 'text']);
  });

  it('바로 뒤가 텍스트 칸이면 그 칸을 이어 쓰고 빈 칸을 더하지 않는다', () => {
    const a = textBlock('A');
    const b = textBlock('B');
    const blocks: ComposeBlock[] = [a, { kind: 'photo', id: 'x', ...PHOTO_A }, b];
    const out = insertPhotoBlocks(blocks, null, [pendingPhoto('p')]);
    // 포커스 기록이 없으면 끝에 — 끝 뒤엔 텍스트가 없으므로 빈 칸 추가.
    expect(out.map((x) => x.kind)).toEqual(['text', 'photo', 'text', 'photo', 'text']);
    const mid = insertPhotoBlocks([a, b], a.id, [pendingPhoto('p')]);
    expect(mid.map((x) => x.id)).toEqual([a.id, 'p', b.id]);
  });

  it(`편지당 최대 ${MAX_PHOTOS}장 — 남은 슬롯을 넘는 사진은 버린다`, () => {
    let blocks: ComposeBlock[] = [textBlock()];
    blocks = insertPhotoBlocks(blocks, null, [1, 2, 3, 4].map((i) => pendingPhoto(`p${i}`)));
    blocks = insertPhotoBlocks(blocks, null, [5, 6, 7].map((i) => pendingPhoto(`p${i}`)));
    expect(blocks.filter((b) => b.kind === 'photo').map((b) => b.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    const full = insertPhotoBlocks(blocks, null, [pendingPhoto('p8')]);
    expect(full).toBe(blocks);
  });

  it('사진을 빼면 맞닿은 두 텍스트 칸을 하나로 합친다(빈 칸은 빈 줄 없이)', () => {
    const a = textBlock('A');
    const b = textBlock('B');
    const merged = removePhotoBlock([a, pendingPhoto('p'), b], 'p');
    expect(merged).toEqual([{ ...a, text: 'A\n\nB' }]);
    const withEmpty = removePhotoBlock([a, pendingPhoto('p'), textBlock('')], 'p');
    expect(shape(withEmpty)).toEqual(['A']);
    // 텍스트 칸이 한쪽뿐이면 합칠 것 없이 사진만 빠진다.
    expect(shape(removePhotoBlock([pendingPhoto('p'), b], 'p'))).toEqual(['B']);
  });
});
