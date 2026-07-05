// validateSchedule — 전달 링크 발급 시 "태어나자마자 죽은 링크"를 막는 스케줄 검증.
//
// 배경: 만료(expiresAt)·예약 공개(revealAt)는 datetime-local로 입력받는데, 가드가 없으면
// 사용자가 이미 지난 시각(예: 날짜만 고르면 00:00 = 오늘 자정)을 만료로 넣어 발급 즉시
// 만료된 링크가 생긴다 → 복붙해 열면 바로 "만료됨". 발급 전에 여기서 차단한다.
//
// 순수 함수(now 주입 가능) — UI와 분리해 단위 테스트로 동작을 증명한다.

export interface ScheduleInput {
  /** 만료 시각 ISO(UTC). 미설정이면 만료 없음. */
  expiresAt?: string;
  /** 예약 공개 시각 ISO(UTC). 미설정이면 즉시 공개. */
  revealAt?: string;
  /** 기준 현재 시각(ms). 테스트 주입용 — 기본 Date.now(). */
  now?: number;
}

/**
 * 스케줄이 유효하면 null, 문제가 있으면 사용자에게 보여줄 한국어 메시지를 반환한다.
 * 규칙:
 *  - 만료가 현재 이하 → 발급 즉시 만료(born-dead) → 차단.
 *  - 만료·공개가 함께 설정됐고 공개 ≥ 만료 → 열리기 전에 만료 → 차단.
 *  - 과거 공개(revealAt ≤ now)는 "즉시 공개"와 동일해 무해하므로 막지 않는다.
 */
export function validateSchedule({ expiresAt, revealAt, now = Date.now() }: ScheduleInput): string | null {
  const exp = expiresAt ? new Date(expiresAt).getTime() : null;
  const rev = revealAt ? new Date(revealAt).getTime() : null;

  if (exp !== null && Number.isNaN(exp)) return '만료 시각 형식이 올바르지 않아요.';
  if (rev !== null && Number.isNaN(rev)) return '예약 공개 시각 형식이 올바르지 않아요.';

  if (exp !== null && exp <= now) {
    return '만료 시각은 지금보다 뒤여야 해요. 이대로면 링크가 발급되자마자 만료돼요.';
  }
  if (exp !== null && rev !== null && rev >= exp) {
    return '예약 공개 시각이 만료보다 앞서야 해요. 이대로면 열리기 전에 만료돼요.';
  }
  return null;
}
