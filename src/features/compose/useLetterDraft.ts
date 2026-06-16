// 편지 초안 상태 관리 hook. pwa-architecture 스킬 참조.
// 초안 CRUD는 react-query 뮤테이션으로 처리하고,
// 단락·큐 편집은 로컬 useState로 유지한다.

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createDraft, updateLetter } from '@/data/letters';
import type { Paragraph, MusicCue } from '@/data/types';

// ---------------------------------------------------------------------------
// 공개 타입
// ---------------------------------------------------------------------------

export interface DraftState {
  letterId: string | null;
  title: string;
  templateId: string;
  paragraphs: Paragraph[];
}

export interface UseLetterDraftReturn {
  draft: DraftState;
  isSaving: boolean;
  saveError: Error | null;
  setTitle: (title: string) => void;
  setTemplateId: (id: string) => void;
  addParagraph: () => void;
  updateParagraphText: (id: string, text: string) => void;
  deleteParagraph: (id: string) => void;
  moveParagraph: (id: string, direction: 'up' | 'down') => void;
  setCue: (paragraphId: string, cue: MusicCue | undefined) => void;
  save: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// 단락 ID 생성 (안정적 유일 키)
// ---------------------------------------------------------------------------

function newParagraphId(): string {
  // crypto.randomUUID는 브라우저 환경에서 항상 사용 가능
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
  const [templateId, setTemplateId] = useState<string>(initialTemplateId);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([
    // 초기 단락 1개 제공 — 빈 편지로 시작하지 않는다
    { id: newParagraphId(), order: 0, text: '' },
  ]);
  const [saveError, setSaveError] = useState<Error | null>(null);

  // ── 뮤테이션: 신규 초안 생성 ──────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => createDraft({ title, paragraphs, templateId }),
    onSuccess: (letter) => {
      setLetterId(letter.id);
      // 내가 보낸 편지 목록 캐시 무효화
      void queryClient.invalidateQueries({ queryKey: ['letters', 'mine'] });
    },
  });

  // ── 뮤테이션: 기존 초안 업데이트 ──────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (id: string) => updateLetter(id, { title, paragraphs, templateId }),
    onSuccess: (letter) => {
      void queryClient.invalidateQueries({ queryKey: ['letters', letter.id] });
      void queryClient.invalidateQueries({ queryKey: ['letters', 'mine'] });
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ── 단락 편집 액션 ─────────────────────────────────────────────────────────

  const addParagraph = useCallback(() => {
    setParagraphs((prev) => {
      const nextOrder = prev.length;
      return [...prev, { id: newParagraphId(), order: nextOrder, text: '' }];
    });
  }, []);

  const updateParagraphText = useCallback((id: string, text: string) => {
    setParagraphs((prev) => prev.map((p) => (p.id === id ? { ...p, text } : p)));
  }, []);

  const deleteParagraph = useCallback((id: string) => {
    setParagraphs((prev) => {
      // 마지막 단락은 삭제 불가 — 편지는 최소 1단락 필요
      if (prev.length <= 1) return prev;
      return prev.filter((p) => p.id !== id).map((p, idx) => ({ ...p, order: idx }));
    });
  }, []);

  const moveParagraph = useCallback((id: string, direction: 'up' | 'down') => {
    setParagraphs((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx === -1) return prev;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;

      const next = [...prev];
      // 스왑 — 안정적 id 기반 key로 재정렬 보존
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next.map((p, i) => ({ ...p, order: i }));
    });
  }, []);

  const setCue = useCallback((paragraphId: string, cue: MusicCue | undefined) => {
    setParagraphs((prev) =>
      prev.map((p) => (p.id === paragraphId ? { ...p, cue } : p)),
    );
  }, []);

  // ── 저장 ──────────────────────────────────────────────────────────────────

  const save = useCallback(async () => {
    setSaveError(null);
    try {
      if (letterId) {
        await updateMutation.mutateAsync(letterId);
      } else {
        await createMutation.mutateAsync();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [letterId, createMutation, updateMutation]);

  return {
    draft: { letterId, title, templateId, paragraphs },
    isSaving,
    saveError,
    setTitle,
    setTemplateId,
    addParagraph,
    updateParagraphText,
    deleteParagraph,
    moveParagraph,
    setCue,
    save,
  };
}
