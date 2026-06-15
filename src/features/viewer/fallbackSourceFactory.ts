// 무음0 폴백 sourceFactory — T8 viewer가 SyncEngine에 주입한다.
//
// 핵심 약속(music-sync / license-compliance): **편지는 절대 무음으로 떨어지지 않는다.**
// SoundCloud 소스가 load/ERROR로 실패하면(삭제·embed-disabled·private·네트워크),
// 그 자리에서 카탈로그 CC0 기본 트랙(HostedAudioSource)으로 자동 대체한다.
//
// SyncEngine은 sourceFactory(cue) → await load() → seekTo/play/onProgress... 순으로
// TrackSource 인터페이스에만 의존하므로, 여기서는 "load 실패 시 CC0로 갈아끼우는"
// 위임 래퍼(FallbackTrackSource)를 돌려준다. 엔진은 폴백 여부를 모른 채 동작한다.

import type { MusicCue, Track } from '@/data/types';
import { getCatalog } from '@/data/tracks';
import {
  createSource,
  HostedAudioSource,
  type TrackSource,
  type ProgressCb,
  type FinishCb,
  type Unsub,
} from '@/features/music';

/** fallbackSourceFactory 동작을 테스트/환경별로 주입하기 위한 옵션. */
export interface FallbackFactoryOptions {
  /** cue → 1차 소스 생성. 기본: music feature의 createSource(SC/hosted 분기). */
  primaryFactory?: (cue: MusicCue) => TrackSource;
  /** CC0 폴백 트랙 해석. 기본: 카탈로그 첫 CC0 트랙. */
  resolveFallbackTrack?: () => Track;
  /** 폴백 오디오 소스 생성. 기본: HostedAudioSource(track.url). 테스트에서 주입. */
  fallbackSourceFactory?: (track: Track) => TrackSource;
}

/**
 * 카탈로그에서 무음0 폴백으로 쓸 CC0 트랙을 고른다.
 * - CC0를 최우선(표기 의무 없음)으로, 없으면 카탈로그 첫 트랙.
 * - 카탈로그는 loadCatalog가 비어있지 않음을 보장(무음 편지 0 불변식)하므로 항상 존재.
 */
function defaultFallbackTrack(): Track {
  const catalog = getCatalog();
  const cc0 = catalog.find((t) => t.license === 'CC0' || t.license === 'PD');
  // CC0가 없을 수는 없지만(시드 보장), 방어적으로 첫 트랙으로 폴백.
  return cc0 ?? catalog[0];
}

/**
 * load() 실패를 감지해 CC0로 대체하는 위임 TrackSource.
 *
 * 1차 소스(주로 SoundCloudSource)의 load()를 시도한다.
 *  - 성공: 이후 모든 호출을 1차 소스로 위임.
 *  - reject/throw(ERROR·embed-disabled·네트워크): 1차 소스를 정리하고
 *    CC0 HostedAudioSource를 만들어 load한 뒤, 이후 호출을 그 폴백 소스로 위임.
 *
 * load() 이전에 호출되는 메서드는 없다(엔진은 항상 load 완료 후 제어).
 * 단, 안전을 위해 active가 비어 있으면 no-op/즉시 unsub 처리한다.
 */
class FallbackTrackSource implements TrackSource {
  private active: TrackSource | null = null;

  constructor(
    private readonly cue: MusicCue,
    private readonly opts: Required<
      Pick<FallbackFactoryOptions, 'primaryFactory' | 'resolveFallbackTrack' | 'fallbackSourceFactory'>
    >,
  ) {}

  async load(): Promise<void> {
    const primary = this.opts.primaryFactory(this.cue);
    try {
      await primary.load();
      this.active = primary;
    } catch (err) {
      // SC liveness 실패 → 무음0 폴백. 1차 소스 리소스 정리 후 CC0로 대체.
      console.warn(
        '[fallbackSourceFactory] 1차 소스 load 실패 → CC0 폴백으로 대체:',
        err instanceof Error ? err.message : String(err),
      );
      primary.destroy();
      const track = this.opts.resolveFallbackTrack();
      const fallback = this.opts.fallbackSourceFactory(track);
      await fallback.load();
      this.active = fallback;
    }
  }

  unlock(): Promise<void> {
    return this.active?.unlock() ?? Promise.resolve();
  }

  play(): void {
    this.active?.play();
  }

  pause(): void {
    this.active?.pause();
  }

  seekTo(ms: number): void {
    this.active?.seekTo(ms);
  }

  setVolume(v: number): void {
    this.active?.setVolume(v);
  }

  onProgress(cb: ProgressCb): Unsub {
    return this.active?.onProgress(cb) ?? (() => {});
  }

  onFinish(cb: FinishCb): Unsub {
    return this.active?.onFinish(cb) ?? (() => {});
  }

  destroy(): void {
    this.active?.destroy();
    this.active = null;
  }
}

/**
 * SyncEngine에 주입할 sourceFactory를 만든다.
 *
 * - hosted cue: 카탈로그 트랙이라 그대로 1차 소스를 쓴다(폴백 래핑 불필요하지만
 *   래퍼가 load 성공을 그대로 위임하므로 동형 처리해도 안전·동일 동작).
 * - soundcloud cue: 1차(SoundCloudSource) load 실패 시 CC0로 자동 대체.
 *
 * 무음0 보장: 어떤 cue든 최종적으로 재생 가능한 TrackSource를 반환한다.
 */
export function createFallbackSourceFactory(
  options: FallbackFactoryOptions = {},
): (cue: MusicCue) => TrackSource {
  const opts: Required<
    Pick<FallbackFactoryOptions, 'primaryFactory' | 'resolveFallbackTrack' | 'fallbackSourceFactory'>
  > = {
    primaryFactory: options.primaryFactory ?? createSource,
    resolveFallbackTrack: options.resolveFallbackTrack ?? defaultFallbackTrack,
    fallbackSourceFactory:
      options.fallbackSourceFactory ?? ((track) => new HostedAudioSource(track.url)),
  };

  return (cue: MusicCue) => new FallbackTrackSource(cue, opts);
}
