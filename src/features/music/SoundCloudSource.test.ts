/**
 * SoundCloudSource 순수 헬퍼 단위 테스트.
 *
 * 실제 SC iframe·Widget API 로드·오디오 재생은 jsdom에서 불가하므로 테스트 범위 밖이며
 * 수동 디바이스 검증(iOS Safari 제스처 후 seekTo·무로그인 풀재생)이 필요하다.
 * 여기서는 0..1 → 0..100 볼륨 변환과 canonical embed URL 빌더만 못 박는다.
 */
import { describe, it, expect } from 'vitest';
import { toScVolume, buildEmbedSrc } from './SoundCloudSource';

describe('toScVolume (0..1 → 0..100)', () => {
  it('0 → 0', () => expect(toScVolume(0)).toBe(0));
  it('1 → 100', () => expect(toScVolume(1)).toBe(100));
  it('0.5 → 50', () => expect(toScVolume(0.5)).toBe(50));

  it('범위를 벗어난 값은 클램프한다', () => {
    expect(toScVolume(-0.2)).toBe(0);
    expect(toScVolume(1.7)).toBe(100);
  });
});

describe('buildEmbedSrc', () => {
  it('canonical 트랙 URL을 w.soundcloud.com 위젯 src로 만든다', () => {
    const url = 'https://soundcloud.com/artist/track';
    const src = buildEmbedSrc(url);
    expect(src.startsWith('https://w.soundcloud.com/player/?')).toBe(true);
    expect(src).toContain(encodeURIComponent(url));
  });

  it('auto_play=false (재생은 제스처 컨텍스트에서만)', () => {
    const src = buildEmbedSrc('https://soundcloud.com/a/b');
    expect(src).toContain('auto_play=false');
  });
});
