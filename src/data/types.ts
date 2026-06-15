// 도메인 타입 (단일 출처). DB row 타입과 분리하고 data 레이어에서 매핑한다.

export type SourceType = 'soundcloud' | 'hosted';

/** CC0/RF 카탈로그 또는 SC 트랙의 라이선스 종류. license-compliance 스킬 참조. */
export type LicenseKind = 'CC0' | 'PD' | 'CC-BY' | 'VENDOR_RF' | 'SOUNDCLOUD';

export interface Provenance {
  sourceUrl: string;
  licenseName: string; // 예: "CC-BY 4.0"
  licenseTextSnapshot: string;
  acquiredAt: string; // ISO date
  author: string;
}

export interface Track {
  id: string;
  source: SourceType;
  title: string;
  author: string;
  license: LicenseKind;
  url: string; // hosted: 오디오 URL / soundcloud: canonical 트랙 URL
  provenance?: Provenance; // 카탈로그 트랙은 필수, SC paste-URL은 메타만
}

export interface MusicCue {
  sourceType: SourceType;
  ref: string; // soundcloud: 트랙 URL / hosted: 카탈로그 trackId
  startMs?: number;
}

export interface Paragraph {
  id: string;
  order: number;
  text: string;
  cue?: MusicCue;
}

export interface Letter {
  id: string;
  ownerId: string;
  title: string;
  paragraphs: Paragraph[];
  templateId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryLink {
  token: string;
  letterId: string;
  hasPassword: boolean;
  claimedDeviceId?: string;
  expiresAt?: string;
  revokedAt?: string;
}
