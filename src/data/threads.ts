// threads 데이터 레이어 — 유저 간 주고받은 편지 연결. supabase-data 스킬 참조.
// 보안 RPC(get_counterparts / get_thread / get_my_sent_with_recipients) 경유로만 조회한다.
// RLS·security definer가 소유권을 강제하므로 클라이언트는 결과를 domain으로 매핑만 한다.

import { getSupabase } from './supabase';

// ---------------------------------------------------------------------------
// RPC 반환 타입 (DB row와 1:1)
// ---------------------------------------------------------------------------

/** get_counterparts RPC가 반환하는 row 구조 */
interface CounterpartRow {
  counterpart_id: string;
  nickname: string | null;
  letter_count: number;
  last_at: string;
}

/** get_thread RPC가 반환하는 row 구조 */
interface ThreadLetterRow {
  letter_id: string;
  token: string | null;
  title: string;
  direction: ThreadDirection;
  at: string;
}

/** get_my_sent_with_recipients RPC가 반환하는 row 구조 */
interface SentWithRecipientRow {
  letter_id: string;
  title: string;
  created_at: string;
  recipient_id: string | null;
  recipient_nickname: string | null;
  saved_at: string | null;
}

// ---------------------------------------------------------------------------
// domain 타입
// ---------------------------------------------------------------------------

/** 편지 방향 — 내가 보낸 편지(sent) / 내가 받은 편지(received). */
export type ThreadDirection = 'sent' | 'received';

/** 주고받은 상대(counterpart) 요약 */
export interface Counterpart {
  counterpartId: string;
  // 닉네임 미설정/무계정이면 null일 수 있다(안전 처리는 뷰에서).
  nickname: string | null;
  letterCount: number;
  lastAt: string;
}

/** 특정 상대와 주고받은 편지 한 통 */
export interface ThreadLetter {
  letterId: string;
  // received: 내 inbox 토큰(/l/:token). sent: 내가 소유 → 토큰 불필요(null 가능).
  token: string | null;
  title: string;
  direction: ThreadDirection;
  at: string;
}

/** 보낸 편지의 수신자 한 명 (한 편지에 여러 행일 수 있음) */
export interface SentWithRecipient {
  letterId: string;
  title: string;
  createdAt: string;
  // 아직 아무도 저장 안 했으면 recipient는 null.
  recipientId: string | null;
  recipientNickname: string | null;
  savedAt: string | null;
}

// ---------------------------------------------------------------------------
// DB row → domain 매핑
// ---------------------------------------------------------------------------

function rowToCounterpart(row: CounterpartRow): Counterpart {
  return {
    counterpartId: row.counterpart_id,
    nickname: row.nickname,
    letterCount: row.letter_count,
    lastAt: row.last_at,
  };
}

function rowToThreadLetter(row: ThreadLetterRow): ThreadLetter {
  return {
    letterId: row.letter_id,
    token: row.token,
    title: row.title,
    direction: row.direction,
    at: row.at,
  };
}

function rowToSentWithRecipient(row: SentWithRecipientRow): SentWithRecipient {
  return {
    letterId: row.letter_id,
    title: row.title,
    createdAt: row.created_at,
    recipientId: row.recipient_id,
    recipientNickname: row.recipient_nickname,
    savedAt: row.saved_at,
  };
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 현재 사용자와 편지를 주고받은 상대 목록을 반환한다.
 * RPC get_counterparts() — last_at 내림차순(최근 교류 순).
 */
export async function getCounterparts(): Promise<Counterpart[]> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_counterparts');
  if (error) throw error;
  return ((data as CounterpartRow[]) ?? []).map(rowToCounterpart);
}

/**
 * 특정 상대와 주고받은 편지를 시간순으로 반환한다.
 * RPC get_thread(p_counterpart) — direction으로 보냄/받음을 구분한다.
 */
export async function getThread(counterpartId: string): Promise<ThreadLetter[]> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_thread', { p_counterpart: counterpartId });
  if (error) throw error;
  return ((data as ThreadLetterRow[]) ?? []).map(rowToThreadLetter);
}

/**
 * 내가 보낸 편지를 수신자와 함께 반환한다.
 * RPC get_my_sent_with_recipients() — 한 편지에 수신자가 여러 명이면 여러 행,
 * 아직 아무도 저장 안 했으면 recipient null인 한 행.
 */
export async function getMySentWithRecipients(): Promise<SentWithRecipient[]> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_my_sent_with_recipients');
  if (error) throw error;
  return ((data as SentWithRecipientRow[]) ?? []).map(rowToSentWithRecipient);
}
