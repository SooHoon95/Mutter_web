// LetterView — 수신 편지 본문 + 음악 1곡 재생 (T8 viewer 통합 지점).
//
// 합치는 것: T6 템플릿(TemplateThemed/Paginated) + 음악(useScrollSync/SyncEngine) +
// T8 무음0 폴백(fallbackSourceFactory) + license-compliance 크레딧(Credits).
//
// 모델(단일트랙): 편지는 음악 1곡만 가진다. cues에서 첫 유효 cue 1개를 골라
// 게이트 언락(▶) 시점에 처음부터 재생한다. 단락 스크롤로 곡이 바뀌거나 seek되지 않는다.
//
// 흐름:
//  1) 본문 단락 DOM을 먼저 렌더한다(스크린리더 텍스트 레이어).
//  2) AudioUnlockGate가 본문 위를 덮는다(façade). 이 게이트 전엔 오디오/iframe 소스가
//     생성되지 않는다 — 소스는 attach 시 preload되고 unlock() 시점에 재생된다.
//  3) "편지 열기 ▶" 단일 클릭 핸들러 안에서 동기적으로 useScrollSync.unlock()을 호출한다
//     (iOS 오디오 정책 — music-sync). 이후 음악 1곡이 끝까지 재생된다.
//
// 접근성: article/section/p 시맨틱 마크업(Paginated)이 스크린리더 텍스트 레이어를 보장한다.
// 죽은 임베드여도 본문은 항상 표시된다(폴백이 무음0을 보장하고, 본문 렌더는 음악과 독립).

import { useEffect, useMemo, useRef, useState } from 'react';
import { TemplateThemed, Paginated, type PaginatedParagraph } from '@/features/templates';
import { useScrollSync } from '@/features/music';
import { setSoundCloudContainer } from '@/features/music/SoundCloudSource';
import { SaveToInboxButton } from '@/features/inbox';
import type { ViewerLetter } from './useLetterViewer';
import { recordLetterOpen } from '@/data/links';
import { createFallbackSourceFactory } from './fallbackSourceFactory';
import { AudioUnlockGate } from './AudioUnlockGate';
import { Credits } from './Credits';
import { Footer } from '@/components/Footer';
import styles from './LetterView.module.css';

interface LetterViewProps {
  letter: ViewerLetter;
  /** 수신 토큰 — 로그인 수신자가 받은 편지함에 저장할 때 사용. */
  token?: string;
}

export function LetterView({ letter, token }: LetterViewProps): React.ReactElement {
  const { title, templateId, paragraphs, cues, audioDisabled } = letter;

  // 게이트 통과(언락) 여부. 통과 전엔 게이트가 본문을 덮는다(오디오 façade).
  const [unlocked, setUnlocked] = useState(false);

  // 무음0 폴백 팩토리 — SC 실패 시 CC0로 대체. 마운트 동안 안정적이어야 하므로 ref로 고정.
  const sourceFactoryRef = useRef(createFallbackSourceFactory());

  // SC iframe을 붙일 본문 내 숨김 호스트. document.body 직속이 아니라 viewer 트리 안에
  // 두어야 iOS PWA 풀스크린에서 Widget postMessage 채널이 끊기지 않는다(무음 방지).
  const scHostRef = useRef<HTMLDivElement | null>(null);

  // 호스트를 SoundCloudSource 전역 기본 컨테이너로 등록한다. 언마운트 시 해제.
  useEffect(() => {
    setSoundCloudContainer(scHostRef.current);
    return () => setSoundCloudContainer(null);
  }, []);

  // 읽음 확인(0017): 수신자가 편지를 "실제로 연" 순간을 한 번만 기록한다.
  //   - 일반 편지: 게이트 "편지 열기 ▶" 통과(unlocked) 시점 = 진짜 열람.
  //   - audioDisabled(권리자 비활성화) 편지: 게이트가 없으므로 마운트 즉시 본문 노출 = 열람.
  // token이 없으면(미리보기 등) 기록하지 않는다. fire-and-forget — 실패해도 무시.
  const openRecordedRef = useRef(false);
  useEffect(() => {
    if (openRecordedRef.current) return;
    if (!token) return;
    if (unlocked || audioDisabled) {
      openRecordedRef.current = true;
      void recordLetterOpen(token);
    }
  }, [token, unlocked, audioDisabled]);

  // T9: 오디오 비활성화 상태면 빈 큐 배열을 엔진에 전달해 오디오를 마운트하지 않는다.
  // useScrollSync 훅은 항상 호출해야 하므로(React 훅 규칙), 빈 배열로 no-op 실행.
  // useMemo로 참조를 안정화해야 useScrollSync의 엔진 생성 effect가 매 렌더(언락 탭 포함)마다
  // 재실행되지 않는다 — 그렇지 않으면 언락 직후 엔진이 파괴·재생성되며 오디오가 즉시 끊긴다.
  const effectiveCues = useMemo(() => (audioDisabled ? [] : cues), [audioDisabled, cues]);

  const { isPlaying, unlock, togglePlay } = useScrollSync(
    effectiveCues,
    sourceFactoryRef.current,
  );

  // 음악 큐가 하나라도 있는지 — 상단 플레이어 노출 여부.
  const hasMusic = !audioDisabled && cues.some((c) => c != null);

  function handleUnlock(): Promise<void> {
    // audioDisabled 상태에서는 언락 게이트를 건너뛰므로 이 함수는 호출되지 않는다.
    setUnlocked(true);
    return unlock();
  }

  // Paginated에 넘길 단락 표현. 단일트랙 모델에선 단락별 음악 데코레이션이 없다.
  const paginatedParagraphs: PaginatedParagraph[] = paragraphs.map((p) => ({
    id: p.id,
    text: p.text,
  }));

  return (
    <TemplateThemed templateId={templateId} className={styles.themed}>
      {/*
        SC iframe 부착 호스트. 본문 트리 안에 두되 시각적으로 숨긴다(display:none 금지 —
        일부 브라우저에서 iframe 렌더/오디오가 멈춘다). document.body 직속이 아니라 여기에
        mount해야 iOS PWA 풀스크린에서 Widget postMessage 채널이 유지된다(무음 방지).
      */}
      <div ref={scHostRef} className={styles.scHost} aria-hidden="true" />

      {/* 상단 고정 음악 플레이어 — 언락 후 노출. 재생 중 표시 + 일시정지/재생 토글. */}
      {hasMusic && unlocked && (
        <div className={styles.player} role="region" aria-label="음악 플레이어">
          <button
            type="button"
            className={styles.playerToggle}
            onClick={togglePlay}
            aria-label={isPlaying ? '음악 일시정지' : '음악 재생'}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <span className={`${styles.playerBars} ${isPlaying ? '' : styles.playerBarsPaused}`} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className={styles.playerLabel}>
            {isPlaying ? '음악 재생 중' : '일시정지됨'}
          </span>
        </div>
      )}

      {/* 본문은 항상 렌더된다(스크린리더 텍스트 레이어 + 죽은 임베드여도 본문 표시). */}
      <Paginated
        paragraphs={paginatedParagraphs}
        title={title}
        className={styles.reader}
      />

      {/* CC-BY 크레딧 — 미렌더 시 침해(license-compliance). 본문 하단에 항상 표기. */}
      <Credits cues={cues} />

      {/* 로그인한 수신자에게만 보이는 받은 편지함 저장 버튼. 비로그인 시 null 반환(무마찰 유지). */}
      {token !== undefined && <SaveToInboxButton token={token} />}

      {/* T9: 저작권 신고 링크 + 이용 약관 (수신 뷰 하단) */}
      <Footer />

      {/*
        T9: 권리주장자 요청으로 오디오가 비활성화된 경우.
        본문은 유지되고 AudioUnlockGate 대신 안내 배너를 표시한다.
        이 상태는 "무음 편지 0" 원칙의 예외가 아니라 별도 법적 비활성화 상태이다.
      */}
      {audioDisabled ? (
        <p className={styles.audioDisabledNotice} role="note">
          권리자의 요청으로 이 편지의 음악이 비활성화되었습니다.
        </p>
      ) : (
        /* 게이트: 언락 전까지 본문 위를 덮는다. 편지 테마로 스타일링된 "표지". */
        !unlocked && (
          <AudioUnlockGate title={title} templateId={templateId} onUnlock={handleUnlock} />
        )
      )}
    </TemplateThemed>
  );
}
