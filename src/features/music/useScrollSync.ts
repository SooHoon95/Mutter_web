// useScrollSync — SyncEngine을 감싸는 React hook (T8 viewer가 사용).
//
// 단락 ref 배열 + cues를 받아 마운트 시 엔진을 attach하고, 언마운트 시 destroy한다
// (cleanup 필수 — IntersectionObserver disconnect + 소스 destroy).
// React에 노출하는 상태는 최소(현재 단락 index, isPlaying)로 제한한다(music-sync 원칙).

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MusicCue } from '@/data/types';
import { SyncEngine } from './SyncEngine';
import type { TrackSource } from './TrackSource';

export interface UseScrollSyncResult {
  /** 현재 활성 단락 index (-1 = 아직 진입 전). */
  activeIndex: number;
  /** 재생 중 여부(언락 이후 true). */
  isPlaying: boolean;
  /**
   * iOS 언락 트리거. **반드시 사용자 제스처(onClick 등) 핸들러에서 호출**해야 한다.
   * "편지 열기 ▶" 버튼이 이 함수를 호출한다(AudioUnlockGate).
   */
  unlock: () => Promise<void>;
}

/**
 * @param paragraphRefs 각 단락 DOM 노드 ref 배열. cues와 인덱스 1:1 대응.
 * @param cues          단락별 음악 큐(없는 단락은 undefined).
 * @param sourceFactory SyncEngine에 주입할 소스 팩토리(옵션). T8 viewer는 무음0 폴백
 *                      팩토리를 넘겨 SC 실패 시 CC0로 대체한다. 미지정 시 엔진 기본값(createSource).
 */
export function useScrollSync(
  paragraphRefs: React.RefObject<HTMLElement>[],
  cues: Array<MusicCue | undefined>,
  sourceFactory?: (cue: MusicCue) => TrackSource,
): UseScrollSyncResult {
  const engineRef = useRef<SyncEngine | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);

  // 엔진 생성 + attach. paragraphRefs/cues가 바뀌면 재구성한다.
  useEffect(() => {
    const elements = paragraphRefs
      .map((ref) => ref.current)
      .filter((el): el is HTMLElement => el !== null);

    // 아직 단락이 마운트되지 않았으면 대기(다음 렌더에서 재시도).
    if (elements.length === 0) return;

    const engine = new SyncEngine({
      onActiveChange: (index) => setActiveIndex(index),
      sourceFactory,
    });
    engine.attach(elements, cues);
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [paragraphRefs, cues, sourceFactory]);

  const unlock = useCallback(async () => {
    await engineRef.current?.unlockAll();
    setIsPlaying(true);
  }, []);

  return { activeIndex, isPlaying, unlock };
}
