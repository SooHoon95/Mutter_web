---
name: music-sync
description: Use when working on TrackSource, SoundCloudSource (Widget API), HostedAudioSource (<audio>), IntersectionObserver→seekTo scroll sync, iOS ▶ gesture unlock, setVolume fade, or SC oEmbed validation. Trigger on "TrackSource", "SoundCloud", "Widget", "오디오 동기", "스크롤 동기", "seekTo", "언락", "페이드", "oEmbed".
user-invocable: false
---

# 음악 동기화 엔진 규칙

제품의 본질 = **연출되는 편지**. 싱크 엔진은 소스 타입(SC/호스팅)을 **모른 채** 단락 경계에서 음악을 제어한다. 검증된 PoC: `poc/spike-music-soundcloud.html`(iOS Safari 제스처 후 seekTo·순수오디오·무로그인 풀재생).

## 단일 `TrackSource` 인터페이스

```ts
interface TrackSource {
  load(): Promise<void>;                 // 소스 준비(iframe/audio mount)
  unlock(): Promise<void>;               // iOS 오디오 언락 (사용자 제스처 컨텍스트 내 호출 필수)
  play(): void;
  pause(): void;
  seekTo(ms: number): void;              // 단락 경계 점프
  setVolume(v: number): void;            // 0..1, 페이드용
  onProgress(cb: (ms: number) => void): () => void;  // 구독 해제 함수 반환
  onFinish(cb: () => void): () => void;
  destroy(): void;
}
```

구현: `SoundCloudSource`(Widget API) + `HostedAudioSource`(`<audio>`). 싱크 엔진·viewer는 이 인터페이스에만 의존한다.

## SoundCloudSource (Widget API)

- 키 불필요. `<iframe>` + `SC.Widget(iframe)`.
- 메서드: `play/pause/seekTo(ms)/setVolume(0-100)`. 이벤트: `PLAY_PROGRESS`(현재 ms)·`PLAY/PAUSE/FINISH/READY/ERROR`.
- `onProgress` = `PLAY_PROGRESS` 바인딩(SC는 0-100 percent + ms 제공 → ms 사용). `setVolume`은 0..1 → 0..100 변환.
- **canonical embed URL만.** 스트림 URL rip·proxy·캐시·재호스팅 절대 금지(면책 상실 — `license-compliance`).
- iOS: `unlock()`은 첫 ▶ 제스처 핸들러 안에서 `play()`(필요시 즉시 `pause()`) 호출로 오디오 컨텍스트 언락. 이후 `seekTo` 생존 확인됨(PoC).

## HostedAudioSource (`<audio>`)

- `<audio src=cc0Url preload="auto">`. `timeupdate` → `onProgress`(`currentTime*1000`). `ended` → `onFinish`.
- `setVolume` = `audio.volume`. `seekTo` = `audio.currentTime = ms/1000`.
- 언락: 같은 ▶ 제스처에서 `audio.play()` 한 번. iOS 자동재생 정책 충족.
- CC0 카탈로그·(v2)업로드 모두 URL 기반이라 동일 구현.

## oEmbed 검증 (작성 시점, 자격증명 불필요)

- SC Data API(검색)는 폐쇄 → **paste-URL only**. 작성자가 SC URL 붙여넣으면:
  - `GET https://soundcloud.com/oembed?format=json&url=<track>` 호출.
  - 비200 / ERROR / embed-disabled / private → **작성 시점 즉시 거부**, fallback(CC0 무드 픽커) 안내.
- 이 검증은 `src/lib/scOembed.ts` 순수/주입가능 함수로 — fetch를 주입해 단위 테스트.

## 스크롤 동기 (수신 뷰)

- 각 단락에 `IntersectionObserver`. 단락이 뷰포트 임계(예: 60%)에 들어오면 그 단락의 큐로 **추가 탭 없이** `seekTo(startMs)` + 필요 시 소스 전환.
- 단일 활성 트랙(1곡 위주). 큐가 다른 트랙이면 이전 페이드아웃 → 새 트랙 페이드인.
- **페이드:** `setVolume` 램프(requestAnimationFrame 또는 setInterval로 N단계). Web Audio 갭리스 크로스페이드는 v2.
- IntersectionObserver는 cleanup에서 `disconnect()`.

## iOS 단일 ▶ 제스처 언락 (치명적)

- 수신 뷰는 "편지 열기 ▶" 게이트로 시작(`AudioUnlockGate`). 이 단 한 번의 사용자 제스처 안에서 **활성 소스의 `unlock()`을 동기적으로** 호출.
- 제스처 밖에서 `play()` 호출 금지(iOS가 차단). 소스 전환 시에도 이미 언락된 컨텍스트를 재사용.

## 무음 편지 0 (폴백)

- 수신 로드 시 SC liveness 실패(ERROR/embed-disabled/삭제) → 그 편지의 CC0 폴백 트랙으로 자동 교체. **편지는 절대 무음으로 떨어지지 않는다**(핵심 약속).

## 자가 점검

- 싱크 엔진·viewer가 `TrackSource` 인터페이스에만 의존하는가(소스 타입 분기 없음).
- `unlock()`이 사용자 제스처 핸들러 내부에서 호출되는가.
- IntersectionObserver·Widget 이벤트·timeupdate 구독이 cleanup되는가.
- SC 스트림을 rip/proxy/cache 하지 않고 공식 Widget/embed만 쓰는가.
- SC 실패가 CC0 폴백으로 이어져 무음이 0인가.
