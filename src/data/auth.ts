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

/**
 * 매직링크 발송. 이메일 입력 후 호출한다.
 * emailRedirectTo: 링크 클릭 후 현재 앱 origin으로 복귀(로컬·배포 자동 적응).
 * 단, 이 origin이 Supabase 대시보드 Authentication → URL Configuration의
 * Redirect URLs 허용목록에 등록돼 있어야 한다.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const emailRedirectTo =
    typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
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

/**
 * 소셜 OAuth 로그인. Google 또는 Kakao 제공자로 리다이렉트한다.
 *
 * 주의: 실제 동작을 위해 Supabase 대시보드 Authentication → Providers에서
 * Google/Kakao client id·secret을 각각 등록해야 한다.
 * redirectTo: OAuth 완료 후 현재 앱 origin으로 복귀(로컬·배포 자동 적응).
 */
export async function signInWithProvider(provider: 'google' | 'kakao'): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}
