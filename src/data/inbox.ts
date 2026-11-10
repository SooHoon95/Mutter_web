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
  sender_id: string | null;
  sender_nickname: string | null;
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
  // 보낸이 — 닉네임 미설정/무계정이면 null일 수 있다(안전 처리는 뷰에서).
  senderId: string | null;
  senderNickname: string | null;
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
    senderId: row.sender_id,
    senderNickname: row.sender_nickname,
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

// ---------------------------------------------------------------------------
// 삭제 · 받은 편지 삭제함 (0035) — 지우면 30일 보관, 되돌리기·복구·완전 삭제
// ---------------------------------------------------------------------------

/** 받은 편지함에서 지운다(서버 inbox 뷰가 보관으로 바꾼다). 보낸 사람의 편지는 그대로. */
export async function deleteInboxItems(letterIds: string[]): Promise<void> {
  if (letterIds.length === 0) return;
  const { error } = await getSupabase().from('inbox').delete().in('letter_id', letterIds);
  if (error) throw error;
}

/** 받은 편지 삭제함에서 되살린다(되돌리기 토스트·삭제함 공용). 되살린 수를 돌려준다. */
export async function restoreInboxItems(letterIds: string[]): Promise<number> {
  const { data, error } = await getSupabase().rpc('restore_inbox_items', { p_letter_ids: letterIds });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/** 받은 편지 삭제함에서 완전히 지운다. 링크를 다시 열면 받은 편지함에 다시 담긴다. */
export async function purgeInboxItems(letterIds: string[]): Promise<number> {
  const { data, error } = await getSupabase().rpc('purge_inbox_items', { p_letter_ids: letterIds });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/** 받은 편지 삭제함 항목. purgeAt 이후 서버 정리 작업이 지운다. */
export interface DeletedInboxItem {
  letterId: string;
  token: string;
  title: string;
  senderId: string | null;
  senderNickname: string | null;
  deletedAt: string;
  purgeAt: string;
}

interface DeletedInboxRow {
  letter_id: string;
  token: string;
  title: string | null;
  sender_id: string | null;
  sender_nickname: string | null;
  deleted_at: string;
  purge_at: string;
}

/** 내 받은 편지 삭제함 — 최근에 지운 순. */
export async function listDeletedInbox(): Promise<DeletedInboxItem[]> {
  const { data, error } = await getSupabase().rpc('get_my_deleted_inbox');
  if (error) throw error;
  return ((data ?? []) as DeletedInboxRow[]).map((row) => ({
    letterId: row.letter_id,
    token: row.token,
    title: row.title ?? '',
    senderId: row.sender_id,
    senderNickname: row.sender_nickname,
    deletedAt: row.deleted_at,
    purgeAt: row.purge_at,
  }));
}
