// supabase/functions/_shared/appleJws.ts
//
// App Store가 서명한 JWS(StoreKit 2 거래 · App Store Server Notifications V2)를 검증한다.
// Apple 공식 라이브러리(app-store-server-library)의 SignedDataVerifier와 같은 절차를 Deno에서 직접 한다:
//   1. 헤더 alg = ES256, x5c = [leaf, intermediate, root]
//   2. root가 우리가 가진 Apple Root CA - G3와 바이트 단위로 같다
//   3. leaf ← intermediate ← root 순서로 인증서 서명이 맞다
//   4. leaf에 App Store 영수증 서명용 OID(1.2.840.113635.100.6.11.1), intermediate에 Apple WWDR OID(1.2.840.113635.100.6.2.1)
//   5. 서명 시각(signedDate, 없으면 지금)에 leaf·intermediate가 유효 기간 안
//   6. JWS 서명이 leaf 공개키로 맞다
// 온라인 폐기 확인(OCSP)은 하지 않는다(공식 라이브러리도 선택 사항).

import * as x509 from 'npm:@peculiar/x509@1.12.3';
import { APPLE_ROOT_CA_G3_BASE64 } from './appleRootCa.ts';

x509.cryptoProvider.set(crypto);

const LEAF_OID = '1.2.840.113635.100.6.11.1';
const INTERMEDIATE_OID = '1.2.840.113635.100.6.2.1';

const fromBase64 = (b64: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const fromBase64Url = (s: string): Uint8Array<ArrayBuffer> => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
};
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const APPLE_ROOTS: Uint8Array[] = [fromBase64(APPLE_ROOT_CA_G3_BASE64)];

/**
 * 검증에 성공하면 페이로드, 아니면 null. 예외를 던지지 않는다.
 * @param roots 믿는 루트 인증서(DER). 기본은 Apple Root CA - G3. 시험할 때만 바꾼다.
 */
export async function verifyAppleJws(
  jws: string,
  roots: Uint8Array[] = APPLE_ROOTS,
): Promise<Record<string, unknown> | null> {
  try {
    const parts = jws.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const header = JSON.parse(new TextDecoder().decode(fromBase64Url(h))) as { alg?: string; x5c?: string[] };
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(p))) as Record<string, unknown>;
    if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) return null;

    const ders = header.x5c.map(fromBase64);
    if (!roots.some((root) => sameBytes(root, ders[2]))) return null;
    const [leaf, intermediate, root] = ders.map((d) => new x509.X509Certificate(d));

    if (!(await leaf.verify({ publicKey: intermediate.publicKey, signatureOnly: true }))) return null;
    if (!(await intermediate.verify({ publicKey: root.publicKey, signatureOnly: true }))) return null;
    if (!leaf.extensions.some((e) => e.type === LEAF_OID)) return null;
    if (!intermediate.extensions.some((e) => e.type === INTERMEDIATE_OID)) return null;

    const at = typeof payload.signedDate === 'number' ? new Date(payload.signedDate) : new Date();
    for (const cert of [leaf, intermediate]) {
      if (at < cert.notBefore || at > cert.notAfter) return null;
    }

    const key = await crypto.subtle.importKey(
      'spki',
      leaf.publicKey.rawData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64Url(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    return ok ? payload : null;
  } catch {
    return null;
  }
}
