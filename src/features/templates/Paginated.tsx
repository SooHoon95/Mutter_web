// 긴 편지 모바일 페이지네이션 / 리더 컴포넌트.
// 단락 배열을 받아 세로 스크롤 기반으로 렌더한다.
// 가로 스크롤 0, 텍스트 클리핑 0 — 긴 본문이 모바일에서 안전하게 읽힌다.
// T8 Viewer가 재사용할 수 있도록 순수 props 기반 설계.

import type { ReactNode } from 'react';
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
  /** 추가 className (선택). */
  className?: string;
}

export function Paginated({
  paragraphs,
  title,
  onParagraphRef,
  className,
}: PaginatedProps): React.ReactElement {
  const combinedClass = [styles.reader, className].filter(Boolean).join(' ');

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
            // ref 콜백: T8 IntersectionObserver가 스크롤 위치를 추적할 수 있도록.
            ref={(el) => onParagraphRef?.(para.id, el)}
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
