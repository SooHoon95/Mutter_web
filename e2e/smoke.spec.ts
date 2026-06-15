import { test, expect } from '@playwright/test';

// 베이스라인 스모크. T10(US-010)에서 happy/불행 경로 시나리오로 확장한다.
test('랜딩이 렌더되고 편지 쓰기 CTA가 보인다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '연출되는 편지' })).toBeVisible();
  await expect(page.getByRole('link', { name: '편지 쓰기' })).toBeVisible();
});

test('수신 라우트는 무인증으로 열린다(인코그니토 컨텍스트)', async ({ page }) => {
  await page.goto('/l/sometesttoken');
  await expect(page.getByRole('heading', { name: '편지' })).toBeVisible();
});
