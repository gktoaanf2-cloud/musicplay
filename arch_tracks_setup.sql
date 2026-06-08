-- ARCH 공식 사운드트랙 테이블
create table public.arch_tracks (
  id uuid default gen_random_uuid() primary key,
  video_id text not null,
  title text not null,
  artist text default '',
  category text default 'OST',
  position int default 0,
  created_at timestamptz default now()
);

alter table public.arch_tracks enable row level security;

-- 누구나 읽기 가능 (에디터에서 목록 표시)
create policy "arch_read" on public.arch_tracks for select using (true);

-- API 접근 권한
grant select on public.arch_tracks to anon, authenticated;

-- 관리자(너)만 Supabase 대시보드에서 직접 추가/수정/삭제
-- (클라이언트에서는 읽기만 가능)
