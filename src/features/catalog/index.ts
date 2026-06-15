// catalog feature 공개 API.
// 이 외부로 내보내는 심볼만 다른 feature/route에서 import 가능.
// useCatalog 내부 구현이 DB 연동으로 바뀌어도 이 인터페이스는 유지된다.

export { MoodPicker } from './MoodPicker';
export { useCatalog, MOODS } from './useCatalog';
export type { Mood } from './useCatalog';
