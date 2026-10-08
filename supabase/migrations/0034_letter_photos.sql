-- supabase/migrations/0034_letter_photos.sql
--
-- 편지 사진(본문 사이사이 여러 장) — 저장소 버킷 + RLS.
-- 설계: Mutter docs/superpowers/specs/2026-10-07-letter-photos-design.md §3.
--
-- 데이터 계약은 스키마 변경 없이 letters.paragraphs jsonb 요소의 선택 필드 `photo`
-- ({ path, width, height })로 표현한다. 이 마이그레이션은 사진 바이트를 담을 저장소만 만든다.
--
-- - 버킷은 비공개(public=false)다. 수신자는 Edge Function `letter-photo-urls`가 발급한
--   1시간짜리 서명 URL로만 본다 → 링크를 회수·만료하면 사진도 더 이상 발급되지 않는다.
-- - 경로 규칙: `<auth.uid()>/<letterId>/<uuid>.jpg`. 첫 폴더가 소유자이므로 RLS는 첫 폴더만 본다.
-- - update 정책은 두지 않는다. 사진을 바꾸면 새 uuid로 올리고 이전 객체를 지운다(덮어쓰기 없음).
-- - 재적용해도 안전하다(on conflict do nothing / drop policy if exists).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 버킷: 비공개, 10MB 상한, JPEG만(기기에서 긴 변 2048px·품질 0.8로 줄여 올린다).
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('letter-photos', 'letter-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. storage.objects RLS(authenticated): 자기 폴더(첫 폴더 = auth.uid())에서만
--    insert·select·delete. anon은 정책이 없으므로 직접 접근 불가(서명 URL만).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "letter_photos_insert_own" on storage.objects;
create policy "letter_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'letter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "letter_photos_select_own" on storage.objects;
create policy "letter_photos_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'letter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "letter_photos_delete_own" on storage.objects;
create policy "letter_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'letter-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
