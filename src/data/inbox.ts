// inbox 데이터 레이어. supabase-data 스킬 참조.
// RPC save_to_inbox / get_my_inbox 를 통해 받은 편지함을 관리한다.
// 수신자가 로그인 상태일 때만 보관/조회가 가능하다(RLS).

import { getSupabase } from './supabase';

// ---------------------------------------------------------------------------
// RPC 반환 타입 (DB row와 1:1)
// ---------------------------------------------------------------------------

/** get_my_inbox RPC가 반환하는 row 구조 */
interface InboxRow {
  letter_id: string;
  token: string;
  title: string;
  saved_at: string;
}

// ---------------------------------------------------------------------------
// domain 타입
// ---------------------------------------------------------------------------

/** 받은 편지함 항목 */
export interface InboxItem {
  letterId: string;
  token: string;
  title: string;
  savedAt: string;
}

// ---------------------------------------------------------------------------
// DB row → domain 매핑
// ---------------------------------------------------------------------------

function rowToInboxItem(row: InboxRow): InboxItem {
  return {
    letterId: row.letter_id,
    token: row.token,
    title: row.title,
    savedAt: row.saved_at,
  };
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 현재 로그인한 수신자의 받은 편지함에 편지를 저장한다.
 * RPC save_to_inbox(p_token) — RLS로 세션 user에게만 허용.
 * 이미 저장된 경우 서버에서 무시(upsert 또는 idempotent).
 */
export async function saveToInbox(token: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc('save_to_inbox', { p_token: token });
  if (error) throw error;
}

/**
 * 현재 로그인한 사용자의 받은 편지함 목록을 반환한다.
 * RPC get_my_inbox() — saved_at 내림차순(최신 저장 순).
 */
export async function getMyInbox(): Promise<InboxItem[]> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_my_inbox');
  if (error) throw error;
  return ((data as InboxRow[]) ?? []).map(rowToInboxItem);
}
