// 보낸 편지 목록 + 전달 링크 관리 (T7 US-007).
// 각 편지마다 LinkManager를 표시해 링크 발급·revoke·복사를 지원한다.

import { useState, useEffect } from 'react';
import { listMyLetters } from '../data/letters';
import type { Letter } from '../data/types';
import { LinkManager } from '../features/delivery';

export default function Sent() {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listMyLetters()
      .then(setLetters)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : '편지 목록 로드 실패'),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="page">
        <h1>보낸 편지</h1>
        <p>불러오는 중…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <h1>보낸 편지</h1>
        <p style={{ color: 'var(--color-error, #f87171)' }}>{error}</p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>보낸 편지</h1>

      {letters.length === 0 ? (
        <p>작성한 편지가 없습니다.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {letters.map((letter) => (
            <li
              key={letter.id}
              style={{
                border: '1px solid var(--color-border, #2a2a2a)',
                borderRadius: '0.5rem',
                padding: '1rem',
                background: 'var(--color-surface, #18181b)',
              }}
            >
              {/* 편지 헤더 */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: expanded === letter.id ? '1rem' : 0,
                }}
              >
                <div>
                  <strong style={{ fontSize: '1rem' }}>{letter.title || '(제목 없음)'}</strong>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #a1a1aa)', margin: '0.25rem 0 0' }}>
                    {new Date(letter.updatedAt).toLocaleString('ko-KR')}
                  </p>
                </div>
                <button
                  style={{
                    fontSize: '0.8125rem',
                    background: 'var(--color-surface-2, #27272a)',
                    border: 'none',
                    borderRadius: '0.375rem',
                    color: 'var(--color-text, #e4e4e7)',
                    padding: '0.375rem 0.75rem',
                    cursor: 'pointer',
                  }}
                  onClick={() =>
                    setExpanded((prev) => (prev === letter.id ? null : letter.id))
                  }
                >
                  {expanded === letter.id ? '링크 닫기' : '링크 관리'}
                </button>
              </div>

              {/* 링크 관리 패널 */}
              {expanded === letter.id && <LinkManager letterId={letter.id} />}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
