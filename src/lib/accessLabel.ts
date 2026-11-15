// 영구 편지권(0037) 공용 문구 — 목록 상태·닫힘 예고·삭제 안내(0042)·날짜. 문구는 서버 계약의 문구 표와 같다.

import type { LetterAccess } from '@/data/access';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 오늘(로컬 날짜)부터 iso가 가리키는 날까지 달력 기준 일수. 같은 날이면 0. */
export function calendarDaysUntil(iso: string, now: Date = new Date()): number {
  const target = new Date(iso);
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((b - a) / DAY_MS);
}

/** "{M}월 {D}일" (로컬 날짜). */
export function monthDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 받은 사람 뷰어의 닫힘 예고 — 남은 기간이 warnDays일 이하일 때만, 그 전에는 null. */
export function closingNotice(
  accessUntil: string | null,
  warnDays: number,
  now: Date = new Date(),
): string | null {
  if (!accessUntil) return null;
  const days = calendarDaysUntil(accessUntil, now);
  if (days > warnDays) return null;
  return days <= 0 ? '이 편지는 오늘 닫혀요' : `이 편지는 ${days}일 뒤 닫혀요`;
}

/** 삭제 안내(0042) — 닫힌 뒤 graceDays일이 지나면 삭제된다는 한 문장. 일수는 서버 값(grace_days)만 쓴다. */
export function purgeNotice(graceDays: number): string {
  return `닫힌 뒤 ${graceDays}일이 지나면 삭제돼요.`;
}

/**
 * 발송 화면(링크 발급·연결 상대에게 보내기)의 무료 기간 안내. 일수는 서버 값(free_days·grace_days)만 쓴다.
 */
export function freePeriodNotice(freeDays: number, graceDays: number): string {
  return `받는 분이 처음 연 날부터 ${freeDays}일 동안 열려요. ${purgeNotice(graceDays)}`;
}

/**
 * 목록 상태 — `영구` / `{n}일 남음` / `닫힘 · {n}일 뒤 삭제`(당일 `닫힘 · 오늘 삭제`, 삭제 날짜를 모르면 `닫힘`).
 * 앱은 "닫힘"을 자물쇠 표시로 대신하지만 웹 목록에는 자물쇠가 없어 글자를 그대로 쓴다(표시하는 쪽이 nowrap으로 접힘을 막는다).
 * 아직 아무도 열지 않은 무료 편지는 시계가 돌지 않으므로 null.
 * 마지막 날은 "1일 남음"으로 둔다(0일 남음을 쓰지 않는다). 삭제까지 남은 날도 같은 달력 기준으로 센다.
 */
export function accessLabel(access: LetterAccess, now: Date = new Date()): string | null {
  if (access.state === 'permanent') return '영구';
  if (access.state === 'gone') return '닫힘';
  if (access.state === 'locked') {
    if (!access.deleteAt) return '닫힘';
    const days = calendarDaysUntil(access.deleteAt, now);
    return days <= 0 ? '닫힘 · 오늘 삭제' : `닫힘 · ${days}일 뒤 삭제`;
  }
  if (!access.accessUntil) return null;
  return `${Math.max(1, calendarDaysUntil(access.accessUntil, now))}일 남음`;
}
