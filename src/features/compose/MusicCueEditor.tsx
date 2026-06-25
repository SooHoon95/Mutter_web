// 편지 음악 1곡 선택기.
// (a) SC URL 붙여넣기 → oEmbed 검증 → 거부 시 사유 표시 + CC0 권유
// (b) "CC0에서 고르기" → MoodPicker로 hosted 큐 설정
// license-compliance 스킬: SC 트랙 광고 경고 배지 표시.
//
// 편지당 음악은 1곡이므로 props는 단일 cue + onChange만 받는다(단락 개념 없음).

import { useState, useCallback } from 'react';
import type { MusicCue, Track } from '@/data/types';
import { validateScUrl, type ScValidation } from '@/lib/scOembed';
import { MoodPicker } from '@/features/catalog';
import { AdWarning } from './AdWarning';
import styles from './MusicCueEditor.module.css';

interface MusicCueEditorProps {
  /** 현재 설정된 편지 음악 (없으면 undefined). */
  cue: MusicCue | undefined;
  /** 음악 변경 콜백 (undefined로 제거). */
  onChange: (cue: MusicCue | undefined) => void;
}

type Mode = 'idle' | 'sc-input' | 'cc0-picker';

/**
 * SC 큐 ref를 화면용 짧은 이름으로 변환한다.
 * cue.ref는 보통 절대 URL이지만, oEmbed가 canonical 추출에 실패하면 원본 문자열(비-URL)로 폴백할 수 있다.
 * 이때 new URL()이 throw해 작성 화면이 통째로 죽으므로, 파싱 실패 시 원본 ref를 그대로 보여준다.
 */
function safeScDisplayName(ref: string): string {
  try {
    return new URL(ref).pathname.slice(1);
  } catch {
    return ref;
  }
}

/** SC 검증 거부 사유 한국어 메시지 */
const REJECT_MESSAGES: Record<string, string> = {
  'non-200': '존재하지 않거나 삭제된 트랙입니다.',
  'embed-disabled': '이 트랙은 외부 임베드가 비활성화되어 있습니다.',
  'private': '비공개 트랙이거나 지역 제한이 있습니다.',
  'invalid-url': 'SoundCloud 트랙 URL이 아닙니다.',
  'network': '네트워크 오류로 확인하지 못했습니다. 다시 시도해 주세요.',
};

export function MusicCueEditor({
  cue,
  onChange,
}: MusicCueEditorProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>('idle');
  const [scInput, setScInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── SC URL 검증 및 큐 설정 ────────────────────────────────────────────────

  const handleScSubmit = useCallback(async () => {
    if (!scInput.trim()) return;
    setIsValidating(true);
    setValidationError(null);

    const result: ScValidation = await validateScUrl(scInput.trim());

    if (!result.ok) {
      const errorMsg = REJECT_MESSAGES[result.reason] ?? '알 수 없는 오류입니다.';
      setValidationError(
        `${errorMsg} CC0 트랙을 사용하면 광고 없이 재생이 보장됩니다.`,
      );
      setIsValidating(false);
      return;
    }

    // 검증 통과 → soundcloud 큐 설정
    onChange({ sourceType: 'soundcloud', ref: result.canonicalUrl, startMs: 0 });
    setMode('idle');
    setScInput('');
    setIsValidating(false);
  }, [scInput, onChange]);

  // ── CC0 트랙 선택 ─────────────────────────────────────────────────────────

  const handleCc0Select = useCallback(
    (track: Track) => {
      onChange({ sourceType: 'hosted', ref: track.id, startMs: 0 });
      setMode('idle');
    },
    [onChange],
  );

  // ── 큐 제거 ───────────────────────────────────────────────────────────────

  const handleRemoveCue = useCallback(() => {
    onChange(undefined);
    setMode('idle');
    setScInput('');
    setValidationError(null);
  }, [onChange]);

  const switchToCc0 = useCallback(() => {
    setValidationError(null);
    setScInput('');
    setMode('cc0-picker');
  }, []);

  // ── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* 현재 설정된 편지 음악 표시 */}
      {cue && (
        <div className={styles.currentCue}>
          <span className={styles.cueLabel}>
            {cue.sourceType === 'soundcloud' ? '♪ SC' : '♪ CC0'}
          </span>
          <span className={styles.cueRef} title={cue.ref}>
            {cue.sourceType === 'soundcloud' ? safeScDisplayName(cue.ref) : cue.ref}
          </span>
          <button
            type="button"
            className={styles.removeBtn}
            onClick={handleRemoveCue}
            aria-label="음악 제거"
          >
            ✕
          </button>
        </div>
      )}

      {/* SC 트랙이면 광고 경고 배지 표시 */}
      {cue?.sourceType === 'soundcloud' && <AdWarning onSwitchToCc0={switchToCc0} />}

      {/* 음악 선택/변경 버튼 */}
      {mode === 'idle' && (
        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setMode('sc-input')}
          >
            {cue ? 'SoundCloud URL로 변경' : 'SoundCloud URL 붙여넣기'}
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setMode('cc0-picker')}
          >
            {cue ? 'CC0에서 다시 고르기' : 'CC0에서 고르기'}
          </button>
          {cue && (
            <button
              type="button"
              className={styles.actionBtnDanger}
              onClick={handleRemoveCue}
            >
              음악 없애기
            </button>
          )}
        </div>
      )}

      {/* SC URL 입력 패널 */}
      {mode === 'sc-input' && (
        <div className={styles.panel}>
          <label htmlFor="sc-url-input" className={styles.panelLabel}>
            SoundCloud 트랙 URL
          </label>
          <div className={styles.inputRow}>
            <input
              id="sc-url-input"
              type="url"
              className={styles.urlInput}
              placeholder="https://soundcloud.com/artist/track"
              value={scInput}
              onChange={(e) => {
                setScInput(e.target.value);
                setValidationError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleScSubmit();
              }}
              disabled={isValidating}
              aria-describedby={validationError ? 'sc-url-error' : undefined}
            />
            <button
              type="button"
              className={styles.submitBtn}
              onClick={() => void handleScSubmit()}
              disabled={isValidating || !scInput.trim()}
            >
              {isValidating ? '확인 중…' : '확인'}
            </button>
          </div>

          {/* 검증 거부 메시지 */}
          {validationError && (
            <div id="sc-url-error" className={styles.errorBox} role="alert">
              <p className={styles.errorMsg}>{validationError}</p>
              <button type="button" className={styles.cc0SuggestBtn} onClick={switchToCc0}>
                CC0 트랙 고르기 →
              </button>
            </div>
          )}

          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => {
              setMode('idle');
              setScInput('');
              setValidationError(null);
            }}
          >
            취소
          </button>
        </div>
      )}

      {/* CC0 무드 픽커 패널 */}
      {mode === 'cc0-picker' && (
        <div className={styles.panel}>
          <p className={styles.panelLabel}>CC0 트랙 선택 (광고 없음 보장)</p>
          <MoodPicker onSelect={handleCc0Select} />
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => setMode('idle')}
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
}
