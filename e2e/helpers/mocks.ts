// e2e/helpers/mocks.ts — Supabase REST/RPC + SC oEmbed 네트워크 스텁 헬퍼.
//
// 전략: 이 환경에는 라이브 Supabase 크리덴셜이 없으므로
// Playwright page.route()로 모든 외부 네트워크 요청을 가로채 스텁 응답을 반환한다.
// 이렇게 하면 UI 흐름을 끝까지 실제 네트워크 없이 검증할 수 있다.

import type { Page, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export interface LetterPayloadStub {
  id: string;
  title: string;
  paragraphs: Array<{ id: string; order: number; text: string; cue?: unknown }>;
  template_id: string;
  cues: unknown[];
  audio_disabled: boolean;
}

export interface ScOembedStubOptions {
  /** 'ok' | 'embed-disabled' | 'not-found' | 'private' */
  kind: 'ok' | 'embed-disabled' | 'not-found' | 'private';
  title?: string;
  authorName?: string;
}

// ---------------------------------------------------------------------------
// Supabase RPC 스텁
// ---------------------------------------------------------------------------

/**
 * Supabase REST + auth 요청을 전부 가로챈다.
 * stub.supabase.co 도메인이나 실제 supabase.co 도메인 모두 대응.
 */
export async function stubSupabaseAuth(page: Page): Promise<void> {
  // auth 세션 — 발신자 인증이 필요한 라우트용
  await page.route('**/auth/v1/**', (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'stub-access-token',
        token_type: 'bearer',
        user: { id: 'stub-user-id', email: 'test@example.com' },
      }),
    });
  });
}

/**
 * 매직링크 발송 RPC 스텁 (발신자 로그인 흐름).
 */
export async function stubMagicLink(page: Page): Promise<void> {
  await page.route('**/auth/v1/otp**', (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

/**
 * letters 테이블 upsert/SELECT 스텁 (편지 저장 흐름).
 */
export async function stubLetterSave(
  page: Page,
  letterId = 'stub-letter-id',
): Promise<void> {
  await page.route('**/rest/v1/letters**', (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: letterId,
          owner_id: 'stub-user-id',
          title: '테스트 편지',
          template_id: 'classic',
          paragraphs: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  });
}

/**
 * issue_link RPC 스텁 — 전달 링크 발급.
 */
export async function stubIssueLink(
  page: Page,
  token = 'stub-token-abc123',
): Promise<void> {
  await page.route('**/rest/v1/rpc/issue_link**', (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'stub-link-id',
        letter_id: 'stub-letter-id',
        owner_id: 'stub-user-id',
        token,
        password_hash: null,
        claim_device_id: null,
        claimed_at: null,
        expires_at: null,
        revoked: false,
        revoked_at: null,
        created_at: new Date().toISOString(),
      }),
    });
  });
}

/**
 * get_letter_by_token RPC 스텁 — 수신자 편지 열람.
 */
export async function stubGetLetterByToken(
  page: Page,
  payload: LetterPayloadStub,
): Promise<void> {
  await page.route('**/rest/v1/rpc/get_letter_by_token**', (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

/**
 * get_letter_by_token RPC가 에러(revoked 링크 등)를 반환하도록 스텁.
 */
export async function stubGetLetterByTokenError(
  page: Page,
  errorCode = 'LINK_REVOKED',
): Promise<void> {
  await page.route('**/rest/v1/rpc/get_letter_by_token**', (route: Route) => {
    void route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message: errorCode, code: errorCode }),
    });
  });
}

/**
 * listMyLetters용 letters SELECT 스텁.
 */
export async function stubListLetters(
  page: Page,
  letters: Array<{ id: string; title: string }> = [],
): Promise<void> {
  await page.route('**/rest/v1/letters*select*', (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(letters),
    });
  });
}

/**
 * delivery_links SELECT 스텁 (Sent 페이지 링크 목록).
 */
export async function stubListLinks(
  page: Page,
  token = 'stub-token-abc123',
): Promise<void> {
  await page.route('**/rest/v1/delivery_links**', (route: Route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'stub-link-id',
          letter_id: 'stub-letter-id',
          owner_id: 'stub-user-id',
          token,
          password_hash: null,
          claim_device_id: null,
          claimed_at: null,
          expires_at: null,
          revoked: false,
          revoked_at: null,
          created_at: new Date().toISOString(),
        },
      ]),
    });
  });
}

// ---------------------------------------------------------------------------
// SoundCloud oEmbed 스텁
// ---------------------------------------------------------------------------

/**
 * SC oEmbed 엔드포인트를 스텁한다.
 *
 * kind:
 *  - 'ok'            → 200 + 정상 embed HTML
 *  - 'embed-disabled'→ 200 + 빈 html 필드 (임베드 비활성)
 *  - 'not-found'     → 404 (삭제된 트랙)
 *  - 'private'       → 403 (비공개/지역 제한)
 */
export async function stubScOembed(
  page: Page,
  opts: ScOembedStubOptions,
): Promise<void> {
  await page.route('**/soundcloud.com/oembed**', (route: Route) => {
    const { kind, title = '테스트 트랙', authorName = 'Test Artist' } = opts;

    if (kind === 'not-found') {
      void route.fulfill({ status: 404 });
      return;
    }
    if (kind === 'private') {
      void route.fulfill({ status: 403 });
      return;
    }
    if (kind === 'embed-disabled') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          title,
          author_name: authorName,
          html: '',
          provider_name: 'SoundCloud',
        }),
      });
      return;
    }
    // 'ok'
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        title,
        author_name: authorName,
        html: `<iframe width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/test/track&color=%23ff5500"></iframe>`,
        provider_name: 'SoundCloud',
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// 세션 쿠키 주입 헬퍼 — 발신자 인증 우회
// ---------------------------------------------------------------------------

/**
 * Supabase 세션 쿠키/localStorage를 심어 RequireAuth를 통과시킨다.
 * build+preview 환경에서는 실제 Supabase가 없으므로,
 * auth 요청도 스텁하고 localStorage에 세션을 직접 주입한다.
 */
export async function injectAuthSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Supabase JS가 참조하는 localStorage 키 (sb-<project>-auth-token)
    // stub URL 기반 키: sb-stub-auth-token
    const session = {
      access_token: 'stub-access-token',
      refresh_token: 'stub-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'stub-user-id',
        email: 'test@example.com',
        role: 'authenticated',
      },
    };
    localStorage.setItem('sb-stub-auth-token', JSON.stringify(session));
    // 일부 Supabase 버전은 다른 키를 쓰므로 양쪽 세팅
    localStorage.setItem(
      'supabase.auth.token',
      JSON.stringify({ currentSession: session }),
    );
  });
}
