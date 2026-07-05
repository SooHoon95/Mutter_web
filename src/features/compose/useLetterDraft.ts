// 편지 초안 상태 관리 hook. pwa-architecture 스킬 참조.
// 초안 CRUD는 react-query 뮤테이션으로 처리하고,
// 본문(body) · 음악(cue 1곡) 편집은 로컬 useState로 유지한다.
//
// 컴포즈 모델은 "테마 즉시적용 WYSIWYG"로, 단락 관리 UI 없이
// 본문은 하나의 문자열(여러 줄)로 다루고 음악은 편지당 1곡만 둔다.
// 저장 시점에만 DB 계약(paragraphs jsonb)으로 변환한다(스키마 변경 없음).
//
// /create/:id 진입 시 기존 편지를 react-query로 로드해 로컬 상태를 초기화한다.
// 무음 허용(앱과 동일): cue가 없으면 음악 없는 편지로 저장한다(CC0 자동부착 제거).

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDraft, updateLetter, getLetter } from '@/data/letters';
import type { Paragraph, MusicCue } from '@/data/types';

// ---------------------------------------------------------------------------
// 공개 타입
// ---------------------------------------------------------------------------

export interface DraftState {
  letterId: string | null;
  title: string;
  /** 본문 — 여러 줄 문자열. 저장 시 빈 줄 기준으로 paragraphs로 변환된다. */
  body: string;
  templateId: string;
  /** 편지 음악 1곡 (선택 — 없으면 음악 없는 편지). */
  cue: MusicCue | undefined;
}

/** save() 결과 — 차단 시 사유를 호출부에 알려 UI 후처리(제목 포커스 등)를 가능하게 한다. */
export type SaveResult = { ok: true } | { ok: false; reason: 'empty-title' | 'error' };

export interface UseLetterDraftReturn {
  draft: DraftState;
  /** 기존 편지를 로드 중인지 — Create.tsx가 스켈레톤/"불러오는 중"을 표시한다. */
  isLoading: boolean;
  isSaving: boolean;
  saveError: Error | null;
  setTitle: (title: string) => void;
  setBody: (body: string) => void;
  setTemplateId: (id: string) => void;
  /** 편지 음악 1곡 설정 (undefined로 제거). */
  setCue: (cue: MusicCue | undefined) => void;
  save: () => Promise<SaveResult>;
}

// ---------------------------------------------------------------------------
// 단락 ID 생성 (안정적 유일 키)
// ---------------------------------------------------------------------------

function newParagraphId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// body ↔ paragraphs 변환 (저장/로드 계약)
// ---------------------------------------------------------------------------

/**
 * 본문 문자열을 빈 줄(\n\n 이상) 기준으로 분리해 paragraphs[]로 변환한다.
 * - 각 단락 = { id, order, text }
 * - 앞뒤 공백만 있는 단락(빈 단락)은 제거한다.
 * - 결과가 비면 빈 텍스트 단락 1개를 보장한다(최소 1개).
 * - cue가 주어지면 paragraphs[0]에만 부착한다(편지 1곡).
 */
export function bodyToParagraphs(body: string, cue: MusicCue | undefined): Paragraph[] {
  const blocks = body
    .split(/\n\s*\n/) // 빈 줄(\n\n 이상, 사이 공백 허용) 기준 분리
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  // 빈 본문이면 최소 1개 보장 — 빈 편지로 저장하지 않는다.
  const texts = blocks.length > 0 ? blocks : [''];

  return texts.map((text, idx) => {
    const paragraph: Paragraph = { id: newParagraphId(), order: idx, text };
    // 선택된 음악 1곡은 첫 단락에만 부착한다(다른 단락엔 cue 없음).
    if (idx === 0 && cue) paragraph.cue = cue;
    return paragraph;
  });
}

/**
 * 로드된 paragraphs[]를 본문 문자열로 복원한다.
 * 단락 text를 \n\n로 join해 작성 화면의 빈 줄 구분을 재현한다.
 */
export function paragraphsToBody(paragraphs: Paragraph[]): string {
  return paragraphs.map((p) => p.text).join('\n\n');
}

// ---------------------------------------------------------------------------
// hook 구현
// ---------------------------------------------------------------------------

export function useLetterDraft(
  initialLetterId: string | null = null,
  initialTemplateId = 'default',
): UseLetterDraftReturn {
  const queryClient = useQueryClient();

  const [letterId, setLetterId] = useState<string | null>(initialLetterId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState<string>(initialTemplateId);
  const [cue, setCue] = useState<MusicCue | undefined>(undefined);
  const [saveError, setSaveError] = useState<Error | null>(null);

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
  useEffect(() => {
    if (hydratedRef.current) return;
    const loaded = existingQuery.data;
    if (!loaded) return; // 아직 로딩 중이거나 null(없음/타계정) — 디폴트 유지, 덮어쓰기 금지

    hydratedRef.current = true;
    setLetterId(loaded.id);
    setTitle(loaded.title);
    setTemplateId(loaded.templateId || initialTemplateId);
    // paragraphs → body 복원 (단락 text를 \n\n로 join).
    setBody(paragraphsToBody(loaded.paragraphs));
    // cue = 첫 번째로 발견되는 paragraph.cue (편지 1곡 모델).
    setCue(loaded.paragraphs.find((p) => p.cue)?.cue);
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

  // ── 뮤테이션: 신규 초안 생성 ──────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (input: { title: string; paragraphs: Paragraph[]; templateId: string }) =>
      createDraft(input),
    onSuccess: (letter) => {
      setLetterId(letter.id);
      // 내가 보낸 편지 목록 캐시 무효화
      void queryClient.invalidateQueries({ queryKey: ['letters', 'mine'] });
    },
  });

  // ── 뮤테이션: 기존 초안 업데이트 ──────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (args: {
      id: string;
      input: { title: string; paragraphs: Paragraph[]; templateId: string };
    }) => updateLetter(args.id, args.input),
    onSuccess: (letter) => {
      void queryClient.invalidateQueries({ queryKey: ['letters', letter.id] });
      void queryClient.invalidateQueries({ queryKey: ['letters', 'mine'] });
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ── 저장 ──────────────────────────────────────────────────────────────────

  // 중복 저장 가드(동기). isSaving(state)은 비동기 갱신이라, 첫 저장의 onSuccess로
  // letterId가 박히기 전에 두 번째 save()가 들어오면 createDraft가 두 번 호출돼 편지가
  // 중복 생성될 수 있다. ref는 즉시 반영되므로 그 sub-frame 갭을 막는다.
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

    // 이미 저장 중이면 중복 호출을 무시(편지 중복 생성 방지).
    if (savingRef.current) return { ok: false, reason: 'error' };
    savingRef.current = true;

    // 무음 허용(앱과 동일): cue가 없으면 음악 없는 편지로 저장한다(CC0 자동첨부 제거).
    // 본문 → paragraphs 변환 (빈 줄 분리·빈 단락 제거·최소 1개, cue는 첫 단락에만).
    const paragraphs = bodyToParagraphs(body, cue);

    try {
      const input = { title, paragraphs, templateId };
      if (letterId) {
        await updateMutation.mutateAsync({ id: letterId, input });
      } else {
        await createMutation.mutateAsync(input);
      }
      return { ok: true };
    } catch (err) {
      setSaveError(err instanceof Error ? err : new Error(String(err)));
      return { ok: false, reason: 'error' };
    } finally {
      savingRef.current = false;
    }
  }, [title, isLoading, body, cue, templateId, letterId, createMutation, updateMutation]);

  return {
    draft: { letterId, title, body, templateId, cue },
    isLoading,
    isSaving,
    saveError,
    setTitle,
    setBody,
    setTemplateId,
    setCue,
    save,
  };
}
