// 읽음 확인(read receipt) 데이터 레이어 — 발송함 편지별 열람 롤업.
// 보안 RPC get_my_letter_opens() 경유로만 조회한다(소유자 전용, security definer).
// 기록(record_letter_open)은 수신 경로라 links.ts에 둔다.

import { getSupabase } from './supabase';

/** get_my_letter_opens RPC가 반환하는 row 구조 */
interface LetterOpenRow {
  letter_id: string;
  open_count: number;
  last_opened_at: string;
}

/** 편지 한 통의 열람 요약(여러 링크의 합산). */
export interface LetterOpenSummary {
  letterId: string;
  /** 이 편지의 모든 링크가 열린 총 횟수. */
  openCount: number;
  /** 가장 최근에 열린 시각(ISO). */
  lastOpenedAt: string;
}

function rowToSummary(row: LetterOpenRow): LetterOpenSummary {
  return {
    letterId: row.letter_id,
    // RPC는 bigint를 문자열/숫자로 보낼 수 있으므로 명시적으로 숫자화한다.
    openCount: Number(row.open_count),
    lastOpenedAt: row.last_opened_at,
  };
}

/**
 * 내가 보낸 편지들의 열람 요약을 반환한다(열린 편지만).
 * RPC get_my_letter_opens() — letter_id로 그룹핑된 한 편지당 1행.
 */
export async function getMyLetterOpens(): Promise<LetterOpenSummary[]> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_my_letter_opens');
  if (error) throw error;
  return ((data as LetterOpenRow[]) ?? []).map(rowToSummary);
}
