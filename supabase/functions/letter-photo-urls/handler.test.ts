// @vitest-environment node
/**
 * letter-photo-urls 순수 로직 테스트(설계 §4·§7).
 *
 * Supabase 클라이언트는 가짜 deps로 대체한다 → 배포 없이 권한 분기·경로 필터·응답 모양을 검증.
 * 실제 서명 왕복은 마이그레이션·함수 배포 후 실기기에서 확인한다(여기서는 미검증).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createHandler,
  extractPhotoPaths,
  filterOwnedPaths,
  SIGNED_URL_TTL_SECONDS,
  type LetterPhotoUrlDeps,
} from './handler';

const OWNER = '11111111-1111-1111-1111-111111111111';
const LETTER = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';

const paragraphs = [
  { id: 'p1', order: 0, text: '안녕', cue: { sourceType: 'soundcloud', ref: 'x' } },
  { id: 'p2', order: 1, text: '', photo: { path: `${OWNER}/${LETTER}/a.jpg`, width: 1536, height: 2048 } },
  { id: 'p3', order: 2, text: '', photo: { path: `${OTHER}/${LETTER}/stolen.jpg`, width: 10, height: 10 } },
  { id: 'p4', order: 3, text: '', photo: { path: `${OWNER}/other-letter/b.jpg`, width: 10, height: 10 } },
  { id: 'p5', order: 4, text: '끝' },
];

function makeDeps(overrides: Partial<LetterPhotoUrlDeps> = {}): LetterPhotoUrlDeps {
  return {
    openByToken: vi.fn().mockResolvedValue({ data: { id: LETTER, paragraphs }, error: null }),
    selectOwnLetter: vi.fn().mockResolvedValue({ data: { id: LETTER, paragraphs }, error: null }),
    fetchOwnerId: vi.fn().mockResolvedValue(OWNER),
    createSignedUrls: vi.fn(async (paths: string[]) =>
      Object.fromEntries(paths.map((p) => [p, `https://signed.example/${p}`])),
    ),
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/letter-photo-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('extractPhotoPaths', () => {
  it('photo.path만 순서대로 뽑고 중복·잘못된 형태는 무시한다', () => {
    expect(
      extractPhotoPaths([
        { text: 'a' },
        { photo: { path: 'x/y/1.jpg' } },
        { photo: { path: 'x/y/1.jpg' } },
        { photo: { path: 42 } },
        { photo: null },
        null,
        { photo: { path: 'x/y/2.jpg' } },
      ]),
    ).toEqual(['x/y/1.jpg', 'x/y/2.jpg']);
  });

  it('배열이 아니면 빈 배열', () => {
    expect(extractPhotoPaths(null)).toEqual([]);
    expect(extractPhotoPaths({})).toEqual([]);
  });
});

describe('filterOwnedPaths', () => {
  it('<ownerId>/<letterId>/<파일명>만 남기고 남의 폴더·다른 편지 경로는 거른다', () => {
    const paths = [
      `${OWNER}/${LETTER}/a.jpg`,
      `${OTHER}/${LETTER}/stolen.jpg`,
      `${OWNER}/other-letter/b.jpg`,
      `${OWNER}/${LETTER}`,
    ];
    expect(filterOwnedPaths(paths, OWNER, LETTER)).toEqual([`${OWNER}/${LETTER}/a.jpg`]);
  });

  it('접두사 뒤 경로 탈출(../, 하위 폴더, 빈 파일명)은 거른다', () => {
    const paths = [
      `${OWNER}/${LETTER}/../../${OTHER}/x.jpg`,
      `${OWNER}/${LETTER}/sub/x.jpg`,
      `${OWNER}/${LETTER}/`,
      `${OWNER}/${LETTER}/..`,
    ];
    expect(filterOwnedPaths(paths, OWNER, LETTER)).toEqual([]);
  });
});

describe('createHandler — 수신자 모드', () => {
  it('토큰·암호로 RPC를 부르고 소유자 경로만 서명해 { urls, expiresIn }을 돌려준다', async () => {
    const deps = makeDeps();
    const res = await createHandler(deps)(post({ token: 'tok', password: 'pw' }));

    expect(res.status).toBe(200);
    expect(deps.openByToken).toHaveBeenCalledWith('tok', 'pw');
    expect(deps.selectOwnLetter).not.toHaveBeenCalled();
    expect(deps.fetchOwnerId).toHaveBeenCalledWith(LETTER);
    expect(deps.createSignedUrls).toHaveBeenCalledWith([`${OWNER}/${LETTER}/a.jpg`], 3600);
    expect(await res.json()).toEqual({
      urls: { [`${OWNER}/${LETTER}/a.jpg`]: `https://signed.example/${OWNER}/${LETTER}/a.jpg` },
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('password가 없거나 null이면 null로 넘긴다', async () => {
    const deps = makeDeps();
    await createHandler(deps)(post({ token: 'tok' }));
    expect(deps.openByToken).toHaveBeenCalledWith('tok', null);
  });

  it('잘못된 암호(RPC 에러)면 403 { error: 메시지 그대로 }이고 서명하지 않는다', async () => {
    const deps = makeDeps({
      openByToken: vi.fn().mockResolvedValue({ data: null, error: { message: 'WRONG_PASSWORD' } }),
    });
    const res = await createHandler(deps)(post({ token: 'tok', password: 'nope' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'WRONG_PASSWORD' });
    expect(deps.createSignedUrls).not.toHaveBeenCalled();
  });

  it('회수된 링크도 403(LINK_REVOKED)', async () => {
    const deps = makeDeps({
      openByToken: vi.fn().mockResolvedValue({ data: null, error: { message: 'LINK_REVOKED' } }),
    });
    const res = await createHandler(deps)(post({ token: 'tok', password: null }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'LINK_REVOKED' });
  });

  it('요청에 사용자 Authorization이 있어도 수신자 모드는 그것을 RPC에 넘기지 않는다', async () => {
    const deps = makeDeps();
    await createHandler(deps)(post({ token: 'tok', password: null }, { Authorization: 'Bearer user-jwt' }));
    // openByToken 시그니처는 (token, password)뿐 — 헤더를 받을 통로가 없다.
    expect(deps.openByToken).toHaveBeenCalledWith('tok', null);
    expect(deps.selectOwnLetter).not.toHaveBeenCalled();
  });

  it('사진이 없으면 저장소를 부르지 않고 빈 urls', async () => {
    const deps = makeDeps({
      openByToken: vi
        .fn()
        .mockResolvedValue({ data: { id: LETTER, paragraphs: [{ id: 'p', order: 0, text: 'hi' }] }, error: null }),
    });
    const res = await createHandler(deps)(post({ token: 'tok', password: null }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ urls: {}, expiresIn: 3600 });
    expect(deps.createSignedUrls).not.toHaveBeenCalled();
  });
});

describe('createHandler — 소유자 모드', () => {
  it('Authorization 헤더로 RLS select 후 서명한다', async () => {
    const deps = makeDeps();
    const res = await createHandler(deps)(post({ letterId: LETTER }, { Authorization: 'Bearer user-jwt' }));
    expect(res.status).toBe(200);
    expect(deps.selectOwnLetter).toHaveBeenCalledWith('Bearer user-jwt', LETTER);
    expect(deps.openByToken).not.toHaveBeenCalled();
    expect(Object.keys((await res.json()).urls)).toEqual([`${OWNER}/${LETTER}/a.jpg`]);
  });

  it('RLS로 편지가 안 보이면 403', async () => {
    const deps = makeDeps({ selectOwnLetter: vi.fn().mockResolvedValue({ data: null, error: null }) });
    const res = await createHandler(deps)(post({ letterId: LETTER }, { Authorization: 'Bearer other' }));
    expect(res.status).toBe(403);
    expect(deps.createSignedUrls).not.toHaveBeenCalled();
  });

  it('Authorization이 없으면 401', async () => {
    const deps = makeDeps();
    const res = await createHandler(deps)(post({ letterId: LETTER }));
    expect(res.status).toBe(401);
    expect(deps.selectOwnLetter).not.toHaveBeenCalled();
  });
});

describe('createHandler — 요청 형태', () => {
  it('OPTIONS 프리플라이트는 CORS 헤더와 함께 200', async () => {
    const res = await createHandler(makeDeps())(
      new Request('http://localhost/letter-photo-urls', { method: 'OPTIONS' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('x-client-info');
  });

  it('token·letterId 둘 다 없으면 400, 잘못된 JSON도 400', async () => {
    const handler = createHandler(makeDeps());
    expect((await handler(post({}))).status).toBe(400);
    const bad = new Request('http://localhost/x', { method: 'POST', body: '{not json' });
    expect((await handler(bad)).status).toBe(400);
  });

  it('GET은 405', async () => {
    const res = await createHandler(makeDeps())(new Request('http://localhost/x', { method: 'GET' }));
    expect(res.status).toBe(405);
  });
});
