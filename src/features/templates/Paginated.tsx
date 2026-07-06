// 긴 편지 모바일 페이지네이션 / 리더 컴포넌트.
// 단락 배열을 받아 세로 스크롤 기반으로 렌더한다.
// 가로 스크롤 0, 텍스트 클리핑 0 — 긴 본문이 모바일에서 안전하게 읽힌다.
// T8 Viewer가 재사용할 수 있도록 순수 props 기반 설계.

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import styles from './Paginated.module.css';

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

  // reveal 연출용 IntersectionObserver. 단락이 뷰포트에 들어오면 revealed 클래스를 붙이고
  // 즉시 unobserve해 "한 번만" 재생한다. revealOnScroll이 켜질 때(편지 열람) 생성된다.
  const observerRef = useRef<IntersectionObserver | null>(null);
  // 마운트된 단락 노드 추적 — 관측자 생성 전 마운트된 노드도 뒤늦게 관측하기 위함.
  const nodesRef = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    if (!revealOnScroll || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealed);
            io.unobserve(entry.target); // 한 번만 — 재생 반복 없음
          }
        }
      },
      // 단락 상단이 살짝 들어오면 재생. 하단 여백으로 화면 진입 직후 자연스럽게 나타남.
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    observerRef.current = io;
    // 관측자 생성 전에 이미 마운트된 단락들을 관측 등록.
    nodesRef.current.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      observerRef.current = null;
    };
  }, [revealOnScroll]);

  // 단락 노드 등록 — onParagraphRef 위임 + reveal 관측 등록/해제.
  const registerNode = useCallback(
    (el: HTMLElement | null, id: string) => {
      onParagraphRef?.(id, el);
      const map = nodesRef.current;
      if (el) {
        map.set(id, el);
        observerRef.current?.observe(el); // 관측자가 이미 있으면 즉시 관측
      } else {
        const prev = map.get(id);
        if (prev) observerRef.current?.unobserve(prev);
        map.delete(id);
      }
    },
    [onParagraphRef],
  );

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

      <div className={styles.body}>
        {paragraphs.map((para) => (
          <section
            key={para.id}
            className={styles.paragraph}
            // ref 콜백: onParagraphRef 위임 + reveal 연출 관측 등록.
            ref={(el) => registerNode(el, para.id)}
            data-paragraph-id={para.id}
          >
            {/* 장식 노드 (음악 큐 아이콘 등) — 텍스트 위에 배치 */}
            {para.decoration && (
              <div className={styles.decoration} aria-hidden="true">
                {para.decoration}
              </div>
            )}
            {/* 본문 — 빈 단락도 최소 높이를 가져 읽기 리듬 유지 */}
            <p className={styles.text}>
              {para.text || (
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
