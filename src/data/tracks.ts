// CC0/RF 카탈로그 데이터 레이어.
// 현재는 정적 JSON 기반 — DB 연동은 supabase-data 스킬에서 추후 추가.
// 모든 트랙은 ingestTrack 게이트를 통과해야 getCatalog()에서 반환된다.

import type { Track } from '@/data/types';
import { ingestTrack } from '@/lib/licenseGate';
import rawTracks from '@/data/catalog/tracks.json';

// tracks.json의 각 항목은 Track + mood 필드를 가진다.
// mood는 도메인 Track 타입에 없는 UI 힌트 — 카탈로그 레이어에서만 사용.
interface CatalogEntry extends Track {
  mood?: string;
  _note?: string; // 시드 메타 주석 — 런타임에는 무시
}

// ---------------------------------------------------------------------------
// 내부: JSON 로드 + 게이트 통과
// ---------------------------------------------------------------------------

/**
 * tracks.json을 로드해 각 트랙을 ingestTrack 게이트로 검증한다.
 * 게이트 실패는 시드 큐레이션 오류이므로 조용히 삼키지 않는다 — 개발 중엔 즉시 throw.
 * 카탈로그가 비면 "무음 편지 0" 원칙이 깨지므로(폴백 음원 소실) 빈 결과도 에러로 막는다.
 */
function loadCatalog(): CatalogEntry[] {
  const result: CatalogEntry[] = [];

  for (const raw of rawTracks as CatalogEntry[]) {
    try {
      const track = ingestTrack(raw as Track) as CatalogEntry;
      // mood는 ingestTrack 통과 후 그대로 보존
      track.mood = raw.mood;
      result.push(track);
    } catch (err) {
      const message = `[tracks] ingestTrack 거부: ${(err as Error).message}`;
      console.error(message);
      // 개발 환경에서는 시드 오류를 즉시 인지하도록 실패시킨다.
      if (import.meta.env.DEV) throw new Error(message);
    }
  }

  // "무음 편지 0": CC0 폴백 카탈로그는 절대 비어선 안 된다.
  if (result.length === 0) {
    throw new Error('[tracks] 카탈로그가 비어 있습니다 — CC0 폴백 음원 소실(무음 편지 0 위반)');
  }

  return result;
}

// 모듈 초기화 시 한 번만 로드 + 검증 (정적 JSON이므로 캐싱 적합)
const CATALOG: CatalogEntry[] = loadCatalog();

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/** 게이트를 통과한 전체 CC0/RF 카탈로그를 반환한다. */
export function getCatalog(): Track[] {
  return CATALOG;
}

/** id로 특정 트랙을 조회한다. 없으면 undefined. */
export function getTrackById(id: string): Track | undefined {
  return CATALOG.find((t) => t.id === id);
}

/**
 * 무드별 트랙 목록을 반환한다.
 * mood는 CatalogEntry 확장 필드이므로 여기서만 사용하고 Track 타입 밖으로 새지 않는다.
 */
export function getCatalogByMood(mood: string): Track[] {
  return CATALOG.filter((t) => t.mood === mood);
}
