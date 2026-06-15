// viewer feature 공개 API (수신자 웹뷰).
// 이 외부로 내보내는 심볼만 routes/Viewer가 import한다.

export { useLetterViewer } from './useLetterViewer';
export type { ViewerLetter, ViewerStatus, UseLetterViewerResult } from './useLetterViewer';
export { LetterView } from './LetterView';
export { PasswordGate } from './PasswordGate';
export { AudioUnlockGate } from './AudioUnlockGate';
export { Credits } from './Credits';
export { createFallbackSourceFactory } from './fallbackSourceFactory';
export type { FallbackFactoryOptions } from './fallbackSourceFactory';
