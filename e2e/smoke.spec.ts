import { test, expect } from '@playwright/test';
import { stubGetLetterByToken } from './helpers/mocks';

// 베이스라인 스모크. T10(US-010)에서 happy/불행 경로 시나리오로 확장한다.
test('랜딩이 렌더되고 편지 쓰기 CTA가 보인다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '연출되는 편지' })).toBeVisible();
  await expect(page.getByRole('link', { name: '편지 쓰기' })).toBeVisible();
});

test('수신 라우트는 무인증으로 열린다(인코그니토 컨텍스트)', async ({ page }) => {
  // get_letter_by_token RPC를 스텁해 Viewer가 편지 열기 게이트까지 진행하게 한다.
  await stubGetLetterByToken(page, {
    id: 'smoke-letter',
    title: '스모크 테스트 편지',
    paragraphs: [{ id: 'p-0', order: 0, text: '안녕하세요.' }],
    template_id: 'classic',
    cues: [],
    audio_disabled: false,
  });

  await page.goto('/l/sometesttoken');
  // 수신 라우트: 인증 없이 "편지 열기 ▶" 게이트가 표시된다 (무인증 OK).
  await expect(page.getByRole('button', { name: '편지 열기' })).toBeVisible({ timeout: 8_000 });
});
