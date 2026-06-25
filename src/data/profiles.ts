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
 * 사용자 프로필을 반환한다. 프로필 행이 없으면(행이 비워진 경우 등) null.
 * `.eq('id', userId)`로 명시 필터한다 — RLS만 의존하지 않아 RLS 오설정 시에도
 * 타인 행이 새지 않고, 0행이면 maybeSingle이 null을 안전 반환한다.
 */
export async function getMyProfile(userId: string): Promise<Profile | null> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  if (!data) return null;
  return rowToProfile(data);
}

/**
 * 닉네임을 upsert한다(없으면 생성, 있으면 갱신).
 *
 * 근본 원인 수정: 기존 `.update()`는 profiles 행이 없을 때(트리거 미실행·행 비움 등)
 * 0행 매칭 → `.single()`이 에러 → "저장 실패"였다. upsert는 행 유무와 무관하게
 * 동작하므로 가입 트리거(0006)에 의존하지 않고도 항상 성공한다.
 * RLS(profiles_self_rw)가 `with check (auth.uid() = id)`로 본인 행만 허용한다.
 */
export async function upsertNickname(userId: string, nickname: string): Promise<Profile> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from('profiles')
    .upsert(
      { id: userId, nickname, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
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
