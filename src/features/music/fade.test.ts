import { describe, it, expect, vi } from 'vitest';
import { computeFadeSteps, applyFade, type FadeTimer } from './fade';

describe('computeFadeSteps', () => {
  it('마지막 단계 값은 항상 정확히 to', () => {
    const steps = computeFadeSteps(0, 1, 600, 50);
    expect(steps[steps.length - 1]).toBe(1);
  });

  it('from < to 면 단조 증가한다', () => {
    const steps = computeFadeSteps(0, 1, 600, 50);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
    }
  });

  it('from > to 면 단조 감소한다 (페이드아웃)', () => {
    const steps = computeFadeSteps(1, 0, 600, 50);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThanOrEqual(steps[i - 1]);
    }
    expect(steps[steps.length - 1]).toBe(0);
  });

  it('단계 수 = ceil(durationMs / stepMs)', () => {
    expect(computeFadeSteps(0, 1, 600, 50)).toHaveLength(12);
    expect(computeFadeSteps(0, 1, 500, 100)).toHaveLength(5);
    // 나누어떨어지지 않으면 올림.
    expect(computeFadeSteps(0, 1, 550, 100)).toHaveLength(6);
  });

  it('durationMs<=0 또는 stepMs<=0 이면 [to] 한 단계만(즉시 전환)', () => {
    expect(computeFadeSteps(0, 1, 0, 50)).toEqual([1]);
    expect(computeFadeSteps(0, 1, 600, 0)).toEqual([1]);
  });

  it('첫 단계는 from이 아니라 from을 지난 첫 보간값', () => {
    // 시작 볼륨(from)은 이미 적용돼 있으므로 배열에 포함하지 않는다.
    const steps = computeFadeSteps(0, 1, 400, 100); // 4단계: 0.25,0.5,0.75,1
    expect(steps).toEqual([0.25, 0.5, 0.75, 1]);
  });
});

describe('applyFade', () => {
  // 가짜 타이머: cb를 수집해 수동으로 tick 한다(시간 의존 제거).
  function makeFakeTimer() {
    const callbacks: Array<() => void> = [];
    let nextId = 1;
    const timer: FadeTimer = {
      set: (cb) => {
        callbacks.push(cb);
        return nextId++;
      },
      clear: () => {
        callbacks.length = 0;
      },
    };
    return {
      timer,
      tick: (n: number) => {
        for (let i = 0; i < n; i++) callbacks.forEach((cb) => cb());
      },
      isCleared: () => callbacks.length === 0,
    };
  }

  it('단계마다 setVolume을 순차 호출하고 마지막은 to', () => {
    const setVolume = vi.fn();
    const { timer, tick } = makeFakeTimer();

    applyFade({ setVolume }, 1, 400, { from: 0, stepMs: 100, timer });
    // 4단계 진행.
    tick(4);

    expect(setVolume).toHaveBeenCalledTimes(4);
    expect(setVolume).toHaveBeenNthCalledWith(1, 0.25);
    expect(setVolume).toHaveBeenLastCalledWith(1);
  });

  it('완료 후 타이머를 정리한다(누수 없음)', () => {
    const setVolume = vi.fn();
    const { timer, tick, isCleared } = makeFakeTimer();

    applyFade({ setVolume }, 1, 200, { from: 0, stepMs: 100, timer });
    tick(2); // 2단계 완료
    expect(isCleared()).toBe(true);
  });

  it('cancel()이 진행 중 램프를 중단한다', () => {
    const setVolume = vi.fn();
    const { timer, isCleared } = makeFakeTimer();

    const handle = applyFade({ setVolume }, 1, 600, { from: 0, stepMs: 50, timer });
    handle.cancel();
    expect(isCleared()).toBe(true);
  });

  it('즉시 전환(단계 1개)은 타이머 없이 바로 setVolume', () => {
    const setVolume = vi.fn();
    const { timer } = makeFakeTimer();

    applyFade({ setVolume }, 0.8, 0, { from: 0, timer });
    expect(setVolume).toHaveBeenCalledOnce();
    expect(setVolume).toHaveBeenCalledWith(0.8);
  });
});
