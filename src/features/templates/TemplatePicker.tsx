// 템플릿 선택 UI — 썸네일 칩 방식.
// 각 칩은 해당 템플릿의 bg/fg/fontFamily를 인라인 스타일로 미리보기한다.
// onSelect(id) 콜백으로 선택 id를 상위에 전달한다.

import type { CSSProperties } from 'react';
import { getAllTemplates, DEFAULT_TEMPLATE_ID } from './templates';
import styles from './TemplatePicker.module.css';

interface TemplatePickerProps {
  /** 현재 선택된 템플릿 id. */
  selectedId: string;
  /** 템플릿 선택 시 호출. */
  onSelect: (id: string) => void;
}

export function TemplatePicker({
  selectedId,
  onSelect,
}: TemplatePickerProps): React.ReactElement {
  const templates = getAllTemplates();
  const activeId = selectedId || DEFAULT_TEMPLATE_ID;

  return (
    <div className={styles.container} role="group" aria-label="편지 템플릿 선택">
      <p className={styles.label}>스타일 선택</p>
      <div className={styles.chipRow}>
        {templates.map((tpl) => {
          const isActive = tpl.id === activeId;
          // 칩에 해당 템플릿의 색상을 직접 적용해 미리보기 역할.
          const chipStyle: CSSProperties = {
            background: tpl.theme.bg,
            color: tpl.theme.fg,
            fontFamily: tpl.theme.fontFamily,
            borderColor: isActive ? tpl.theme.accent : tpl.theme.borderColor,
          };

          return (
            <button
              key={tpl.id}
              type="button"
              className={`${styles.chip} ${isActive ? styles.chipActive : ''}`}
              style={chipStyle}
              onClick={() => onSelect(tpl.id)}
              aria-pressed={isActive}
              aria-label={`${tpl.name} — ${tpl.description}`}
              title={tpl.description}
            >
              <span className={styles.chipName}>{tpl.name}</span>
              {/* 미니 샘플 텍스트: 해당 폰트 패밀리로 렌더된다. */}
              <span className={styles.chipSample} aria-hidden="true">
                가나다
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
