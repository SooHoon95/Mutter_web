// 사진이 있는 편지 저장 흐름(설계 §5). 컴포넌트·hook 밖의 순수 오케스트레이션 — 의존성은 주입받는다.
//
// 순서:
//   1. 새 편지면 먼저 생성해 letterId를 확보한다(업로드 경로에 편지 id가 들어가므로).
//      생성 직후 onCreated로 알려 hook이 곧바로 "편집 모드"로 바뀐다 — 뒤 단계가 실패해 다시 저장해도
//      편지가 두 통 생기지 않는다.
//   2. 대기 중인 사진을 올린다. 하나라도 실패하면 저장 실패(PhotoUploadError). 이미 올라간 객체는
//      onPhotoUploaded로 path를 돌려줘 재시도 때 다시 올리지 않는다(남은 고아 객체는 다음 저장 때 정리).
//   3. path를 넣은 paragraphs로 update한다.
//   4. 이전에 저장돼 있었지만 이제 참조하지 않는 path를 지운다(best effort).

import { blocksToParagraphs, photoPaths } from './letterBlocks';
import type { ComposeBlock, PhotoBlock } from './letterBlocks';
import type { Letter, MusicCue, Paragraph } from '@/data/types';

export interface SaveLetterInput {
  letterId: string | null;
  /** 기존 편지의 소유자 id. 새 편지면 생성 결과에서 얻는다. */
  ownerId: string | null;
  title: string;
  templateId: string;
  blocks: ComposeBlock[];
  cue: MusicCue | undefined;
  /** 마지막으로 저장된 버전이 참조하던 사진 경로(정리 대상 비교용). */
  previousPaths: string[];
}

type LetterContent = { title: string; paragraphs: Paragraph[]; templateId: string };

export interface SaveLetterDeps {
  createDraft: (input: LetterContent) => Promise<Letter>;
  updateLetter: (id: string, input: LetterContent) => Promise<Letter>;
  newPhotoPath: (ownerId: string, letterId: string) => string;
  uploadPhoto: (path: string, jpeg: Blob) => Promise<void>;
  removePhotos: (paths: string[]) => Promise<void>;
}

export interface SaveLetterCallbacks {
  onCreated?: (letter: Letter) => void;
  onPhotoUploaded?: (blockId: string, path: string) => void;
}

export interface SaveLetterResult {
  letter: Letter;
  /** 업로드 path가 채워진 블록(호출부 상태 반영용). */
  blocks: ComposeBlock[];
  /** 이번 저장으로 편지가 참조하게 된 사진 경로. */
  savedPaths: string[];
}

export class PhotoUploadError extends Error {
  /** 원인(Storage 에러) — 디버깅용. tsconfig lib가 ES2021이라 Error.cause 대신 별도 필드로 둔다. */
  readonly underlying: unknown;
  constructor(underlying?: unknown) {
    super('사진을 올리지 못했어요. 네트워크를 확인하고 다시 저장해 주세요.');
    this.name = 'PhotoUploadError';
    this.underlying = underlying;
  }
}

function isPending(b: ComposeBlock): b is PhotoBlock & { file: Blob } {
  return b.kind === 'photo' && !b.path && !!b.file;
}

export async function saveLetterWithPhotos(
  input: SaveLetterInput,
  deps: SaveLetterDeps,
  callbacks: SaveLetterCallbacks = {},
): Promise<SaveLetterResult> {
  const { title, templateId, cue } = input;
  let blocks = input.blocks;
  let letterId = input.letterId;
  let ownerId = input.ownerId;
  let letter: Letter | null = null;

  // 1. 새 편지 — 업로드 전 사진은 빼고(blocksToParagraphs가 건너뜀) 먼저 만든다.
  if (!letterId) {
    letter = await deps.createDraft({ title, templateId, paragraphs: blocksToParagraphs(blocks, cue) });
    letterId = letter.id;
    ownerId = letter.ownerId;
    callbacks.onCreated?.(letter);
    if (!blocks.some(isPending)) {
      return { letter, blocks, savedPaths: photoPaths(blocks) };
    }
  }
  if (!ownerId) throw new Error('편지 소유자를 확인하지 못했어요. 다시 로그인해 주세요.');

  // 2. 대기 사진 업로드 — 순서대로(편지당 최대 5장이라 병렬 이득이 작고, 실패 지점이 분명하다).
  const uploaded = new Map<string, string>();
  for (const b of blocks) {
    if (!isPending(b)) continue;
    const path = deps.newPhotoPath(ownerId, letterId);
    try {
      await deps.uploadPhoto(path, b.file);
    } catch (err) {
      throw new PhotoUploadError(err);
    }
    uploaded.set(b.id, path);
    callbacks.onPhotoUploaded?.(b.id, path);
  }
  blocks = blocks.map((b) => {
    const path = uploaded.get(b.id);
    return path && b.kind === 'photo' ? { ...b, path, file: undefined } : b;
  });

  // 3. path가 들어간 본문으로 갱신.
  letter = await deps.updateLetter(letterId, {
    title,
    templateId,
    paragraphs: blocksToParagraphs(blocks, cue),
  });

  // 4. 더는 참조하지 않는 이전 사진 정리(best effort — 실패해도 저장은 성공).
  const savedPaths = photoPaths(blocks);
  const stale = input.previousPaths.filter((p) => !savedPaths.includes(p));
  if (stale.length > 0) {
    try {
      await deps.removePhotos(stale);
    } catch {
      // 비공개 버킷이라 남아도 노출되지 않는다. 다음 기회에 다시 정리한다.
    }
  }

  return { letter, blocks, savedPaths };
}
