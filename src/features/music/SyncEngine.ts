// SyncEngine — 스크롤 동기 음악 엔진 (풀 기반, iOS 다중 트랙 대응).
//
// 핵심: iOS Safari는 "사용자 제스처 밖"에서 시작하는 오디오 재생을 막는다. 그래서
// 단락을 스크롤로 지날 때 그 자리에서 새 위젯을 만들어 play()하면 2번째 이후 트랙이
// 재생되지 않는다. 이를 피하려고:
//   1) attach() 시점에 모든 distinct 트랙 소스를 미리 생성·로드해 둔다(▶ 전, 게이트 뒤).
//   2) unlockAll()(▶ 제스처)에서 **모든** 소스를 한꺼번에 언락(play→pause→음소거)한다.
//   3) 스크롤로 단락이 바뀌면 이미 언락된 소스를 재생/페이드만 한다(새 제스처 불필요).
//
// 엔진 본체는 TrackSource 인터페이스에만 의존하고, 소스 타입 분기는 createSource 한 곳에만.

import type { MusicCue } from '@/data/types';
import { getTrackById } from '@/data/tracks';
import type { TrackSource } from './TrackSource';
import { SoundCloudSource } from './SoundCloudSource';
import { HostedAudioSource } from './HostedAudioSource';
import { applyFade, type FadeHandle } from './fade';

/** 단락 진입 시 외부(viewer)로 알리는 콜백. */
export type ActiveParagraphCb = (index: number) => void;

const FADE_MS = 600; // 곡 전환 페이드 길이.
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

/** 같은 트랙 식별 키(sourceType+ref). 같은 곡을 쓰는 단락들은 소스 하나를 공유한다. */
function cueKey(cue: MusicCue): string {
  return `${cue.sourceType}::${cue.ref}`;
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
  private cues: Array<MusicCue | undefined> = [];
  private elements: Element[] = [];

  /** cueKey → 미리 생성·로드된 소스. 단락 전환 시 새로 만들지 않고 여기서 꺼내 쓴다. */
  private readonly pool = new Map<string, TrackSource>();

  private activeKey: string | null = null;
  private activeIndex = -1;

  // 페이드 인/아웃은 동시에 진행되므로 슬롯을 분리한다.
  private fadeIn: FadeHandle | null = null;
  private fadeOut: FadeHandle | null = null;
  // 페이드아웃 후 정지 타이머(전환 중첩 시 정리).
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  private unlocked = false;

  constructor(options: SyncEngineOptions = {}) {
    this.onActiveChange = options.onActiveChange;
    this.observerFactory =
      options.observerFactory ?? ((cb, opts) => new IntersectionObserver(cb, opts));
    this.sourceFactory = options.sourceFactory ?? createSource;
  }

  /**
   * 단락 엘리먼트 + 큐 배열을 받아 (1) 모든 distinct 소스를 미리 생성·로드하고
   * (2) IntersectionObserver를 설정한다. ▶ 전에 호출돼 소스를 준비해 둔다.
   */
  attach(paragraphEls: Element[], cues: Array<MusicCue | undefined>): void {
    this.detachObserver();
    this.elements = paragraphEls;
    this.cues = cues;

    // 1) 모든 distinct cue의 소스를 미리 생성·로드(언락은 ▶ 제스처에서).
    for (const cue of cues) {
      if (!cue) continue;
      const key = cueKey(cue);
      if (this.pool.has(key)) continue;
      let src: TrackSource;
      try {
        src = this.sourceFactory(cue);
      } catch (err) {
        console.error('[SyncEngine] 소스 생성 실패(건너뜀):', err);
        continue;
      }
      this.pool.set(key, src);
      // 미리 로드 — 실패는 폴백 팩토리가 처리(무음0). 로드 에러는 조용히 무시.
      void src.load().catch((err) => console.error('[SyncEngine] preload 실패:', err));
    }

    // 2) IntersectionObserver: 단락 중앙 밴드 진입 감지.
    const observer = this.observerFactory((entries) => this.handleIntersect(entries), {
      rootMargin: '-45% 0px -45% 0px',
      threshold: 0,
    });
    for (const el of paragraphEls) observer.observe(el);
    this.observer = observer;
  }

  /**
   * iOS 언락. **사용자 제스처(▶ 클릭) 핸들러 안에서 호출**해야 한다.
   * 풀의 모든 소스를 언락(play→pause→음소거)해 둔 뒤, 첫 cue를 재생한다.
   * 이렇게 미리 다 언락해야 스크롤로 만나는 2번째+ 트랙도 재생된다(iOS 제약 회피).
   */
  async unlockAll(): Promise<void> {
    this.unlocked = true;

    // 1) 모든 소스를 제스처 컨텍스트에서 언락(play를 동기적으로 호출하는 게 핵심).
    for (const src of this.pool.values()) {
      try {
        void src.unlock(); // 내부에서 play() 동기 호출 → 이 소스는 이후 재생 허용됨
      } catch {
        /* 개별 소스 언락 실패는 무시(나머지는 계속) */
      }
    }

    // 2) 첫 cue를 제외한 나머지는 정지·음소거.
    const firstIdx = this.cues.findIndex((c) => c != null);
    const firstKey = firstIdx >= 0 ? cueKey(this.cues[firstIdx] as MusicCue) : null;
    for (const [key, src] of this.pool) {
      if (key === firstKey) continue;
      try {
        src.pause();
        src.setVolume(0);
      } catch {
        /* ignore */
      }
    }

    // 3) 첫 cue 재생 + 페이드인.
    if (firstIdx >= 0) {
      this.activate(this.cues[firstIdx] as MusicCue, firstIdx);
    }
    return Promise.resolve();
  }

  destroy(): void {
    this.detachObserver();
    this.fadeIn?.cancel();
    this.fadeOut?.cancel();
    this.fadeIn = null;
    this.fadeOut = null;
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    for (const src of this.pool.values()) {
      try {
        src.destroy();
      } catch {
        /* ignore */
      }
    }
    this.pool.clear();
    this.elements = [];
    this.cues = [];
    this.activeKey = null;
    this.activeIndex = -1;
  }

  // --- 내부 -----------------------------------------------------------------

  private handleIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const index = this.elements.indexOf(entry.target);
      if (index < 0) continue;

      // 활성 단락 통지(cue 유무 무관 — 텍스트 하이라이트 등 UI용).
      if (index !== this.activeIndex) {
        this.activeIndex = index;
        this.onActiveChange?.(index);
      }

      const cue = this.cues[index];
      if (!cue) continue; // 음악 큐 없는 단락 — 현재 곡 유지.
      if (!this.unlocked) continue; // 언락 전(▶ 전)에는 재생하지 않는다.

      const key = cueKey(cue);
      if (key === this.activeKey) {
        // 같은 트랙: 위치만 점프(추가 탭 없이 seekTo).
        this.pool.get(key)?.seekTo(cue.startMs ?? 0);
      } else {
        // 다른 트랙: 이미 언락된 풀 소스로 전환(페이드).
        this.switchTo(cue);
      }
    }
  }

  /** 활성 cue 재생 + 페이드인(언락 직후/전환 시 공통). */
  private activate(cue: MusicCue, index: number): void {
    const key = cueKey(cue);
    const src = this.pool.get(key);
    if (!src) return;
    this.activeKey = key;
    this.activeIndex = index;
    src.seekTo(cue.startMs ?? 0);
    src.play();
    this.fadeIn?.cancel();
    this.fadeIn = applyFade(src, FULL_VOLUME, FADE_MS, { from: 0 });
  }

  /** 스크롤 전환: 이전 소스 페이드아웃·정지 → 새 소스(이미 언락됨) 재생·페이드인. */
  private switchTo(cue: MusicCue): void {
    const prev = this.activeKey ? this.pool.get(this.activeKey) : null;
    const nextKey = cueKey(cue);
    const next = this.pool.get(nextKey);
    if (!next) return;

    // 이전 소스 페이드아웃 후 정지(파괴하지 않음 — 재진입 시 재사용).
    if (prev && prev !== next) {
      this.fadeOut?.cancel();
      this.fadeOut = applyFade(prev, 0, FADE_MS, { from: FULL_VOLUME });
      if (this.pauseTimer) clearTimeout(this.pauseTimer);
      this.pauseTimer = setTimeout(() => {
        try {
          prev.pause();
        } catch {
          /* ignore */
        }
      }, FADE_MS + 50);
    }

    // 새 소스 재생 + 페이드인(이미 언락돼 있으므로 iOS도 허용).
    this.activeKey = nextKey;
    next.seekTo(cue.startMs ?? 0);
    next.play();
    this.fadeIn?.cancel();
    this.fadeIn = applyFade(next, FULL_VOLUME, FADE_MS, { from: 0 });
  }

  private detachObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
