// supabase/functions/apple-notifications/handler.ts
//
// App Store Server Notifications V2 수신 — 환불(REFUND)을 편지권에 반영한다. 배선은 index.ts.
// App Store Connect → 앱 → App 정보 → App Store 서버 알림: 운영·샌드박스 URL 모두 이 함수, 버전 2.
//
// 요청 본문 { signedPayload: '<JWS>' }. 서명은 _shared/appleJws.ts로 Apple 루트까지 검증한다.
// 응답: 처리했거나 관심 없는 알림은 200(Apple이 다시 보내지 않게), 서명·형식이 틀리면 400.
// 같은 알림이 여러 번 와도 refund_purchase가 한 번만 반영한다.

export const BUNDLE_ID = 'com.efreedom.mutter';

export interface AppleNotificationDeps {
  verifyAppleJws(jws: string): Promise<Record<string, unknown> | null>;
  /** refund_purchase RPC. 반영하면 true, 이미 반영했거나 모르는 거래면 false. */
  refund(transactionId: string, raw: unknown): Promise<boolean>;
  log(event: Record<string, unknown>): void;
}

export function createHandler(deps: AppleNotificationDeps): (req: Request) => Promise<Response> {
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    try {
      let body: { signedPayload?: unknown };
      try {
        body = await req.json();
      } catch {
        return json(400, { error: 'bad_request' });
      }
      if (typeof body?.signedPayload !== 'string') return json(400, { error: 'bad_request' });

      const notification = await deps.verifyAppleJws(body.signedPayload);
      if (!notification) return json(400, { error: 'invalid_signature' });

      const type = notification.notificationType;
      const data = (notification.data ?? {}) as Record<string, unknown>;
      if (data.bundleId !== BUNDLE_ID) return json(400, { error: 'wrong_app' });

      if (type !== 'REFUND') {
        deps.log({ evt: 'apple_notification', type, subtype: notification.subtype ?? null, handled: false });
        return json(200, { ok: true });
      }

      const signedTx = data.signedTransactionInfo;
      const tx = typeof signedTx === 'string' ? await deps.verifyAppleJws(signedTx) : null;
      if (!tx || tx.bundleId !== BUNDLE_ID) return json(400, { error: 'invalid_signature' });
      const transactionId =
        typeof tx.transactionId === 'string' || typeof tx.transactionId === 'number' ? String(tx.transactionId) : '';
      if (!transactionId) return json(400, { error: 'bad_request' });

      const refunded = await deps.refund(transactionId, {
        notificationUUID: notification.notificationUUID ?? null,
        environment: data.environment ?? null,
        revocationDate: tx.revocationDate ?? null,
        revocationReason: tx.revocationReason ?? null,
      });
      deps.log({ evt: 'apple_notification', type, environment: data.environment ?? null, refunded });
      return json(200, { ok: true, refunded });
    } catch (e) {
      // 일시 장애면 Apple이 다시 보낸다.
      deps.log({ evt: 'apple_notification', ok: false, err: String(e) });
      return json(500, { error: 'internal' });
    }
  };
}
