/**
 * SyncEngine 단위 테스트.
 *
 * IntersectionObserver를 주입 가능한 fake로 교체하고(전역 교체 대신 observerFactory 주입),
 * fake TrackSource(sourceFactory 주입)로 단락 진입 → seekTo/전환/페이드/cleanup을 검증한다.
 * 실제 IO 트리거·SC iframe·오디오 재생은 jsdom 밖이라 수동 검증 필요.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MusicCue } from '@/data/types';
import type { TrackSource } from './TrackSource';
import { SyncEngine } from './SyncEngine';

// --- 테스트 더블 -------------------------------------------------------------

/** 호출을 기록하는 fake TrackSource. */
function makeFakeSource(): TrackSource & { volumes: number[] } {
  const volumes: number[] = [];
  return {
    volumes,
    load: vi.fn().mockResolvedValue(undefined),
    unlock: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn((v: number) => volumes.push(v)),
    onProgress: vi.fn().mockReturnValue(() => {}),
    onFinish: vi.fn().mockReturnValue(() => {}),
    destroy: vi.fn(),
  };
}

/** 콜백을 캡처해 수동으로 intersection을 발생시키는 fake IntersectionObserver. */
function makeObserverHarness() {
  let captured: IntersectionObserverCallback | null = null;
  const disconnect = vi.fn();
  const observe = vi.fn();
  const factory = (cb: IntersectionObserverCallback): IntersectionObserver => {
    captured = cb;
    return {
      observe,
      disconnect,
      unobserve: vi.fn(),
      takeRecords: vi.fn().mockReturnValue([]),
      root: null,
      rootMargin: '',
      thresholds: [],
    } as unknown as IntersectionObserver;
  };
  // 특정 target이 교차했다고 알린다.
  const enter = (target: Element) => {
    captured?.(
      [{ isIntersecting: true, target } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  };
  return { factory, enter, disconnect, observe };
}

function makeEls(n: number): HTMLElement[] {
  return Array.from({ length: n }, () => document.createElement('div'));
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('SyncEngine', () => {
  it('단락 진입 시 해당 큐의 startMs로 seekTo한다', async () => {
    const source = makeFakeSource();
    const harness = makeObserverHarness();
    const cues: Array<MusicCue | undefined> = [
      { sourceType: 'hosted', ref: 't1', startMs: 0 },
      { sourceType: 'hosted', ref: 't1', startMs: 42000 },
    ];
    const engine = new SyncEngine({
      observerFactory: harness.factory,
      sourceFactory: () => source,
    });
    const els = makeEls(2);
    engine.attach(els, cues);

    // 언락으로 첫 소스 준비(첫 cue startMs=0).
    await engine.unlockAll();
    await vi.runAllTimersAsync();
    expect(source.seekTo).toHaveBeenCalledWith(0);

    // 두 번째 단락(같은 트랙) 진입 → seekTo(42000), 추가 소스 생성 없음.
    harness.enter(els[1]);
    expect(source.seekTo).toHaveBeenLastCalledWith(42000);
  });

  it('같은 트랙이면 단일 활성 소스를 유지한다(소스 재생성 없음)', async () => {
    const created: TrackSource[] = [];
    const harness = makeObserverHarness();
    const cues: Array<MusicCue | undefined> = [
      { sourceType: 'hosted', ref: 't1', startMs: 0 },
      { sourceType: 'hosted', ref: 't1', startMs: 5000 },
    ];
    const engine = new SyncEngine({
      observerFactory: harness.factory,
      sourceFactory: () => {
        const s = makeFakeSource();
        created.push(s);
        return s;
      },
    });
    const els = makeEls(2);
    engine.attach(els, cues);

    await engine.unlockAll();
    await vi.runAllTimersAsync();
    harness.enter(els[1]);

    expect(created).toHaveLength(1); // 같은 트랙 → 소스 하나만
  });

  it('다른 트랙으로 진입 시 소스 전환 + 페이드(setVolume 램프)가 발생한다', async () => {
    const created: Array<TrackSource & { volumes: number[] }> = [];
    const harness = makeObserverHarness();
    const cues: Array<MusicCue | undefined> = [
      { sourceType: 'hosted', ref: 'trackA', startMs: 0 },
      { sourceType: 'hosted', ref: 'trackB', startMs: 0 },
    ];
    const engine = new SyncEngine({
      observerFactory: harness.factory,
      sourceFactory: () => {
        const s = makeFakeSource();
        created.push(s);
        return s;
      },
    });
    const els = makeEls(2);
    engine.attach(els, cues);

    await engine.unlockAll(); // 첫 소스(trackA)
    await vi.runAllTimersAsync();
    expect(created).toHaveLength(1);

    // 다른 트랙(trackB) 단락 진입 → 새 소스 생성 + 페이드.
    harness.enter(els[1]);
    await vi.runAllTimersAsync();

    expect(created).toHaveLength(2);
    const prev = created[0];
    const next = created[1];
    // 이전 소스: full → 0 페이드아웃(여러 단계 setVolume, 마지막 0).
    expect(prev.setVolume).toHaveBeenCalled();
    expect(prev.volumes[prev.volumes.length - 1]).toBe(0);
    // 새 소스: 0 → full 페이드인(마지막 1).
    expect(next.setVolume).toHaveBeenCalled();
    expect(next.volumes[next.volumes.length - 1]).toBe(1);
    // 이전 소스는 전환 후 destroy된다.
    expect(prev.destroy).toHaveBeenCalled();
  });

  it('destroy는 IntersectionObserver를 disconnect하고 활성 소스를 destroy한다', async () => {
    const source = makeFakeSource();
    const harness = makeObserverHarness();
    const cues: Array<MusicCue | undefined> = [{ sourceType: 'hosted', ref: 't1', startMs: 0 }];
    const engine = new SyncEngine({
      observerFactory: harness.factory,
      sourceFactory: () => source,
    });
    engine.attach(makeEls(1), cues);
    await engine.unlockAll();
    await vi.runAllTimersAsync();

    engine.destroy();

    expect(harness.disconnect).toHaveBeenCalledOnce();
    expect(source.destroy).toHaveBeenCalled();
  });

  it('attach는 모든 단락 엘리먼트를 observe한다', () => {
    const harness = makeObserverHarness();
    const engine = new SyncEngine({
      observerFactory: harness.factory,
      sourceFactory: makeFakeSource,
    });
    const els = makeEls(3);
    engine.attach(els, [undefined, undefined, undefined]);
    expect(harness.observe).toHaveBeenCalledTimes(3);
  });
});
