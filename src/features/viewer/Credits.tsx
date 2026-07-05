// Credits — 편지에 쓰인 트랙의 크레딧 렌더 (T8 viewer).
//
// license-compliance: **모든 CC-BY 트랙은 제목·저작자·출처·라이선스를 반드시 렌더**한다.
// 미렌더 = 침해 → 출시 차단. CC0/PD는 표기 의무가 없으나 출처 표기는 선택적으로 노출한다.
//
// 트랙 수집: 편지 cues를 순회해 hosted cue는 카탈로그(getTrackById)로 Track을 해석한다.
// soundcloud cue는 카탈로그 프로비넌스가 없으므로(paste-URL) 출처 URL만 중립 표기한다.

import type { MusicCue, Track } from '@/data/types';
import { getTrackById } from '@/data/tracks';
import styles from './Credits.module.css';

interface CreditsProps {
  /** 편지 단락별 큐(없는 단락은 undefined). 중복 트랙은 한 번만 표기한다. */
  cues: Array<MusicCue | undefined>;
}

/** 크레딧 한 줄의 정규화 표현. */
interface CreditEntry {
  key: string;
  title: string;
  author?: string;
  sourceUrl?: string;
  licenseName: string;
  /** CC-BY 등 표기 의무 트랙 여부(렌더 강조용). */
  attributionRequired: boolean;
}

/** 라이선스명에 표기 의무가 있는지(CC-BY 계열). CC0/PD는 의무 없음. */
function requiresAttribution(licenseName: string): boolean {
  const upper = licenseName.toUpperCase();
  // CC0/PD는 의무 없음. 그 외 CC-BY 계열은 표기 의무.
  if (upper.includes('CC0') || upper.includes('PUBLIC DOMAIN')) return false;
  return upper.includes('CC-BY') || upper.includes('BY');
}

/** hosted Track → CreditEntry. provenance가 있으면 출처 URL을 그대로 노출. */
function trackToEntry(track: Track): CreditEntry {
  const licenseName = track.provenance?.licenseName ?? track.license;
  return {
    key: `track:${track.id}`,
    title: track.title,
    author: track.provenance?.author ?? track.author,
    sourceUrl: track.provenance?.sourceUrl,
    licenseName,
    attributionRequired: requiresAttribution(licenseName),
  };
}

/** soundcloud cue → CreditEntry. oEmbed 메타가 있으면 제목/저작자 표기, 출처는 원본 공개 URL만.
 *  sourceUrl이 없으면(레거시) 출처 링크를 숨긴다 — ref(canonical)는 API JSON이라 링크로 부적합. */
function scCueToEntry(cue: MusicCue): CreditEntry {
  return {
    key: `sc:${cue.ref}`,
    title: cue.title ?? 'SoundCloud 트랙',
    author: cue.author,
    sourceUrl: cue.sourceUrl,
    licenseName: 'SoundCloud',
    attributionRequired: false,
  };
}

/** 편지 cues에서 중복 없는 크레딧 목록을 수집한다. */
function collectCredits(cues: Array<MusicCue | undefined>): CreditEntry[] {
  const seen = new Set<string>();
  const entries: CreditEntry[] = [];

  for (const cue of cues) {
    if (!cue) continue;
    let entry: CreditEntry | null = null;

    if (cue.sourceType === 'hosted') {
      const track = getTrackById(cue.ref);
      // 카탈로그에 없으면(폴백 CC0 대체 등) 표기 대상이 아님 — 무음0 폴백은 CC0라 의무 없음.
      if (track) entry = trackToEntry(track);
    } else {
      entry = scCueToEntry(cue);
    }

    if (entry && !seen.has(entry.key)) {
      seen.add(entry.key);
      entries.push(entry);
    }
  }

  return entries;
}

export function Credits({ cues }: CreditsProps): React.ReactElement | null {
  const entries = collectCredits(cues);
  if (entries.length === 0) return null;

  return (
    <section className={styles.credits} aria-label="음악 출처 및 라이선스">
      <h2 className={styles.heading}>음악 크레딧</h2>
      <ul className={styles.list}>
        {entries.map((e) => (
          <li key={e.key} className={styles.item}>
            <span className={styles.title}>{e.title}</span>
            {e.author && <span className={styles.author}> — {e.author}</span>}
            <span className={styles.license}>
              {' '}
              ({e.licenseName})
            </span>
            {e.sourceUrl && (
              <>
                {' '}
                <a
                  className={styles.source}
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  출처
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
