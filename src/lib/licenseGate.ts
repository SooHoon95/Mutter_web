// 라이선스 ingestion 게이트. license-compliance 스킬 참조.
// "반쯤 만든 safe harbor는 없느니만 못하다" — 이 파일이 카탈로그 진입의 유일한 관문.
// 순수 함수만: React·Supabase·DOM 비의존. vitest 단위 테스트 1순위.

import type { LicenseKind, Provenance, Track } from '@/data/types';

// ---------------------------------------------------------------------------
// 화이트리스트 / 하드밴
// ---------------------------------------------------------------------------

/** 통과 가능 라이선스 목록. 이 외의 모든 값은 하드밴. */
const LICENSE_WHITELIST: ReadonlySet<LicenseKind> = new Set<LicenseKind>([
  'CC0',
  'PD',
  'CC-BY',
  'VENDOR_RF',
]);

/**
 * 라이선스 문자열에 하드밴 키워드(NC/ND)가 포함되어 있는지 검사.
 * CC-BY-NC, CC-BY-ND, CC-BY-NC-ND 등 모든 변형을 잡는다.
 *
 * 주의: 단순 substring 검색 대신 단어 경계(하이픈·언더스코어·문자열 끝)로 구분.
 * "VENDOR_RF" → "ND"가 "VE-ND-OR" 안에 있어 오탐할 수 있으므로
 * CC 라이선스 표기 규약에 맞게 하이픈 구분자 기반으로 검사한다.
 */
function containsBannedTerm(license: string): boolean {
  // CC 라이선스는 항상 하이픈으로 구성 요소를 구분한다 (예: CC-BY-NC-ND).
  // 하이픈으로 분리한 토큰 중 NC 또는 ND가 있을 때만 밴.
  const tokens = license.toUpperCase().split(/[-_\s]+/);
  return tokens.includes('NC') || tokens.includes('ND');
}

// ---------------------------------------------------------------------------
// 공개 게이트 함수
// ---------------------------------------------------------------------------

/**
 * 라이선스가 카탈로그 진입을 허용하는지 반환.
 * false = 하드밴(NC/ND 포함, 비화이트리스트, SOUNDCLOUD는 카탈로그 ingestion 대상 외).
 */
export function isAllowedLicense(license: LicenseKind): boolean {
  if (containsBannedTerm(license)) return false;
  return LICENSE_WHITELIST.has(license);
}

/**
 * 트랙 라이선스가 허용되지 않으면 이유를 포함해 throw.
 * ingestion 파이프라인에서 호출 — 거부 시 카탈로그에 절대 진입 불가.
 */
export function assertAllowedLicense(track: Track): void {
  if (containsBannedTerm(track.license)) {
    throw new Error(
      `[licenseGate] 하드밴: "${track.license}"에 NC 또는 ND 조건이 포함되어 있습니다. ` +
        `(trAckId: ${track.id}) — 비상업·파생제한 트랙은 카탈로그에 진입할 수 없습니다.`,
    );
  }
  if (!LICENSE_WHITELIST.has(track.license)) {
    throw new Error(
      `[licenseGate] 거부: "${track.license}"는 화이트리스트(CC0/PD/CC-BY/VENDOR_RF)에 없습니다. ` +
        `(trackId: ${track.id}) — 라이선스 불명 또는 비화이트리스트 트랙은 카탈로그에 진입할 수 없습니다.`,
    );
  }
}

/** 프로비넌스 필수 필드를 검증. 누락 시 throw. */
export function assertProvenance(track: Track): void {
  if (!track.provenance) {
    throw new Error(
      `[licenseGate] 프로비넌스 누락: trackId="${track.id}" — ` +
        '카탈로그 트랙은 반드시 provenance(출처·라이선스 스냅샷·저작자·취득일)를 포함해야 합니다.',
    );
  }

  const p: Provenance = track.provenance;
  const missing: string[] = [];

  if (!p.sourceUrl) missing.push('sourceUrl');
  if (!p.licenseName) missing.push('licenseName');
  if (!p.licenseTextSnapshot) missing.push('licenseTextSnapshot');
  if (!p.acquiredAt) missing.push('acquiredAt');
  if (!p.author) missing.push('author');

  if (missing.length > 0) {
    throw new Error(
      `[licenseGate] 프로비넌스 불완전: trackId="${track.id}" — ` +
        `누락 필드: ${missing.join(', ')}`,
    );
  }
}

/**
 * raw 객체를 받아 라이선스 게이트 + 프로비넌스 검증을 통과한 Track을 반환.
 * 실패 시 throw — 호출자는 try/catch로 거부 트랙을 건너뛴다.
 *
 * KOMCA 배제 정책: 한국음악저작권협회(KOMCA) / 인접권단체(FKMP) 관리곡은
 * RF 라이선스가 작곡 저작권만 커버하고 실연·음반 인접권을 포함하지 않을 수 있어
 * 반드시 배제한다. 시드 카탈로그는 Pixabay 등 검증된 플랫폼 자체 제작 음원만 사용.
 */
export function ingestTrack(raw: Track): Track {
  assertAllowedLicense(raw);
  assertProvenance(raw);
  return raw;
}
