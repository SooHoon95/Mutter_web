/**
 * src/data/auth.ts
 *
 * Supabase 인증 래퍼. 컴포넌트/hook은 이 함수만 호출하고
 * supabase 클라이언트를 직접 사용하지 않는다.
 *
 * 코드 인증 전략: signInWithOtp → "Magic Link" 이메일 템플릿의 {{ .Token }} 이
 * 6자리 코드로 채워진다. 회원가입(requestEmailCode)과 비밀번호 없는 계정 로그인
 * (sendMagicLink)이 동일한 코드 메일을 사용한다. 검증은 verifyEmailOtp(type 'email').
 * 세션은 Supabase가 localStorage에 지속(persistSession: true).
 */
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

/**
 * 비밀번호 없는(구) 계정 코드 발송. 이메일 입력 후 호출한다.
 *
 * "Magic Link" 이메일 템플릿의 {{ .Token }} 이 6자리 코드로 채워진다.
 * 링크는 포함되지 않으므로, 수신한 코드를 코드 입력 화면(awaitingCode)에 입력해 인증한다.
 * 검증은 verifyEmailOtp(type 'email').
 *
 * emailRedirectTo: 혹시 남아 있는 링크 클릭 대비 복귀 origin. Supabase Redirect URLs 허용목록 필요.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const emailRedirectTo =
    typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });
  if (error) throw error;
}

/**
 * 이메일 OTP 코드 검증. 사용자가 메일로 받은 6자리 코드를 입력하면 호출한다.
 * 성공 시 **이 기기**에 세션이 생성된다(onAuthStateChange 발화 → AuthProvider 갱신).
 * 즉 "코드를 입력한 기기 = 로그인되는 기기"가 되어, 메일을 다른 기기에서 읽어도
 * 요청한 기기에서 인증을 마칠 수 있다.
 */
export async function verifyEmailOtp(email: string, code: string): Promise<void> {
  const { error } = await getSupabase().auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  });
  if (error) throw error;
}

/**
 * 비밀번호 로그인. 가입(+이메일 인증) 이후 매번 이메일 없이 이 경로로 로그인한다.
 * 실패 사유: 자격 불일치 / 이메일 미인증 등 → 호출부에서 메시지 정규화.
 */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * 회원가입/이메일 인증 6자리 코드 요청.
 * signInWithOtp는 **"Magic Link" 이메일 템플릿**을 사용하고, 그 템플릿의 {{ .Token }} 이
 * 6자리 코드로 채워진다(signUp의 "Confirm signup" 템플릿은 .Token이 비어 코드가 안 옴 — 그래서 이걸 씀).
 * shouldCreateUser: 신규 이메일이면 계정을 생성한다. 검증은 verifyEmailOtp(type 'email').
 */
export async function requestEmailCode(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/**
 * 로그인 상태에서 비밀번호 설정/변경. 코드 인증 직후 호출해 비번을 건다
 * → 이후부터는 이메일+비밀번호(signInWithPassword)로 로그인.
 */
export async function setUserPassword(password: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error) throw error;
}

/** 로그아웃. 세션을 파기하고 localStorage를 정리한다. */
export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

/**
 * 현재 세션의 유저가 서버에 여전히 유효한지 검증한다.
 *
 * getSession()은 **로컬 저장값만** 읽으므로, 대시보드에서 유저를 삭제해도
 * 이미 발급된 access token(JWT)이 만료(기본 1h)되기 전까지 로컬 세션이 남는다
 * → 새로고침해도 로그인 상태로 보인다. getUser()는 **서버에 토큰을 검증**하므로
 * 삭제·무효 유저(401/403)를 잡아낸다. 무효면 signOut()으로 로컬 세션을 정리하고,
 * 그 변화는 onAuthStateChange(SIGNED_OUT)로 앱 전역에 전파된다.
 *
 * 네트워크 오류(오프라인 등 status 없음/5xx)에는 로그아웃하지 않는다(오탐 방지).
 */
export async function revalidateSession(): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (!data.session) return; // 비로그인 — 검증 불필요

  const { error } = await sb.auth.getUser();
  if (!error) return; // 유효

  const status = (error as { status?: number }).status;
  // 인증 거부(삭제/무효 유저)만 로그아웃. 네트워크/서버 오류는 세션 유지.
  if (status === 401 || status === 403) {
    await sb.auth.signOut();
  }
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
 * 소셜 OAuth 로그인. Google·Kakao·Apple 제공자로 리다이렉트한다.
 *
 * 주의: 실제 동작을 위해 Supabase 대시보드 Authentication → Providers에서 각 제공자를 등록해야 한다.
 * - Google/Kakao: client id·secret.
 * - Apple(웹): Services ID + Secret Key(.p8 서명 JWT). 네이티브(iOS)는 번들ID만으로 되지만,
 *   웹은 OAuth 리다이렉트 플로우라 별도 Services ID가 필요하다.
 * redirectTo: OAuth 완료 후 현재 앱 origin으로 복귀(로컬·배포 자동 적응).
 */
export async function signInWithProvider(provider: 'google' | 'kakao' | 'apple'): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}
