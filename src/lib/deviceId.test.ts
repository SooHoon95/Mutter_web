// deviceId 단위 테스트. localStorage를 vi.stubGlobal로 모킹해 격리한다.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// localStorage 모킹
// jsdom 환경에서 localStorage.clear 가 stub인 경우가 있으므로
// 직접 Map 기반 fake를 주입해 완전히 격리한다.
// ---------------------------------------------------------------------------

function makeFakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

let fakeStorage: ReturnType<typeof makeFakeStorage>;

beforeEach(() => {
  fakeStorage = makeFakeStorage();
  vi.stubGlobal('localStorage', fakeStorage);
  vi.resetModules(); // 모듈 캐시 초기화 → getDeviceId가 fresh localStorage를 본다
});

// ---------------------------------------------------------------------------
// 각 테스트에서 fresh import (resetModules 후 동적 import 필요)
// ---------------------------------------------------------------------------

describe('getDeviceId', () => {
  it('첫 호출 시 새 id를 생성하고 localStorage에 저장한다', async () => {
    const { getDeviceId } = await import('./deviceId');
    const id = getDeviceId();
    expect(id).toBeTruthy();
    expect(fakeStorage.getItem('letter_device_id')).toBe(id);
  });

  it('두 번째 호출은 동일 id를 반환한다 (같은 기기)', async () => {
    const { getDeviceId } = await import('./deviceId');
    const id1 = getDeviceId();
    const id2 = getDeviceId();
    expect(id1).toBe(id2);
  });

  it('생성된 id는 hex 32자 (128bit)다', async () => {
    const { getDeviceId } = await import('./deviceId');
    const id = getDeviceId();
    // 16바이트 hex = 32자
    expect(id.length).toBe(32);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it('두 개의 독립 기기(빈 storage)에서는 서로 다른 id가 생성된다', async () => {
    const { getDeviceId, clearDeviceId } = await import('./deviceId');
    const id1 = getDeviceId();
    clearDeviceId();
    const id2 = getDeviceId();
    expect(id1).not.toBe(id2);
  });
});

describe('clearDeviceId', () => {
  it('localStorage에서 device id를 제거한다', async () => {
    const { getDeviceId, clearDeviceId } = await import('./deviceId');
    getDeviceId(); // 생성
    clearDeviceId();
    expect(fakeStorage.getItem('letter_device_id')).toBeNull();
  });

  it('clear 후 getDeviceId를 다시 호출하면 새 id가 생성된다', async () => {
    const { getDeviceId, clearDeviceId } = await import('./deviceId');
    const id1 = getDeviceId();
    clearDeviceId();
    const id2 = getDeviceId();
    expect(id2).not.toBe(id1);
  });
});
