// CC0/RF 카탈로그 hook.
// 현재는 정적 JSON 기반이므로 비동기 로딩 없이 동기 반환.
// DB 연동 시 react-query useQuery로 교체 예정.

import { useState, useMemo } from 'react';
import type { Track } from '@/data/types';
import { getCatalog, getCatalogByMood } from '@/data/tracks';

/** 사용 가능한 무드 목록 — tracks.json의 mood 값 집합. */
export const MOODS = ['잔잔', '따뜻', '그리움', '설렘'] as const;
export type Mood = (typeof MOODS)[number];

interface UseCatalogReturn {
  /** 현재 선택된 무드 (undefined = 전체) */
  selectedMood: Mood | undefined;
  /** 무드 선택 변경 */
  setMood: (mood: Mood | undefined) => void;
  /** 현재 필터에 맞는 트랙 목록 */
  tracks: Track[];
  /** 전체 카탈로그 */
  allTracks: Track[];
}

export function useCatalog(): UseCatalogReturn {
  const [selectedMood, setMood] = useState<Mood | undefined>(undefined);

  const allTracks = useMemo(() => getCatalog(), []);

  const tracks = useMemo(() => {
    if (!selectedMood) return allTracks;
    return getCatalogByMood(selectedMood);
  }, [selectedMood, allTracks]);

  return { selectedMood, setMood, tracks, allTracks };
}
