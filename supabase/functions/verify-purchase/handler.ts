// supabase/functions/verify-purchase/handler.ts
//
// verify-purchase의 순수 로직(요청 해석·모드/테스터 관문·영수증 판정·응답 모양).
// 외부 호출은 deps로 주입받는다(letter-photo-urls/handler.ts와 같은 구조). 배선은 index.ts.
//
// 계약(iOS·Android가 같이 쓴다):
//   요청  POST + Authorization: Bearer <user JWT>
//         iOS     { platform: 'ios', jws: '<StoreKit 2 Transaction JWS>' }
//         Android { platform: 'android', productId: 'mutter.ticket.1', purchaseToken: '…' }
//   응답  200 { granted: boolean, tickets: number }   — tickets = 지급 후 잔액
//         granted=false는 "이미 지급된 영수증"이며 성공이다. 앱은 이때도 거래를 finish/consume 한다.
//   오류  401 unauthorized · 403 not_tester · 400 bad_request · 400 invalid_receipt · 400 unknown_product
//         501 store_mode_unavailable · 501 android_verify_unconfigured          본문 { error: '<코드>' }
//
// 테스트 모드(PURCHASE_MODE=test)만 구현돼 있다. 이 모드는 iOS 영수증의 서명을 검증하지 않는다
// (Xcode StoreKit 테스트 결제는 Apple 서명이 아니라 검증 자체가 불가능하다). 그래서
// **purchase_testers에 든 계정에만 지급한다 — 이 관문이 테스트 모드의 유일한 안전장치다.**
// 모드가 test가 아니면(미설정 포함) 501로 닫힌다 → 실수로 검증 없이 열리지 않는다.

/** 상품 ID → 편지권 장수. 스토어에 등록하는 상품과 같아야 한다. */
export const PRODUCT_TICKETS: Record<string, number> = {
  'mutter.ticket.1': 1,
  'mutter.ticket.5': 5,
};

export const BUNDLE_ID = 'com.efreedom.mutter';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY_BYTES = 16 * 1024;

/** Google Play purchases.products.get 응답 중 쓰는 필드. */
export interface PlayPurchase {
  purchaseState?: number; // 0 = 구매 완료
  orderId?: string;
  purchaseType?: number; // 0 = 라이선스 테스터 구매
}

export interface VerifyPurchaseDeps {
  /** PURCHASE_MODE 환경변수 값(미설정이면 null). */
  mode: string | null;
  /** 사용자 JWT → 사용자 id. 유효하지 않으면 null. */
  getUserId(jwt: string): Promise<string | null>;
  isTester(userId: string): Promise<boolean>;
  /**
   * Google Play에서 구매를 조회한다. 서비스 계정이 설정되지 않았으면 'unconfigured',
   * 스토어가 그 토큰을 모르면 null.
   */
  fetchPlayPurchase(productId: string, purchaseToken: string): Promise<PlayPurchase | null | 'unconfigured'>;
  /** credit_purchase RPC. 새로 지급하면 true, 이미 지급된 거래면 false. */
  credit(input: {
    userId: string;
    platform: 'ios' | 'android';
    productId: string;
    transactionId: string;
    tickets: number;
    environment: string;
    raw: unknown;
  }): Promise<boolean>;
  balance(userId: string): Promise<number>;
}

/** JWS 페이로드를 디코드만 한다(서명 검증 없음 — 파일 머리 주석 참고). 형태가 틀리면 null. */
export function decodeJwsPayload(jws: string): Record<string, unknown> | null {
  const parts = jws.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type Verified =
  | { ok: true; productId: string; transactionId: string; environment: string; raw: unknown }
  | { ok: false; status: number; error: string };

function verifyIos(jws: string, userId: string): Verified {
  const payload = decodeJwsPayload(jws);
  if (!payload) return { ok: false, status: 400, error: 'invalid_receipt' };

  const { bundleId, environment, productId, transactionId, purchaseDate, revocationDate } = payload;
  if (bundleId !== BUNDLE_ID) return { ok: false, status: 400, error: 'invalid_receipt' };
  // 테스트 모드는 테스트 환경의 거래만 받는다. 실결제(Production)는 서명 검증이 있는 모드에서만.
  if (environment !== 'Xcode' && environment !== 'Sandbox') {
    return { ok: false, status: 400, error: 'invalid_receipt' };
  }
  if (revocationDate != null) return { ok: false, status: 400, error: 'invalid_receipt' };
  if (typeof productId !== 'string') return { ok: false, status: 400, error: 'invalid_receipt' };
  if (!(productId in PRODUCT_TICKETS)) return { ok: false, status: 400, error: 'unknown_product' };
  const txId =
    typeof transactionId === 'string' || typeof transactionId === 'number' ? String(transactionId) : '';
  if (txId.length === 0) return { ok: false, status: 400, error: 'invalid_receipt' };

  // Xcode 테스트 결제의 거래 번호는 작은 순번이고 초기화하면 재사용된다. 그대로 쓰면 나중 구매가
  // "이미 지급됨"으로 처리된다 → 사용자·구매 시각을 섞어 유일하게 만든다.
  const transactionKey =
    environment === 'Xcode' ? `xcode:${userId}:${txId}:${String(purchaseDate ?? '')}` : txId;

  return { ok: true, productId, transactionId: transactionKey, environment, raw: payload };
}

async function verifyAndroid(
  deps: VerifyPurchaseDeps,
  productId: string,
  purchaseToken: string,
): Promise<Verified> {
  if (!(productId in PRODUCT_TICKETS)) return { ok: false, status: 400, error: 'unknown_product' };
  const purchase = await deps.fetchPlayPurchase(productId, purchaseToken);
  if (purchase === 'unconfigured') {
    return { ok: false, status: 501, error: 'android_verify_unconfigured' };
  }
  if (!purchase || purchase.purchaseState !== 0) {
    return { ok: false, status: 400, error: 'invalid_receipt' };
  }
  return {
    ok: true,
    productId,
    transactionId: purchase.orderId && purchase.orderId.length > 0 ? purchase.orderId : purchaseToken,
    environment: purchase.purchaseType === 0 ? 'PlayTest' : 'Play',
    raw: purchase,
  };
}

export function createHandler(deps: VerifyPurchaseDeps): (req: Request) => Promise<Response> {
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    try {
      // 모드가 test가 아니면 닫는다(실판매 검증은 아직 없다).
      if (deps.mode !== 'test') return json(501, { error: 'store_mode_unavailable' });

      const jwt = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(\S+)$/i)?.[1];
      if (!jwt) return json(401, { error: 'unauthorized' });
      const userId = await deps.getUserId(jwt);
      if (!userId) return json(401, { error: 'unauthorized' });

      // 테스트 모드의 안전장치 — 테스터가 아니면 영수증을 보지도 않는다.
      if (!(await deps.isTester(userId))) return json(403, { error: 'not_tester' });

      const raw = await req.text();
      if (raw.length > MAX_BODY_BYTES) return json(400, { error: 'bad_request' });
      let body: { platform?: unknown; jws?: unknown; productId?: unknown; purchaseToken?: unknown };
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        return json(400, { error: 'bad_request' });
      }
      if (!body || typeof body !== 'object') return json(400, { error: 'bad_request' });

      let verified: Verified;
      let platform: 'ios' | 'android';
      if (body.platform === 'ios' && typeof body.jws === 'string') {
        platform = 'ios';
        verified = verifyIos(body.jws, userId);
      } else if (
        body.platform === 'android' &&
        typeof body.productId === 'string' &&
        typeof body.purchaseToken === 'string' &&
        body.purchaseToken.length > 0
      ) {
        platform = 'android';
        verified = await verifyAndroid(deps, body.productId, body.purchaseToken);
      } else {
        return json(400, { error: 'bad_request' });
      }
      if (!verified.ok) return json(verified.status, { error: verified.error });

      const granted = await deps.credit({
        userId,
        platform,
        productId: verified.productId,
        transactionId: verified.transactionId,
        tickets: PRODUCT_TICKETS[verified.productId],
        environment: verified.environment,
        raw: verified.raw,
      });
      return json(200, { granted, tickets: await deps.balance(userId) });
    } catch (e) {
      // 내부 예외 메시지(키·토큰 등)는 응답에 싣지 않는다.
      console.error(JSON.stringify({ evt: 'verify_purchase', ok: false, err: String(e) }));
      return json(500, { error: 'internal' });
    }
  };
}
