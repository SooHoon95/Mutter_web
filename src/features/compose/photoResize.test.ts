// photoResize 단위 테스트 — 크기 계산(순수)과 디코드 실패 처리(HEIC 등). 캔버스 인코딩 자체는 실브라우저 영역.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PHOTO_MAX_LONG_SIDE, PhotoDecodeError, fitWithin, resizePhotoToJpeg } from './photoResize';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fitWithin', () => {
  it('긴 변을 2048로 맞추고 비율을 지킨다(세로·가로)', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 });
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(PHOTO_MAX_LONG_SIDE).toBe(2048);
  });

  it('이미 작으면 확대하지 않는다', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(2048, 100)).toEqual({ width: 2048, height: 100 });
  });

  it('아주 긴 파노라마도 짧은 변이 0이 되지 않는다', () => {
    expect(fitWithin(100000, 10)).toEqual({ width: 2048, height: 1 });
  });
});

describe('resizePhotoToJpeg — 디코드 실패', () => {
  it('createImageBitmap과 <img> 모두 못 열면 PhotoDecodeError(친절한 한국어 메시지)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.reject(new DOMException('bad', 'InvalidStateError'))));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    // jsdom의 Image는 디코드를 하지 않으므로 src 설정 시 바로 onerror를 부르는 가짜로 바꾼다.
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailingImage);

    const err = await resizePhotoToJpeg(new Blob(['heic'], { type: 'image/heic' })).catch((e) => e);
    expect(err).toBeInstanceOf(PhotoDecodeError);
    expect((err as Error).message).toContain('브라우저에서 열 수 없어요');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
});
