// claim-and-bind 기기 식별자. 첫 호출 시 무작위 id를 생성하고 localStorage에 저장한다.
// 이후 동일 기기에서는 항상 같은 id를 반환하므로 수신 RPC가 기기를 구별할 수 있다.
// 규칙: capability-links 스킬 참조 (claim_device_id 컬럼 바인딩).

const STORAGE_KEY = 'letter_device_id';

/**
 * 현재 기기의 고유 식별자를 반환한다.
 * 최초 호출 시 crypto.getRandomValues 기반 UUID-like id를 생성해 저장한다.
 * 이후 호출은 저장된 id를 그대로 반환한다.
 */
export function getDeviceId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  // 16바이트(128bit) 무작위 → hex string
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

/**
 * 테스트·초기화용: localStorage에서 device id를 제거한다.
 * 프로덕션 코드에서 호출하지 않는다.
 */
export function clearDeviceId(): void {
  localStorage.removeItem(STORAGE_KEY);
}
