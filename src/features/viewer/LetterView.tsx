// LetterView — 수신 편지 본문 + 스크롤 동기 재생 (T8 viewer 통합 지점).
//
// 합치는 것: T6 템플릿(TemplateThemed/Paginated) + T4 음악(useScrollSync/SyncEngine) +
// T8 무음0 폴백(fallbackSourceFactory) + license-compliance 크레딧(Credits).
//
// 흐름:
//  1) 본문 단락 DOM을 먼저 렌더한다(IntersectionObserver가 붙을 대상 + 스크린리더 텍스트 레이어).
//  2) AudioUnlockGate가 본문 위를 덮는다(façade). 이 게이트 전엔 오디오/iframe 소스가
//     생성되지 않는다 — 소스는 unlockAll() 시점에 비로소 mount된다(콜드 예산 <3s/4G).
//  3) "편지 열기 ▶" 단일 클릭 핸들러 안에서 동기적으로 useScrollSync.unlock()을 호출한다
//     (iOS 오디오 정책 — music-sync). 이후 스크롤하면 단락 큐로 음악이 차오른다.
//
// 접근성: article/section/p 시맨틱 마크업(Paginated)이 스크린리더 텍스트 레이어를 보장한다.
// 죽은 임베드여도 본문은 항상 표시된다(폴백이 무음0을 보장하고, 본문 렌더는 음악과 독립).

import { useMemo, useRef, useState, createRef } from 'react';
import { TemplateThemed, Paginated, type PaginatedParagraph } from '@/features/templates';
import { useScrollSync } from '@/features/music';
import { SaveToInboxButton } from '@/features/inbox';
import type { ViewerLetter } from './useLetterViewer';
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

  // 단락 DOM ref 배열 — paragraphs와 인덱스 1:1. useScrollSync가 IntersectionObserver를 건다.
  // letter.paragraphs는 로드 후 불변이므로 길이가 안정적 → ref 배열을 한 번만 생성한다.
  const paragraphRefs = useMemo(
    () => paragraphs.map(() => createRef<HTMLElement>()),
    [paragraphs],
  );

  // 무음0 폴백 팩토리 — SC 실패 시 CC0로 대체. 마운트 동안 안정적이어야 하므로 ref로 고정.
  const sourceFactoryRef = useRef(createFallbackSourceFactory());

  // T9: 오디오 비활성화 상태면 빈 큐 배열을 엔진에 전달해 오디오를 마운트하지 않는다.
  // useScrollSync 훅은 항상 호출해야 하므로(React 훅 규칙), 빈 배열로 no-op 실행.
  const effectiveCues = audioDisabled ? [] : cues;

  const { activeIndex, unlock } = useScrollSync(
    paragraphRefs,
    effectiveCues,
    sourceFactoryRef.current,
  );

  function handleUnlock(): Promise<void> {
    // audioDisabled 상태에서는 언락 게이트를 건너뛰므로 이 함수는 호출되지 않는다.
    setUnlocked(true);
    return unlock();
  }

  // Paginated에 넘길 단락 표현. decoration으로 현재 재생 중 단락에 음표 표시.
  // audioDisabled 상태에서는 음표 데코레이션도 표시하지 않는다.
  const paginatedParagraphs: PaginatedParagraph[] = paragraphs.map((p, index) => ({
    id: p.id,
    text: p.text,
    decoration:
      cues[index] && unlocked && !audioDisabled ? (
        <span
          className={index === activeIndex ? styles.cueActive : styles.cue}
          title="이 단락에서 음악이 재생됩니다"
        >
          ♪
        </span>
      ) : undefined,
  }));

  function handleParagraphRef(id: string, el: HTMLElement | null): void {
    const index = paragraphs.findIndex((p) => p.id === id);
    if (index >= 0) {
      // RefObject.current는 readonly 타입이지만 ref 콜백에서 채우는 표준 패턴.
      (paragraphRefs[index] as React.MutableRefObject<HTMLElement | null>).current = el;
    }
  }

  return (
    <TemplateThemed templateId={templateId} className={styles.themed}>
      {/* 본문은 항상 렌더된다(스크린리더 텍스트 레이어 + 죽은 임베드여도 본문 표시). */}
      <Paginated
        paragraphs={paginatedParagraphs}
        title={title}
        onParagraphRef={handleParagraphRef}
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
        /* 게이트: 언락 전까지 본문 위를 덮는다. 오디오/iframe은 이 클릭 이후에만 mount. */
        !unlocked && <AudioUnlockGate title={title} onUnlock={handleUnlock} />
      )}
    </TemplateThemed>
  );
}
