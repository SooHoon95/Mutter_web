// 작성 화면 블록 모델(텍스트 칸 · 사진 카드)과 DB 계약(paragraphs jsonb) 사이 변환. 설계 §2·§6.4.
//
// iOS LetterContentCodec · Android 코덱과 같은 규칙을 쓴다 — 세 플랫폼 어디서 고쳐 저장해도
// 사진 위치·큐 위치가 똑같이 남아야 하기 때문이다.
//   - 로드: 빈 텍스트 단락은 건너뛰고(사진 앞 큐 자리채움·구버전 잔재), 연속 텍스트 단락은
//     빈 줄로 이어 텍스트 칸 하나로 합친다(편집기의 텍스트 칸 하나 = 사진 사이 구간 하나).
//   - 저장: 텍스트 칸을 빈 줄로 나눠 trim·빈 것 제거 후 단락으로, 사진 카드는 사진 단락으로.
//     큐는 첫 텍스트 단락에만 붙고, 텍스트가 하나도 없으면 큐를 실을 빈 텍스트 단락을 맨 앞에 둔다.
//   - 아직 업로드되지 않은(path 없는) 사진은 저장할 수 없으므로 건너뛴다(저장 흐름이 먼저 올린다).
// 모든 함수는 순수 함수다 — 상태 관리는 useLetterDraft, 업로드는 saveLetterWithPhotos가 맡는다.

import type { LetterPhoto, MusicCue, Paragraph } from '@/data/types';

/** 편지당 사진 최대 장수(설계 §2 — 세 플랫폼 공통). */
export const MAX_PHOTOS = 5;

export interface TextBlock {
  kind: 'text';
  id: string;
  text: string;
}

export interface PhotoBlock {
  kind: 'photo';
  /** 저장된 사진은 단락 id를 그대로 쓴다 — 다시 저장해도 단락 id가 바뀌지 않게. */
  id: string;
  width: number;
  height: number;
  /** 업로드된 사진의 Storage 경로. 없으면 아직 업로드 전(pending). */
  path?: string;
  /** 업로드 대기 중인 JPEG(축소 완료본). */
  file?: Blob;
  /** 이번 세션에서 고른 사진의 로컬 미리보기(object URL). 업로드 뒤에도 재다운로드 없이 계속 쓴다. */
  previewUrl?: string;
}

export type ComposeBlock = TextBlock | PhotoBlock;

export function newBlockId(): string {
  // crypto.randomUUID는 보안 컨텍스트(https·localhost)에서만 있다 — 없으면 시간+난수로 대신한다.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function textBlock(text = ''): TextBlock {
  return { kind: 'text', id: newBlockId(), text };
}

export function photoCount(blocks: ComposeBlock[]): number {
  return blocks.filter((b) => b.kind === 'photo').length;
}

export function remainingPhotoSlots(blocks: ComposeBlock[]): number {
  return Math.max(0, MAX_PHOTOS - photoCount(blocks));
}

/** 블록 안의 업로드된 사진 경로 목록(저장 후 정리 대상 비교용). */
export function photoPaths(blocks: ComposeBlock[]): string[] {
  return blocks.flatMap((b) => (b.kind === 'photo' && b.path ? [b.path] : []));
}

// ---------------------------------------------------------------------------
// paragraphs ↔ blocks
// ---------------------------------------------------------------------------

/** 저장된 단락 → 블록(편집 칸 보정 전). order 순으로 읽는다. */
export function paragraphsToBlocks(paragraphs: Paragraph[]): ComposeBlock[] {
  const blocks: ComposeBlock[] = [];
  for (const p of [...paragraphs].sort((a, b) => a.order - b.order)) {
    if (p.photo) {
      const { path, width, height } = p.photo;
      blocks.push({ kind: 'photo', id: p.id, path, width, height });
      continue;
    }
    if (!p.text.trim()) continue;
    const last = blocks[blocks.length - 1];
    if (last?.kind === 'text') {
      blocks[blocks.length - 1] = { ...last, text: `${last.text}\n\n${p.text}` };
    } else {
      blocks.push({ kind: 'text', id: p.id, text: p.text });
    }
  }
  return blocks;
}

/** 편집 화면용 보정 — 사진으로 끝나거나 비어 있으면 이어 쓸 빈 텍스트 칸을 붙인다(iOS editableBlocks). */
export function editableBlocks(blocks: ComposeBlock[]): ComposeBlock[] {
  const last = blocks[blocks.length - 1];
  if (!last || last.kind === 'photo') return [...blocks, textBlock()];
  return blocks;
}

function splitText(text: string): string[] {
  return text
    .split(/\n\s*\n/) // 빈 줄(사이 공백 허용) 기준 — 기존 웹 본문 분리 규칙 그대로
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** 블록 + 큐 → 저장용 단락. 업로드 전(path 없는) 사진은 건너뛴다. */
export function blocksToParagraphs(blocks: ComposeBlock[], cue: MusicCue | undefined): Paragraph[] {
  type Item = { kind: 'text'; text: string } | { kind: 'photo'; id: string; photo: LetterPhoto };
  const items: Item[] = [];
  for (const b of blocks) {
    if (b.kind === 'text') {
      for (const text of splitText(b.text)) items.push({ kind: 'text', text });
    } else if (b.path) {
      items.push({ kind: 'photo', id: b.id, photo: { path: b.path, width: b.width, height: b.height } });
    }
  }
  // 사진만 있는(또는 빈) 편지도 큐를 실을 자리가 있어야 한다 — 빈 텍스트 단락을 맨 앞에.
  if (!items.some((i) => i.kind === 'text')) items.unshift({ kind: 'text', text: '' });

  let cueAttached = false;
  return items.map((item, order): Paragraph => {
    if (item.kind === 'photo') return { id: item.id, order, text: '', photo: item.photo };
    const paragraph: Paragraph = { id: newBlockId(), order, text: item.text };
    if (!cueAttached && cue) paragraph.cue = cue;
    cueAttached = true;
    return paragraph;
  });
}

/** 단락 중 첫 큐(편지 1곡 모델). */
export function cueFromParagraphs(paragraphs: Paragraph[]): MusicCue | undefined {
  return [...paragraphs].sort((a, b) => a.order - b.order).find((p) => !p.photo && p.cue)?.cue;
}

// ---------------------------------------------------------------------------
// 편집 연산
// ---------------------------------------------------------------------------

/**
 * 사진 카드를 마지막으로 포커스된 텍스트 칸 뒤(없으면 끝)에 넣는다.
 * 바로 뒤가 텍스트 칸이 아니면 이어 쓸 빈 텍스트 칸을 함께 넣는다(iOS addPhotos).
 * 남은 슬롯을 넘는 사진은 버린다 — 5장 제한은 이 함수가 최종 보장한다.
 */
export function insertPhotoBlocks(
  blocks: ComposeBlock[],
  afterTextId: string | null,
  photos: PhotoBlock[],
): ComposeBlock[] {
  const accepted = photos.slice(0, remainingPhotoSlots(blocks));
  if (accepted.length === 0) return blocks;
  const anchor = afterTextId ? blocks.findIndex((b) => b.id === afterTextId) : -1;
  const insertAt = anchor >= 0 ? anchor + 1 : blocks.length;
  const nextIsText = insertAt < blocks.length && blocks[insertAt].kind === 'text';
  const inserted: ComposeBlock[] = nextIsText ? accepted : [...accepted, textBlock()];
  return [...blocks.slice(0, insertAt), ...inserted, ...blocks.slice(insertAt)];
}

/** 사진 카드를 빼고, 그 때문에 맞닿은 두 텍스트 칸을 하나로 합친다(저장 때도 합쳐지므로 화면을 미리 맞춘다). */
export function removePhotoBlock(blocks: ComposeBlock[], photoId: string): ComposeBlock[] {
  const index = blocks.findIndex((b) => b.id === photoId && b.kind === 'photo');
  if (index < 0) return blocks;
  const next = [...blocks.slice(0, index), ...blocks.slice(index + 1)];
  const before = next[index - 1];
  const after = next[index];
  if (before?.kind === 'text' && after?.kind === 'text') {
    const text = [before.text, after.text].filter((t) => t.length > 0).join('\n\n');
    next.splice(index - 1, 2, { ...before, text });
  }
  return next;
}

export function updateTextBlock(blocks: ComposeBlock[], id: string, text: string): ComposeBlock[] {
  return blocks.map((b) => (b.id === id && b.kind === 'text' ? { ...b, text } : b));
}
