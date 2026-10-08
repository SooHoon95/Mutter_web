// 사진 축소·JPEG 인코딩(설계 §2 — 긴 변 2048px, JPEG 0.8). 업로드 전에 브라우저에서 처리한다.
//
// 왜 브라우저에서 줄이나: 폰 원본(4000px·5MB+)을 그대로 올리면 버킷 10MB 제한·수신자 데이터 비용에 걸린다.
// iOS·Android도 기기에서 같은 기준으로 줄이므로, 어느 플랫폼에서 넣은 사진이든 크기·화질이 비슷하다.
//
// EXIF 방향: createImageBitmap(file, { imageOrientation: 'from-image' })이 회전을 반영한 픽셀을 준다.
// 미지원 브라우저는 <img> 디코드로 대신한다 — 최신 브라우저의 <img>는 CSS image-orientation 기본값
// (from-image)으로 EXIF를 반영하므로 canvas에 그린 결과도 똑바로 선다.
// HEIC: Safari는 디코드하지만 Chrome·Firefox는 못 한다 → 두 경로 모두 실패하면 PhotoDecodeError.

/** 업로드 전 긴 변 상한(px). */
export const PHOTO_MAX_LONG_SIDE = 2048;
/** JPEG 품질(0~1). */
export const PHOTO_JPEG_QUALITY = 0.8;

export interface ResizedPhoto {
  jpeg: Blob;
  width: number;
  height: number;
}

/** 브라우저가 열 수 없는 형식(HEIC 등)·깨진 파일. 메시지는 그대로 사용자에게 보여준다. */
export class PhotoDecodeError extends Error {
  constructor() {
    super('이 사진은 브라우저에서 열 수 없어요. JPEG나 PNG 사진으로 다시 넣어 주세요.');
    this.name = 'PhotoDecodeError';
  }
}

/** 긴 변이 maxLongSide를 넘으면 비율을 지켜 줄인 크기. 이미 작으면 그대로(확대하지 않는다). */
export function fitWithin(
  width: number,
  height: number,
  maxLongSide = PHOTO_MAX_LONG_SIDE,
): { width: number; height: number } {
  const longSide = Math.max(width, height);
  if (longSide <= maxLongSide) return { width, height };
  const scale = maxLongSide / longSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeWithBitmap(file: Blob): Promise<Decoded> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
}

function decodeWithImage(file: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoDecodeError());
    };
    img.src = url;
  });
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await decodeWithBitmap(file);
    } catch {
      // 옵션 미지원(구형 Safari) 또는 형식 미지원 — <img> 경로로 한 번 더 시도한다.
    }
  }
  return decodeWithImage(file);
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PhotoDecodeError())),
      'image/jpeg',
      PHOTO_JPEG_QUALITY,
    );
  });
}

/** 파일 → 긴 변 ≤2048 JPEG(0.8) + 실제 픽셀 크기. 열 수 없으면 PhotoDecodeError. */
export async function resizePhotoToJpeg(file: Blob): Promise<ResizedPhoto> {
  const decoded = await decode(file);
  try {
    if (decoded.width <= 0 || decoded.height <= 0) throw new PhotoDecodeError();
    const { width, height } = fitWithin(decoded.width, decoded.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoDecodeError();
    // PNG 투명 영역이 JPEG에서 검게 뜨지 않도록 흰 바탕을 먼저 깐다.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const jpeg = await canvasToJpeg(canvas);
    return { jpeg, width, height };
  } finally {
    decoded.release();
  }
}
