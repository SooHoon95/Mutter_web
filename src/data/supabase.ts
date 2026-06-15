import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 단일 Supabase 클라이언트. anon key만 클라이언트에 둔다(service role 금지).
// 환경변수가 없으면(로컬 셋업 전) 호출 시점에 명확히 실패하도록 lazy 생성한다.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase 환경변수 누락: .env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 설정 필요',
    );
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
