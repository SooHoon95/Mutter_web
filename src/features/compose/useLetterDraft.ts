// 편지 초안 상태 관리 hook. pwa-architecture 스킬 참조.
//
// 컴포즈 모델은 "테마 즉시적용 WYSIWYG" + 블록 편집기(iOS·Android와 같음, 설계 §6.4):
// 본문은 텍스트 칸과 사진 카드가 번갈아 놓인 블록 배열이고, 음악은 편지당 1곡이다.
// 저장 시점에만 DB 계약(paragraphs jsonb)으로 변환한다(스키마 변경 없음 — letterBlocks.ts).
//
// /create/:id 진입 시 기존 편지를 react-query로 로드해 로컬 상태를 초기화한다.
// 앱(iOS·Android)에서 넣은 사진도 같은 자리의 사진 카드로 열리고, 고쳐 저장해도 그대로 남는다.
// 무음 허용(앱과 동일): cue가 없으면 음악 없는 편지로 저장한다.
//
// 사진: 고르면 브라우저에서 축소(photoResize) → 업로드 대기 카드로 넣고, 저장 때
// saveLetterWithPhotos가 생성→업로드→갱신→정리 순서로 처리한다(설계 §5).

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createDraft, updateLetter, getLetter } from '@/data/letters';
import {
  fetchLetterPhotoUrls,
  newLetterPhotoPath,
  removeLetterPhotos,
  uploadLetterPhoto,
} from '@/data/letterPhotos';
import {
  MAX_PHOTOS,
  cueFromParagraphs,
  editableBlocks,
  insertPhotoBlocks,
  newBlockId,
  paragraphsToBlocks,
  photoPaths,
  remainingPhotoSlots,
  removePhotoBlock,
  textBlock,
  updateTextBlock,
} from './letterBlocks';
import { PhotoDecodeError, resizePhotoToJpeg } from './photoResize';
import { saveLetterWithPhotos } from './saveLetterWithPhotos';
import type { ComposeBlock, PhotoBlock } from './letterBlocks';
import type { SaveLetterDeps } from './saveLetterWithPhotos';
import type { PhotoUrlMap } from '@/data/letterPhotos';
import type { MusicCue } from '@/data/types';

// ---------------------------------------------------------------------------
// 공개 타입
// ---------------------------------------------------------------------------

export interface DraftState {
  letterId: string | null;
  title: string;
  /** 본문 블록 — 텍스트 칸과 사진 카드. 저장 시 paragraphs로 변환된다. */
  blocks: ComposeBlock[];
  templateId: string;
  /** 편지 음악 1곡 (선택 — 없으면 음악 없는 편지). */
  cue: MusicCue | undefined;
}

/** save() 결과 — 차단 시 사유를 호출부에 알려 UI 후처리(제목 포커스 등)를 가능하게 한다. */
export type SaveResult = { ok: true } | { ok: false; reason: 'empty-title' | 'error' };

export interface UseLetterDraftReturn {
  draft: DraftState;
  /** 기존 편지를 로드 중인지 — Create.tsx가 "불러오는 중"을 표시한다. */
  isLoading: boolean;
  isSaving: boolean;
  saveError: Error | null;
  /** 저장된 사진의 서명 URL(path → URL). 실패·로딩 중이면 비어 있다(카드는 플레이스홀더). */
  photoUrls: PhotoUrlMap;
  isAddingPhotos: boolean;
  /** 사진 넣기 관련 안내(형식 미지원·장수 초과). */
  photoError: string | null;
  /** 더 넣을 수 있는 사진 장수(0이면 버튼 비활성). */
  remainingPhotos: number;
  setTitle: (title: string) => void;
  setBlockText: (blockId: string, text: string) => void;
  /** 텍스트 칸 포커스 기록 — 사진은 마지막으로 포커스된 칸 뒤에 들어간다. */
  focusTextBlock: (blockId: string) => void;
  addPhotos: (files: File[]) => Promise<void>;
  removePhoto: (blockId: string) => void;
  setTemplateId: (id: string) => void;
  /** 편지 음악 1곡 설정 (undefined로 제거). */
  setCue: (cue: MusicCue | undefined) => void;
  save: () => Promise<SaveResult>;
}

const SAVE_DEPS: SaveLetterDeps = {
  createDraft,
  updateLetter,
  newPhotoPath: newLetterPhotoPath,
  uploadPhoto: uploadLetterPhoto,
  removePhotos: removeLetterPhotos,
};

// 서명 URL은 1시간 유효 — 만료 전에 새로 받도록 여유를 둔다.
const PHOTO_URL_STALE_MS = 50 * 60 * 1000;

export const PHOTO_LIMIT_MESSAGE = `사진은 편지 한 통에 ${MAX_PHOTOS}장까지 넣을 수 있어요.`;

// ---------------------------------------------------------------------------
// hook 구현
// ---------------------------------------------------------------------------

export function useLetterDraft(
  initialLetterId: string | null = null,
  initialTemplateId = 'default',
): UseLetterDraftReturn {
  const queryClient = useQueryClient();

  const [letterId, setLetterId] = useState<string | null>(initialLetterId);
  // 업로드 경로 첫 폴더(RLS = auth.uid()). 기존 편지는 로드 결과, 새 편지는 생성 결과에서 받는다.
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<ComposeBlock[]>(() => [textBlock()]);
  const [templateId, setTemplateId] = useState<string>(initialTemplateId);
  const [cue, setCue] = useState<MusicCue | undefined>(undefined);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingPhotos, setIsAddingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // 비동기 사진 처리 중에도 최신 블록을 보도록 ref로 따라간다(남은 슬롯 계산용).
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const lastFocusedTextIdRef = useRef<string | null>(null);
  // 마지막으로 저장된 버전이 참조하는 사진 경로 — 저장 후 안 쓰는 객체를 지우는 기준.
  const savedPathsRef = useRef<string[]>([]);

  // ── 로컬 미리보기(object URL) 수명 관리 ───────────────────────────────────
  // 만든 URL을 모아 두고, 사진을 빼거나 화면을 떠날 때 해제해 메모리 누수를 막는다.
  const objectUrlsRef = useRef(new Set<string>());
  // 사진 줄이기 도중 화면을 떠나면 이후 만든 URL은 해제할 곳이 없다 — 언마운트 뒤엔 만들지 않는다.
  const unmountedRef = useRef(false);
  useEffect(() => {
    const urls = objectUrlsRef.current;
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  // ── 기존 편지 로드 (편집 진입) ─────────────────────────────────────────────
  // initialLetterId가 있을 때만 활성화. 신규 작성(id 없음)이면 쿼리하지 않는다.
  const existingQuery = useQuery({
    queryKey: ['letters', initialLetterId],
    queryFn: () => getLetter(initialLetterId as string),
    enabled: !!initialLetterId,
  });

  // 로드된 편지로 로컬 상태를 단 한 번만 초기화한다.
  // 초기화 후 사용자의 편집을 덮어쓰지 않도록 guard ref로 1회만 적용한다.
  const hydratedRef = useRef(false);
  // 저장된 사진이 있는 편지의 id — 있을 때만 서명 URL을 받는다.
  const [photoLetterId, setPhotoLetterId] = useState<string | null>(null);
  useEffect(() => {
    if (hydratedRef.current) return;
    const loaded = existingQuery.data;
    if (!loaded) return; // 아직 로딩 중이거나 null(없음/타계정) — 디폴트 유지, 덮어쓰기 금지

    hydratedRef.current = true;
    const loadedBlocks = editableBlocks(paragraphsToBlocks(loaded.paragraphs));
    savedPathsRef.current = photoPaths(loadedBlocks);
    setLetterId(loaded.id);
    setOwnerId(loaded.ownerId);
    setTitle(loaded.title);
    setTemplateId(loaded.templateId || initialTemplateId);
    setBlocks(loadedBlocks);
    setPhotoLetterId(savedPathsRef.current.length > 0 ? loaded.id : null);
    // cue = 첫 텍스트 단락의 cue (편지 1곡 모델).
    setCue(cueFromParagraphs(loaded.paragraphs));
  }, [existingQuery.data, initialTemplateId]);

  // /create/:id 인데 그 편지가 없거나(삭제) 타계정(RLS 차단)이라 null로 resolve되면,
  // letterId를 비워 "신규 작성"으로 전환한다. 그대로 두면 저장 시 존재하지 않는 id로 update →
  // 서버 에러 + 입력 손실(빈 폼이 뜬 채 저장 불가). null 전환 시 저장은 새 편지를 생성한다.
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!initialLetterId) return;
    if (existingQuery.isLoading) return; // 아직 로딩 중
    if (existingQuery.data) return; // 정상 로드 — 위 hydration effect가 처리
    setLetterId(null); // 없음/타계정/에러 → 신규 작성
  }, [initialLetterId, existingQuery.isLoading, existingQuery.data]);

  // 편집 진입인데 아직 로드가 끝나지 않았으면 로딩 상태로 본다(저장으로 빈 초안을 덮어쓰지 않게).
  const isLoading = !!initialLetterId && !hydratedRef.current && existingQuery.isLoading;

  // ── 저장된 사진 썸네일 — 소유자 모드 서명 URL(설계 §6.4) ──────────────────
  // 로드 시점에 한 번 받는다(캐시 키 = 편지 id, 값은 path → URL 맵).
  // 이번 세션에 넣은 사진은 로컬 미리보기를 쓰므로 다시 받지 않는다.
  const photoUrlQuery = useQuery({
    queryKey: ['letter-photo-urls', 'owner', photoLetterId],
    queryFn: () => fetchLetterPhotoUrls({ letterId: photoLetterId as string }),
    enabled: !!photoLetterId,
    staleTime: PHOTO_URL_STALE_MS,
    retry: false,
  });
  const photoUrls = photoUrlQuery.data ?? {};

  // ── 블록 편집 ─────────────────────────────────────────────────────────────

  const setBlockText = useCallback((blockId: string, text: string) => {
    setBlocks((prev) => updateTextBlock(prev, blockId, text));
  }, []);

  const focusTextBlock = useCallback((blockId: string) => {
    lastFocusedTextIdRef.current = blockId;
  }, []);

  // 사진 넣기 중복 실행 가드(동기) — 연달아 고르면 슬롯 계산이 어긋나 5장을 넘을 수 있다.
  const addingRef = useRef(false);

  const addPhotos = useCallback(async (files: File[]): Promise<void> => {
    if (files.length === 0 || addingRef.current) return;
    const slots = remainingPhotoSlots(blocksRef.current);
    if (slots === 0) {
      setPhotoError(PHOTO_LIMIT_MESSAGE);
      return;
    }
    addingRef.current = true;
    setIsAddingPhotos(true);
    setPhotoError(
      files.length > slots ? `${PHOTO_LIMIT_MESSAGE} 앞의 ${slots}장만 넣었어요.` : null,
    );

    const made: PhotoBlock[] = [];
    try {
      for (const file of files.slice(0, slots)) {
        try {
          const { jpeg, width, height } = await resizePhotoToJpeg(file);
          if (unmountedRef.current) return;
          const previewUrl = URL.createObjectURL(jpeg);
          objectUrlsRef.current.add(previewUrl);
          made.push({ kind: 'photo', id: newBlockId(), width, height, file: jpeg, previewUrl });
        } catch (err) {
          // 한 장이 실패해도 나머지는 넣는다 — 실패 사유만 알린다.
          setPhotoError(
            err instanceof PhotoDecodeError
              ? err.message
              : '사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.',
          );
        }
      }
      if (made.length > 0) {
        setBlocks((prev) => insertPhotoBlocks(prev, lastFocusedTextIdRef.current, made));
      }
    } finally {
      addingRef.current = false;
      setIsAddingPhotos(false);
    }
  }, []);

  const removePhoto = useCallback((blockId: string) => {
    const target = blocksRef.current.find((b) => b.id === blockId);
    if (target?.kind === 'photo' && target.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
      objectUrlsRef.current.delete(target.previewUrl);
    }
    setBlocks((prev) => removePhotoBlock(prev, blockId));
    setPhotoError(null);
  }, []);

  // ── 저장 ──────────────────────────────────────────────────────────────────

  // 중복 저장 가드(동기). isSaving(state)은 비동기 갱신이라, 첫 저장이 letterId를 박기 전에
  // 두 번째 save()가 들어오면 편지가 중복 생성될 수 있다. ref는 즉시 반영되므로 그 갭을 막는다.
  const savingRef = useRef(false);

  const save = useCallback(async (): Promise<SaveResult> => {
    setSaveError(null);

    // [P1] 빈 제목 차단 — 수신자가 빈 <h1>을 보지 않게 한다.
    if (!title.trim()) {
      const err = new Error('제목을 입력해 주세요. 수신자에게 가장 먼저 보이는 부분이에요.');
      setSaveError(err);
      return { ok: false, reason: 'empty-title' };
    }

    // 로드가 끝나기 전(편집 진입)에는 저장하지 않는다 — 빈 초안으로 기존 편지를 덮어쓰지 않게.
    if (isLoading) {
      const err = new Error('편지를 불러오는 중입니다. 잠시 후 다시 저장해 주세요.');
      setSaveError(err);
      return { ok: false, reason: 'error' };
    }

    // 사진 처리 중 저장하면 막 고른 사진이 빠진 채 저장된다.
    if (addingRef.current) {
      setSaveError(new Error('사진을 준비하는 중이에요. 잠시 후 다시 저장해 주세요.'));
      return { ok: false, reason: 'error' };
    }

    // 이미 저장 중이면 중복 호출을 무시(편지 중복 생성 방지).
    if (savingRef.current) return { ok: false, reason: 'error' };
    savingRef.current = true;
    setIsSaving(true);

    try {
      const result = await saveLetterWithPhotos(
        {
          letterId,
          ownerId,
          title,
          templateId,
          blocks,
          cue,
          previousPaths: savedPathsRef.current,
        },
        SAVE_DEPS,
        {
          // 생성 직후 편집 모드로 — 업로드가 실패해 다시 저장해도 편지가 두 통 생기지 않는다.
          onCreated: (letter) => {
            setLetterId(letter.id);
            setOwnerId(letter.ownerId);
            void queryClient.invalidateQueries({ queryKey: ['letters', 'mine'] });
          },
          // 올라간 사진은 바로 path를 박아 재시도 때 다시 올리지 않는다.
          onPhotoUploaded: (blockId, path) => {
            setBlocks((prev) =>
              prev.map((b) =>
                b.id === blockId && b.kind === 'photo' ? { ...b, path, file: undefined } : b,
              ),
            );
          },
        },
      );
      savedPathsRef.current = result.savedPaths;
      void queryClient.invalidateQueries({ queryKey: ['letters', result.letter.id] });
      void queryClient.invalidateQueries({ queryKey: ['letters', 'mine'] });
      return { ok: true };
    } catch (err) {
      setSaveError(err instanceof Error ? err : new Error(String(err)));
      return { ok: false, reason: 'error' };
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [title, isLoading, letterId, ownerId, templateId, blocks, cue, queryClient]);

  return {
    draft: { letterId, title, blocks, templateId, cue },
    isLoading,
    isSaving,
    saveError,
    photoUrls,
    isAddingPhotos,
    photoError,
    remainingPhotos: remainingPhotoSlots(blocks),
    setTitle,
    setBlockText,
    focusTextBlock,
    addPhotos,
    removePhoto,
    setTemplateId,
    setCue,
    save,
  };
}
