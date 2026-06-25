/**
 * SoundCloudSource 순수 헬퍼 단위 테스트.
 *
 * 실제 SC iframe·Widget API 로드·오디오 재생은 jsdom에서 불가하므로 테스트 범위 밖이며
 * 수동 디바이스 검증(iOS Safari 제스처 후 seekTo·무로그인 풀재생)이 필요하다.
 * 여기서는 0..1 → 0..100 볼륨 변환과 canonical embed URL 빌더만 못 박는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toScVolume,
  buildEmbedSrc,
  SoundCloudSource,
  setSoundCloudContainer,
} from './SoundCloudSource';
import type { SCWidget } from './soundcloud';

// --- 테스트 더블: SC.Widget ---------------------------------------------------
//
// 실제 위젯은 jsdom에서 불가하므로, bind(event, handler)를 기록하고 테스트가
// emit(event)로 READY/ERROR를 수동 발화하는 fake를 주입한다(widgetFactory 옵션).
function makeFakeWidget(): SCWidget & { emit: (event: string) => void } {
  const handlers = new Map<string, (() => void)[]>();
  const widget = {
    bind: vi.fn((event: string, listener: () => void) => {
      const list = handlers.get(event) ?? [];
      list.push(listener);
      handlers.set(event, list);
    }),
    unbind: vi.fn((event: string) => handlers.delete(event)),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setVolume: vi.fn(),
    getDuration: vi.fn(),
    load: vi.fn(),
    emit: (event: string) => {
      for (const h of handlers.get(event) ?? []) h();
    },
  };
  return widget as unknown as SCWidget & { emit: (event: string) => void };
}

// window.SC가 없을 때 SoundCloudSource.scEvents()가 쓰는 리터럴 이벤트명.
const EV = {
  READY: 'ready',
  ERROR: 'error',
  PLAY_PROGRESS: 'playProgress',
  FINISH: 'finish',
};

describe('toScVolume (0..1 → 0..100)', () => {
  it('0 → 0', () => expect(toScVolume(0)).toBe(0));
  it('1 → 100', () => expect(toScVolume(1)).toBe(100));
  it('0.5 → 50', () => expect(toScVolume(0.5)).toBe(50));

  it('범위를 벗어난 값은 클램프한다', () => {
    expect(toScVolume(-0.2)).toBe(0);
    expect(toScVolume(1.7)).toBe(100);
  });
});

describe('buildEmbedSrc', () => {
  it('canonical 트랙 URL을 w.soundcloud.com 위젯 src로 만든다', () => {
    const url = 'https://soundcloud.com/artist/track';
    const src = buildEmbedSrc(url);
    expect(src.startsWith('https://w.soundcloud.com/player/?')).toBe(true);
    expect(src).toContain(encodeURIComponent(url));
  });

  it('auto_play=false (재생은 제스처 컨텍스트에서만)', () => {
    const src = buildEmbedSrc('https://soundcloud.com/a/b');
    expect(src).toContain('auto_play=false');
  });
});

describe('SoundCloudSource.load() — READY/ERROR/timeout (무음0 폴백 트리거)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setSoundCloudContainer(null); // 테스트 간 전역 상태 격리
  });
  afterEach(() => {
    vi.useRealTimers();
    setSoundCloudContainer(null);
  });

  it('READY가 오면 load가 resolve된다', async () => {
    const widget = makeFakeWidget();
    const src = new SoundCloudSource('https://soundcloud.com/a/b', {
      widgetFactory: () => widget,
    });
    const loaded = src.load();
    widget.emit(EV.READY);
    await expect(loaded).resolves.toBeUndefined();
    src.destroy();
  });

  it('READY 전에 ERROR가 오면 load가 reject된다(FallbackTrackSource가 CC0로 전환)', async () => {
    const widget = makeFakeWidget();
    const src = new SoundCloudSource('https://soundcloud.com/x/dead', {
      widgetFactory: () => widget,
    });
    const loaded = src.load();
    widget.emit(EV.ERROR);
    await expect(loaded).rejects.toThrow(/Widget ERROR/);
    src.destroy();
  });

  it('READY가 끝내 안 오면 타임아웃으로 reject된다(SC 장애 → 무음0 폴백)', async () => {
    const widget = makeFakeWidget();
    const src = new SoundCloudSource('https://soundcloud.com/x/y', {
      widgetFactory: () => widget,
      readyTimeoutMs: 100,
    });
    const loaded = src.load();
    const assertion = expect(loaded).rejects.toThrow(/READY 타임아웃/);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
    src.destroy();
  });

  it('READY 이후의 ERROR는 onFinish 구독자에게 통지된다(재생 중 트랙 사망)', async () => {
    const widget = makeFakeWidget();
    const src = new SoundCloudSource('https://soundcloud.com/a/b', {
      widgetFactory: () => widget,
    });
    const onFinish = vi.fn();
    src.onFinish(onFinish);
    const loaded = src.load();
    widget.emit(EV.READY);
    await loaded;

    widget.emit(EV.ERROR); // READY 후 ERROR
    expect(onFinish).toHaveBeenCalledOnce();
    src.destroy();
  });
});

describe('SoundCloudSource — iframe 컨테이너 라우팅', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setSoundCloudContainer(null);
  });
  afterEach(() => {
    vi.useRealTimers();
    setSoundCloudContainer(null);
  });

  it('viewer가 등록한 기본 컨테이너에 iframe을 mount한다(document.body 직속 아님)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    setSoundCloudContainer(host);

    const widget = makeFakeWidget();
    const src = new SoundCloudSource('https://soundcloud.com/a/b', {
      widgetFactory: () => widget,
    });
    const loaded = src.load();
    widget.emit(EV.READY);
    await loaded;

    expect(host.querySelector('iframe')).not.toBeNull();
    expect(document.body.querySelector(':scope > iframe')).toBeNull();

    src.destroy();
    host.remove();
  });

  it('명시 container 옵션이 전역 기본값보다 우선한다', async () => {
    const globalHost = document.createElement('div');
    const explicitHost = document.createElement('div');
    document.body.append(globalHost, explicitHost);
    setSoundCloudContainer(globalHost);

    const widget = makeFakeWidget();
    const src = new SoundCloudSource('https://soundcloud.com/a/b', {
      widgetFactory: () => widget,
      container: explicitHost,
    });
    const loaded = src.load();
    widget.emit(EV.READY);
    await loaded;

    expect(explicitHost.querySelector('iframe')).not.toBeNull();
    expect(globalHost.querySelector('iframe')).toBeNull();

    src.destroy();
    globalHost.remove();
    explicitHost.remove();
  });
});
