// supabase/functions/play-voided-sync/index.ts
//
// Google Play에서 환불·취소된 구매(Voided Purchases API)를 가져와 편지권에 반영한다. pg_cron이 하루 한 번 부른다(0043).
// 최근 7일을 매번 다시 본다 — refund_purchase가 같은 환불을 두 번 반영하지 않으므로 겹쳐도 된다.
// 누가 불러도 Google이 환불됐다고 한 구매만 반영하므로 따로 인증하지 않는다.
//
// 환경변수: PLAY_SERVICE_ACCOUNT_JSON (없으면 아무것도 하지 않고 200 { skipped: true })
// 배포: supabase functions deploy play-voided-sync --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PLAY_PACKAGE, playAccessToken } from '../_shared/googlePlay.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface VoidedPurchase {
  purchaseToken?: string;
  orderId?: string;
  voidedTimeMillis?: string;
  voidedSource?: number;
  voidedReason?: number;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const serviceAccount = Deno.env.get('PLAY_SERVICE_ACCOUNT_JSON');
  if (!serviceAccount) return json(200, { skipped: true });

  try {
    const token = await playAccessToken(serviceAccount);
    const startTime = Date.now() - WINDOW_MS;
    let pageToken: string | undefined;
    let seen = 0;
    let refunded = 0;
    do {
      const url = new URL(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/purchases/voidedpurchases`,
      );
      url.searchParams.set('startTime', String(startTime));
      url.searchParams.set('type', '0'); // 일회성 상품
      url.searchParams.set('maxResults', '1000');
      if (pageToken) url.searchParams.set('token', pageToken);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`voided list ${res.status}`);
      const page = (await res.json()) as {
        voidedPurchases?: VoidedPurchase[];
        tokenPagination?: { nextPageToken?: string };
      };
      for (const v of page.voidedPurchases ?? []) {
        seen++;
        const keys = [v.orderId, v.purchaseToken].filter((k): k is string => typeof k === 'string' && k.length > 0);
        if (keys.length === 0) continue;
        const { data, error } = await admin.rpc('refund_purchase', {
          p_platform: 'android',
          p_keys: keys,
          p_raw: {
            voidedTimeMillis: v.voidedTimeMillis ?? null,
            voidedSource: v.voidedSource ?? null,
            voidedReason: v.voidedReason ?? null,
          },
        });
        if (error) throw new Error(`refund failed: ${error.message}`);
        if (data === true) refunded++;
      }
      pageToken = page.tokenPagination?.nextPageToken;
    } while (pageToken);

    console.log(JSON.stringify({ evt: 'play_voided_sync', seen, refunded }));
    return json(200, { seen, refunded });
  } catch (e) {
    console.error(JSON.stringify({ evt: 'play_voided_sync', ok: false, err: String(e) }));
    return json(500, { error: 'internal' });
  }
});
