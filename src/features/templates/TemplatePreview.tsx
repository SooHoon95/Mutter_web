// 편지지 스타일 미리보기 — 선택한 템플릿이 실제 편지에서 어떻게 보이는지 보여준다.
// TemplateThemed를 재사용해 수신 뷰(LetterView)와 동일한 CSS 변수를 적용하므로,
// 미리보기와 실제 결과가 일치한다. 작성자의 제목/첫 단락을 샘플로 써 실감나게 보여준다.

import { TemplateThemed } from './TemplateThemed';
import styles from './TemplatePreview.module.css';

interface TemplatePreviewProps {
  templateId: string;
  /** 작성 중인 제목(없으면 플레이스홀더). */
  title?: string;
  /** 작성 중인 첫 단락 텍스트(없으면 안내 문구). */
  sampleText?: string;
}

const FALLBACK_TEXT =
  '받는 사람은 이런 편지지 위에서 당신의 편지를 읽게 됩니다. 단락마다 음악이 차오르고, 글씨·색·여백이 이 템플릿의 분위기를 입습니다.';

export function TemplatePreview({
  templateId,
  title,
  sampleText,
}: TemplatePreviewProps): React.ReactElement {
  return (
    <figure className={styles.frame}>
      <figcaption className={styles.caption}>편지지 미리보기</figcaption>
      <TemplateThemed templateId={templateId} className={styles.paper}>
        <h3 className={styles.title}>{title?.trim() || '편지 제목'}</h3>
        <hr className={styles.divider} />
        <p className={styles.body}>{sampleText?.trim() || FALLBACK_TEXT}</p>
      </TemplateThemed>
    </figure>
  );
}
