/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// PWA 플러그인은 T1(US-001)에서 매니페스트/SW와 함께 활성화한다.
// T0 베이스라인은 빌드·테스트가 통과하는 최소 구성만 둔다.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});
