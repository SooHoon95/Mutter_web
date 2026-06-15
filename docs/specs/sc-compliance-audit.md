# SoundCloud 스트림 no-rip 감사 노트

감사 대상: `src/features/music/SoundCloudSource.ts`  
감사 일시: 2026-06-16  
감사자: T9 구현 패스 (코드 전수 검토)

---

## 결론: 위반 없음 — 공식 Widget API/canonical embed만 사용

### 확인 항목

| 항목 | 결과 | 근거 |
|---|---|---|
| 오디오 바이트 fetch | 없음 | `fetch()`·`XMLHttpRequest`·`axios` 등 HTTP 호출 없음 |
| 스트림 URL rip | 없음 | SC 내부 스트림 URL(`.soundcloud.com/stream/*`) 직접 참조 없음 |
| 오디오 proxy / 재호스팅 | 없음 | 서버 경유 없음 — 순수 클라이언트 Widget embed |
| 오디오 캐시 / Storage 저장 | 없음 | `localStorage`·`IndexedDB`·Supabase Storage에 SC 오디오 저장 없음 |
| embed-disabled/private 우회 | 없음 | `buildEmbedSrc()`는 canonical embed URL만 생성, private 우회 파라미터 없음 |
| 공식 Widget API 사용 | 확인 | `https://w.soundcloud.com/player/api.js` 동적 로드 후 `SC.Widget(iframe)` 사용 |
| canonical embed URL | 확인 | `https://w.soundcloud.com/player/?url=<trackUrl>&...` 형식만 사용 |
| SC 브랜딩/컨트롤 은폐 | 없음 | `visual=false`는 레이아웃 모드 선택이며 SC 브랜딩 제거가 아님 |

### 코드 경로 요약

```
SoundCloudSource.load()
  └─ loadWidgetApi()          // https://w.soundcloud.com/player/api.js 스크립트 로드
  └─ buildEmbedSrc(trackUrl)  // canonical embed URL 생성 (바이트 fetch 없음)
  └─ <iframe src=embedSrc />  // SC 서버가 직접 오디오 스트리밍 담당
  └─ SC.Widget(iframe)        // 공식 Widget API 핸들 획득
     └─ play/pause/seekTo/setVolume  // Widget 메서드만 호출 (내부 스트림 URL 접근 없음)
```

### PRD §8 / license-compliance SKILL 조항 대조

- "공식 Widget API + canonical embed URL만" → **충족**
- "오디오 바이트 fetch/저장/proxy/재호스팅 금지" → **위반 없음**
- "embed-disabled/private 우회 금지" → **위반 없음**
- "SC 브랜딩/컨트롤 은폐·제휴 암시 금지" → **위반 없음**

### 기타 파일 확인

- `poc/spike-music-soundcloud.html`: PoC 스파이크(배포 미포함), Widget API embed만 사용.
- `src/lib/scOembed.ts`: oEmbed 검증용 `GET soundcloud.com/oembed` 호출만 있음. 오디오 바이트 fetch 없음.
- `src/data/links.ts`, `src/features/viewer/`: SC 관련 직접 HTTP 호출 없음.

**감사 결론: SoundCloud 면책 요건 충족. 추가 수정 불필요.**
