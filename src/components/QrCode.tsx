import { useMemo } from 'react';
import { encodeToMatrix, type Ecc } from '@/lib/qr';

interface QrCodeProps {
  /** 인코딩할 값(예: 다운로드 URL). */
  value: string;
  /** 렌더 픽셀 크기(정사각 한 변). 기본 168. */
  size?: number;
  /** 코드 주변 여백(모듈 단위, quiet zone). 기본 2. */
  margin?: number;
  /** 오류정정 레벨. 기본 M. */
  ecc?: Ecc;
  className?: string;
}

/**
 * 인라인 SVG로 QR 코드를 렌더한다(래스터 이미지·외부 요청 없음).
 * 스캔 신뢰성을 위해 배경은 흰색 고정, 모듈은 currentColor.
 * 다크 배경 위에 얹을 땐 흰 카드로 감싸는 걸 전제로 한다.
 */
export function QrCode({
  value,
  size = 168,
  margin = 2,
  ecc = 'M',
  className,
}: QrCodeProps): React.ReactElement | null {
  const path = useMemo(() => {
    if (!value) return null;
    const modules = encodeToMatrix(value, ecc);
    const dim = modules.length;
    // 검은 모듈만 1x1 사각형 path로 누적 — rect 수천 개보다 단일 path가 가볍다.
    let d = '';
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        if (modules[y][x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
      }
    }
    return { d, viewBox: dim + margin * 2 };
  }, [value, ecc, margin]);

  if (!path) return null;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${path.viewBox} ${path.viewBox}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="앱 다운로드 QR 코드"
    >
      <rect width={path.viewBox} height={path.viewBox} fill="#ffffff" />
      <path d={path.d} fill="currentColor" />
    </svg>
  );
}
