// 삭제함(0035) 공용 — 완전 삭제까지 남은 기간 문구. 보낸·받은 편지 삭제함이 같이 쓴다.

const DAY_MS = 24 * 60 * 60 * 1000;

/** 남은 시간을 일 단위로 올림(최소 1일), 이미 지났으면 "오늘". 앱(iOS·Android)과 같은 규칙. */
export function purgeLabel(purgeAt: string, now: number = Date.now()): string {
  const days = Math.ceil((new Date(purgeAt).getTime() - now) / DAY_MS);
  return days <= 0 ? '오늘 완전히 삭제' : `${days}일 후 완전히 삭제`;
}
