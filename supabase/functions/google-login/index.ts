// supabase/functions/google-login/index.ts
//
// 구글 로그인 백엔드(provider별 계정 분리 — 신원을 우리가 소유).
//
// 왜: Supabase 네이티브 구글 OAuth는 "같은 verified 이메일"을 기존 계정에 자동 링크한다.
//     그래서 email/kakao와 같은 이메일이면 한 계정으로 합쳐진다. 데이터 분리를 위해 구글도
//     `kakao-login`과 동형으로 우리가 직접 소유한다: idToken을 서버검증 → google_identity_map(sub→user_id)
//     → synthetic 이메일 계정 생성/조회 → 세션 발급.
//
// 흐름(웹/앱 공통):
//   1) 클라이언트가 Google SDK(iOS GIDSignIn / 웹 GIS)로 받은 idToken을 보낸다.
//   2) 이 함수가 서명(Google JWKS)·발급자·대상(aud)·만료를 검증한다.
//   3) sub로 회원을 찾거나(없으면) synthetic 이메일로 생성한다. 실제 이메일은 metadata에 보관.
//   4) 세션(access/refresh)을 발급해 돌려준다.
//
// 보안: service_role 키는 이 서버(Edge)에서만. 클라는 anon 키 + idToken만 보낸다.

import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// 구글 OIDC 발급자(둘 다 유효) + 서명 공개키(JWKS).
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

// idToken의 aud(대상) 허용목록 = 우리 구글 OAuth 클라이언트 ID들(iOS·웹). 콤마 구분 secret.
// (iOS GIDSignIn → iOS 클라이언트 ID, 웹 GIS → 웹 클라이언트 ID. 둘 다 포함.)
const GOOGLE_AUD_ALLOWLIST = (Deno.env.get("GOOGLE_AUD_ALLOWLIST") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const MAX_IDTOKEN_BYTES = 8 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class AppError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── idToken 검증 ─────────────────────────────────────────────────────────────
// 서명(JWKS) + iss(구글) + aud(우리 클라이언트 ID) + exp/iat + email_verified 확인.
async function verifyGoogleIdToken(idToken: string): Promise<{ sub: string; email: string | null }> {
  if (GOOGLE_AUD_ALLOWLIST.length === 0) {
    // aud 검증을 못 하면 아무 구글 앱 토큰이나 통과 → 위험. 설정 전엔 열지 않는다(fail closed).
    throw new AppError("SERVER_MISCONFIGURED", 500);
  }
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: GOOGLE_AUD_ALLOWLIST,
      clockTolerance: 300,
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) throw new AppError("INVALID_TOKEN", 401);
    // 이메일은 verified일 때만 신뢰(표시·정책용). 미검증이면 null 취급.
    const verified = payload.email_verified === true || payload.email_verified === "true";
    const email = verified && typeof payload.email === "string" ? payload.email : null;
    return { sub, email };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("INVALID_TOKEN", 401);
  }
}

// ── 회원 조회/생성 (구글 sub 전용 — provider별 계정 분리) ──────────────────────
/// 구글 계정의 synthetic auth 이메일(예약 도메인 — 실제 발송 없음, sub당 유일).
function googleAuthEmail(sub: string): string {
  return `google_${sub}@google.mutter.local`;
}

/// 기존 구글 회원만 찾는다(생성 안 함, 이메일 교차정합 없음). 없으면 null.
async function findExistingUserId(sub: string): Promise<string | null> {
  const mapped = await admin
    .from("google_identity_map").select("user_id").eq("google_sub", sub).maybeSingle();
  return mapped.data ? mapped.data.user_id : null;
}

/// 신규 구글 회원 생성(+ 닉네임 있으면 프로필 기록). createdNew: 세션 발급 실패 시 롤백용.
async function createGoogleUser(
  sub: string, email: string, nickname?: string,
): Promise<{ userId: string; createdNew: boolean }> {
  // auth 이메일은 synthetic(sub 기반) — provider 분리. 실제 이메일은 표시용으로 metadata에 보관.
  const created = await admin.auth.admin.createUser({
    email: googleAuthEmail(sub), email_confirm: true,
    user_metadata: { provider: "google", real_email: email },
    // 대시보드 Provider 라벨을 google로(auth identity는 email이라 기본은 email로 뜸 — best-effort).
    app_metadata: { provider: "google", providers: ["google"] },
  });
  if (created.error) {
    // synthetic 이메일 중복 = 같은 sub 동시 최초 로그인 레이스 → 기존 매핑 회원으로 흡수.
    const existingUserId = await findExistingUserId(sub);
    if (existingUserId) return { userId: existingUserId, createdNew: false };
    throw new AppError("EMAIL_CONFLICT_UNRESOLVED", 409);
  }

  const newUserId = created.data.user.id;
  await admin
    .from("google_identity_map")
    .upsert({ google_sub: sub, user_id: newUserId }, { onConflict: "google_sub", ignoreDuplicates: true });

  const winner = await admin
    .from("google_identity_map").select("user_id").eq("google_sub", sub).maybeSingle();
  if (winner.data && winner.data.user_id !== newUserId) {
    // 레이스에서 졌다 → 방금 만든 중복 유저 제거하고 승자 반환.
    await admin.auth.admin.deleteUser(newUserId);
    return { userId: winner.data.user_id, createdNew: false };
  }

  if (nickname && nickname.trim()) {
    await admin.from("profiles").upsert({ id: newUserId, nickname: nickname.trim() }, { onConflict: "id" });
  }
  return { userId: newUserId, createdNew: true };
}

/// 기존이면 그대로, 없으면 생성(앱 — 닉네임-우선 아님).
async function resolveUserId(sub: string, email: string): Promise<{ userId: string; createdNew: boolean }> {
  const existingUserId = await findExistingUserId(sub);
  if (existingUserId) return { userId: existingUserId, createdNew: false };
  return await createGoogleUser(sub, email);
}

/// 세션 발급까지 실패한 신규 유저 되돌리기(고아 유저 0). 매핑은 FK cascade로 함께 삭제.
async function rollbackNewUser(userId: string) {
  try {
    await admin.from("google_identity_map").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
    console.log(JSON.stringify({ evt: "google_login_rollback", user_id: userId }));
  } catch {
    console.log(JSON.stringify({ evt: "google_login_rollback_failed", user_id: userId }));
  }
}

// ── 세션 발급 (입장권 + 재발급권) ─────────────────────────────────────────────
// 매직링크용 일회성 토큰(hashed_token)을 만들고 GoTrue /verify로 교환해 세션을 얻는다(이메일 발송 없음).
async function issueSession(authEmail: string): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: authEmail });
  const hashedToken = link.data?.properties?.hashed_token;
  if (link.error || !hashedToken) throw new AppError("SESSION_ISSUE_FAILED", 500);
  const verificationType = link.data?.properties?.verification_type ?? "magiclink";

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
      idToken?: string; nickname?: string; checkOnly?: boolean;
    };

    // 요청 형태(웹 GIS는 idToken을 바로 주므로 code 교환 없음):
    //  · { idToken, checkOnly:true } — 웹 1단계(조회). 신규면 생성 안 하고 { isNew:true } 반환.
    //  · { idToken, nickname }       — 웹 2단계(닉네임-우선 가입). 이때만 생성.
    //  · { idToken }                 — 앱. 기존이면 로그인/없으면 즉시 생성.
    const idToken = body.idToken;
    if (!idToken) throw new AppError("MISSING_ID_TOKEN", 400);
    const { sub, email } = await verifyGoogleIdToken(idToken);
    if (!email) throw new AppError("EMAIL_UNAVAILABLE", 400);

    if (body.checkOnly) {
      const existingUserId = await findExistingUserId(sub);
      if (!existingUserId) {
        console.log(JSON.stringify({ evt: "google_login", ok: true, is_new: true }));
        return json({ isNew: true });
      }
      const session = await issueSession(googleAuthEmail(sub));
      console.log(JSON.stringify({ evt: "google_login", ok: true, user_id: existingUserId }));
      return json({ ...session, user_id: existingUserId, isNew: false });
    }

    const { userId, createdNew } = body.nickname
      ? await createGoogleUser(sub, email, body.nickname)
      : await resolveUserId(sub, email);

    let session: Awaited<ReturnType<typeof issueSession>>;
    try {
      session = await issueSession(googleAuthEmail(sub));
    } catch (e) {
      if (createdNew) await rollbackNewUser(userId);
      throw e;
    }
    // Provider 라벨 고정 — 매직링크 verify가 email로 되돌릴 수 있어 세션 발급 후 다시 못박음(best-effort).
    try {
      await admin.auth.admin.updateUserById(userId, {
        app_metadata: { provider: "google", providers: ["google"] },
      });
    } catch { /* 라벨 실패는 로그인 막지 않음 */ }

    console.log(JSON.stringify({ evt: "google_login", ok: true, user_id: userId }));
    return json({ ...session, user_id: userId, isNew: false });
  } catch (e) {
    const err = e instanceof AppError ? e : new AppError("INTERNAL_ERROR", 500);
    console.log(JSON.stringify({ evt: "google_login", ok: false, code: err.code }));
    return json({ error: err.code }, err.status);
  }
});
