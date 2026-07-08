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

// 웹(인가코드 흐름)용 — REST 키(client_id) + Client Secret. code→token 교환에만 쓴다(서버 전용).
// iOS는 네이티브 SDK idToken을 직접 보내므로 이 값이 없어도 동작한다.
const KAKAO_REST_KEY = Deno.env.get("KAKAO_REST_KEY") ?? "";
const KAKAO_CLIENT_SECRET = Deno.env.get("KAKAO_CLIENT_SECRET") ?? "";

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

// ── 웹 인가코드 → idToken 교환 ────────────────────────────────────────────────
// 웹은 카카오로 리다이렉트해 받은 code를 우리 콜백이 이 함수로 넘긴다. client_secret 교환은
// 서버(Edge)에서만 하므로 비밀이 클라에 노출되지 않는다. openid 스코프라 응답에 id_token 포함.
async function exchangeKakaoCode(code: string, redirectUri: string): Promise<string> {
  if (!KAKAO_REST_KEY) throw new AppError("SERVER_MISCONFIGURED", 500);
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: KAKAO_REST_KEY,
    redirect_uri: redirectUri,
    code,
  });
  if (KAKAO_CLIENT_SECRET) params.set("client_secret", KAKAO_CLIENT_SECRET);
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: params.toString(),
  });
  if (!res.ok) throw new AppError("INVALID_TOKEN", 401);
  const t = await res.json();
  if (typeof t.id_token !== "string") throw new AppError("INVALID_TOKEN", 401);
  return t.id_token;
}

// ── 회원 조회/생성 (카카오 sub 기준, 실패 시 이메일로 재조정) ──────────────────
// 유니크 키 = 이메일. 같은 sub는 항상 같은 user이고, 그 이메일을 이미 쓰는 계정이 있으면
// (웹 내장 카카오 OAuth·구글·이메일 등 경로 무관) 그 기존 계정으로 로그인시킨다(0026).

/// 기존 회원만 찾는다(생성 안 함). 없으면 null. — 웹 닉네임-우선: 신규는 닉네임 받기 전 생성 금지.
async function findExistingUserId(sub: string, email: string): Promise<string | null> {
  // 1) 이미 매핑된 카카오 회원?
  const mapped = await admin
    .from("kakao_identity_map").select("user_id").eq("kakao_sub", sub).maybeSingle();
  if (mapped.data) return mapped.data.user_id;

  // 2) 이 이메일을 쓰는 기존 계정?(경로 무관) → 있으면 sub 매핑에 흡수하고 그 계정 반환.
  //    카카오 email은 카카오 확인값 + 기존 계정 이메일도 Supabase 확인값이라 병합이 안전.
  const found = await admin.rpc("find_user_id_by_email", { p_email: email });
  const existingUserId = typeof found.data === "string" ? found.data : null;
  if (existingUserId) {
    await admin
      .from("kakao_identity_map")
      .upsert({ kakao_sub: sub, user_id: existingUserId }, { onConflict: "kakao_sub", ignoreDuplicates: true });
    return existingUserId;
  }
  return null;
}

/// 신규 카카오 회원 생성(+ 닉네임 있으면 프로필에 기록). createdNew: 세션 발급 실패 시 롤백용.
async function createKakaoUser(
  sub: string, email: string, nickname?: string,
): Promise<{ userId: string; createdNew: boolean }> {
  const created = await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { provider: "kakao" },
  });
  if (created.error) {
    // 이메일 중복 = 이미 있는 계정(동시 최초 로그인 레이스 포함) → 기존 회원으로 흡수.
    const existingUserId = await findExistingUserId(sub, email);
    if (existingUserId) return { userId: existingUserId, createdNew: false };
    throw new AppError("EMAIL_CONFLICT_UNRESOLVED", 409);
  }

  const newUserId = created.data.user.id;
  await admin
    .from("kakao_identity_map")
    .upsert({ kakao_sub: sub, user_id: newUserId }, { onConflict: "kakao_sub", ignoreDuplicates: true });

  const winner = await admin
    .from("kakao_identity_map").select("user_id").eq("kakao_sub", sub).maybeSingle();
  if (winner.data && winner.data.user_id !== newUserId) {
    // 레이스에서 졌다 → 방금 만든 중복 유저 제거하고 승자 반환.
    await admin.auth.admin.deleteUser(newUserId);
    return { userId: winner.data.user_id, createdNew: false };
  }

  // 닉네임 동반(웹 닉네임-우선 가입) → 프로필에 기록(트리거가 만든 nickname NULL 행을 upsert로 갱신).
  if (nickname && nickname.trim()) {
    await admin.from("profiles").upsert({ id: newUserId, nickname: nickname.trim() }, { onConflict: "id" });
  }
  return { userId: newUserId, createdNew: true };
}

/// iOS 레거시(idToken만): 기존이면 그대로, 없으면 생성. (닉네임-우선 아님 — 앱은 이후 별도 단계 처리)
async function resolveUserId(sub: string, email: string): Promise<{ userId: string; createdNew: boolean }> {
  const existingUserId = await findExistingUserId(sub, email);
  if (existingUserId) return { userId: existingUserId, createdNew: false };
  return await createKakaoUser(sub, email);
}

/// 세션 발급까지 실패한 신규 유저 되돌리기 — "로그인 실패했는데 DB에 유저가 남는" 상태 방지.
/// (매핑은 user_id FK cascade로 함께 삭제된다.)
async function rollbackNewUser(userId: string) {
  try {
    await admin.from("kakao_identity_map").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
    console.log(JSON.stringify({ evt: "kakao_login_rollback", user_id: userId }));
  } catch {
    // 되돌리기 실패는 로그만(다음 로그인 시도 시 매핑으로 재사용되므로 치명적이지 않음).
    console.log(JSON.stringify({ evt: "kakao_login_rollback_failed", user_id: userId }));
  }
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
    const body = JSON.parse(raw || "{}") as {
      idToken?: string; code?: string; redirectUri?: string; nickname?: string;
    };

    // 요청 3형태:
    //  · { code, redirectUri }  — 웹 1단계(로그인/조회). 신규면 계정 생성 안 하고 { isNew, idToken } 반환.
    //  · { idToken, nickname }  — 웹 2단계(닉네임-우선 가입). 이때만 신규 계정 생성.
    //  · { idToken }            — iOS 레거시. 신규면 즉시 생성(기존 동작).

    // 웹 1단계: 인가코드 → idToken 교환 후 "기존 회원만" 로그인. 신규면 idToken만 돌려줘 닉네임 뒤로 미룬다.
    if (body.code) {
      if (!body.redirectUri) throw new AppError("MISSING_REDIRECT_URI", 400);
      const idToken = await exchangeKakaoCode(body.code, body.redirectUri);
      const { sub, email } = await verifyKakaoIdToken(idToken);
      if (!email) throw new AppError("EMAIL_UNAVAILABLE", 400);
      const existingUserId = await findExistingUserId(sub, email);
      if (!existingUserId) {
        console.log(JSON.stringify({ evt: "kakao_login", ok: true, is_new: true }));
        return json({ isNew: true, idToken });
      }
      const session = await issueSession(email);
      console.log(JSON.stringify({ evt: "kakao_login", ok: true, user_id: existingUserId }));
      return json({ ...session, user_id: existingUserId, isNew: false });
    }

    const idToken = body.idToken;
    if (!idToken) throw new AppError("MISSING_ID_TOKEN", 400);
    const { sub, email } = await verifyKakaoIdToken(idToken);
    // 이메일은 검증된 클레임에서만. 없으면(동의 철회) 지금 정책은 차단.
    if (!email) throw new AppError("EMAIL_UNAVAILABLE", 400);

    // 웹 2단계(가입)=nickname 동반 → 이때만 생성. 그 외(iOS)는 resolve(기존이면 로그인/없으면 생성).
    const { userId, createdNew } = body.nickname
      ? await createKakaoUser(sub, email, body.nickname)
      : await resolveUserId(sub, email);

    let session: Awaited<ReturnType<typeof issueSession>>;
    try {
      session = await issueSession(email);
    } catch (e) {
      // 세션 발급 실패 → 이 요청에서 만든 유저라면 되돌린다(고아 유저 0).
      if (createdNew) await rollbackNewUser(userId);
      throw e;
    }

    // 로깅: 토큰/이메일 원문 없이 결과만(관측성 AC4).
    console.log(JSON.stringify({ evt: "kakao_login", ok: true, user_id: userId }));
    return json({ ...session, user_id: userId, isNew: false });
  } catch (e) {
    const err = e instanceof AppError ? e : new AppError("INTERNAL_ERROR", 500);
    console.log(JSON.stringify({ evt: "kakao_login", ok: false, code: err.code }));
    return json({ error: err.code }, err.status);
  }
});
