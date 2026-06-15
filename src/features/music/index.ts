// music feature 공개 API.
// 싱크 엔진·소스 구현·hook의 공개 표면. 다른 feature/route는 이 인터페이스만 import한다.
// 소스 타입 분기(createSource)는 SyncEngine 내부에 있으므로 외부는 TrackSource만 본다.

export type { TrackSource, ProgressCb, FinishCb, Unsub } from './TrackSource';
export { SoundCloudSource, toScVolume, buildEmbedSrc } from './SoundCloudSource';
export { HostedAudioSource } from './HostedAudioSource';
export { SyncEngine, createSource } from './SyncEngine';
export { computeFadeSteps, applyFade } from './fade';
export { useScrollSync } from './useScrollSync';
export type { UseScrollSyncResult } from './useScrollSync';
