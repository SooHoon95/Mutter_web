// supabase/functions/send-push/index.ts
//
// FCM HTTP v1로 푸시를 보낸다. DB 트리거(pg_net)가 이벤트 발생 시 호출한다.
//
// 요청(POST, x-push-secret 헤더로 인증):
//   { recipient_user_id: uuid, title: string, body: string, data?: Record<string,string> }
//
// 동작:
//   1) 공유 시크릿 검증(트리거만 호출 가능 — verify_jwt=false로 배포)
//   2) service role로 수신자 push_tokens 조회(RLS 우회)
//   3) 서비스계정으로 Google OAuth 액세스토큰 발급(RS256)
//   4) 토큰별 messages:send. UNREGISTERED/무효 → 해당 토큰 행 삭제(위생)
//
// 필요한 시크릿(supabase secrets set):
//   FCM_SERVICE_ACCOUNT  = Firebase 서비스계정 JSON 전체(문자열)
//   PUSH_TRIGGER_SECRET  = 트리거↔함수 공유 비밀(임의 랜덤 문자열)
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 런타임 자동 주입)

import { createClient } from 'jsr:@supabase/supabase-js@2';

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

/** 서비스계정 → Google OAuth 액세스토큰(FCM 전송 스코프). */
async function getAccessToken(sa: {
  client_email: string;
  private_key: string;
  token_uri: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)),
  );
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`OAuth token 실패: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // 1) 공유 시크릿 검증(트리거만 호출)
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_TRIGGER_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { recipient_user_id, title, body, data } = await req.json().catch(() => ({}));
  if (!recipient_user_id || !title) return new Response('Bad request', { status: 400 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 2) 수신자 토큰(여러 기기 가능)
  const { data: rows, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', recipient_user_id);
  if (error) return new Response(`DB error: ${error.message}`, { status: 500 });
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no tokens' }), { status: 200 });
  }

  // 3) FCM 액세스토큰
  const sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT')!);
  const accessToken = await getAccessToken(sa);
  const projectId = sa.project_id;

  // 4) 토큰별 발송 + 무효 토큰 정리
  let sent = 0;
  const stale: string[] = [];
  for (const { token } of rows) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body: body ?? '' },
          data: data ?? {},
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        },
      }),
    });
    if (res.ok) {
      sent++;
    } else {
      const errJson = await res.json().catch(() => ({}));
      const code = errJson?.error?.details?.[0]?.errorCode ?? errJson?.error?.status;
      if (res.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') {
        stale.push(token); // 죽은 토큰 → 정리 대상
      }
    }
  }
  if (stale.length) await supabase.from('push_tokens').delete().in('token', stale);

  return new Response(JSON.stringify({ sent, cleaned: stale.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
