// supabase/functions/kakao-login/index.ts
//
// 카카오 로그인 백엔드(우리가 신원을 소유하는 방식).
//
// 흐름(웹/앱 공통):
//   1) 클라이언트가 카카오 SDK로 로그인해 받은 "카카오 증표"(idToken)를 이 함수로 보낸다.
//   2) 이 함수가 그 증표가 진짜 카카오가 발급한 것인지 검증한다(서명·발급자·대상·만료).
//   3) 증표 안의 카카오 회원번호(sub)로 우리 회원을 찾거나(없으면) 새로 만든다.
//      - 매핑은 kakao_identity_map(sub → user_id) 표로 우리가 직접 관리(GoTrue 내장 카카오 OAuth 미사용).
//   4) 그 회원의 Supabase 세션(입장권 access_token + 재발급권 refresh_token)을 발급해 돌려준다.
//   5) 클라이언트는 받은 토큰으로 setSession → 이후 자동 로그인/갱신은 Supabase SDK가 처리.
//
// 보안: service_role 키·카카오 값은 전부 이 서버(Edge)에서만. 클라는 anon 키 + idToken만 보낸다.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

// ── 상수/환경 ────────────────────────────────────────────────────────────────
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY 는 Edge 런타임이 자동 주입.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// 카카오 OIDC 발급자와 서명 공개키(JWKS) 위치. 증표(idToken)의 서명을 이 공개키로 검증한다.
const KAKAO_ISSUER = "https://kauth.kakao.com";
const KAKAO_JWKS = createRemoteJWKSet(new URL("https://kauth.kakao.com/.well-known/jwks.json"));

// idToken의 aud(대상) 클레임 허용목록 = 우리 카카오 앱의 앱키들(REST/JS/네이티브).
// 콤마로 구분해 secret KAKAO_AUD_ALLOWLIST에 넣는다. 웹·앱이 같은 카카오 앱이면 여기에 모두 포함.
const KAKAO_AUD_ALLOWLIST = (Deno.env.get("KAKAO_AUD_ALLOWLIST") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const MAX_IDTOKEN_BYTES = 8 * 1024; // 비정상적으로 큰 토큰 거부.

// 브라우저(웹)에서도 호출하므로 CORS 허용.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 에러를 코드로 정규화(클라에서 메시지 분기). 토큰/이메일 원문은 로그·응답에 남기지 않는다.
class AppError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

// service_role 클라이언트: RLS를 우회해 auth 유저 생성 + 매핑표 접근(서버 전용).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── idToken 검증 ─────────────────────────────────────────────────────────────
// 서명(JWKS) + iss(카카오) + aud(우리 앱키) + exp/iat(만료·미래 발급)를 모두 확인.
// jose가 서명·exp·iss·aud 불일치를 예외로 던진다. 통과 payload에서 sub/email만 신뢰한다.
async function verifyKakaoIdToken(idToken: string): Promise<{ sub: string; email: string | null }> {
  if (KAKAO_AUD_ALLOWLIST.length === 0) {
    // 대상 검증을 못 하면 아무 카카오 앱 토큰이나 통과 → 위험. 설정 전엔 열지 않는다(fail closed).
    throw new AppError("SERVER_MISCONFIGURED", 500);
  }
  try {
    const { payload } = await jwtVerify(idToken, KAKAO_JWKS, {
      issuer: KAKAO_ISSUER,
      audience: KAKAO_AUD_ALLOWLIST,
      clockTolerance: 300, // 시계 오차 5분 허용(그 이상 만료/미래 토큰은 거부).
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) throw new AppError("INVALID_TOKEN", 401);
    const email = typeof payload.email === "string" ? payload.email : null;
    return { sub, email };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("INVALID_TOKEN", 401); // 서명·발급자·대상·만료 불일치 전부 여기로.
  }
}

// ── 회원 find-or-create (카카오 sub 기준) ─────────────────────────────────────
// R2: 같은 sub는 항상 같은 user. 구글(같은 이메일) 유저와는 병합하지 않는다(409 차단).
async function resolveUserId(sub: string, email: string): Promise<string> {
  // 1) 이미 매핑된 카카오 회원?
  const existing = await admin
    .from("kakao_identity_map").select("user_id").eq("kakao_sub", sub).maybeSingle();
  if (existing.data) return existing.data.user_id;

  // 2) 없으면 새 Supabase 유저 생성(이메일 확인됨 처리 → handle_new_user 트리거가 프로필 자동 생성).
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { provider: "kakao" },
  });

  if (created.error) {
    // 생성 실패의 대표 원인 = 이메일 중복(email UNIQUE).
    // (a) 같은 sub 요청이 방금 먼저 만들었을 수도(동시 최초 로그인 레이스) → 매핑 재조회로 흡수.
    const raced = await admin
      .from("kakao_identity_map").select("user_id").eq("kakao_sub", sub).maybeSingle();
    if (raced.data) return raced.data.user_id;
    // (b) 그 이메일을 구글 등 "다른 로그인 방식" 유저가 이미 쓰는 경우 → R2상 병합 금지, 차단.
    throw new AppError("EMAIL_CONFLICT_DIFFERENT_PROVIDER", 409);
  }

  const newUserId = created.data.user.id;

  // 3) 매핑 기록(멱등). 레이스로 다른 요청이 먼저 넣었으면 그 값이 승자.
  await admin
    .from("kakao_identity_map")
    .upsert({ kakao_sub: sub, user_id: newUserId }, { onConflict: "kakao_sub", ignoreDuplicates: true });

  const winner = await admin
    .from("kakao_identity_map").select("user_id").eq("kakao_sub", sub).maybeSingle();
  if (winner.data && winner.data.user_id !== newUserId) {
    // 레이스에서 졌다 → 방금 만든 중복 유저 제거하고 승자 반환.
    await admin.auth.admin.deleteUser(newUserId);
    return winner.data.user_id;
  }
  return newUserId;
}

// ── 세션 발급 (입장권 + 재발급권) ─────────────────────────────────────────────
// 관리자 API엔 "특정 유저의 세션을 바로 주는" 공개 엔드포인트가 없다.
// 그래서 매직링크용 일회성 토큰(hashed_token)을 만들고, 그걸 GoTrue /verify로 교환해
// 진짜 세션(access_token/refresh_token)을 얻는다. (이메일 발송 없음 — 토큰만 생성/교환.)
async function issueSession(email: string): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hashedToken = link.data?.properties?.hashed_token;
  if (link.error || !hashedToken) throw new AppError("SESSION_ISSUE_FAILED", 500);
  // GoTrue가 이 토큰을 어떤 type으로 검증해야 하는지 응답이 알려준다(버전 무관 안전). 기본 magiclink.
  const verificationType = link.data?.properties?.verification_type ?? "magiclink";

  // /verify는 공개 엔드포인트지만 hashed_token 자체가 자격증명이라 안전. 응답이 곧 세션.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ type: verificationType, token_hash: hashedToken }),
  });
  if (!res.ok) throw new AppError("SESSION_ISSUE_FAILED", 500);
  const s = await res.json();
  if (!s.access_token || !s.refresh_token) throw new AppError("SESSION_ISSUE_FAILED", 500);
  return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at };
}

// ── 요청 처리 ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    if (req.method !== "POST") throw new AppError("METHOD_NOT_ALLOWED", 405);

    const raw = await req.text();
    if (raw.length > MAX_IDTOKEN_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", 413);
    const idToken = (JSON.parse(raw || "{}") as { idToken?: string }).idToken;
    if (!idToken) throw new AppError("MISSING_ID_TOKEN", 400);

    const { sub, email } = await verifyKakaoIdToken(idToken);
    // 이메일은 검증된 클레임에서만. 없으면(동의 철회) 지금 정책은 차단.
    if (!email) throw new AppError("EMAIL_UNAVAILABLE", 400);

    const userId = await resolveUserId(sub, email);
    const session = await issueSession(email);

    // 로깅: 토큰/이메일 원문 없이 결과만(관측성 AC4).
    console.log(JSON.stringify({ evt: "kakao_login", ok: true, user_id: userId }));
    return json({ ...session, user_id: userId });
  } catch (e) {
    const err = e instanceof AppError ? e : new AppError("INTERNAL_ERROR", 500);
    console.log(JSON.stringify({ evt: "kakao_login", ok: false, code: err.code }));
    return json({ error: err.code }, err.status);
  }
});
