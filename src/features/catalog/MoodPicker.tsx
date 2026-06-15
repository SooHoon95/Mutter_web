// CC0/RF 카탈로그 무드 픽커 UI 컴포넌트.
// 발신자가 편지에 어울리는 CC0 배경음악을 무드별로 선택한다.
// 과한 디자인 금지 — T6 테마에서 스타일링 예정.

import type { Track } from '@/data/types';
import { useCatalog, MOODS, type Mood } from './useCatalog';
import styles from './MoodPicker.module.css';

interface MoodPickerProps {
  /** 트랙 선택 시 호출. 발신자가 편지 큐에 연결하는 진입점. */
  onSelect: (track: Track) => void;
}

export function MoodPicker({ onSelect }: MoodPickerProps): React.ReactElement {
  const { selectedMood, setMood, tracks } = useCatalog();

  function handleMoodClick(mood: Mood): void {
    // 같은 무드를 다시 클릭하면 필터 해제(전체 보기)
    setMood(selectedMood === mood ? undefined : mood);
  }

  return (
    <div className={styles.container}>
      {/* 무드 필터 버튼 */}
      <div className={styles.moodBar} role="group" aria-label="무드 필터">
        {MOODS.map((mood) => (
          <button
            key={mood}
            type="button"
            className={`${styles.moodBtn} ${selectedMood === mood ? styles.moodBtnActive : ''}`}
            onClick={() => handleMoodClick(mood)}
            aria-pressed={selectedMood === mood}
          >
            {mood}
          </button>
        ))}
      </div>

      {/* 트랙 목록 */}
      {tracks.length === 0 ? (
        <p className={styles.empty}>해당 무드의 곡이 없습니다.</p>
      ) : (
        <ul className={styles.trackList}>
          {tracks.map((track) => (
            <li key={track.id}>
              <button
                type="button"
                className={styles.trackItem}
                onClick={() => onSelect(track)}
                aria-label={`${track.title} 선택 — ${track.author}, ${track.license}`}
              >
                <span className={styles.trackInfo}>
                  <span className={styles.trackTitle}>{track.title}</span>
                  <span className={styles.trackMeta}>{track.author}</span>
                </span>
                {/* CC-BY 트랙은 라이선스 표기 필수 — 수신 뷰에서 크레딧 렌더 필요 */}
                <span className={styles.trackLicense}>{track.license}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
