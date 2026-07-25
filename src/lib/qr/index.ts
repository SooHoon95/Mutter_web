// QR 모듈 공개 API — 내부 인코더(qrEncoder)를 얇게 재노출한다.
// 소비자(QrCode 컴포넌트)는 이 진입점만 참조하고 벤더링 세부는 몰라도 된다.
export { encodeToMatrix, type Ecc } from './qrEncoder';
