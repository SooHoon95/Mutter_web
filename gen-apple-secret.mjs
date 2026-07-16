// gen-apple-secret.mjs
// Apple "Sign in with Apple" 웹 OAuth 클라이언트 시크릿(JWT) 생성기.
// - .p8 개인키는 로컬에서만 읽고 어디로도 전송하지 않는다(Node 내장 crypto만 사용, 의존성 0).
// - 출력된 JWT를 Supabase → Authentication → Providers → Apple → "Secret Key (for OAuth)"에 붙여넣는다.
//
// 사용법:
//   node gen-apple-secret.mjs \
//     --p8 ./AuthKey_XXXXXX.p8 \
//     --team <Team ID> \
//     --key  <Key ID> \
//     --services <Services ID>   (예: com.efreedom.mutter.web)
//
// 값 위치:
//   - Team ID    : Apple Developer 우상단 계정 / Membership 페이지
//   - Key ID     : Keys 목록에서 그 .p8 키의 ID (파일명 AuthKey_<KeyID>.p8 에도 들어있음)
//   - Services ID: 방금 만든 웹용 Services 식별자(=Supabase Client ID)

import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const p8Path = arg('p8');
const teamId = arg('team');
const keyId = arg('key');
const servicesId = arg('services');

if (!p8Path || !teamId || !keyId || !servicesId) {
  console.error(`\n[사용법]
  node gen-apple-secret.mjs --p8 <AuthKey_XXX.p8 경로> --team <Team ID> --key <Key ID> --services <Services ID>

[예]
  node gen-apple-secret.mjs --p8 ./AuthKey_ABC123.p8 --team 4QCSG92KD9 --key ABC123 --services com.efreedom.mutter.web\n`);
  process.exit(1);
}

const privateKeyPem = readFileSync(p8Path, 'utf8');

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const now = Math.floor(Date.now() / 1000);
const exp = now + 15777000; // ~182.5일 = Apple 허용 최대(6개월)

const header = { alg: 'ES256', kid: keyId };
const payload = {
  iss: teamId,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: servicesId, // 웹 client_id = Services ID
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

// ES256: ECDSA P-256 + SHA-256. JWT는 raw R||S(64B) 서명을 요구하므로 ieee-p1363.
const signature = crypto.sign('sha256', Buffer.from(signingInput), {
  key: crypto.createPrivateKey(privateKeyPem),
  dsaEncoding: 'ieee-p1363',
});

const jwt = `${signingInput}.${b64url(signature)}`;

console.log('\n=== Apple 클라이언트 시크릿 (Supabase "Secret Key (for OAuth)"에 붙여넣기) ===\n');
console.log(jwt);
console.log(`\n(만료: ${new Date(exp * 1000).toISOString()} — 만료 시 이 스크립트 다시 실행해 재발급)\n`);
