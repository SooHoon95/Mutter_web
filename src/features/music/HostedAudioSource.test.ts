/**
 * HostedAudioSource 단위 테스트.
 *
 * jsdom에는 실제 오디오 디코더가 없으므로(play/seek가 소리를 내지 않음),
 * 여기서는 mock HTMLAudioElement를 주입해 메서드/이벤트 "매핑"만 검증한다.
 * iOS Safari 언락·풀재생 등 실제 재생 동작은 테스트 범위 밖이며 수동 디바이스 검증이 필요하다.
 */
import { describe, it, expect, vi } from 'vitest';
import { HostedAudioSource } from './HostedAudioSource';

// 최소 표면을 갖춘 가짜 HTMLAudioElement. 이벤트 리스너는 type별로 보관해 수동 dispatch.
function makeFakeAudio() {
  const listeners: Record<string, Set<EventListener>> = {};
  const audio = {
    currentTime: 0,
    volume: 1,
    preload: '',
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    load: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener: vi.fn((type: string, handler: EventListener) => {
      (listeners[type] ??= new Set()).add(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: EventListener) => {
      listeners[type]?.delete(handler);
    }),
  };
  const emit = (type: string) => {
    listeners[type]?.forEach((h) => h(new Event(type)));
  };
  return { audio: audio as unknown as HTMLAudioElement, emit, listeners };
}

describe('HostedAudioSource', () => {
  it('play/pause를 audio에 위임한다', () => {
    const { audio } = makeFakeAudio();
    const src = new HostedAudioSource('https://cc0.example/a.mp3', () => audio);

    src.play();
    expect(audio.play).toHaveBeenCalled();

    src.pause();
    expect(audio.pause).toHaveBeenCalled();
  });

  it('seekTo(ms)는 currentTime(초)로 변환한다', () => {
    const { audio } = makeFakeAudio();
    const src = new HostedAudioSource('x', () => audio);

    src.seekTo(2500);
    expect(audio.currentTime).toBe(2.5);
  });

  it('setVolume은 audio.volume(0..1)으로 매핑하고 클램프한다', () => {
    const { audio } = makeFakeAudio();
    const src = new HostedAudioSource('x', () => audio);

    src.setVolume(0.4);
    expect(audio.volume).toBe(0.4);

    src.setVolume(1.5);
    expect(audio.volume).toBe(1);

    src.setVolume(-1);
    expect(audio.volume).toBe(0);
  });

  it('unlock은 제스처 내 audio.play()를 호출한다', async () => {
    const { audio } = makeFakeAudio();
    const src = new HostedAudioSource('x', () => audio);

    await src.unlock();
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it('timeupdate → onProgress(currentTime*1000)', () => {
    const { audio, emit } = makeFakeAudio();
    const src = new HostedAudioSource('x', () => audio);
    const cb = vi.fn();

    src.onProgress(cb);
    (audio as { currentTime: number }).currentTime = 3;
    emit('timeupdate');

    expect(cb).toHaveBeenCalledWith(3000);
  });

  it('onProgress unsub 이후에는 콜백이 호출되지 않는다', () => {
    const { audio, emit } = makeFakeAudio();
    const src = new HostedAudioSource('x', () => audio);
    const cb = vi.fn();

    const unsub = src.onProgress(cb);
    emit('timeupdate');
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    emit('timeupdate');
    expect(cb).toHaveBeenCalledTimes(1); // 증가하지 않음
  });

  it('ended → onFinish', () => {
    const { audio, emit } = makeFakeAudio();
    const src = new HostedAudioSource('x', () => audio);
    const cb = vi.fn();

    src.onFinish(cb);
    emit('ended');
    expect(cb).toHaveBeenCalledOnce();
  });

  it('destroy는 pause + 리스너 제거 + src 해제', () => {
    const { audio } = makeFakeAudio();
    const src = new HostedAudioSource('x', () => audio);
    src.onProgress(vi.fn());
    src.onFinish(vi.fn());

    src.destroy();

    expect(audio.pause).toHaveBeenCalled();
    expect(audio.removeAttribute).toHaveBeenCalledWith('src');
    // 등록했던 2개 리스너가 제거됐는지(removeEventListener 호출 횟수).
    expect(audio.removeEventListener).toHaveBeenCalledTimes(2);
  });
});
