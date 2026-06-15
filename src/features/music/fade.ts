// 볼륨 페이드(램프) 로직.
//
// 곡 전환·페이드인/아웃은 setVolume을 N단계로 선형 보간해 호출하는 것으로 구현한다
// (Web Audio 갭리스 크로스페이드는 v2 비목표 — music-sync 스킬).
//
// 램프 계산은 DOM·타이머와 무관한 순수 함수(computeFadeSteps)로 분리해 단위 테스트로
// 못 박고, applyFade는 그 단계 배열을 시간축에 흘려보내는 얇은 실행기다.

import type { TrackSource } from './TrackSource';

/**
 * from → to 까지 stepMs 간격으로 선형 보간한 볼륨 단계 배열을 반환한다.
 *
 * - 마지막 값은 항상 정확히 `to`(부동소수 누적 오차로 목표 볼륨에 못 미치는 것 방지).
 * - from < to면 단조 증가, from > to면 단조 감소.
 * - durationMs 또는 stepMs가 0 이하면 즉시 전환을 의미하므로 `[to]` 한 단계만 반환.
 *
 * 반환 배열은 "적용할 볼륨 값들"이며 시작 값(from)은 포함하지 않는다
 * (이미 그 볼륨이므로 다시 쓸 필요가 없다).
 */
export function computeFadeSteps(
  from: number,
  to: number,
  durationMs: number,
  stepMs: number,
): number[] {
  // 즉시 전환: 단계 분할이 무의미하므로 목표값 하나만.
  if (durationMs <= 0 || stepMs <= 0) return [to];

  // 전체 시간 / 단계 길이 = 단계 수(올림). 최소 1단계는 보장된다.
  const stepCount = Math.max(1, Math.ceil(durationMs / stepMs));
  const steps: number[] = [];

  for (let i = 1; i <= stepCount; i++) {
    // i/stepCount 비율로 from→to 선형 보간.
    const ratio = i / stepCount;
    steps[i - 1] = from + (to - from) * ratio;
  }

  // 부동소수 오차 보정: 마지막 단계는 정확히 목표 볼륨.
  steps[steps.length - 1] = to;
  return steps;
}

/** applyFade 진행을 취소하는 핸들. cleanup/곡 전환 시 호출. */
export type FadeHandle = {
  cancel: () => void;
};

/** 테스트·환경 주입용 타이머 인터페이스(기본은 setInterval/clearInterval). */
export interface FadeTimer {
  set: (cb: () => void, ms: number) => number;
  clear: (id: number) => void;
}

const defaultTimer: FadeTimer = {
  // window가 아닌 전역 setInterval을 써서 jsdom/노드 양쪽에서 동작하게 한다.
  set: (cb, ms) => setInterval(cb, ms) as unknown as number,
  clear: (id) => clearInterval(id),
};

/** applyFade 옵션. stepMs는 램프 해상도(기본 50ms ≈ 20fps, 모바일에서 충분히 매끄럽다). */
export interface ApplyFadeOptions {
  stepMs?: number;
  /** 현재 볼륨(from). 미지정 시 to로 즉시 점프(시작 볼륨을 알 수 없을 때 안전).*/
  from?: number;
  timer?: FadeTimer;
}

/**
 * source.setVolume을 durationMs 동안 from→to로 램프한다.
 *
 * 타이머로 단계 배열을 순차 적용하며, 완료 또는 cancel 시 타이머를 정리한다.
 * 반환된 핸들의 cancel()은 진행 중인 램프를 중단한다(곡 전환·언마운트 cleanup용).
 */
export function applyFade(
  source: Pick<TrackSource, 'setVolume'>,
  to: number,
  durationMs: number,
  options: ApplyFadeOptions = {},
): FadeHandle {
  const stepMs = options.stepMs ?? 50;
  const from = options.from ?? to;
  const timer = options.timer ?? defaultTimer;

  const steps = computeFadeSteps(from, to, durationMs, stepMs);

  // 즉시 전환(단계 1개): 타이머 없이 바로 적용하고 no-op 핸들 반환.
  if (steps.length <= 1) {
    source.setVolume(steps[0]);
    return { cancel: () => {} };
  }

  let index = 0;
  let intervalId: number | null = null;

  const stop = (): void => {
    if (intervalId !== null) {
      timer.clear(intervalId);
      intervalId = null;
    }
  };

  intervalId = timer.set(() => {
    source.setVolume(steps[index]);
    index += 1;
    if (index >= steps.length) stop();
  }, stepMs);

  return { cancel: stop };
}
