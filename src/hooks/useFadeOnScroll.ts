import { useEffect, useRef, type RefObject } from 'react';

/**
 * useFadeOnScroll — IntersectionObserver 기반 스크롤 fade-in 훅.
 *
 * 사용법:
 *   const [ref0, ref1, ref2] = useFadeOnScroll<HTMLParagraphElement>(3);
 *   <p ref={ref0} className={styles.fadeItem}>단락 1</p>
 *
 * CSS: .fadeItem { opacity: 0; transform: translateY(20px); transition: ... }
 *      :global(.visible).fadeItem { opacity: 1; transform: none; }
 *
 * prefers-reduced-motion 환경에서는 즉시 visible 처리한다.
 * count는 렌더 간 변하지 않아야 한다 (Hook 규칙 준수). 최대 8개.
 */
export function useFadeOnScroll<T extends Element = Element>(
  count: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
): RefObject<T>[] {
  // Hook 규칙: 조건/루프 내 useRef 금지 → 최대 개수(8)를 고정 선언하고 slice로 반환.
  const r0 = useRef<T>(null);
  const r1 = useRef<T>(null);
  const r2 = useRef<T>(null);
  const r3 = useRef<T>(null);
  const r4 = useRef<T>(null);
  const r5 = useRef<T>(null);
  const r6 = useRef<T>(null);
  const r7 = useRef<T>(null);

  const allRefs: RefObject<T>[] = [r0, r1, r2, r3, r4, r5, r6, r7];
  const refs = allRefs.slice(0, count);

  useEffect(() => {
    // prefers-reduced-motion: reduce → 즉시 모두 visible.
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      refs.forEach((ref) => ref.current?.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.25 },
    );

    refs.forEach((ref) => {
      if (ref.current) observer.observe(ref.current);
    });

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return refs;
}
