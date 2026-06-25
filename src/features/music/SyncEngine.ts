// SyncEngine — 편지당 음악 1곡 재생기 (단일 트랙).
//
// 모델 변경(v4 → 단일트랙): 예전엔 단락마다 cue를 두고 스크롤로 곡을 전환했지만,
// 이제 편지는 음악 1곡만 가진다. cues 배열에서 **첫 유효 cue 1개**를 골라
// 게이트 언락(▶) 시점에 처음부터 재생하고, 스크롤로는 곡이 바뀌거나 seek되지 않는다.
//
// iOS 오디오 정책(music-sync): 첫 사용자 제스처 핸들러 "안에서 동기적으로" 오디오를
// 언락(play→음소거)해야 이후 자동 재생/페이드가 허용된다. unlockAll()이 그 진입점이다.
//
// 엔진 본체는 TrackSource 인터페이스에만 의존하고, 소스 타입 분기는 createSource 한 곳에만.

import type { MusicCue } from '@/data/types';
import { getTrackById } from '@/data/tracks';
import type { TrackSource } from './TrackSource';
import { SoundCloudSource } from './SoundCloudSource';
import { HostedAudioSource } from './HostedAudioSource';
import { applyFade, type FadeHandle } from './fade';

const FADE_MS = 600; // 재생 시작 페이드인 길이.
const FULL_VOLUME = 1;

/**
 * MusicCue로부터 적절한 TrackSource를 생성하는 팩토리.
 * **여기가 소스 타입을 아는 유일한 지점**이다(엔진 본체는 인터페이스만 사용).
 */
export function createSource(cue: MusicCue): TrackSource {
  if (cue.sourceType === 'soundcloud') {
    return new SoundCloudSource(cue.ref);
  }
  const track = getTrackById(cue.ref);
  if (!track) {
    throw new Error(`[SyncEngine] hosted 트랙을 찾을 수 없음: ${cue.ref}`);
  }
  return new HostedAudioSource(track.url);
}

export interface SyncEngineOptions {
  /** 소스 팩토리 주입(테스트용 fake TrackSource). 기본: createSource. */
  sourceFactory?: (cue: MusicCue) => TrackSource;
}

export class SyncEngine {
  private readonly sourceFactory: (cue: MusicCue) => TrackSource;

  /** 편지당 단일 음악 소스. 유효 cue가 없으면 null(무음). */
  private source: TrackSource | null = null;
  /** 단일 소스의 cue(시작 오프셋 startMs 보관). */
  private cue: MusicCue | null = null;

  /**
   * 단일 소스의 preload(load) 완료 Promise. SC Widget은 READY 전에 play가 no-op이라,
   * unlockAll에서 재생 전에 이 Promise를 await해 "준비된 뒤에만" 재생한다(느린 망 무음 방지).
   * load는 FallbackTrackSource가 실패를 흡수하므로 항상 resolve된다(무음0).
   */
  private loadPromise: Promise<void> | null = null;

  private fadeIn: FadeHandle | null = null;

  private unlocked = false;
  // 실제로 재생이 시작됐는지(상단 플레이어 토글 기준 + unlockAll 반환값).
  private started = false;
  // 사용자가 상단 플레이어로 일시정지했는지.
  private userPaused = false;

  constructor(options: SyncEngineOptions = {}) {
    this.sourceFactory = options.sourceFactory ?? createSource;
  }

  /**
   * 큐 배열을 받아 **첫 유효 cue 1개**의 소스를 생성·preload한다(▶ 전, 게이트 뒤).
   * 단락 엘리먼트는 더 이상 필요 없다(스크롤 동기 제거).
   */
  attach(cues: Array<MusicCue | undefined>): void {
    const cue = cues.find((c): c is MusicCue => c != null);
    if (!cue) return; // 유효 cue 없음 — 무음(무음0 폴백은 cue가 있을 때만).

    let src: TrackSource;
    try {
      src = this.sourceFactory(cue);
    } catch (err) {
      console.error('[SyncEngine] 소스 생성 실패:', err);
      return;
    }
    this.source = src;
    this.cue = cue;
    // 미리 로드 — 실패는 폴백 팩토리가 처리(무음0). 로드 에러는 조용히 무시.
    this.loadPromise = src
      .load()
      .catch((err) => console.error('[SyncEngine] preload 실패:', err));
  }

  /**
   * iOS 언락. **사용자 제스처(▶ 클릭) 핸들러 안에서 호출**해야 한다.
   * 단일 소스를 언락(play→음소거)한 뒤, load 완료를 기다려 처음부터 재생한다.
   *
   * @returns 실제로 트랙이 재생 시작됐는지. 소스가 없거나 실패하면 false →
   *          viewer가 "재생 중" UI를 거짓 표시하지 않게 한다.
   */
  async unlockAll(): Promise<boolean> {
    this.unlocked = true;
    const src = this.source;
    if (!src) return false;

    // 1) 제스처 컨텍스트에서 언락(play를 동기적으로 호출하는 게 핵심 — iOS 제약).
    //    SC unlock()의 widget.play()는 READY 전에 no-op이므로, load 완료를 기다린 뒤에야
    //    재생해야 느린 망에서 무음으로 떨어지지 않는다.
    const unlockResult = Promise.resolve(src.unlock()).catch((err) =>
      console.error('[SyncEngine] 소스 언락 실패:', err),
    );

    // 2) load(READY) + unlock 완료를 기다린 뒤 처음부터 재생.
    //    그새 사용자가 일시정지했으면 강제 재생을 건너뛴다.
    await Promise.all([this.loadPromise ?? Promise.resolve(), unlockResult]);
    if (this.unlocked && !this.userPaused) {
      this.activate(src);
    }

    return this.started;
  }

  /** 현재 사용자 일시정지 상태(상단 플레이어 UI용). */
  get paused(): boolean {
    return this.userPaused;
  }

  /** 상단 플레이어: 일시정지. */
  pause(): void {
    this.userPaused = true;
    this.fadeIn?.cancel();
    try {
      this.source?.pause();
    } catch {
      /* ignore */
    }
  }

  /** 상단 플레이어: 재개. 멈춘 자리에서 이어 재생한다(처음으로 되감지 않음). */
  resume(): void {
    if (!this.unlocked || !this.source) return;
    this.userPaused = false;
    try {
      this.source.setVolume(FULL_VOLUME);
      this.source.play();
    } catch {
      /* ignore */
    }
  }

  destroy(): void {
    this.fadeIn?.cancel();
    this.fadeIn = null;
    try {
      this.source?.destroy();
    } catch {
      /* ignore */
    }
    this.source = null;
    this.cue = null;
    this.loadPromise = null;
    this.started = false;
  }

  // --- 내부 -----------------------------------------------------------------

  /** 시작 오프셋(cue.startMs)부터 재생 + 페이드인. */
  private activate(src: TrackSource): void {
    src.seekTo(this.cue?.startMs ?? 0);
    src.play();
    this.started = true;
    this.fadeIn?.cancel();
    this.fadeIn = applyFade(src, FULL_VOLUME, FADE_MS, { from: 0 });
  }
}
