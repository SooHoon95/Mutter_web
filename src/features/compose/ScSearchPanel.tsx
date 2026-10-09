// SoundCloud "찾아서 복사해 오기" 블록 — 새 탭 검색 + 클립보드에서 곡 링크 가져오기.
// 앱의 인앱 SC 브라우저("이 곡 넣기")는 웹에서 불가하다 — m.soundcloud.com이 iframe을 막고
// (X-Frame-Options: DENY), 다른 출처 창의 URL은 읽을 수 없다. 그래서 새 탭 검색 → 공유 링크 복사 →
// 돌아와 "복사한 곡 넣기"(클릭 제스처 안에서 클립보드 읽기)로 가장 가까운 흐름을 만든다.
//
// 검증은 하지 않는다 — 뽑은 URL을 onClipboardUrl로 넘겨 MusicCueEditor의 단일 검증 경로를 탄다.
// children 자리에 부모의 URL 입력 행이 들어가, 검색 → 붙여넣기 칸 → 복사한 곡 넣기 순서를 유지한다.

import { useState, useCallback, useEffect } from 'react';
import type { ReactNode, RefObject } from 'react';
import { buildScSearchUrl, extractScUrl } from './scSearch';
import editorStyles from './MusicCueEditor.module.css';
import styles from './ScSearchPanel.module.css';

interface ScSearchPanelProps {
  /** 부모 검증 진행 중 여부 (버튼 비활성·안내 정리). */
  isValidating: boolean;
  /** 클립보드 실패 시 수동 붙여넣기로 포커스를 옮길 입력칸. */
  urlInputRef: RefObject<HTMLInputElement | null>;
  /** 클립보드 읽기를 시작할 때 (부모의 이전 검증 오류 정리). */
  onClipboardStart: () => void;
  /** 클립보드에서 뽑은 SC URL — 부모의 기존 검증 경로로 넘긴다. */
  onClipboardUrl: (url: string) => Promise<void>;
  /** 부모의 URL 입력 행 (검색 블록과 "복사한 곡 넣기" 사이에 렌더). */
  children: ReactNode;
}

const CLIPBOARD_UNAVAILABLE_MSG =
  '복사한 링크를 읽지 못했어요. 아래 칸에 길게 눌러 직접 붙여넣어 주세요.';
const CLIPBOARD_NO_SC_MSG =
  '복사한 내용에 SoundCloud 링크가 없어요. 곡 화면에서 공유 → 링크 복사 후 다시 눌러 주세요.';

export function ScSearchPanel({
  isValidating,
  urlInputRef,
  onClipboardStart,
  onClipboardUrl,
  children,
}: ScSearchPanelProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);
  // 검색 탭을 연 뒤 이 화면으로 돌아왔는지 — "복사한 곡 넣기"를 강조하는 신호.
  const [hasOpenedSearch, setHasOpenedSearch] = useState(false);
  const [hasReturnedFromSearch, setHasReturnedFromSearch] = useState(false);

  // 검색 탭에서 돌아오면(탭 전환·앱 전환 모두) 강조만 켠다. 클립보드는 클릭 없이 읽지 않는다.
  useEffect(() => {
    if (!hasOpenedSearch) return;
    const markReturned = (): void => {
      if (document.visibilityState === 'visible') setHasReturnedFromSearch(true);
    };
    window.addEventListener('focus', markReturned);
    document.addEventListener('visibilitychange', markReturned);
    return () => {
      window.removeEventListener('focus', markReturned);
      document.removeEventListener('visibilitychange', markReturned);
    };
  }, [hasOpenedSearch]);

  // 어느 입구로든 검증이 시작되면 이전 클립보드 안내는 낡은 정보가 된다.
  useEffect(() => {
    if (isValidating) setClipboardMessage(null);
  }, [isValidating]);

  const handleOpenSearch = useCallback(() => {
    // 모바일에선 SC 유니버설 링크가 SC 앱을 열 수 있다 — 거기서 공유→링크 복사해도 같은 흐름.
    window.open(buildScSearchUrl(searchQuery), '_blank', 'noopener,noreferrer');
    setHasOpenedSearch(true);
    setHasReturnedFromSearch(false);
  }, [searchQuery]);

  const showClipboardFallback = useCallback(
    (message: string) => {
      setClipboardMessage(message);
      urlInputRef.current?.focus();
    },
    [urlInputRef],
  );

  // Safari는 사용자 제스처 안에서만 readText를 허용하므로, 클릭 핸들러에서 await 전에 바로 호출한다.
  const handlePasteFromClipboard = useCallback(async () => {
    onClipboardStart();
    setClipboardMessage(null);
    let text: string;
    try {
      if (!navigator.clipboard?.readText) throw new Error('clipboard-unavailable');
      text = await navigator.clipboard.readText();
    } catch {
      showClipboardFallback(CLIPBOARD_UNAVAILABLE_MSG);
      return;
    }
    const url = extractScUrl(text);
    if (!url) {
      showClipboardFallback(CLIPBOARD_NO_SC_MSG);
      return;
    }
    await onClipboardUrl(url);
  }, [onClipboardStart, onClipboardUrl, showClipboardFallback]);

  return (
    <>
      <label htmlFor="sc-search-input" className={editorStyles.panelLabel}>
        SoundCloud에서 곡 찾기
      </label>
      <div className={editorStyles.inputRow}>
        <input
          id="sc-search-input"
          type="search"
          className={editorStyles.urlInput}
          placeholder="곡·아티스트 검색"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleOpenSearch();
          }}
          aria-describedby="sc-search-hint"
        />
        <button type="button" className={styles.secondaryBtn} onClick={handleOpenSearch}>
          SoundCloud에서 찾기
        </button>
      </div>
      <p id="sc-search-hint" className={styles.hint}>
        곡 화면에서 공유 → 링크 복사 후 돌아와 &lsquo;복사한 곡 넣기&rsquo;를 눌러 주세요
      </p>

      {children}

      <button
        type="button"
        className={
          hasReturnedFromSearch ? `${styles.pasteBtn} ${styles.pasteBtnEmphasis}` : styles.pasteBtn
        }
        onClick={() => void handlePasteFromClipboard()}
        disabled={isValidating}
      >
        복사한 곡 넣기
      </button>

      {/* 클립보드 실패·SC 링크 없음 안내 — 입력칸으로 포커스를 옮기며 함께 읽힌다 */}
      {clipboardMessage && (
        <p id="sc-clipboard-msg" className={styles.hint} role="status">
          {clipboardMessage}
        </p>
      )}
    </>
  );
}
