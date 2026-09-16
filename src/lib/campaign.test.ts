import { describe, it, expect } from 'vitest';
import { campaignFromUtm, CAMPAIGNS } from './campaign';

describe('campaignFromUtm', () => {
  it('인스타 bio/reel을 구분한다', () => {
    expect(campaignFromUtm('?utm_source=instagram&utm_medium=bio')).toBe('ig_bio');
    expect(campaignFromUtm('?utm_source=instagram&utm_medium=reel')).toBe('ig_reel');
    expect(campaignFromUtm('?utm_source=Instagram&utm_medium=Story')).toBe('ig_reel');
  });
  it('채널별 토큰으로 매핑한다', () => {
    expect(campaignFromUtm('?utm_source=threads')).toBe('threads');
    expect(campaignFromUtm('?utm_source=youtube&utm_medium=shorts')).toBe('yt_shorts');
    expect(campaignFromUtm('?utm_source=tiktok')).toBe('tiktok');
    expect(campaignFromUtm('?utm_source=naver&utm_medium=blog')).toBe('naver_blog');
    expect(campaignFromUtm('?utm_source=disquiet')).toBe('disquiet');
  });
  it('뷰어 데스크톱 폴백(/download?utm_source=viewer)은 CTA별 토큰을 유지한다', () => {
    expect(campaignFromUtm('?utm_source=viewer&utm_medium=qr')).toBe('viewer_reply');
    expect(campaignFromUtm('?utm_source=viewer&utm_medium=send')).toBe('viewer_send');
    expect(campaignFromUtm('?utm_source=viewer&utm_medium=save')).toBe('viewer_save');
  });
  it('없거나 모르는 출처는 landing', () => {
    expect(campaignFromUtm('')).toBe('landing');
    expect(campaignFromUtm('?utm_source=newsletter')).toBe('landing');
  });
  it('모든 토큰에 source·medium이 있다', () => {
    for (const v of Object.values(CAMPAIGNS)) {
      expect(v.source).toBeTruthy();
      expect(v.medium).toBeTruthy();
    }
  });
});
