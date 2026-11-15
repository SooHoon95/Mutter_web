// supabase/functions/apple-notifications/index.ts — 배선만. 로직은 handler.ts.
// 배포: supabase functions deploy apple-notifications --no-verify-jwt (Apple이 부른다 — 서명으로 확인)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { verifyAppleJws } from '../_shared/appleJws.ts';
import { createHandler } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve(
  createHandler({
    verifyAppleJws: (jws) => verifyAppleJws(jws),
    async refund(transactionId, raw) {
      const { data, error } = await admin.rpc('refund_purchase', {
        p_platform: 'ios',
        p_keys: [transactionId],
        p_raw: raw,
      });
      if (error) throw new Error(`refund failed: ${error.message}`);
      return data === true;
    },
    log: (event) => console.log(JSON.stringify(event)),
  }),
);
