// 표시 이름 해석 — 닉네임 > 소셜 로그인 이름 > 이메일 아이디 > 기본값.
//
// 소셜 로그인(구글/카카오)은 사용자 실명/닉네임을 user_metadata에 담아준다.
//   - 구글: full_name / name
//   - 카카오: name / nickname (OIDC면 nickname/name)
// 기본값은 "사람 이름" — 이름이 없을 때만 이메일 아이디로 폴백한다.
import type { User } from '@supabase/supabase-js';

const pick = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * 소셜 로그인 메타데이터의 "사람 이름"만 반환한다(이메일 아이디 폴백 없음).
 * profiles 닉네임 시드용 — 이메일 아이디를 닉네임으로 굳히지 않기 위해 이름이 없으면 ''.
 */
export function socialDisplayName(user: User | null | undefined): string {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return (
    pick(meta.full_name) ||
    pick(meta.name) ||
    pick(meta.nickname) ||
    pick(meta.user_name) ||
    pick(meta.preferred_username)
  );
}

/** 표시 이름 — 닉네임 > 소셜 실명 > 이메일 아이디 > 기본값. */
export function resolveDisplayName(
  nickname: string | null | undefined,
  user: User | null | undefined,
): string {
  return (
    pick(nickname) || // 사용자가 직접 설정한 닉네임(있으면 우선)
    socialDisplayName(user) || // 소셜 실명
    (user?.email ? user.email.split('@')[0] : '') || // 이름이 전혀 없을 때만 아이디
    '나'
  );
}
