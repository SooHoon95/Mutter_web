// supabase/functions/_shared/googlePlay.ts
//
// Google Play Developer API 호출용 액세스 토큰(서비스 계정 → OAuth). verify-purchase·play-voided-sync가 같이 쓴다.
// 서비스 계정은 Play Console의 "사용자 및 권한"에 초대돼 있어야 하고 "재무 데이터 보기" 권한이 필요하다.

export const PLAY_PACKAGE = 'com.efreedom.mutter';

const base64url = (data: ArrayBuffer | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function playAccessToken(serviceAccountJson: string): Promise<string> {
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
