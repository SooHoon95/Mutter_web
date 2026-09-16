// 캠페인 토큰 — App Store `ct` = Play `utm_campaign`(같은 값). 채널 비교의 단일 키.
// 표의 정본: Mutter 저장소 marketing/plans/2026-09-16-week1-loop-spec.md §0-3.

export const CAMPAIGNS = {
  viewer_reply: { source: 'viewer', medium: 'cta' },
  viewer_save: { source: 'viewer', medium: 'cta' },
  viewer_send: { source: 'viewer', medium: 'cta' },
  connect_invite: { source: 'viewer', medium: 'connect' },
  ig_bio: { source: 'instagram', medium: 'bio' },
  ig_reel: { source: 'instagram', medium: 'reel' },
  threads: { source: 'threads', medium: 'post' },
  yt_shorts: { source: 'youtube', medium: 'shorts' },
  tiktok: { source: 'tiktok', medium: 'video' },
  naver_blog: { source: 'naver', medium: 'blog' },
  disquiet: { source: 'disquiet', medium: 'post' },
  landing: { source: 'direct', medium: 'landing' },
} as const;

export type Campaign = keyof typeof CAMPAIGNS;

/**
 * 랜딩에 들어온 `utm_source`(+`utm_medium`)를 스토어 캠페인 토큰으로 매핑한다.
 * 소셜은 스토어로 직접 보내지 않고 랜딩 한 곳에 모아 채널을 비교하기 위해서다.
 * 알 수 없는 조합은 `landing`(직접 유입)으로 본다.
 */
export function campaignFromUtm(search: string): Campaign {
  const params = new URLSearchParams(search);
  const source = (params.get('utm_source') ?? '').toLowerCase();
  const medium = (params.get('utm_medium') ?? '').toLowerCase();
  switch (source) {
    // 뷰어 마지막 장에서 데스크톱으로 /download에 온 경우 — 어느 CTA였는지 medium으로 구분해 귀속을 잃지 않는다.
    case 'viewer':
      if (medium === 'qr' || medium === 'reply') return 'viewer_reply';
      if (medium === 'save') return 'viewer_save';
      if (medium === 'connect') return 'connect_invite';
      return 'viewer_send';
    case 'instagram':
      return medium === 'reel' || medium === 'story' ? 'ig_reel' : 'ig_bio';
    case 'threads':
      return 'threads';
    case 'youtube':
      return 'yt_shorts';
    case 'tiktok':
      return 'tiktok';
    case 'naver':
    case 'naver_blog':
      return 'naver_blog';
    case 'disquiet':
      return 'disquiet';
    default:
      return 'landing';
  }
}
