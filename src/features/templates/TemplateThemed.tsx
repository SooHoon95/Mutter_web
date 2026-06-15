// 템플릿 테마를 CSS 변수로 적용하는 래퍼 컴포넌트.
// 제작 프리뷰(Create)와 수신 뷰(T8 Viewer) 양쪽에서 재사용된다.
// 인라인 style로 CSS 변수를 주입해 전역 스코프를 오염시키지 않는다.

import type { CSSProperties, ReactNode } from 'react';
import { getTemplate } from './templates';
// themes.css: .templateScoped 기본값 + 자식 h/p/hr 스타일을 정의한다.
// global.css를 수정하지 않고 이 feature에서만 import한다.
import '@/styles/themes.css';

interface TemplateThemedProps {
  /** 적용할 템플릿 id. 없으면 기본 템플릿으로 폴백. */
  templateId: string;
  children: ReactNode;
  /** 추가 className (선택). 외부에서 레이아웃 오버라이드가 필요할 때. */
  className?: string;
}

export function TemplateThemed({
  templateId,
  children,
  className,
}: TemplateThemedProps): React.ReactElement {
  const template = getTemplate(templateId);
  const { theme } = template;

  // CSS 변수 주입: 각 템플릿 값을 인라인 style로 제한 스코프에 적용한다.
  // 전역 :root를 건드리지 않으므로 여러 템플릿이 동시에 페이지에 있어도 충돌 없음.
  const cssVars: CSSProperties = {
    ['--tpl-bg' as string]: theme.bg,
    ['--tpl-fg' as string]: theme.fg,
    ['--tpl-muted' as string]: theme.muted,
    ['--tpl-accent' as string]: theme.accent,
    ['--tpl-font-family' as string]: theme.fontFamily,
    ['--tpl-heading-font-family' as string]: theme.headingFontFamily,
    ['--tpl-font-size' as string]: theme.fontSize,
    ['--tpl-line-height' as string]: theme.lineHeight,
    ['--tpl-heading-size' as string]: theme.headingSize,
    ['--tpl-border-radius' as string]: theme.borderRadius,
    ['--tpl-border-color' as string]: theme.borderColor,
    ['--tpl-paper-texture' as string]: theme.paperTexture,
    // paper-texture를 배경으로 적용 (bg 위에 레이어)
    backgroundImage: theme.paperTexture !== 'none' ? theme.paperTexture : undefined,
  };

  const combinedClass = ['templateScoped', className].filter(Boolean).join(' ');

  return (
    <div className={combinedClass} style={cssVars} data-template-id={template.id}>
      {children}
    </div>
  );
}
