// useLetterViewer — 수신 편지 로드 상태 머신 (T8 viewer).
//
// openByToken(token, password)을 호출해 편지 본문을 가져온다.
// 인증에 의존하지 않는다(인코그니토 OK — capability-links: 토큰/암호로만 통제).
// 마이그레이션 0011: claim-and-bind 제거 — getDeviceId() 호출 삭제.
//
// 상태 전이:
//   idle/loading → ready                 (성공)
//                → needPassword           (암호 필요: 첫 시도가 암호 없이 실패)
//                → error(정규화 메시지)    (revoke/expiry/not-found 등)
//
// 암호 필요 판단: 첫 시도(암호 없이)가 "암호가 올바르지 않습니다." 로 정규화돼 돌아오면
// 그 링크는 암호 보호된 것으로 보고 PasswordGate를 띄운다. 사용자가 암호를 넣으면
// submitPassword(pw)로 재시도한다(같은 openByToken 경로).

import { useState, useEffect, useCallback, useRef } from 'react';
import { openByToken, LinkNotYetError } from '@/data/links';
import type { MusicCue, Paragraph } from '@/data/types';

// ---------------------------------------------------------------------------
// 공개 타입
// ---------------------------------------------------------------------------

/** 뷰어가 렌더에 쓰는 정규화된 편지 데이터. */
export interface ViewerLetter {
  id: string;
  title: string;
  templateId: string;
  paragraphs: Paragraph[];
  /** paragraphs와 인덱스 1:1 대응하는 큐 배열(없는 단락은 undefined). */
  cues: Array<MusicCue | undefined>;
  /**
   * T9: 권리주장자 takedown 통지로 오디오가 비활성화된 경우 true.
   * true이면 LetterView가 오디오를 마운트/재생하지 않고 본문만 표시한다.
   * "무음 편지 0" 원칙과는 별개 — 이건 법적 비활성화 상태이므로
   * 사용자에게 명확히 안내한다.
   */
  audioDisabled: boolean;
}

export type ViewerStatus = 'loading' | 'needPassword' | 'notYet' | 'error' | 'ready';

export interface UseLetterViewerResult {
  status: ViewerStatus;
  /** status==='ready'일 때만 채워진다. */
  letter: ViewerLetter | null;
  /** status==='error'일 때 사용자 메시지(정규화됨). */
  errorMessage: string | null;
  /** status==='notYet'일 때 공개 가능 시각(ISO8601). 예약 공개(0018). */
  revealAt: string | null;
  /** 암호 재시도 중 여부(PasswordGate 버튼 비활성화용). */
  submitting: boolean;
  /** 암호 입력 후 재시도. needPassword 상태에서 PasswordGate가 호출한다. */
  submitPassword: (password: string) => void;
}

// 첫 시도가 암호 없이 실패했을 때 "암호 필요"로 해석할 정규화 메시지.
// links.ts normalizeOpenError가 WRONG_PASSWORD → 이 문구로 변환한다.
const WRONG_PASSWORD_MESSAGE = '암호가 올바르지 않습니다.';

// ---------------------------------------------------------------------------
// 페이로드 정규화 (LetterPayload의 paragraphs/cues는 unknown)
// ---------------------------------------------------------------------------

/** unknown → Paragraph[] 좁히기. 형태가 안 맞는 항목은 안전한 기본값으로 채운다. */
function normalizeParagraphs(raw: unknown): Paragraph[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index): Paragraph => {
    const p = (item ?? {}) as Partial<Paragraph>;
    return {
      id: typeof p.id === 'string' ? p.id : `p-${index}`,
      order: typeof p.order === 'number' ? p.order : index,
      text: typeof p.text === 'string' ? p.text : '',
      cue: normalizeCue(p.cue),
    };
  });
}

/** 단일 cue를 좁힌다. 형태가 안 맞으면 undefined(음악 변화 없음). */
function normalizeCue(raw: unknown): MusicCue | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<MusicCue>;
  if (c.sourceType !== 'soundcloud' && c.sourceType !== 'hosted') return undefined;
  if (typeof c.ref !== 'string') return undefined;
  return {
    sourceType: c.sourceType,
    ref: c.ref,
    startMs: typeof c.startMs === 'number' ? c.startMs : undefined,
    // 크레딧/출처 표기용 메타 보존(없으면 undefined) — 없으면 뷰어가 폴백 처리.
    title: typeof c.title === 'string' ? c.title : undefined,
    author: typeof c.author === 'string' ? c.author : undefined,
    sourceUrl: typeof c.sourceUrl === 'string' ? c.sourceUrl : undefined,
  };
}

/**
 * paragraphs와 cues를 정규화하고 인덱스 정렬한다.
 * - cues가 별도 배열로 오면 그것을, 없으면 각 단락의 cue 필드를 사용한다.
 * - 항상 paragraphs와 길이가 같은 cue 배열을 반환(인덱스 1:1, 없는 칸 undefined).
 * - T9: audioDisabled가 true이면 ViewerLetter에 그대로 전달한다.
 */
function normalizeLetter(payload: {
  id: string;
  title: string;
  templateId: string;
  paragraphs: unknown;
  cues: unknown;
  audioDisabled: boolean;
}): ViewerLetter {
  const paragraphs = normalizeParagraphs(payload.paragraphs);

  // 별도 cues 배열이 "비어있지 않게" 제공되면 우선 사용한다.
  // 빈 배열([])은 "별도 큐 트랙 미제공"을 뜻하므로 단락별 cue 필드를 권위로 삼는다.
  const cuesFromPayload =
    Array.isArray(payload.cues) && payload.cues.length > 0
      ? payload.cues.map((c) => normalizeCue(c))
      : null;

  const cues: Array<MusicCue | undefined> = paragraphs.map((p, i) =>
    cuesFromPayload ? cuesFromPayload[i] : p.cue,
  );

  return {
    id: payload.id,
    title: payload.title,
    templateId: payload.templateId,
    paragraphs,
    cues,
    audioDisabled: payload.audioDisabled,
  };
}

// ---------------------------------------------------------------------------
// hook 구현
// ---------------------------------------------------------------------------

export function useLetterViewer(token: string | undefined): UseLetterViewerResult {
  const [status, setStatus] = useState<ViewerStatus>('loading');
  const [letter, setLetter] = useState<ViewerLetter | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revealAt, setRevealAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 마지막 시도가 암호 없이였는지 추적 — WRONG_PASSWORD가 오면 needPassword로 전이.
  const triedWithoutPassword = useRef(false);
  // 언마운트 후 setState 방지(비동기 응답 레이스).
  const aliveRef = useRef(true);

  const attempt = useCallback(
    async (password: string | undefined) => {
      if (!token) {
        setStatus('error');
        setErrorMessage('링크를 찾을 수 없습니다.');
        return;
      }

      triedWithoutPassword.current = password === undefined;
      try {
        const payload = await openByToken(token, password);
        if (!aliveRef.current) return;
        setLetter(normalizeLetter(payload));
        setStatus('ready');
        setErrorMessage(null);
      } catch (err) {
        if (!aliveRef.current) return;
        // 0018 예약 공개: 아직 열 수 없는 편지 → 봉인 화면(공개 시각 표시).
        if (err instanceof LinkNotYetError) {
          setRevealAt(err.revealAt);
          setStatus('notYet');
          setErrorMessage(null);
          return;
        }
        const message = err instanceof Error ? err.message : '편지를 불러올 수 없습니다.';
        // 암호 없이 시도했는데 암호 오류가 나면 → 암호 보호된 링크. PasswordGate로.
        if (triedWithoutPassword.current && message === WRONG_PASSWORD_MESSAGE) {
          setStatus('needPassword');
          setErrorMessage(null);
        } else {
          setStatus('error');
          setErrorMessage(message);
        }
      } finally {
        if (aliveRef.current) setSubmitting(false);
      }
    },
    [token],
  );

  // 최초 로드: 암호 없이 1회 시도.
  useEffect(() => {
    aliveRef.current = true;
    setStatus('loading');
    void attempt(undefined);
    return () => {
      aliveRef.current = false;
    };
  }, [attempt]);

  const submitPassword = useCallback(
    (password: string) => {
      setSubmitting(true);
      void attempt(password);
    },
    [attempt],
  );

  return { status, letter, errorMessage, revealAt, submitting, submitPassword };
}
