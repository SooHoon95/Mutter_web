// SoundCloud Widget API 전역 타입 선언.
//
// SC는 공식 .d.ts를 npm으로 배포하지 않으므로(스크립트 태그 로드), any 금지 규칙을
// 지키기 위해 우리가 쓰는 표면만 직접 선언한다. canonical Widget API 기준
// (https://developers.soundcloud.com/docs/api/html5-widget).

/** PLAY_PROGRESS 이벤트 페이로드. currentPosition은 ms 단위. */
export interface SCProgressEvent {
  currentPosition: number;
  loadedProgress: number;
  relativePosition: number;
}

/** Widget.Events 상수 모음 — bind/unbind에 사용. */
export interface SCWidgetEvents {
  READY: string;
  PLAY: string;
  PAUSE: string;
  FINISH: string;
  PLAY_PROGRESS: string;
  ERROR: string;
}

/** SC.Widget 인스턴스. 우리가 호출하는 메서드만 선언한다. */
export interface SCWidget {
  bind(eventName: string, listener: (e?: SCProgressEvent) => void): void;
  unbind(eventName: string): void;
  play(): void;
  pause(): void;
  /** SC는 ms 단위로 seek한다. */
  seekTo(milliseconds: number): void;
  /** SC 볼륨은 0..100 스케일. */
  setVolume(volume: number): void;
  getDuration(callback: (durationMs: number) => void): void;
  load(
    url: string,
    options?: { auto_play?: boolean; visual?: boolean; callback?: () => void },
  ): void;
}

/** SC 전역 네임스페이스 (player/api.js가 window.SC에 주입). */
export interface SCNamespace {
  Widget: {
    (iframe: HTMLIFrameElement | string): SCWidget;
    Events: SCWidgetEvents;
  };
}

declare global {
  interface Window {
    SC?: SCNamespace;
  }
}

export {};
