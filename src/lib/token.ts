// 전달 링크 토큰 (capability URL). 토큰이 곧 권한이므로 추측 불가해야 한다.
// 규칙은 capability-links 스킬 참조: >=128bit, 순차성 없음, crypto 기반.

/** 토큰 엔트로피 바이트 수. 16바이트 = 128bit (요구사항 하한). */
export const TOKEN_BYTES = 16;

/** Uint8Array를 URL-safe base64(base64url, 패딩 제거)로 인코딩. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  // btoa는 jsdom·브라우저·Node(>=16) globalThis에 존재.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 추측 불가 전달 토큰을 생성한다.
 * @param bytes 엔트로피 바이트 수(기본 16 = 128bit). 하한 미만은 거부.
 */
export function generateToken(bytes: number = TOKEN_BYTES): string {
  if (bytes < TOKEN_BYTES) {
    throw new Error(`token entropy too low: ${bytes} bytes < ${TOKEN_BYTES}`);
  }
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toBase64Url(buf);
}

/**
 * 토큰이 최소 엔트로피(>=128bit)를 만족하는지 검증한다.
 * base64url 1글자 = 6bit → 128bit는 최소 22글자.
 */
export function assertTokenEntropy(token: string): void {
  const MIN_CHARS = Math.ceil((TOKEN_BYTES * 8) / 6); // 22
  if (token.length < MIN_CHARS) {
    throw new Error(`token too short: ${token.length} < ${MIN_CHARS}`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('token has non-url-safe characters');
  }
}
