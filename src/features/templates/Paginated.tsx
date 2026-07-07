// 긴 편지 모바일 페이지네이션 / 리더 컴포넌트.
// 단락 배열을 받아 세로 스크롤 기반으로 렌더한다.
// 가로 스크롤 0, 텍스트 클리핑 0 — 긴 본문이 모바일에서 안전하게 읽힌다.
// T8 Viewer가 재사용할 수 있도록 순수 props 기반 설계.

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Paginated.module.css';

/** 한 단락 텍스트를 개행(\n) 기준 줄로 나눈다. reveal 모드의 줄 단위 연출에 쓴다. */
function splitLines(text: string): string[] {
  return text.split('\n');
}

export interface PaginatedParagraph {
  /** 단락 고유 id — React key로 사용. 인덱스 key 금지(재정렬 보존). */
  id: string;
  /** 단락 본문 텍스트. */
  text: string;
  /** 단락에 부착된 임의 장식 노드 (음악 큐 아이콘 등). 선택적. */
  decoration?: ReactNode;
}

interface PaginatedProps {
  paragraphs: PaginatedParagraph[];
  /** 편지 제목. 없으면 렌더하지 않는다. */
  title?: string;
  /** 단락 ref 콜백 — T8 IntersectionObserver 싱크에서 사용. */
  onParagraphRef?: (id: string, el: HTMLElement | null) => void;
  /**
   * 스크롤 진입 시 단락을 한 줄씩(위에서 아래로) 페이드-하강으로 드러내는 연출.
   * 음악이 있는 편지를 연 뒤에만 켠다(무음/열기 전은 평소대로 즉시 표시).
   * 한 번 나타난 단락은 그대로 유지한다(스크롤 왕복 시 재생 안 함). reduced-motion 존중.
   */
  revealOnScroll?: boolean;
  /** 추가 className (선택). */
  className?: string;
}

export function Paginated({
  paragraphs,
  title,
  onParagraphRef,
  revealOnScroll = false,
  className,
}: PaginatedProps): React.ReactElement {
  const combinedClass = [styles.reader, revealOnScroll ? styles.revealMode : '', className]
    .filter(Boolean)
    .join(' ');

  // 본문 컨테이너 — reveal 관측 시 이 안의 단락([data-paragraph-id])을 질의한다.
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // reveal 연출: 편지를 연 뒤(revealOnScroll=true) 각 단락이 뷰포트에 들어오면
  // "위에서 아래로" 페이드-하강으로 한 번만 나타난다(스크롤 왕복 재생 없음).
  useEffect(() => {
    const container = bodyRef.current;
    if (!revealOnScroll || !container || typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(
      (entries) => {
        // 동시에 들어온 단락은 위→아래 순서로 계단식 지연을 줘 "한 줄씩" 등장을 또렷하게 한다.
        // (스크롤로 하나씩 들어오는 경우엔 i=0이라 지연 없이 즉시 재생된다.)
        const entering = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        entering.forEach((entry, i) => {
          const el = entry.target as HTMLElement;
          el.style.transitionDelay = `${Math.min(i, 12) * 70}ms`;
          el.classList.add(styles.revealed);
          io.unobserve(entry.target); // 한 번만 — 재생 반복 없음
        });
      },
      // 단락 상단이 살짝 들어오면 재생. 하단 여백으로 화면 진입 직후 자연스럽게 나타남.
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    const nodes = container.querySelectorAll<HTMLElement>('[data-reveal-line]');
    // 핵심: 숨김 상태(opacity 0)가 최소 한 프레임 "그려진 뒤"에 관측을 시작한다.
    // 즉시 관측하면 첫 화면(이미 보이는) 단락은 opacity 0이 페인트되기 전에 revealed가 붙어
    // 전환 시작 프레임이 없어 그냥 튀어나온다 — 첫 줄부터 연출되도록 이중 rAF로 페인트를 보장한다.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        nodes.forEach((el) => io.observe(el));
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      io.disconnect();
    };
  }, [revealOnScroll]);

  return (
    // overflow-x: hidden 으로 가로 클리핑 원천 차단.
    // overflow-y: auto + word-break: keep-all 로 세로 스크롤 기반 읽기.
    <article className={combinedClass} aria-label="편지 본문">
      {title && (
        <header className={styles.letterHeader}>
          <h1 className={styles.letterTitle}>{title}</h1>
          <hr className={styles.divider} />
        </header>
      )}

      <div className={styles.body} ref={bodyRef}>
        {paragraphs.map((para) => (
          <section
            key={para.id}
            className={styles.paragraph}
            // ref 콜백: T8 IntersectionObserver 싱크(onParagraphRef)에 위임. reveal 관측은
            // 상위 bodyRef 기준 querySelectorAll로 처리하므로 여기선 위임만 한다.
            ref={(el) => onParagraphRef?.(para.id, el)}
            data-paragraph-id={para.id}
          >
            {/* 장식 노드 (음악 큐 아이콘 등) — 텍스트 위에 배치 */}
            {para.decoration && (
              <div className={styles.decoration} aria-hidden="true">
                {para.decoration}
              </div>
            )}
            {/* 본문 — reveal 모드에선 줄(\n) 단위 블록으로 쪼개 각 줄을 개별 연출한다.
                (긴 단락도 아래쪽 줄이 화면에 들어올 때 나타나도록.) 그 외엔 통짜 텍스트. */}
            <p className={styles.text}>
              {revealOnScroll ? (
                splitLines(para.text).map((line, i) => (
                  <span key={i} className={styles.line} data-reveal-line>
                    {line === '' ? ' ' : line}
                  </span>
                ))
              ) : para.text ? (
                para.text
              ) : (
                // 빈 텍스트는 nbsp로 최소 높이 보장
                <span aria-hidden="true">&nbsp;</span>
              )}
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}
