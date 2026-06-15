# letter-app — 연출되는 편지

읽는 순간을 연출하는 감성 편지 PWA. 발신자가 단락별로 음악을 연출하고, 수신자는 설치 없이 링크로 열어 스크롤하며 그 순간을 경험한다.

- **스택:** Vite + React + TypeScript · Supabase · Netlify · Vitest + Playwright
- **음악:** SoundCloud(paste-URL) + CC0 무드 픽커 (무음 편지 0)
- **문서:** 제품 결정 `docs/PRD.md`(v4) · 요구사항 `docs/specs/requirements.md` · TASK `docs/specs/task-breakdown.md`
- **작업 하네스:** `CLAUDE.md` + `.claude/skills/` + `.claude/commands/`

## 개발

```bash
npm install
cp .env.example .env   # Supabase URL/anon key 채우기
npm run dev            # 개발 서버
npm run typecheck      # 타입체크
npm run test           # 유닛 테스트
npm run build          # 프로덕션 빌드
npm run e2e            # E2E (Playwright)
```

## 라우트

| 경로 | 설명 | 인증 |
|---|---|---|
| `/` | 랜딩 | - |
| `/login` | 매직링크 로그인 | - |
| `/create`, `/create/:id` | 편지 작성 + 음악 큐 | 필요 |
| `/sent` | 보낸 편지·링크 관리 | 필요 |
| `/l/:token` | 수신 무설치 웹뷰 | 무인증 |
| `/legal/takedown` | 저작권 신고 | 공개 |
