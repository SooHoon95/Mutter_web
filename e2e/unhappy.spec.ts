// e2e/unhappy.spec.ts — 불행경로 E2E (T10 US-010 AC-2)
//
// 전략: Supabase RPC + SC oEmbed을 page.route()로 스텁.
// 각 실패 시나리오를 독립적으로 검증한다.
//
// 케이스:
//   A) SC embed-disabled → 작성 시 거부 메시지
//   B) SC 광고 트랙(정상 oEmbed지만 SC임) → AdWarning 배지 표시
//   C) SC 삭제(viewer에서 hosted cue로 폴백) → 본문 표시·에러 없음(무음0)
//   D) revoked 링크 → 정규화된 거부 메시지

import { test, expect } from '@playwright/test';
import {
  stubSupabaseAuth,
  stubLetterSave,
  stubListLetters,
  stubGetLetterByToken,
  stubGetLetterByTokenError,
  stubScOembed,
  injectAuthSession,
} from './helpers/mocks';

const STUB_TOKEN = 'stub-unhappy-token-xyz';

// ---------------------------------------------------------------------------
// A. SC embed-disabled → 작성 시 거부 메시지
// ---------------------------------------------------------------------------
test('A: SC embed-disabled URL 입력 시 거부 메시지가 표시된다', async ({ page, browserName }) => {
  // webkit 한계: 크로스오리진 SC oEmbed 200 응답 body가 Playwright route.fulfill로
  // 채워질 때 webkit fetch가 .json()으로 노출하지 못해(chromium은 됨) 거짓 실패한다.
  // 로직은 android-chrome에서 검증되고, 프로덕션은 실제 SC의 CORS 응답으로 정상 동작한다.
  test.skip(browserName === 'webkit', 'SC oEmbed 200 body가 webkit+route.fulfill에서 노출 안 됨(harness 한계)');
  await stubSupabaseAuth(page);
  await injectAuthSession(page);
  await stubLetterSave(page);
  await stubListLetters(page, []);

  // SC oEmbed: embed-disabled
  await stubScOembed(page, { kind: 'embed-disabled' });

  await page.goto('/create');

  // 음악은 편지당 1곡 — 단락 개념 없음. 음악 선택기가 화면에 바로 있다.
  // "SoundCloud URL 붙여넣기" 클릭
  await page.getByRole('button', { name: 'SoundCloud URL 붙여넣기' }).first().click();

  // SC URL 입력
  const urlInput = page.getByPlaceholder('https://soundcloud.com/artist/track');
  await urlInput.fill('https://soundcloud.com/test/embed-disabled-track');

  // "확인" 클릭 → oEmbed 스텁이 embed-disabled 반환
  await page.getByRole('button', { name: '확인' }).click();

  // 거부 메시지가 표시된다 — MusicCueEditor의 validationError
  await expect(
    page.getByText('이 트랙은 외부 임베드가 비활성화되어 있습니다.'),
  ).toBeVisible({ timeout: 8_000 });

  // CC0 권유 버튼도 보인다 (에러 박스 안의 "CC0 트랙 고르기 →" 버튼)
  await expect(page.getByRole('button', { name: 'CC0 트랙 고르기 →' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// B. SC 4xx(not-found) → 거부 메시지
// ---------------------------------------------------------------------------
test('B: SC 404(삭제된 트랙) URL 입력 시 거부 메시지가 표시된다', async ({ page }) => {
  await stubSupabaseAuth(page);
  await injectAuthSession(page);
  await stubLetterSave(page);
  await stubListLetters(page, []);

  await stubScOembed(page, { kind: 'not-found' });

  await page.goto('/create');
  await page.getByRole('button', { name: 'SoundCloud URL 붙여넣기' }).first().click();
  await page.getByPlaceholder('https://soundcloud.com/artist/track').fill(
    'https://soundcloud.com/deleted/track',
  );
  await page.getByRole('button', { name: '확인' }).click();

  // 삭제/존재하지 않는 트랙 메시지
  await expect(
    page.getByText('존재하지 않거나 삭제된 트랙입니다.'),
  ).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// C. SC 광고 트랙 경고 배지 — SC 큐 설정 후 AdWarning 표시
// ---------------------------------------------------------------------------
test('C: SC 큐가 설정된 단락에 광고 경고 배지가 표시된다', async ({ page, browserName }) => {
  // webkit 한계: 위 A와 동일(크로스오리진 SC oEmbed 200 body가 route.fulfill로 노출 안 됨).
  test.skip(browserName === 'webkit', 'SC oEmbed 200 body가 webkit+route.fulfill에서 노출 안 됨(harness 한계)');
  await stubSupabaseAuth(page);
  await injectAuthSession(page);
  await stubLetterSave(page);
  await stubListLetters(page, []);

  // SC oEmbed: 정상(광고 가능 트랙 — embed는 되지만 SC이므로 AdWarning 뜸)
  await stubScOembed(page, {
    kind: 'ok',
    title: '광고 있을 수 있는 곡',
    authorName: 'Popular Artist',
  });

  await page.goto('/create');
  await page.getByRole('button', { name: 'SoundCloud URL 붙여넣기' }).first().click();
  await page
    .getByPlaceholder('https://soundcloud.com/artist/track')
    .fill('https://soundcloud.com/popular/track');
  await page.getByRole('button', { name: '확인' }).click();

  // 큐가 설정되면 AdWarning이 표시된다 (SC 트랙 → 광고 가능 경고)
  await expect(
    page.getByText('SoundCloud 무료 트랙은 재생 중 광고가 포함될 수 있어요.'),
  ).toBeVisible({ timeout: 8_000 });

  // CC0로 전환 버튼도 보인다
  await expect(page.getByRole('button', { name: '광고 없는 CC0 트랙으로 변경' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// D. SC 삭제 → 수신 시 폴백(본문 표시, 에러 없음)
// ---------------------------------------------------------------------------
test('D: viewer에서 SC 큐 liveness 실패 시 폴백 — 본문 표시·에러 없음', async ({ page }) => {
  // SC 큐가 담긴 편지 페이로드
  const payloadWithDeadSc = {
    id: 'stub-letter-id',
    title: '그리운 편지',
    paragraphs: [
      { id: 'p-0', order: 0, text: '잘 있었어요?' },
      {
        id: 'p-1',
        order: 1,
        text: '이 음악이 생각났어요.',
        cue: { sourceType: 'soundcloud', ref: 'https://soundcloud.com/deleted/song', startMs: 0 },
      },
    ],
    template_id: 'classic',
    cues: [
      undefined,
      { sourceType: 'soundcloud', ref: 'https://soundcloud.com/deleted/song', startMs: 0 },
    ],
    audio_disabled: false,
  };

  await stubGetLetterByToken(page, payloadWithDeadSc);

  // SC oEmbed: ok (편지 저장 시 검증은 통과했으나 지금은 삭제됐다고 가정)
  // viewer는 oEmbed를 다시 검증하지 않으므로 SC Widget API 로드 실패가 폴백 트리거
  await stubScOembed(page, { kind: 'ok' });

  // SC Widget API iframe을 404로 막아 FallbackTrackSource가 CC0로 폴백하게 한다
  await page.route('**/w.soundcloud.com/player/**', (r) => void r.fulfill({ status: 404 }));
  await page.route('**/api.soundcloud.com/**', (r) => void r.fulfill({ status: 404 }));

  await page.goto(`/l/${STUB_TOKEN}`);

  // 게이트 통과
  await page.getByRole('button', { name: '편지 열기' }).click();

  // 본문은 항상 표시된다 (무음0: SC 실패해도 에러 없이 본문 보존)
  await expect(page.getByText('잘 있었어요?')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('이 음악이 생각났어요.')).toBeVisible();

  // 에러 alert이 없어야 한다
  await expect(page.getByRole('alert')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// E. Revoked 링크 → 거부 메시지
// ---------------------------------------------------------------------------
test('E: revoked 링크 열람 시 정규화된 거부 메시지가 표시된다', async ({ page }) => {
  // get_letter_by_token이 LINK_REVOKED 에러를 반환하도록 스텁
  await stubGetLetterByTokenError(page, 'LINK_REVOKED');

  await page.goto(`/l/${STUB_TOKEN}`);

  // 정규화된 사용자 메시지 (links.ts normalizeOpenError)
  await expect(
    page.getByText('이 링크는 발신자에 의해 무효화되었습니다.'),
  ).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// F. 만료된 링크 → 만료 메시지
// ---------------------------------------------------------------------------
test('F: 만료된 링크 열람 시 만료 메시지가 표시된다', async ({ page }) => {
  await stubGetLetterByTokenError(page, 'LINK_EXPIRED');

  await page.goto(`/l/${STUB_TOKEN}`);

  await expect(
    page.getByText('링크가 만료되었습니다. 발신자에게 재발급을 요청하세요.'),
  ).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// G. TOKEN_NOT_FOUND → 링크 없음 메시지
// ---------------------------------------------------------------------------
test('G: 존재하지 않는 토큰 열람 시 "링크를 찾을 수 없습니다" 메시지가 표시된다', async ({
  page,
}) => {
  await stubGetLetterByTokenError(page, 'TOKEN_NOT_FOUND');

  await page.goto('/l/nonexistent-token-xyz');

  await expect(page.getByText('링크를 찾을 수 없습니다.')).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// H. noindex 메타 태그가 수신 라우트에 주입된다
// ---------------------------------------------------------------------------
test('H: 수신 라우트에 noindex 메타 태그가 주입된다', async ({ page }) => {
  await stubGetLetterByToken(page, {
    id: 'l1',
    title: 'noindex 테스트',
    paragraphs: [{ id: 'p-0', order: 0, text: '안녕' }],
    template_id: 'classic',
    cues: [],
    audio_disabled: false,
  });

  await page.goto(`/l/${STUB_TOKEN}`);

  // noindex 메타 태그 주입 확인 (Viewer.tsx: injectNoIndex()는 mount 시 useEffect로 주입).
  // useEffect는 hydration 이후 비동기로 실행되므로 즉시 count()가 아니라 재시도 단언으로 기다린다.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex,nofollow',
    { timeout: 8_000 },
  );
});
