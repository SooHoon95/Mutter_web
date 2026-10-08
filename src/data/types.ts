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
  ref: string; // soundcloud: 재생용 canonical URL(api.soundcloud.com/tracks/ID) / hosted: 카탈로그 trackId
  startMs?: number;
  /** oEmbed 트랙 제목/저작자(크레딧 표기용). 붙일 때 저장. */
  title?: string;
  author?: string;
  /** 발신자가 붙인 원본 공개 트랙 URL(출처 링크용). ref는 재생용 canonical이라 브라우저로 열면 API JSON이 뜬다. */
  sourceUrl?: string;
}

/**
 * 편지 사진(0034, 비공개 버킷 letter-photos). path = `<ownerId>/<letterId>/<uuid>.jpg`.
 * width/height는 원본 픽셀 크기 — 이미지가 오기 전에 자리(비율)를 잡아 레이아웃 흔들림을 막는다.
 */
export interface LetterPhoto {
  path: string;
  width: number;
  height: number;
}

export interface Paragraph {
  id: string;
  order: number;
  /** 사진 단락이면 "". */
  text: string;
  /** 첫 텍스트 단락에만 붙는다(사진 단락엔 없음). */
  cue?: MusicCue;
  /** 있으면 이 단락은 사진 블록이다(iOS·Android·웹 공통 계약 — 설계 §2). */
  photo?: LetterPhoto;
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
  /** 예약 공개(0018): 이 시각 이후에만 열림. 미설정이면 즉시 공개. */
  revealAt?: string;
}
