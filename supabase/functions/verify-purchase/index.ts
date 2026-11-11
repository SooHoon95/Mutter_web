// supabase/functions/verify-purchase/index.ts
//
// 편지권 구매 검증 → 지급. 로직은 handler.ts, 여기서는 Supabase·Google Play 배선만 한다.
// 설계: Mutter docs/superpowers/specs/2026-11-11-permanent-letter-ticket-design.md (5.6, 9절).
//
// 환경변수:
//   PURCHASE_MODE              'test'만 지원. 그 외·미설정이면 501(닫힘).
//   PLAY_SERVICE_ACCOUNT_JSON  Google Play 서비스 계정 키(JSON 문자열). 없으면 Android는 501.
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 런타임 자동 주입)
//
// 배포: supabase functions deploy verify-purchase --no-verify-jwt (함수 안에서 직접 인증)
//       supabase secrets set PURCHASE_MODE=test

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { BUNDLE_ID, createHandler, type PlayPurchase } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ── Google Play Developer API (서비스 계정 → OAuth 액세스 토큰) ──────────────────────────────

const base64url = (data: ArrayBuffer | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function playAccessToken(serviceAccountJson: string): Promise<string> {
  const account = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) +
    '.' +
    base64url(
      JSON.stringify({
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 600,
      }),
    );
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`play token ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

Deno.serve(
  createHandler({
    mode: Deno.env.get('PURCHASE_MODE') ?? null,

    async getUserId(jwt) {
      const { data, error } = await admin.auth.getUser(jwt);
      return error || !data.user ? null : data.user.id;
    },

    async isTester(userId) {
      const { data, error } = await admin
        .from('purchase_testers')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(`tester lookup failed: ${error.message}`);
      return data !== null;
    },

    async fetchPlayPurchase(productId, purchaseToken) {
      const serviceAccount = Deno.env.get('PLAY_SERVICE_ACCOUNT_JSON');
      if (!serviceAccount) return 'unconfigured';
      const token = await playAccessToken(serviceAccount);
      const res = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${BUNDLE_ID}` +
          `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // 스토어가 모르는 토큰(400·404·410)은 "유효하지 않은 영수증"이다. 그 밖(401·403·5xx)은 설정·장애.
      if (res.status === 400 || res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw new Error(`play purchase ${res.status}`);
      return (await res.json()) as PlayPurchase;
    },

    async credit({ userId, platform, productId, transactionId, tickets, environment, raw }) {
      const { data, error } = await admin.rpc('credit_purchase', {
        p_user: userId,
        p_platform: platform,
        p_product_id: productId,
        p_transaction_id: transactionId,
        p_tickets: tickets,
        p_environment: environment,
        p_raw: raw,
      });
      if (error) throw new Error(`credit failed: ${error.message}`);
      return data === true;
    },

    async balance(userId) {
      const { data, error } = await admin.from('ticket_ledger').select('delta').eq('user_id', userId);
      if (error) throw new Error(`balance failed: ${error.message}`);
      return ((data ?? []) as { delta: number }[]).reduce((sum, row) => sum + row.delta, 0);
    },
  }),
);
