/**
 * src/data/auth.ts
 *
 * Supabase 인증 래퍼. 컴포넌트/hook은 이 함수만 호출하고
 * supabase 클라이언트를 직접 사용하지 않는다.
 *
 * 매직링크 전략 근거: 비밀번호 없음 → 유출 표면 최소, 마찰 최소.
 * 세션은 Supabase가 localStorage에 지속(persistSession: true).
 */
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

/** 매직링크 발송. 이메일 입력 후 호출한다. */
export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({ email });
  if (error) throw error;
}

/** 로그아웃. 세션을 파기하고 localStorage를 정리한다. */
export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

/** 현재 세션을 반환한다. 세션 없으면 null. */
export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * 인증 상태 변경 구독. AuthProvider에서만 사용한다.
 * cleanup 함수를 반환하므로 useEffect에서 반드시 cleanup 호출 필요.
 */
export function onAuthChange(
  cb: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const { data } = getSupabase().auth.onAuthStateChange(cb);
  // Supabase v2: data.subscription.unsubscribe()로 정리
  return () => data.subscription.unsubscribe();
}
