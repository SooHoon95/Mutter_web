// connections 데이터 레이어 — 특정 사람과의 연결(초대 링크 + 직접 발송). supabase-data 스킬 참조.
// 보안 RPC(create_connect_invite / get_connect_invite / accept_connect_invite /
// get_my_connections / send_to_connection) 경유로만 동작한다.
// 토큰은 capability-links 규칙대로 클라이언트에서 generateToken()으로 생성해 RPC에 넘긴다.

import { generateToken } from '@/lib/token';
import { getSupabase } from './supabase';

// ---------------------------------------------------------------------------
// RPC 반환 타입 (DB row와 1:1)
// ---------------------------------------------------------------------------

/** get_connect_invite RPC가 반환하는 row 구조 */
interface ConnectInviteRow {
  inviter_id: string;
  inviter_nickname: string | null;
  is_self: boolean;
  already_connected: boolean;
}

/** get_my_connections RPC가 반환하는 row 구조 */
interface ConnectionRow {
  user_id: string;
  nickname: string | null;
  connected_at: string;
}

// ---------------------------------------------------------------------------
// domain 타입
// ---------------------------------------------------------------------------

/** 초대 링크를 열었을 때 보여줄 초대자 정보 */
export interface ConnectInvite {
  inviterId: string;
  // 닉네임 미설정이면 null일 수 있다(안전 처리는 뷰에서).
  inviterNickname: string | null;
  // 본인이 만든 초대를 본인이 연 경우 — 수락 불가.
  isSelf: boolean;
  // 이미 연결된 상대 — 다시 수락할 필요 없음.
  alreadyConnected: boolean;
}

/** 나와 연결된 사람 한 명 */
export interface Connection {
  userId: string;
  nickname: string | null;
  connectedAt: string;
}

// ---------------------------------------------------------------------------
// DB row → domain 매핑
// ---------------------------------------------------------------------------

function rowToInvite(row: ConnectInviteRow): ConnectInvite {
  return {
    inviterId: row.inviter_id,
    inviterNickname: row.inviter_nickname,
    isSelf: row.is_self,
    alreadyConnected: row.already_connected,
  };
}

function rowToConnection(row: ConnectionRow): Connection {
  return {
    userId: row.user_id,
    nickname: row.nickname,
    connectedAt: row.connected_at,
  };
}

/** setof 반환 RPC는 배열로 온다 — 단일 행 RPC도 안전하게 첫 행을 꺼낸다. */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T) ?? null;
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 연결 초대를 생성하고 토큰을 반환한다.
 * 토큰은 클라이언트에서 generateToken()으로 만들어 RPC에 넘긴다(capability-links).
 */
export async function createInvite(): Promise<string> {
  const sb = getSupabase();
  const token = generateToken();
  const { error } = await sb.rpc('create_connect_invite', { p_token: token });
  if (error) throw error;
  return token;
}

/**
 * 토큰으로 초대 정보를 조회한다(로그인 필요).
 * RPC get_connect_invite(p_token) — is_self/already_connected로 수락 가능 여부를 판단한다.
 */
export async function getInvite(token: string): Promise<ConnectInvite> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_connect_invite', { p_token: token });
  if (error) throw error;
  const row = firstRow<ConnectInviteRow>(data);
  if (!row) throw new Error('초대를 찾을 수 없습니다.');
  return rowToInvite(row);
}

/**
 * 초대를 수락해 두 사용자를 연결한다.
 * RPC accept_connect_invite(p_token) — 서버가 양방향 연결을 기록한다.
 */
export async function acceptInvite(token: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc('accept_connect_invite', { p_token: token });
  if (error) throw error;
}

/**
 * 현재 사용자와 연결된 사람 목록을 반환한다.
 * RPC get_my_connections() — connected_at 순.
 */
export async function getMyConnections(): Promise<Connection[]> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_my_connections');
  if (error) throw error;
  return ((data as ConnectionRow[]) ?? []).map(rowToConnection);
}

/**
 * 연결된 사람에게 편지를 직접 발송한다(상대 받은 편지함으로).
 * 토큰은 클라이언트에서 generateToken()으로 생성해 RPC에 넘긴다.
 * RPC send_to_connection(p_letter_id, p_recipient, p_token).
 */
export async function sendToConnection(
  letterId: string,
  recipientId: string,
): Promise<void> {
  const sb = getSupabase();
  const token = generateToken();
  const { error } = await sb.rpc('send_to_connection', {
    p_letter_id: letterId,
    p_recipient: recipientId,
    p_token: token,
  });
  if (error) throw error;
}
