// Supabase profiles CRUD. supabase-data 스킬 참조.
// profiles(id, nickname, created_at, updated_at) — RLS: 본인 행만.
// delete_my_account() RPC는 서버사이드에서 사용자 데이터를 일괄 삭제한다.

import { getSupabase } from './supabase';

// ---------------------------------------------------------------------------
// DB row 타입 (profiles 테이블 스키마와 1:1)
// ---------------------------------------------------------------------------

interface ProfileRow {
  id: string;
  nickname: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// domain 타입
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  nickname: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// DB row → domain 매핑
// ---------------------------------------------------------------------------

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    nickname: row.nickname,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 현재 로그인 사용자의 프로필을 반환한다.
 * 프로필 행이 없으면(신규 가입 직후 등) null을 반환한다.
 * RLS에 의해 본인 행만 조회 가능하다.
 */
export async function getMyProfile(): Promise<Profile | null> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  if (!data) return null;
  return rowToProfile(data);
}

/**
 * 닉네임을 업데이트한다.
 * RLS가 본인 행만 update를 허용한다.
 */
export async function updateNickname(nickname: string): Promise<Profile> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from('profiles')
    .update({ nickname, updated_at: new Date().toISOString() })
    .select()
    .single<ProfileRow>();

  if (error) throw error;
  return rowToProfile(data);
}

/**
 * 계정과 관련 데이터를 삭제한다.
 * 서버사이드 RPC `delete_my_account()`가 Cascade로 모든 소유 데이터를 정리한다.
 * (클라이언트에서 테이블을 직접 delete하지 않는다 — RPC에 위임해 원자성 보장)
 */
export async function deleteMyAccount(): Promise<void> {
  const sb = getSupabase();

  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
}
