// 보낸 편지 읽기 전용 미리보기 라우트 (/preview/:id).
// 소유자가 /people 스레드에서 자기가 보낸 편지를 "열기"로 볼 때 사용한다.
// 편집기(/create/:id)로 보내지 않고, 본문을 그대로 읽기만 하도록 한다.
//   - getLetter는 RLS로 소유자만 접근 가능 → 타계정/없음이면 null.
//   - 음악 큐는 발송한 편지의 실제 경험과 다르므로 여기선 재생하지 않는다(정적 미리보기).

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getLetter } from '@/data/letters';
import type { Letter } from '@/data/types';
import { TemplateThemed, Paginated, type PaginatedParagraph } from '@/features/templates';
import styles from './Preview.module.css';

/** Letter.paragraphs(order)를 order순으로 정렬해 Paginated 입력으로 변환한다. */
function toPaginated(letter: Letter): PaginatedParagraph[] {
  return [...letter.paragraphs]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ id: p.id, text: p.text }));
}

export default function Preview(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [letter, setLetter] = useState<Letter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('편지를 찾을 수 없습니다.');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getLetter(id)
      .then((l) => {
        if (!active) return;
        if (!l) setError('편지를 찾을 수 없습니다.');
        else setLetter(l);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : '편지를 불러올 수 없습니다.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <p className={styles.empty}>불러오는 중…</p>;
  }

  if (error !== null || letter === null) {
    return <p className={styles.error}>{error ?? '편지를 불러올 수 없습니다.'}</p>;
  }

  return (
    <main className={styles.page}>
      <TemplateThemed templateId={letter.templateId}>
        <Paginated title={letter.title || '(제목 없음)'} paragraphs={toPaginated(letter)} />
      </TemplateThemed>
    </main>
  );
}
