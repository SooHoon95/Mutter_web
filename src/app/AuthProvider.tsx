/**
 * src/app/AuthProvider.tsx
 *
 * 인증 상태를 전역 Context로 제공한다.
 * onAuthStateChange를 구독해 세션 변화(로그인·로그아웃·토큰 갱신)를 실시간 반영한다.
 *
 * useAuth() hook을 통해 { session, user, loading }에 접근한다.
 * loading=true 동안 세션 확인 중이므로 RequireAuth는 이때 스피너를 표시한다.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { onAuthChange } from '@/data/auth';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): ReactNode {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChange는 마운트 시 즉시 INITIAL_SESSION 이벤트로 현재 세션을 반환한다.
    // 따라서 별도 getCurrentSession() 호출 없이 이 구독으로 초기 로딩을 처리할 수 있다.
    const unsubscribe = onAuthChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });

    // 구독 정리 — 컴포넌트 언마운트 시 메모리 누수 방지
    return unsubscribe;
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * 인증 상태에 접근하는 hook.
 * AuthProvider 외부에서 호출하면 즉시 오류를 발생시켜 잘못된 트리 구조를 조기에 발견한다.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
