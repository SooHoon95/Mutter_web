// Paragraph(데이터 계약) → PaginatedParagraph(렌더 입력) 변환. 수신 뷰어·소유자 미리보기 공용.
//
// 사진 단락(0034)은 서명 URL 맵(path → URL)에서 src를 찾는다. 캐시 키가 path라서
// URL이 재발급돼도 같은 단락에 그대로 붙는다.
//   - photoUrls === null : 아직 받는 중 → 로딩 플레이스홀더
//   - 맵에 path가 없음   : 서명 실패(객체 없음·남의 경로로 걸러짐) → 실패 플레이스홀더
//   - photoUrlsFailed    : 함수 호출 자체 실패 → 모든 사진 실패 플레이스홀더(본문은 그대로)

import type { Paragraph } from '@/data/types';
import type { PaginatedParagraph } from './Paginated';

export function toPaginatedParagraphs(
  paragraphs: Paragraph[],
  photoUrls: Record<string, string> | null = null,
  photoUrlsFailed = false,
): PaginatedParagraph[] {
  return paragraphs.map((p) => {
    if (!p.photo) return { id: p.id, text: p.text };
    const src = photoUrls?.[p.photo.path];
    return {
      id: p.id,
      text: '',
      photo: {
        width: p.photo.width,
        height: p.photo.height,
        src,
        failed: photoUrlsFailed || (photoUrls !== null && !src),
      },
    };
  });
}
