// templates feature 공개 API.
// 이 인터페이스 밖으로 내보내는 심볼만 다른 feature/route에서 import 가능.

export { getAllTemplates, getTemplate, getDefaultTemplate, DEFAULT_TEMPLATE_ID } from './templates';
export type { Template, TemplateTheme } from './templates';
export { TemplateThemed } from './TemplateThemed';
export { TemplatePicker } from './TemplatePicker';
export { Paginated } from './Paginated';
export type { PaginatedParagraph } from './Paginated';
