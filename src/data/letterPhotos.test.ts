// letterPhotos.ts 단위 테스트 — Edge Function 호출 형태와 응답 좁히기. getSupabase 모킹.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from './supabase';
import {
  fetchLetterPhotoUrls,
  newLetterPhotoPath,
  removeLetterPhotoFolder,
  removeLetterPhotos,
  uploadLetterPhoto,
} from './letterPhotos';

const mockGetSupabase = vi.mocked(getSupabase);

function makeSupabaseMock(result: unknown) {
  const invoke = vi.fn(() => Promise.resolve(result));
  mockGetSupabase.mockReturnValue({ functions: { invoke } } as unknown as ReturnType<typeof getSupabase>);
  return invoke;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchLetterPhotoUrls', () => {
  it('수신자 모드: { token, password }를 letter-photo-urls에 보내고 urls 맵을 돌려준다', async () => {
    const invoke = makeSupabaseMock({
      data: { urls: { 'o/l/a.jpg': 'https://s/a', bad: 42 }, expiresIn: 3600 },
      error: null,
    });
    const urls = await fetchLetterPhotoUrls({ token: 'tok', password: null });
    expect(invoke).toHaveBeenCalledWith('letter-photo-urls', { body: { token: 'tok', password: null } });
    // 문자열이 아닌 값은 걸러진다.
    expect(urls).toEqual({ 'o/l/a.jpg': 'https://s/a' });
  });

  it('소유자 모드: { letterId }를 보낸다', async () => {
    const invoke = makeSupabaseMock({ data: { urls: {}, expiresIn: 3600 }, error: null });
    await fetchLetterPhotoUrls({ letterId: 'L1' });
    expect(invoke).toHaveBeenCalledWith('letter-photo-urls', { body: { letterId: 'L1' } });
  });

  it('함수 에러(403 등)면 throw — 호출부가 플레이스홀더로 처리한다', async () => {
    makeSupabaseMock({ data: null, error: new Error('Edge Function returned a non-2xx status code') });
    await expect(fetchLetterPhotoUrls({ token: 'tok', password: 'x' })).rejects.toThrow();
  });
});

function makeStorageMock(over: Partial<Record<'upload' | 'remove' | 'list', unknown>> = {}) {
  const bucket = {
    upload: vi.fn(() => Promise.resolve(over.upload ?? { data: {}, error: null })),
    remove: vi.fn(() => Promise.resolve(over.remove ?? { data: [], error: null })),
    list: vi.fn(() => Promise.resolve(over.list ?? { data: [], error: null })),
  };
  const from = vi.fn(() => bucket);
  mockGetSupabase.mockReturnValue({ storage: { from } } as unknown as ReturnType<typeof getSupabase>);
  return { from, bucket };
}

describe('Storage 업로드·삭제', () => {
  it('경로는 <ownerId>/<letterId>/<uuid>.jpg', () => {
    expect(newLetterPhotoPath('o', 'L')).toMatch(/^o\/L\/[0-9a-f-]{36}\.jpg$/);
  });

  it('업로드: letter-photos 버킷에 image/jpeg · upsert:false로 올린다', async () => {
    const { from, bucket } = makeStorageMock();
    const jpeg = new Blob(['j'], { type: 'image/jpeg' });
    await uploadLetterPhoto('o/L/a.jpg', jpeg);
    expect(from).toHaveBeenCalledWith('letter-photos');
    expect(bucket.upload).toHaveBeenCalledWith('o/L/a.jpg', jpeg, {
      contentType: 'image/jpeg',
      upsert: false,
    });
  });

  it('업로드 에러는 throw — 저장 흐름이 저장 실패로 처리한다', async () => {
    makeStorageMock({ upload: { data: null, error: new Error('Payload too large') } });
    await expect(uploadLetterPhoto('o/L/a.jpg', new Blob())).rejects.toThrow('Payload too large');
  });

  it('빈 목록 삭제는 호출하지 않는다', async () => {
    const { bucket } = makeStorageMock();
    await removeLetterPhotos([]);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('편지 폴더 삭제: <ownerId>/<letterId> 아래 객체를 나열해 지운다', async () => {
    const { bucket } = makeStorageMock({
      list: { data: [{ name: 'a.jpg' }, { name: 'b.jpg' }], error: null },
    });
    await removeLetterPhotoFolder('o', 'L');
    expect(bucket.list).toHaveBeenCalledWith('o/L', { limit: 100 });
    expect(bucket.remove).toHaveBeenCalledWith(['o/L/a.jpg', 'o/L/b.jpg']);
  });
});
