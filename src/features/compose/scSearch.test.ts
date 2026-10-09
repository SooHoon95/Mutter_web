// scSearch — 공유 텍스트에서 SC URL 추출, 검색 URL 인코딩.
import { describe, it, expect } from 'vitest';
import { buildScSearchUrl, extractScUrl } from './scSearch';

describe('extractScUrl', () => {
  it('공유 문구 속 on.soundcloud.com 단축링크를 뽑는다', () => {
    expect(extractScUrl('Listen to Song on #SoundCloud https://on.soundcloud.com/abc123')).toBe(
      'https://on.soundcloud.com/abc123',
    );
  });

  it('soundcloud.com·m.soundcloud.com 트랙 URL을 뽑는다', () => {
    expect(extractScUrl('https://soundcloud.com/artist/track?si=x')).toBe(
      'https://soundcloud.com/artist/track?si=x',
    );
    expect(extractScUrl('들어봐 https://m.soundcloud.com/artist/track 좋아')).toBe(
      'https://m.soundcloud.com/artist/track',
    );
  });

  it('여러 개면 첫 URL만, 문장 끝 구두점은 뗀다', () => {
    expect(extractScUrl('a https://soundcloud.com/a/one. b https://soundcloud.com/b/two')).toBe(
      'https://soundcloud.com/a/one',
    );
  });

  it('SC URL이 없거나 위장 호스트면 null', () => {
    expect(extractScUrl('그냥 텍스트')).toBeNull();
    expect(extractScUrl('https://youtube.com/watch?v=1')).toBeNull();
    expect(extractScUrl('https://soundcloud.com.evil.com/x')).toBeNull();
    expect(extractScUrl('https://evilsoundcloud.com/x')).toBeNull();
  });
});

describe('buildScSearchUrl', () => {
  it('검색어를 인코딩해 트랙 검색 URL을 만든다', () => {
    expect(buildScSearchUrl('  아이유 & 밤편지 ')).toBe(
      'https://soundcloud.com/search/sounds?q=%EC%95%84%EC%9D%B4%EC%9C%A0%20%26%20%EB%B0%A4%ED%8E%B8%EC%A7%80',
    );
  });

  it('빈 검색어면 검색 홈으로', () => {
    expect(buildScSearchUrl('   ')).toBe('https://soundcloud.com/search');
  });
});
