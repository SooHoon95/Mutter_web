# commit

변경 사항을 검토하고 커밋한다. CLAUDE.md의 커밋 규칙을 준수한다.

## 작업 순서

### 1단계: 변경 파일 확인
`git status`와 `git diff`로 변경 내용을 확인한다. staging된 파일이 없으면 변경 목록을 보여주고 staging할 파일을 확인받는다.

### 2단계: 커밋 전 검증
1. 커밋에 포함되면 안 될 파일이 staging되지 않았는가
   - `.env`, API 키, service role key 제외
   - `node_modules/`, `dist/`, 빌드 산출물 제외
2. 각 커밋이 단일 목적을 가지는가
3. 주석 처리된 dead code가 포함되지 않았는가
4. `npm run typecheck && npm run test`가 통과하는가(코드 변경 시)

### 3단계: 커밋 타입 결정

| 타입 | 사용 시점 |
|------|-----------|
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `style` | 의미 영향 없는 수정(포맷·공백) |
| `refactor` | 기능 변경 없이 구조 개선 |
| `test` | 테스트 추가/수정 |
| `docs` | 문서 수정 |
| `build` | 빌드·의존성 설정(package.json, vite.config 등) |
| `chore` | 기타 자잘한 수정 |
| `WIP` | 작업 중 임시 커밋 |

### 4단계: 커밋 메시지

```
{타입}: {변경 내용 한국어로 간결하게}
```

예: `feat: 수신 웹뷰 스크롤 동기 재생 구현`, `fix: SC oEmbed 검증 비200 처리`, `build: vite-plugin-pwa 매니페스트 추가`

### 5단계: 커밋 실행
```bash
git add {파일들}
git commit -m "{타입}: {메시지}"
```

## 커밋 규칙
- **Co-Authored-By 포함하지 않는다.**
- `git add`로 파일을 개별 지정한다(`-A`/`.` 지양).
- `.env`·비밀·`node_modules`·`dist`는 절대 커밋하지 않는다(.gitignore 확인).
