// supabase/functions/purge-deleted-letters/index.ts
//
// 두 종류의 편지를 사진까지 영구 삭제한다. pg_cron이 매일 03:00 KST에 pg_net으로 호출한다.
//   1) 삭제함(letters_all.deleted_at, 0035)에서 보관 기간(30일)이 지난 편지
//   2) 무료 기간과 잠김 유예가 모두 끝난 편지(0036~0039 — 영구 편지권을 붙이지 않은 편지)
//
// 요청: POST, 본문 없음. 응답 200 { purged: number, failed: number, expired: number }
// 인증 없음(verify_jwt=false) — 기한이 지난 것만 지우므로 누가 불러도 정리가 앞당겨질 뿐 무해하다.
//
// 순서: 사진 폴더(<owner_id>/<letter_id>/)를 먼저 지우고 행을 지운다(연관 행은 FK cascade).
// 사진 삭제가 실패한 편지는 행을 남겨 다음 날 다시 시도한다.
//
// 배포: supabase functions deploy purge-deleted-letters --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const RETENTION_DAYS = 30; // 0035 get_my_deleted_letters의 purge_at과 같은 값
const BATCH = 200;
const BUCKET = 'letter-photos';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function removePhotoFolder(ownerId: string, letterId: string): Promise<void> {
  const prefix = `${ownerId}/${letterId}`;
  const bucket = admin.storage.from(BUCKET);
  const { data, error } = await bucket.list(prefix, { limit: 100 });
  if (error) throw new Error(`list ${prefix}: ${error.message}`);
  const paths = (data ?? []).map((obj) => `${prefix}/${obj.name}`);
  if (paths.length === 0) return;
  const { error: removeError } = await bucket.remove(paths);
  if (removeError) throw new Error(`remove ${prefix}: ${removeError.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('letters_all')
    .select('id, owner_id')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .order('deleted_at', { ascending: true })
    .limit(BATCH);
  if (error) return json(500, { error: error.message });

  let purged = 0;
  let failed = 0;
  for (const row of (data ?? []) as { id: string; owner_id: string }[]) {
    try {
      await removePhotoFolder(row.owner_id, row.id);
      const { error: deleteError } = await admin
        .from('letters_all')
        .delete()
        .eq('id', row.id)
        .not('deleted_at', 'is', null);
      if (deleteError) throw new Error(deleteError.message);
      purged += 1;
    } catch (e) {
      failed += 1;
      console.error(`[purge-deleted-letters] ${row.id}: ${(e as Error).message}`);
    }
  }

  // 2) 유예가 끝난 무료 편지. 지우기 직전에 claim_expired_letter로 다시 확인한다 —
  //    목록을 받은 뒤 편지권이 붙은 편지의 사진을 지우면 되돌릴 수 없다.
  let expired = 0;
  const { data: expiredRows, error: expiredError } = await admin.rpc('expired_letter_ids', {
    p_limit: BATCH,
  });
  if (expiredError) return json(500, { error: expiredError.message });

  for (const row of (expiredRows ?? []) as { id: string; owner_id: string }[]) {
    try {
      const { data: claimed, error: claimError } = await admin.rpc('claim_expired_letter', {
        p_letter_id: row.id,
      });
      if (claimError) throw new Error(claimError.message);
      if (claimed !== true) continue; // 그사이 영구가 됐다

      await removePhotoFolder(row.owner_id, row.id);
      const { error: deleteError } = await admin.from('letters_all').delete().eq('id', row.id);
      if (deleteError) throw new Error(deleteError.message);
      expired += 1;
    } catch (e) {
      failed += 1;
      console.error(`[purge-deleted-letters] expired ${row.id}: ${(e as Error).message}`);
    }
  }

  return json(200, { purged, failed, expired });
});
