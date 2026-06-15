// HostedAudioSource — <audio> 엘리먼트 래퍼.
//
// CC0/RF 카탈로그(및 v2 업로드) 트랙은 모두 URL 기반이라 단일 구현으로 처리한다.
// 단위 테스트를 위해 HTMLAudioElement를 주입 가능하게 설계했다(기본은 new Audio()).

import type { ProgressCb, FinishCb, TrackSource, Unsub } from './TrackSource';

/**
 * 테스트에서 주입할 audio 팩토리. jsdom에는 실제 오디오 디코더가 없으므로
 * play/seek 등 메서드 호출 "매핑"만 검증하고, 실제 재생은 테스트 범위 밖이다
 * (수동 디바이스 검증 필요 — iOS Safari 언락·풀재생).
 */
export type AudioFactory = (src: string) => HTMLAudioElement;

const defaultAudioFactory: AudioFactory = (src) => {
  const audio = new Audio(src);
  // preload='auto' — seek 직후 즉시 들리도록 메타+데이터를 미리 받는다.
  audio.preload = 'auto';
  return audio;
};

export class HostedAudioSource implements TrackSource {
  private readonly audio: HTMLAudioElement;

  // 등록한 리스너를 추적해 destroy에서 빠짐없이 제거한다(누수 방지).
  private readonly listeners: Array<{ event: string; handler: EventListener }> = [];

  constructor(audioUrl: string, factory: AudioFactory = defaultAudioFactory) {
    this.audio = factory(audioUrl);
  }

  load(): Promise<void> {
    // <audio>는 src가 이미 설정돼 있으므로 명시 load()로 버퍼링을 시작한다.
    // 일부 환경(jsdom)에 load가 없을 수 있어 방어적으로 호출.
    if (typeof this.audio.load === 'function') this.audio.load();
    return Promise.resolve();
  }

  async unlock(): Promise<void> {
    // iOS 언락: 사용자 제스처 안에서 play()를 1회 호출하면 이후 자동 재생이 허용된다.
    // 언락 직후 일시정지하지 않고 그대로 재생을 이어가도 되지만,
    // 호출 측(SyncEngine.unlockAll)이 제스처 컨텍스트를 통제하므로 여기선 play만 한다.
    await this.audio.play();
  }

  play(): void {
    // 제스처 밖 자동재생이 거부되면 reject되지만, 언락 이후이므로 정상 동작.
    // 반환 Promise는 의도적으로 무시(인터페이스가 void).
    void this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  seekTo(ms: number): void {
    // audio는 초 단위, 인터페이스는 ms 단위 → 변환.
    this.audio.currentTime = ms / 1000;
  }

  setVolume(v: number): void {
    // HTMLMediaElement.volume은 0..1 — 인터페이스 단위와 동일.
    this.audio.volume = clamp01(v);
  }

  onProgress(cb: ProgressCb): Unsub {
    // timeupdate → 현재 위치(초)를 ms로 변환해 통지.
    const handler: EventListener = () => cb(this.audio.currentTime * 1000);
    this.audio.addEventListener('timeupdate', handler);
    this.listeners.push({ event: 'timeupdate', handler });
    return () => {
      this.audio.removeEventListener('timeupdate', handler);
      this.removeFromRegistry('timeupdate', handler);
    };
  }

  onFinish(cb: FinishCb): Unsub {
    const handler: EventListener = () => cb();
    this.audio.addEventListener('ended', handler);
    this.listeners.push({ event: 'ended', handler });
    return () => {
      this.audio.removeEventListener('ended', handler);
      this.removeFromRegistry('ended', handler);
    };
  }

  destroy(): void {
    this.audio.pause();
    // 남은 리스너 전부 제거.
    for (const { event, handler } of this.listeners) {
      this.audio.removeEventListener(event, handler);
    }
    this.listeners.length = 0;
    // src 비우기 → 브라우저가 네트워크/디코딩 리소스를 해제하도록 유도.
    this.audio.removeAttribute('src');
    if (typeof this.audio.load === 'function') this.audio.load();
  }

  private removeFromRegistry(event: string, handler: EventListener): void {
    const i = this.listeners.findIndex((l) => l.event === event && l.handler === handler);
    if (i >= 0) this.listeners.splice(i, 1);
  }
}

/** 볼륨을 0..1로 클램프(잘못된 입력이 audio.volume 예외를 던지지 않게). */
function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
