// 단일 TrackSource 추상화 (music-sync 스킬의 핵심).
//
// 싱크 엔진과 viewer는 음악이 SoundCloud(Widget)에서 오는지 호스팅 오디오(<audio>)에서
// 오는지 "모른 채" 이 인터페이스에만 의존한다. 소스 타입 분기는 createSource 팩토리
// 한 곳에만 존재한다(SyncEngine 참조).

/** 진행 콜백: 현재 재생 위치를 ms로 통지한다(SC PLAY_PROGRESS / audio timeupdate 공통). */
export type ProgressCb = (ms: number) => void;

/** 종료 콜백: 트랙이 끝까지 재생됐을 때 호출(SC FINISH / audio ended 공통). */
export type FinishCb = () => void;

/** 구독 해제 함수. onProgress/onFinish는 이 함수를 반환해 cleanup을 강제한다. */
export type Unsub = () => void;

/**
 * 음악 소스 공통 인터페이스.
 *
 * 구현체: SoundCloudSource(Widget API) · HostedAudioSource(<audio>).
 * 두 구현은 동형(同形)이어야 하며, 엔진은 아래 메서드 시그니처에만 의존한다.
 */
export interface TrackSource {
  /** 소스 준비(iframe/audio mount + 메타 로드). 멱등. */
  load(): Promise<void>;
  /**
   * iOS 오디오 언락. **반드시 사용자 제스처 핸들러 내부에서 동기적으로 호출**해야
   * iOS Safari가 후속 자동 play()/seekTo()를 허용한다(PoC로 검증).
   */
  unlock(): Promise<void>;
  play(): void;
  pause(): void;
  /** 단락 경계 점프. ms 단위(SC/audio 공통 단위로 통일). */
  seekTo(ms: number): void;
  /** 볼륨 설정. 0..1 정규화 값(페이드 램프용). 구현이 자체 스케일로 변환한다. */
  setVolume(v: number): void;
  /** 진행 구독. 반환된 함수로 구독 해제. */
  onProgress(cb: ProgressCb): Unsub;
  /** 종료 구독. 반환된 함수로 구독 해제. */
  onFinish(cb: FinishCb): Unsub;
  /** 모든 리소스·구독 정리(iframe/audio 제거, 이벤트 해제). */
  destroy(): void;
}
