/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    // vite-plugin-pwa: 웹 매니페스트 + 서비스워커(Workbox) 자동 생성.
    // registerType 'autoUpdate' — 새 SW가 감지되면 사용자 개입 없이 자동 갱신.
    VitePWA({
      registerType: 'autoUpdate',
      // SW 파일명: sw.js (dist/sw.js)
      filename: 'sw.js',
      // 개발 중에도 SW를 활성화해 A2HS 테스트를 가능하게 한다.
      devOptions: { enabled: false },
      manifest: {
        name: '연출되는 편지',
        short_name: '편지',
        description: '읽는 순간을 연출하는 편지. 설치 없이 링크 하나로 전합니다.',
        lang: 'ko',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1a1a1a',
        background_color: '#0f0f10',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 앱 셸 파일(JS/CSS/HTML)을 precache한다.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // 수신 편지 경로(/l/*)는 network-first:
        // revoke·만료가 즉시 반영돼야 하므로 캐시 우선 전략을 쓰지 않는다.
        // navigateFallback에서 /l/ 경로를 제외해 오래된 셸이 서빙되지 않게 한다.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          // /l/:token — 수신 편지 경로: 항상 서버/네트워크 우선
          /^\/l\/.+/,
          // /legal/ — takedown 등 공개 법적 채널
          /^\/legal\/.*/,
        ],
        runtimeCaching: [
          {
            // 수신 편지 경로: network-first (최신성·revoke 보장)
            urlPattern: /^https?:\/\/.*\/l\/.+/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'letter-viewer',
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
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
