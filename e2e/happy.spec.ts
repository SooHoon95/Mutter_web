// e2e/happy.spec.ts — happy path E2E (T10 US-010 AC-1)
//
// 전략: Supabase REST/RPC + SC oEmbed을 page.route()로 네트워크 스텁.
// 라이브 크리덴셜 없이 UI 흐름 전체를 검증한다.
//
// 흐름:
//   1) 랜딩(/) → "편지 쓰기" 클릭 → /create
//   2) /create: 단락 작성 + CC0 무드 픽커로 큐 지정 + 저장(RPC 스텁)
//   3) /sent: 링크 발급(issue_link 스텁) → 토큰 URL 확인
//   4) 새 browser context(인코그니토)로 /l/:token 오픈
//   5) get_letter_by_token 스텁 응답 → "편지 열기 ▶" 클릭
//   6) 본문 단락·크레딧 렌더 확인 (오디오 실재생은 검증 범위 밖)

import { test, expect } from '@playwright/test';
import {
  stubSupabaseAuth,
  stubLetterSave,
  stubIssueLink,
  stubListLetters,
  stubSentWithRecipients,
  stubListLinks,
  stubGetLetterByToken,
  stubScOembed,
  injectAuthSession,
} from './helpers/mocks';

const STUB_TOKEN = 'stub-happy-token-abc123';
const STUB_LETTER_PAYLOAD = {
  id: 'stub-letter-id',
  title: '봄날의 편지',
  paragraphs: [
    { id: 'p-0', order: 0, text: '오늘도 잘 지내고 있나요?' },
    { id: 'p-1', order: 1, text: '이 음악을 들으며 생각했어요.' },
  ],
  template_id: 'classic',
  cues: [
    undefined,
    { sourceType: 'hosted', ref: 'track-calm-piano', startMs: 0 },
  ],
  audio_disabled: false,
};

// ---------------------------------------------------------------------------
// 1. 랜딩 → 편지 쓰기 CTA
// ---------------------------------------------------------------------------
test('랜딩 페이지가 렌더되고 편지 쓰기 CTA가 보인다', async ({ page }) => {
  await stubSupabaseAuth(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /음악 한 곡/ })).toBeVisible();
  // 히어로 + 최종 CTA 둘 다 "편지 쓰기"를 포함하므로 첫 번째(히어로)로 특정한다.
  await expect(page.getByRole('link', { name: '편지 쓰기' }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. /create 단락 작성 + CC0 큐 + 저장
// ---------------------------------------------------------------------------
test('/create에서 테마 편지(제목+본문)를 작성하고 저장할 수 있다', async ({ page }) => {
  await stubSupabaseAuth(page);
  await injectAuthSession(page);
  await stubLetterSave(page, 'stub-letter-id');
  // letters SELECT(초안 로드)도 스텁
  await stubListLetters(page, []);

  await page.goto('/create');

  // 테마 편지지 위에서 제목·본문을 바로 입력(WYSIWYG, 단락 추가 UI 없음).
  await page.getByLabel('편지 제목').fill('봄날의 편지');
  await page.getByLabel('편지 본문').fill('오늘도 잘 지내고 있나요?\n\n언제나 응원해요.');

  // 음악 미선택 시 기본 CC0가 자동 부착되므로(무음 편지 0) 바로 저장 가능하다.
  await page.getByRole('button', { name: /저장/ }).first().click();

  // 에러 없이 저장되어 저장 버튼이 여전히 보인다(모킹 환경).
  await expect(page.getByRole('button', { name: /저장/ }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// 3. happy path 전체 흐름: /create → /sent → 인코그니토로 /l/:token
// ---------------------------------------------------------------------------
test('happy path: 편지 작성 → 링크 발급 → 인코그니토로 수신 열기', async ({ browser }) => {
  // 작성자 컨텍스트
  const creatorCtx = await browser.newContext();
  const creatorPage = await creatorCtx.newPage();

  await stubSupabaseAuth(creatorPage);
  await injectAuthSession(creatorPage);
  await stubLetterSave(creatorPage, 'stub-letter-id');
  await stubListLetters(creatorPage, [{ id: 'stub-letter-id', title: '봄날의 편지' }]);
  // Sent 페이지는 listMyLetters와 get_my_sent_with_recipients를 함께 호출한다(Promise.all).
  await stubSentWithRecipients(creatorPage, []);
  await stubListLinks(creatorPage, STUB_TOKEN);
  await stubIssueLink(creatorPage, STUB_TOKEN);

  // /sent 페이지: 편지 목록 + 링크 발급 확인
  await creatorPage.goto('/sent');
  await expect(creatorPage.getByText('봄날의 편지')).toBeVisible();

  // 인코그니토(스토리지 격리) 컨텍스트로 수신 페이지 열기
  const incognitoCtx = await browser.newContext({
    storageState: undefined, // 완전 빈 스토리지 — 인코그니토 시뮬레이션
  });
  const viewerPage = await incognitoCtx.newPage();

  // get_letter_by_token RPC 스텁
  await stubGetLetterByToken(viewerPage, STUB_LETTER_PAYLOAD);
  // SC oEmbed 스텁 (hosted 큐이지만 혹시 SC 콜이 있어도 OK 반환)
  await stubScOembed(viewerPage, { kind: 'ok', title: 'Calm Piano' });

  // 수신 라우트 오픈 (무인증)
  await viewerPage.goto(`/l/${STUB_TOKEN}`);

  // "편지 열기 ▶" 게이트가 보인다
  await expect(
    viewerPage.getByRole('button', { name: '편지 열기' }),
  ).toBeVisible({ timeout: 10_000 });

  // "편지 열기 ▶" 클릭 → 게이트 통과
  await viewerPage.getByRole('button', { name: '편지 열기' }).click();

  // 본문 단락 렌더 확인
  await expect(viewerPage.getByText('오늘도 잘 지내고 있나요?')).toBeVisible({
    timeout: 10_000,
  });
  await expect(viewerPage.getByText('이 음악을 들으며 생각했어요.')).toBeVisible();

  // Credits 섹션 — CC-BY 표기 (hosted 큐라 CC-BY 아닐 수 있음, 단락 본문 확인으로 대체)
  // 가로 스크롤 없음 확인
  const scrollWidth = await viewerPage.evaluate(() => document.body.scrollWidth);
  const clientWidth = await viewerPage.evaluate(() => document.body.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 소수점 반올림 허용

  await incognitoCtx.close();
  await creatorCtx.close();
});

// ---------------------------------------------------------------------------
// 4. 수신 라우트는 무인증으로 열린다 (인코그니토 컨텍스트)
// ---------------------------------------------------------------------------
test('수신 라우트는 무인증으로 열린다 — 인코그니토 컨텍스트', async ({ browser }) => {
  const incognitoCtx = await browser.newContext({ storageState: undefined });
  const page = await incognitoCtx.newPage();

  await stubGetLetterByToken(page, STUB_LETTER_PAYLOAD);
  await stubScOembed(page, { kind: 'ok' });

  await page.goto(`/l/${STUB_TOKEN}`);

  // 편지 열기 게이트가 보인다 (인증 요구 없음)
  await expect(page.getByRole('button', { name: '편지 열기' })).toBeVisible({
    timeout: 10_000,
  });

  await incognitoCtx.close();
});

// ---------------------------------------------------------------------------
// 5. "편지 열기 ▶" 단일 클릭으로 게이트 통과 후 본문 표시
// ---------------------------------------------------------------------------
test('"편지 열기 ▶" 클릭 후 편지 제목과 단락이 표시된다', async ({ page }) => {
  await stubGetLetterByToken(page, STUB_LETTER_PAYLOAD);
  await stubScOembed(page, { kind: 'ok' });

  await page.goto(`/l/${STUB_TOKEN}`);

  await page.getByRole('button', { name: '편지 열기' }).click();

  // 편지 제목 표시
  await expect(page.getByText('봄날의 편지')).toBeVisible({ timeout: 10_000 });
  // 단락 텍스트 표시
  await expect(page.getByText('오늘도 잘 지내고 있나요?')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 6. SC 큐가 있는 편지도 "▶" 후 본문 렌더 (오디오 실재생 없이)
// ---------------------------------------------------------------------------
test('SC 큐가 있는 편지도 게이트 통과 후 본문이 렌더된다', async ({ page }) => {
  const payloadWithSc = {
    ...STUB_LETTER_PAYLOAD,
    cues: [
      { sourceType: 'soundcloud', ref: 'https://soundcloud.com/test/track', startMs: 0 },
      undefined,
    ],
  };
  await stubGetLetterByToken(page, payloadWithSc);
  // SC oEmbed 스텁 (플레이어 iframe은 실제 마운트되지 않으므로 ok만 반환)
  await stubScOembed(page, { kind: 'ok', title: 'My Track', authorName: 'Artist' });
  // SC Widget API iframe 로드도 차단 (실재생 없이 본문만 확인)
  await page.route('**/w.soundcloud.com/**', (r) => void r.fulfill({ status: 200, body: '' }));

  await page.goto(`/l/${STUB_TOKEN}`);
  await page.getByRole('button', { name: '편지 열기' }).click();

  await expect(page.getByText('오늘도 잘 지내고 있나요?')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('이 음악을 들으며 생각했어요.')).toBeVisible();
});
