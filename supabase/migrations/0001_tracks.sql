-- Migration: 0001_tracks
-- tracks 테이블: CC0/RF 카탈로그 트랙 저장.
-- provenance 컬럼은 jsonb — 출처·라이선스 텍스트 스냅샷·취득일·저작자 포함.
-- KOMCA/FKMP 관리곡은 삽입 금지(큐레이션 정책, licenseGate.ts ingestion 통과분만).
-- RLS: 인증 없이 읽기(read) 허용 — 수신자 무인증 경로에서도 카탈로그 접근 가능.

create table if not exists public.tracks (
  id            text        primary key,
  source        text        not null check (source in ('soundcloud', 'hosted')),
  title         text        not null,
  author        text        not null,
  license       text        not null check (
                              license in ('CC0', 'PD', 'CC-BY', 'VENDOR_RF')
                              -- SOUNDCLOUD 트랙은 이 테이블에 저장하지 않는다(oEmbed 경유).
                              -- NC/ND 라이선스는 check 제약으로 DB 레벨에서도 거부.
                            ),
  url           text        not null,
  mood          text,
  provenance    jsonb       not null,
  -- provenance 필수 키 존재 여부를 check로 강제
  -- (licenseGate.ts assertProvenance와 이중 방어)
  constraint tracks_provenance_keys check (
    provenance ? 'sourceUrl'          and
    provenance ? 'licenseName'        and
    provenance ? 'licenseTextSnapshot' and
    provenance ? 'acquiredAt'         and
    provenance ? 'author'
  ),
  created_at    timestamptz not null default now()
);

-- RLS 활성화
alter table public.tracks enable row level security;

-- 공개 read 정책: 모든 사용자(인증 여부 무관)가 읽을 수 있다.
-- 수신자 무설치 웹뷰(/l/:token)에서 CC0 폴백 카탈로그에 접근하기 위해 필요.
create policy "tracks: public read"
  on public.tracks
  for select
  using (true);

-- 쓰기는 서비스 롤(Edge Function 또는 관리자)만 허용.
-- anon/authenticated 역할의 insert/update/delete는 모두 거부(정책 없음 = 거부).

comment on table public.tracks is
  '큐레이션 CC0/RF 카탈로그. licenseGate.ts ingestion 통과분만 수록. ' ||
  'KOMCA/FKMP 관리곡 배제(한국 인접권 미커버 위험). ' ||
  'NC/ND 라이선스는 check 제약으로 DB 레벨 거부.';

comment on column public.tracks.provenance is
  'jsonb: { sourceUrl, licenseName, licenseTextSnapshot, acquiredAt, author }. ' ||
  '라이선스 텍스트 스냅샷 포함 — takedown 시 근거 자료.';
