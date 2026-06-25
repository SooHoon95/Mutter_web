// AudioUnlockGate — "편지 열기 ▶" 풀스크린 게이트 (T8 viewer).
//
// iOS 오디오 정책(music-sync): 첫 사용자 제스처 핸들러 "안에서 동기적으로" 오디오를
// 언락해야 이후 자동 play()/seekTo()가 허용된다. 이 게이트의 단일 ▶ 클릭이 그 제스처다.
//
// 콜드 예산(<3s/4G, pwa-architecture): 이 제스처 전에는 오디오/iframe을 마운트하지 않는다.
// 게이트가 보이는 동안 LetterView는 음악을 재생하지 않는다(façade). onUnlock이
// 완료되면 부모가 음악 1곡을 재생한다.
//
// W6: 게이트를 TemplateThemed로 감싸 편지 테마(편지지 배경·테마 폰트·골드 톤)로 스타일링한다.
// 일반 회색 진입 화면이 아니라 "편지의 표지"처럼 보이게 한다.

import { useState } from 'react';
import { TemplateThemed } from '@/features/templates';
import styles from './AudioUnlockGate.module.css';

interface AudioUnlockGateProps {
  /** 편지 제목(게이트에 중립적으로 미리보기). 본문은 누설하지 않는다. */
  title?: string;
  /** 편지 템플릿 id — 게이트를 편지와 같은 테마로 스타일링한다(W6). */
  templateId: string;
  /**
   * 제스처 컨텍스트에서 호출할 언락 함수.
   * **반드시 onClick 핸들러 안에서 동기적으로 시작**해야 iOS가 오디오를 언락한다.
   * (Promise를 반환하지만, play() 호출 자체는 클릭 이벤트 틱에서 이뤄진다.)
   */
  onUnlock: () => Promise<void>;
}

export function AudioUnlockGate({
  title,
  templateId,
  onUnlock,
}: AudioUnlockGateProps): React.ReactElement {
  const [opening, setOpening] = useState(false);

  function handleOpen(): void {
    // 중복 클릭 방지. 단, onUnlock 호출은 이 클릭 틱 안에서 동기적으로 시작한다.
    if (opening) return;
    setOpening(true);
    // iOS: 제스처 핸들러 내부에서 즉시 unlock을 시작해야 한다(await로 미루지 않음).
    // 단, onUnlock이 거부/실패하면 버튼이 "여는 중…"에 영구히 갇히지 않게 복구해 재시도를 허용한다.
    // (.catch는 동기 호출에 영향을 주지 않으므로 제스처 틱 내 play() 타이밍은 그대로 유지된다.)
    onUnlock().catch(() => setOpening(false));
  }

  return (
    // TemplateThemed가 --tpl-* CSS 변수를 주입해 게이트를 편지 테마로 칠한다.
    <TemplateThemed templateId={templateId} className={styles.gate}>
      <div className={styles.inner} role="dialog" aria-modal="true" aria-label="편지 열기">
        {title && <p className={styles.title}>{title}</p>}
        <p className={styles.subtitle}>도착한 편지가 있어요.</p>
        <button
          type="button"
          className={styles.openButton}
          onClick={handleOpen}
          disabled={opening}
          aria-label="편지 열기"
        >
          <span className={styles.playIcon} aria-hidden="true">
            ▶
          </span>
          {opening ? '여는 중…' : '편지 열기'}
        </button>
        <p className={styles.hint}>편지를 열면 음악과 함께 재생됩니다.</p>
      </div>
    </TemplateThemed>
  );
}
