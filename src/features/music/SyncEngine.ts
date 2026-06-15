// SyncEngine — 스크롤 동기 음악 엔진.
//
// 단락 엘리먼트마다 IntersectionObserver를 걸고, 단락이 임계에 진입하면 그 단락의
// MusicCue로 "추가 탭 없이" seekTo(+필요 시 소스 전환)를 수행한다.
// 단일 활성 트랙(1곡 위주). 엔진 본체는 TrackSource 인터페이스에만 의존하고,
// 소스 타입 분기는 createSource 팩토리 한 곳에만 존재한다.

import type { MusicCue } from '@/data/types';
import { getTrackById } from '@/data/tracks';
import type { TrackSource, Unsub } from './TrackSource';
import { SoundCloudSource } from './SoundCloudSource';
import { HostedAudioSource } from './HostedAudioSource';
import { applyFade, type FadeHandle } from './fade';

/** 단락 진입 시 외부(viewer)로 알리는 콜백. */
export type ActiveParagraphCb = (index: number) => void;

const FADE_MS = 600; // 곡 전환 페이드 길이. 모바일에서 끊김 없이 부드러운 정도.
const FULL_VOLUME = 1;

/**
 * MusicCue로부터 적절한 TrackSource를 생성하는 팩토리.
 * **여기가 소스 타입을 아는 유일한 지점**이다(엔진 본체는 인터페이스만 사용).
 * - soundcloud: cue.ref = canonical 트랙 URL
 * - hosted: cue.ref = 카탈로그 trackId → getTrackById로 오디오 URL 해석
 */
export function createSource(cue: MusicCue): TrackSource {
  if (cue.sourceType === 'soundcloud') {
    return new SoundCloudSource(cue.ref);
  }
  const track = getTrackById(cue.ref);
  if (!track) {
    // "무음 편지 0" — 카탈로그에 없는 ref는 시드/매핑 오류. 조용히 무음으로 떨어지지 않는다.
    throw new Error(`[SyncEngine] hosted 트랙을 찾을 수 없음: ${cue.ref}`);
  }
  return new HostedAudioSource(track.url);
}

/** 큐 동일성 비교 — 같은 소스·같은 ref면 같은 트랙으로 본다(전환 불필요 판단용). */
function sameTrack(a: MusicCue | undefined, b: MusicCue | undefined): boolean {
  if (!a || !b) return false;
  return a.sourceType === b.sourceType && a.ref === b.ref;
}

export interface SyncEngineOptions {
  /** 현재 활성 단락 index 변경 통지(viewer UI용). */
  onActiveChange?: ActiveParagraphCb;
  /** IntersectionObserver 생성자 주입(테스트용). 기본: 전역 IntersectionObserver. */
  observerFactory?: (
    cb: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) => IntersectionObserver;
  /** 소스 팩토리 주입(테스트용 fake TrackSource). 기본: createSource. */
  sourceFactory?: (cue: MusicCue) => TrackSource;
}

export class SyncEngine {
  private readonly onActiveChange?: ActiveParagraphCb;
  private readonly observerFactory: NonNullable<SyncEngineOptions['observerFactory']>;
  private readonly sourceFactory: (cue: MusicCue) => TrackSource;

  private observer: IntersectionObserver | null = null;
  private cues: MusicCue[] = [];
  private elements: Element[] = [];

  private activeSource: TrackSource | null = null;
  private activeCue: MusicCue | undefined;
  private activeIndex = -1;

  // 페이드 핸들을 둘로 나눈다: 떠나는 소스의 페이드아웃과 새 소스의 페이드인은
  // 동시에 진행되므로 서로를 cancel하면 안 된다(한 슬롯이면 페이드아웃이 0에
  // 닿기 전에 페이드인이 취소해버린다).
  private fadeIn: FadeHandle | null = null;
  private fadeOut: FadeHandle | null = null;

  // 활성 소스의 progress/finish 구독 해제 함수(소스 교체 시 정리).
  private sourceUnsubs: Unsub[] = [];

  // iOS 언락이 끝났는지. 언락 전에는 play()/seekTo()를 미루지 않고 그대로 호출하되,
  // 첫 진입 시 자동 play를 해도 되는지 판단에 쓴다.
  private unlocked = false;

  constructor(options: SyncEngineOptions = {}) {
    this.onActiveChange = options.onActiveChange;
    this.observerFactory =
      options.observerFactory ??
      ((cb, opts) => new IntersectionObserver(cb, opts));
    this.sourceFactory = options.sourceFactory ?? createSource;
  }

  /**
   * 단락 엘리먼트 배열과 그에 대응하는 큐 배열을 받아 IntersectionObserver를 설정한다.
   * paragraphEls[i] ↔ cues[i] 가 1:1 대응이며, cue가 없는 단락(undefined)은 음악 변화 없음.
   */
  attach(paragraphEls: Element[], cues: Array<MusicCue | undefined>): void {
    this.detachObserver();
    this.elements = paragraphEls;
    // cue 인덱스를 엘리먼트 인덱스와 정렬(undefined 포함).
    this.cues = cues as MusicCue[];

    const observer = this.observerFactory(
      (entries) => this.handleIntersect(entries),
      // 단락 중앙 밴드(상하 45% 제외)에 들어오면 활성으로 — PoC와 동일한 임계.
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    for (const el of paragraphEls) observer.observe(el);
    this.observer = observer;
  }

  /**
   * iOS 언락. **사용자 제스처 핸들러 내부에서 동기적으로 호출**해야 한다.
   * 현재 활성 소스가 있으면 그 소스를 언락하고, 없으면 첫 단락 큐의 소스를 만들어 언락한다.
   * 이후 소스 전환 때도 이미 언락된 오디오 컨텍스트를 재사용한다.
   */
  async unlockAll(): Promise<void> {
    this.unlocked = true;
    // 활성 소스가 아직 없으면 첫 cue가 있는 단락의 소스를 준비한다.
    if (!this.activeSource) {
      const firstIdx = this.cues.findIndex((c) => c !== undefined);
      if (firstIdx >= 0) {
        await this.switchToCue(this.cues[firstIdx], { autoplay: true });
        this.activeIndex = firstIdx;
      }
    } else {
      await this.activeSource.unlock();
      this.activeSource.play();
    }
  }

  destroy(): void {
    this.detachObserver();
    this.fadeIn?.cancel();
    this.fadeOut?.cancel();
    this.fadeIn = null;
    this.fadeOut = null;
    this.teardownSource();
    this.elements = [];
    this.cues = [];
    this.activeIndex = -1;
  }

  // --- 내부 -----------------------------------------------------------------

  private handleIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const index = this.elements.indexOf(entry.target);
      if (index < 0) continue;

      // 활성 단락 통지(cue 유무와 무관 — 텍스트 하이라이트 등 UI용).
      if (index !== this.activeIndex) {
        this.activeIndex = index;
        this.onActiveChange?.(index);
      }

      const cue = this.cues[index];
      if (!cue) continue; // 음악 큐 없는 단락 — 현재 곡 그대로 유지.

      if (sameTrack(cue, this.activeCue)) {
        // 같은 트랙: 단락 위치로만 점프(추가 탭 없이 seekTo).
        this.activeSource?.seekTo(cue.startMs ?? 0);
      } else {
        // 다른 트랙: 페이드아웃 → 전환 → 페이드인. (await 불필요 — fire-and-forget)
        void this.transition(cue);
      }
    }
  }

  /** 곡 전환: 이전 소스 페이드아웃 후 destroy → 새 소스 로드·언락·페이드인. */
  private async transition(cue: MusicCue): Promise<void> {
    const previous = this.activeSource;

    // 이전 소스 페이드아웃(있으면). 새 소스의 페이드인과 별도 슬롯이라 충돌하지 않는다.
    if (previous) {
      this.fadeOut?.cancel();
      this.fadeOut = applyFade(previous, 0, FADE_MS, { from: FULL_VOLUME });
    }

    await this.switchToCue(cue, { autoplay: this.unlocked });
  }

  /**
   * 새 cue의 소스로 교체한다. 이전 소스 구독을 해제·정리하고, 새 소스를 만들어
   * load → (언락된 경우) unlock → seekTo → 페이드인 한다.
   */
  private async switchToCue(cue: MusicCue, opts: { autoplay: boolean }): Promise<void> {
    const previous = this.activeSource;

    const source = this.sourceFactory(cue);
    this.activeSource = source;
    this.activeCue = cue;

    // 새 소스 구독(현재는 외부 전달 없이 내부 보관 — viewer 연동은 hook에서).
    this.clearSourceUnsubs();

    await source.load();

    // 이미 사용자 제스처로 언락된 상태라면 새 소스도 같은 컨텍스트에서 언락.
    if (opts.autoplay && this.unlocked) {
      await source.unlock();
    }

    source.seekTo(cue.startMs ?? 0);

    if (opts.autoplay) {
      source.play();
      // 0→full 페이드인. (페이드아웃 슬롯과 분리 — 이전 소스의 램프를 건드리지 않는다)
      this.fadeIn?.cancel();
      this.fadeIn = applyFade(source, FULL_VOLUME, FADE_MS, { from: 0 });
    } else {
      source.setVolume(FULL_VOLUME);
    }

    // 전환이 끝났으니 이전 소스를 정리(페이드아웃 시간 이후).
    if (previous && previous !== source) {
      // 페이드아웃이 끝나도록 잠시 후 destroy. 타이머 누수 방지 위해 즉시 destroy해도
      // 무방하지만, 부드러움을 위해 페이드 시간만큼 유지 후 정리한다.
      const stale = previous;
      window.setTimeout(() => stale.destroy(), FADE_MS + 50);
    }
  }

  private clearSourceUnsubs(): void {
    for (const unsub of this.sourceUnsubs) unsub();
    this.sourceUnsubs = [];
  }

  private teardownSource(): void {
    this.clearSourceUnsubs();
    this.activeSource?.destroy();
    this.activeSource = null;
    this.activeCue = undefined;
  }

  private detachObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
