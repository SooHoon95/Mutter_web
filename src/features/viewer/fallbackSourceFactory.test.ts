/**
 * fallbackSourceFactory 단위 테스트 — 무음0 폴백의 핵심 보장.
 *
 * SC 소스가 load 실패(reject/ERROR)하면 CC0 HostedAudioSource로 대체 반환되어
 * 편지가 무음으로 떨어지지 않음을 못 박는다(music-sync / license-compliance).
 * hosted cue는 그대로 1차 소스를 사용한다.
 *
 * 실제 SC iframe 로드·오디오 재생은 jsdom에서 불가하므로(소리 없음), 여기서는
 * 주입된 fake TrackSource의 호출/대체 로직만 검증한다. 실제 재생은 수동 디바이스 검증.
 */
import { describe, it, expect, vi } from 'vitest';
import type { MusicCue, Track } from '@/data/types';
import type { TrackSource } from '@/features/music';
import { createFallbackSourceFactory } from './fallbackSourceFactory';

// --- 테스트 더블 -------------------------------------------------------------

/** 호출을 기록하는 fake TrackSource. loadBehavior로 성공/실패를 제어. */
function makeFakeSource(opts: { loadRejects?: boolean; tag: string }): TrackSource & {
  tag: string;
  loadCalls: number;
  destroyed: boolean;
} {
  const state = { tag: opts.tag, loadCalls: 0, destroyed: false };
  return {
    ...state,
    get loadCalls() {
      return state.loadCalls;
    },
    get destroyed() {
      return state.destroyed;
    },
    load: vi.fn(() => {
      state.loadCalls += 1;
      return opts.loadRejects
        ? Promise.reject(new Error('SC ERROR: embed-disabled'))
        : Promise.resolve();
    }),
    unlock: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    onProgress: vi.fn().mockReturnValue(() => {}),
    onFinish: vi.fn().mockReturnValue(() => {}),
    destroy: vi.fn(() => {
      state.destroyed = true;
    }),
  } as unknown as TrackSource & { tag: string; loadCalls: number; destroyed: boolean };
}

const FALLBACK_TRACK: Track = {
  id: 'pixabay-calm-001',
  source: 'hosted',
  title: 'Calm Piano Melody',
  author: 'Aleksey Chistilin',
  license: 'CC0',
  url: '/audio/pixabay-calm-001.mp3',
};

describe('createFallbackSourceFactory', () => {
  it('SC 소스 load 실패 시 CC0 폴백 소스로 대체한다 (무음0)', async () => {
    const scSource = makeFakeSource({ loadRejects: true, tag: 'sc' });
    const cc0Source = makeFakeSource({ loadRejects: false, tag: 'cc0' });
    const fallbackFactory = vi.fn(() => cc0Source);

    const factory = createFallbackSourceFactory({
      primaryFactory: () => scSource,
      resolveFallbackTrack: () => FALLBACK_TRACK,
      fallbackSourceFactory: fallbackFactory,
    });

    const cue: MusicCue = { sourceType: 'soundcloud', ref: 'https://soundcloud.com/x/y' };
    const source = factory(cue);

    // load는 reject하지 않고 폴백으로 흡수되어 resolve해야 한다(엔진이 멈추지 않음).
    await expect(source.load()).resolves.toBeUndefined();

    // 1차 SC 소스는 load 시도 후 정리되고, 폴백 CC0가 만들어져 load된다.
    expect(scSource.load).toHaveBeenCalledOnce();
    expect(scSource.destroy).toHaveBeenCalledOnce();
    expect(fallbackFactory).toHaveBeenCalledWith(FALLBACK_TRACK);
    expect(cc0Source.load).toHaveBeenCalledOnce();

    // 이후 제어는 폴백 소스로 위임된다(무음 아님).
    source.play();
    source.seekTo(1234);
    expect(cc0Source.play).toHaveBeenCalledOnce();
    expect(cc0Source.seekTo).toHaveBeenCalledWith(1234);
    // SC 소스는 더 이상 제어받지 않는다.
    expect(scSource.play).not.toHaveBeenCalled();
  });

  it('SC 소스 load 성공 시 그대로 1차 소스를 사용한다(폴백 미발동)', async () => {
    const scSource = makeFakeSource({ loadRejects: false, tag: 'sc' });
    const fallbackFactory = vi.fn(() => makeFakeSource({ loadRejects: false, tag: 'cc0' }));

    const factory = createFallbackSourceFactory({
      primaryFactory: () => scSource,
      resolveFallbackTrack: () => FALLBACK_TRACK,
      fallbackSourceFactory: fallbackFactory,
    });

    const cue: MusicCue = { sourceType: 'soundcloud', ref: 'https://soundcloud.com/a/b' };
    const source = factory(cue);
    await source.load();

    expect(scSource.load).toHaveBeenCalledOnce();
    expect(scSource.destroy).not.toHaveBeenCalled();
    expect(fallbackFactory).not.toHaveBeenCalled();

    source.play();
    expect(scSource.play).toHaveBeenCalledOnce();
  });

  it('hosted cue는 1차 소스를 그대로 사용한다(SC 폴백 경로와 무관)', async () => {
    const hostedSource = makeFakeSource({ loadRejects: false, tag: 'hosted' });
    const fallbackFactory = vi.fn(() => makeFakeSource({ loadRejects: false, tag: 'cc0' }));

    const factory = createFallbackSourceFactory({
      primaryFactory: () => hostedSource,
      resolveFallbackTrack: () => FALLBACK_TRACK,
      fallbackSourceFactory: fallbackFactory,
    });

    const cue: MusicCue = { sourceType: 'hosted', ref: 'pixabay-warm-002', startMs: 0 };
    const source = factory(cue);
    await source.load();

    expect(hostedSource.load).toHaveBeenCalledOnce();
    expect(fallbackFactory).not.toHaveBeenCalled();

    source.seekTo(5000);
    expect(hostedSource.seekTo).toHaveBeenCalledWith(5000);
  });

  it('hosted cue의 1차 소스가 실패해도 CC0 폴백으로 대체한다(무음0 일관성)', async () => {
    const brokenHosted = makeFakeSource({ loadRejects: true, tag: 'hosted-broken' });
    const cc0Source = makeFakeSource({ loadRejects: false, tag: 'cc0' });
    const fallbackFactory = vi.fn(() => cc0Source);

    const factory = createFallbackSourceFactory({
      primaryFactory: () => brokenHosted,
      resolveFallbackTrack: () => FALLBACK_TRACK,
      fallbackSourceFactory: fallbackFactory,
    });

    const cue: MusicCue = { sourceType: 'hosted', ref: 'missing-track', startMs: 0 };
    const source = factory(cue);
    await expect(source.load()).resolves.toBeUndefined();

    expect(brokenHosted.destroy).toHaveBeenCalledOnce();
    expect(cc0Source.load).toHaveBeenCalledOnce();
  });

  it('destroy는 활성 소스를 destroy한다(폴백 소스 포함)', async () => {
    const scSource = makeFakeSource({ loadRejects: true, tag: 'sc' });
    const cc0Source = makeFakeSource({ loadRejects: false, tag: 'cc0' });

    const factory = createFallbackSourceFactory({
      primaryFactory: () => scSource,
      resolveFallbackTrack: () => FALLBACK_TRACK,
      fallbackSourceFactory: () => cc0Source,
    });

    const source = factory({ sourceType: 'soundcloud', ref: 'u' });
    await source.load();
    source.destroy();

    // 활성(폴백) 소스가 정리된다.
    expect(cc0Source.destroy).toHaveBeenCalled();
  });

  it('load 이전 호출은 안전하게 no-op이다(엔진은 항상 load 후 제어하지만 방어)', () => {
    const factory = createFallbackSourceFactory({
      primaryFactory: () => makeFakeSource({ loadRejects: false, tag: 'sc' }),
      resolveFallbackTrack: () => FALLBACK_TRACK,
      fallbackSourceFactory: () => makeFakeSource({ loadRejects: false, tag: 'cc0' }),
    });

    const source = factory({ sourceType: 'soundcloud', ref: 'u' });
    // load 전 호출 — throw하지 않아야 한다.
    expect(() => source.play()).not.toThrow();
    expect(() => source.seekTo(0)).not.toThrow();
    const unsub = source.onProgress(() => {});
    expect(() => unsub()).not.toThrow();
  });
});
