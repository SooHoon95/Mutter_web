// Vercel Edge Function — /l/:token 링크 미리보기(OG) 응답. 크롤러 UA만 vercel.json rewrite로 여기 온다.
//
// 흐름: token → Supabase RPC get_letter_preview(본문 없음, 봉인 여부·테마만) → OG 메타만 담은 HTML.
// RPC 실패·미배포·타임아웃이면 봉인 카드로 폴백한다 — 미리보기가 편지 열람을 막는 일은 없어야 한다.
// 환경변수는 빌드용 VITE_* 를 그대로 읽는다(Vercel 프로젝트 env가 런타임에도 주입된다).

import { buildPreviewHtml } from '../src/lib/ogPreview';

export const config = { runtime: 'edge' };

interface PreviewRow {
  sealed: boolean;
  template_id: string | null;
}

const RPC_TIMEOUT_MS = 3000;

async function fetchPreview(token: string): Promise<PreviewRow> {
  const sealed: PreviewRow = { sealed: true, template_id: null };
  const base = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!base || !anon) return sealed;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/rest/v1/rpc/get_letter_preview`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
      signal: controller.signal,
    });
    if (!res.ok) return sealed;
    const data = (await res.json()) as Partial<PreviewRow> | null;
    if (!data || typeof data.sealed !== 'boolean') return sealed;
    return { sealed: data.sealed, template_id: data.template_id ?? null };
  } catch {
    return sealed;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const preview = token ? await fetchPreview(token) : { sealed: true, template_id: null };
  const html = buildPreviewHtml({
    origin: url.origin,
    token,
    templateId: preview.template_id,
    sealed: preview.sealed,
  });
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 카카오는 카드를 자체 캐시한다. 짧게 잡아 revoke 뒤 봉인 카드로 빨리 바뀌게 한다.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
