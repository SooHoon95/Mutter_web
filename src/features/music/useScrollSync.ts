// useScrollSync — SyncEngine을 감싸는 React hook (T8 viewer가 사용).
//
// 단일트랙 모델: cues에서 첫 유효 cue 1곡을 골라 마운트 시 엔진을 attach(preload)하고,
// 게이트 언락(▶) 시 처음부터 재생한다. 스크롤 동기(IntersectionObserver)는 제거됐다.
// 언마운트 시 destroy한다(cleanup 필수 — 소스 destroy).
// React에 노출하는 상태는 최소(isPlaying)로 제한한다(music-sync 원칙).

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MusicCue } from '@/data/types';
import { SyncEngine } from './SyncEngine';
import type { TrackSource } from './TrackSource';

export interface UseScrollSyncResult {
  /** 재생 중 여부(언락 후 && 일시정지 아님). */
  isPlaying: boolean;
  /**
   * iOS 언락 트리거. **반드시 사용자 제스처(onClick 등) 핸들러에서 호출**해야 한다.
   * "편지 열기 ▶" 버튼이 이 함수를 호출한다(AudioUnlockGate).
   */
  unlock: () => Promise<void>;
  /** 상단 플레이어: 재생/일시정지 토글. */
  togglePlay: () => void;
}

/**
 * @param cues          편지의 음악 큐 배열. 여기서 첫 유효 cue 1개만 재생한다.
 * @param sourceFactory SyncEngine에 주입할 소스 팩토리(옵션). T8 viewer는 무음0 폴백
 *                      팩토리를 넘겨 SC 실패 시 CC0로 대체한다. 미지정 시 엔진 기본값(createSource).
 */
export function useScrollSync(
  cues: Array<MusicCue | undefined>,
  sourceFactory?: (cue: MusicCue) => TrackSource,
): UseScrollSyncResult {
  const engineRef = useRef<SyncEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 엔진 생성 + attach(단일 소스 preload). cues가 바뀌면 재구성한다.
  useEffect(() => {
    const engine = new SyncEngine({ sourceFactory });
    engine.attach(cues);
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [cues, sourceFactory]);

  const unlock = useCallback(async () => {
    // 실제로 트랙이 재생 시작됐을 때만 "재생 중"으로 표시한다.
    // 소스가 없거나 실패하면 false → 거짓 재생 UI를 막는다.
    const started = (await engineRef.current?.unlockAll()) ?? false;
    setIsPlaying(started);
  }, []);

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.paused) {
      engine.resume();
      setIsPlaying(true);
    } else {
      engine.pause();
      setIsPlaying(false);
    }
  }, []);

  return { isPlaying, unlock, togglePlay };
}
