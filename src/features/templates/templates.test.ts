import { describe, it, expect } from 'vitest';
import {
  getAllTemplates,
  getTemplate,
  getDefaultTemplate,
  DEFAULT_TEMPLATE_ID,
} from './templates';

// ---------------------------------------------------------------------------
// 기본 불변식
// ---------------------------------------------------------------------------

describe('getAllTemplates', () => {
  it('5~7개 템플릿을 반환한다', () => {
    const templates = getAllTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(5);
    expect(templates.length).toBeLessThanOrEqual(7);
  });

  it('모든 템플릿 id가 유일하다', () => {
    const templates = getAllTemplates();
    const ids = templates.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('모든 템플릿에 name, description, theme이 있다', () => {
    for (const t of getAllTemplates()) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.theme).toBeDefined();
    }
  });

  it('모든 템플릿 테마에 필수 CSS 변수 값이 있다', () => {
    const requiredFields: (keyof ReturnType<typeof getAllTemplates>[number]['theme'])[] = [
      'bg',
      'fg',
      'muted',
      'accent',
      'fontFamily',
      'headingFontFamily',
      'fontSize',
      'lineHeight',
      'headingSize',
      'borderRadius',
      'borderColor',
      'paperTexture',
    ];

    for (const template of getAllTemplates()) {
      for (const field of requiredFields) {
        expect(
          template.theme[field],
          `template "${template.id}" theme.${String(field)} should be defined`,
        ).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// getTemplate
// ---------------------------------------------------------------------------

describe('getTemplate', () => {
  it('유효한 id로 조회하면 해당 템플릿을 반환한다', () => {
    for (const t of getAllTemplates()) {
      const found = getTemplate(t.id);
      expect(found.id).toBe(t.id);
    }
  });

  it('존재하지 않는 id는 기본 템플릿을 반환한다(안전 폴백)', () => {
    const fallback = getTemplate('totally-unknown-id-xyz');
    expect(fallback.id).toBe(DEFAULT_TEMPLATE_ID);
  });

  it('빈 문자열 id도 기본 템플릿 폴백으로 처리한다', () => {
    const fallback = getTemplate('');
    expect(fallback.id).toBe(DEFAULT_TEMPLATE_ID);
  });
});

// ---------------------------------------------------------------------------
// getDefaultTemplate
// ---------------------------------------------------------------------------

describe('getDefaultTemplate', () => {
  it('DEFAULT_TEMPLATE_ID와 동일한 템플릿을 반환한다', () => {
    const def = getDefaultTemplate();
    expect(def.id).toBe(DEFAULT_TEMPLATE_ID);
  });

  it('기본 템플릿이 템플릿 목록에 포함돼 있다', () => {
    const ids = getAllTemplates().map((t) => t.id);
    expect(ids).toContain(DEFAULT_TEMPLATE_ID);
  });

  it('기본 템플릿은 완전한 theme 객체를 가진다', () => {
    const def = getDefaultTemplate();
    expect(def.theme.bg).toBeTruthy();
    expect(def.theme.fg).toBeTruthy();
    expect(def.theme.fontFamily).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_TEMPLATE_ID 상수
// ---------------------------------------------------------------------------

describe('DEFAULT_TEMPLATE_ID', () => {
  it('문자열이다', () => {
    expect(typeof DEFAULT_TEMPLATE_ID).toBe('string');
  });

  it('빈 문자열이 아니다', () => {
    expect(DEFAULT_TEMPLATE_ID.length).toBeGreaterThan(0);
  });

  it('실제로 존재하는 템플릿 id다', () => {
    const ids = getAllTemplates().map((t) => t.id);
    expect(ids).toContain(DEFAULT_TEMPLATE_ID);
  });
});
