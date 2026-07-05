/**
 * SyncEngine 단위 테스트 (단일트랙 모델).
 *
 * 편지는 음악 1곡만 가진다. cues에서 첫 유효 cue 1개를 골라 게이트 언락(▶) 시
 * 처음부터 재생한다(스크롤 동기 없음). fake TrackSource(sourceFactory 주입)로
 * 언락·재생·load 게이팅·일시정지/재개·cleanup을 검증한다.
 * 실제 SC iframe·오디오 재생은 jsdom 밖이라 수동 검증 필요.
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

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('SyncEngine (단일트랙)', () => {
  it('첫 유효 cue 1개의 소스만 생성·preload한다', () => {
    const created: TrackSource[] = [];
    const cues: Array<MusicCue | undefined> = [
      undefined,
      { sourceType: 'hosted', ref: 'trackA', startMs: 0 },
      { sourceType: 'hosted', ref: 'trackB', startMs: 0 },
    ];
    const engine = new SyncEngine({
      sourceFactory: () => {
        const s = makeFakeSource();
        created.push(s);
        return s;
      },
    });
    engine.attach(cues);

    // 단일트랙: 둘째 cue(첫 유효)만 소스를 만든다. trackB는 무시.
    expect(created).toHaveLength(1);
    expect(created[0].load).toHaveBeenCalledOnce();
  });

  it('unlockAll은 첫 유효 cue의 startMs로 seek해 처음부터 재생한다', async () => {
    const source = makeFakeSource();
    const cues: Array<MusicCue | undefined> = [
      { sourceType: 'hosted', ref: 't1', startMs: 42000 },
    ];
    const engine = new SyncEngine({ sourceFactory: () => source });
    engine.attach(cues);

    const started = await engine.unlockAll();
    await vi.runAllTimersAsync();

    expect(source.unlock).toHaveBeenCalledOnce();
    expect(source.seekTo).toHaveBeenCalledWith(42000);
    expect(source.play).toHaveBeenCalled();
    expect(started).toBe(true);
  });

  it('startMs가 없으면 0부터 재생한다', async () => {
    const source = makeFakeSource();
    const cues: Array<MusicCue | undefined> = [{ sourceType: 'hosted', ref: 't1' }];
    const engine = new SyncEngine({ sourceFactory: () => source });
    engine.attach(cues);

    await engine.unlockAll();
    await vi.runAllTimersAsync();
    expect(source.seekTo).toHaveBeenCalledWith(0);
  });

  it('재생 가능한 cue가 없으면 unlockAll은 false를 반환한다(거짓 "재생 중" UI 방지)', async () => {
    const source = makeFakeSource();
    const engine = new SyncEngine({ sourceFactory: () => source });
    // cue가 전혀 없는 편지 — 소스가 만들어지지 않는다.
    engine.attach([undefined, undefined]);

    const started = await engine.unlockAll();
    await vi.runAllTimersAsync();
    expect(started).toBe(false);
    expect(source.play).not.toHaveBeenCalled();
  });

  it('unlockAll은 load 완료 전에는 재생(play)하지 않는다(느린 망 무음 방지)', async () => {
    // load를 수동으로 resolve하는 deferred 소스 — READY 전 재생이 일어나지 않음을 못 박는다.
    let resolveLoad!: () => void;
    const loadGate = new Promise<void>((r) => {
      resolveLoad = r;
    });
    const source = makeFakeSource();
    source.load = vi.fn().mockReturnValue(loadGate);

    const cues: Array<MusicCue | undefined> = [{ sourceType: 'hosted', ref: 't1', startMs: 0 }];
    const engine = new SyncEngine({ sourceFactory: () => source });
    engine.attach(cues);

    // unlockAll 진행 중이지만 load가 아직 안 끝났으면 play()는 호출되지 않아야 한다.
    const unlocking = engine.unlockAll();
    await Promise.resolve(); // microtask 한 틱 — load가 막혀 있으므로 activate 미실행
    expect(source.play).not.toHaveBeenCalled();

    // load 완료 → 비로소 재생된다.
    resolveLoad();
    const started = await unlocking;
    await vi.runAllTimersAsync();
    expect(source.play).toHaveBeenCalled();
    expect(started).toBe(true);
  });

  it('재생 시작 시 0 → full 페이드인이 발생한다', async () => {
    const source = makeFakeSource();
    const cues: Array<MusicCue | undefined> = [{ sourceType: 'hosted', ref: 't1', startMs: 0 }];
    const engine = new SyncEngine({ sourceFactory: () => source });
    engine.attach(cues);

    await engine.unlockAll();
    await vi.runAllTimersAsync();

    // 페이드인: 단계적 램프(첫 단계는 full 미만) → 마지막은 정확히 full(1).
    // computeFadeSteps는 시작값(0)을 배열에 포함하지 않으므로 첫 기록은 첫 램프 단계다.
    expect(source.volumes.length).toBeGreaterThan(1);
    expect(source.volumes[0]).toBeLessThan(1);
    expect(source.volumes[source.volumes.length - 1]).toBe(1);
  });

  it('pause 후 unlockAll 중간 진입이면 강제 재생을 건너뛴다', async () => {
    // load를 막아 두고 그 사이 pause() → load 완료 후에도 play 안 함.
    let resolveLoad!: () => void;
    const loadGate = new Promise<void>((r) => {
      resolveLoad = r;
    });
    const source = makeFakeSource();
    source.load = vi.fn().mockReturnValue(loadGate);

    const cues: Array<MusicCue | undefined> = [{ sourceType: 'hosted', ref: 't1', startMs: 0 }];
    const engine = new SyncEngine({ sourceFactory: () => source });
    engine.attach(cues);

    const unlocking = engine.unlockAll();
    engine.pause(); // 사용자가 그새 일시정지
    resolveLoad();
    const started = await unlocking;
    await vi.runAllTimersAsync();

    expect(source.play).not.toHaveBeenCalled();
    expect(started).toBe(false);
  });

  it('pause/resume는 단일 소스를 멈췄다 이어 재생한다', async () => {
    const source = makeFakeSource();
    const cues: Array<MusicCue | undefined> = [{ sourceType: 'hosted', ref: 't1', startMs: 0 }];
    const engine = new SyncEngine({ sourceFactory: () => source });
    engine.attach(cues);

    await engine.unlockAll();
    await vi.runAllTimersAsync();

    engine.pause();
    expect(engine.paused).toBe(true);
    expect(source.pause).toHaveBeenCalled();

    vi.mocked(source.play).mockClear();
    engine.resume();
    expect(engine.paused).toBe(false);
    expect(source.play).toHaveBeenCalled();
  });

  it('destroy는 단일 소스를 destroy하고 상태를 비운다', async () => {
    const source = makeFakeSource();
    const cues: Array<MusicCue | undefined> = [{ sourceType: 'hosted', ref: 't1', startMs: 0 }];
    const engine = new SyncEngine({ sourceFactory: () => source });
    engine.attach(cues);
    await engine.unlockAll();
    await vi.runAllTimersAsync();

    engine.destroy();

    expect(source.destroy).toHaveBeenCalled();
    // destroy 후 resume은 no-op(소스 없음).
    vi.mocked(source.play).mockClear();
    engine.resume();
    expect(source.play).not.toHaveBeenCalled();
  });

  // --- whenReady: 게이트 ▶ 활성화 게이팅 (iOS 첫 탭 무음 방지) --------------------

  it('whenReady는 음악(cue)이 없으면 즉시 resolve한다', async () => {
    const engine = new SyncEngine({ sourceFactory: () => makeFakeSource() });
    engine.attach([undefined, undefined]); // 유효 cue 없음 → 무음
    await expect(engine.whenReady()).resolves.toBeUndefined();
  });

  it('whenReady는 소스 load(SC READY 대응)가 끝난 뒤에 resolve한다', async () => {
    // 수동으로 resolve하는 load — READY 지연을 재현.
    let resolveLoad!: () => void;
    const source = makeFakeSource();
    vi.mocked(source.load).mockReturnValue(
      new Promise<void>((r) => {
        resolveLoad = r;
      }),
    );
    const engine = new SyncEngine({ sourceFactory: () => source });
    engine.attach([{ sourceType: 'hosted', ref: 't1', startMs: 0 }]);

    let ready = false;
    void engine.whenReady().then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false); // load 미완료 → 아직 준비 안 됨(게이트 잠금)

    resolveLoad();
    await vi.runAllTimersAsync();
    expect(ready).toBe(true); // load 완료 → 준비됨(게이트 해제)
  });

  it('unlockAll은 언락 전에 볼륨 0으로 시작한다(포지션0 풀볼륨 블립 방지)', async () => {
    const source = makeFakeSource();
    const engine = new SyncEngine({ sourceFactory: () => source });
    engine.attach([{ sourceType: 'hosted', ref: 't1', startMs: 0 }]);

    await engine.unlockAll();
    // 언락 직전 첫 setVolume은 0이어야 한다(블레스 재생을 무음으로).
    expect(source.volumes[0]).toBe(0);
    // 이후 페이드가 볼륨을 최종 1까지 올린다.
    await vi.runAllTimersAsync();
    expect(source.volumes[source.volumes.length - 1]).toBe(1);
  });
});
