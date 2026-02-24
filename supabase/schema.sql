-- ============================================================
-- Diary app DB 스키마 (Supabase PostgreSQL)
-- Supabase 대시보드 → SQL Editor에서 실행
-- ============================================================

-- UUID 생성용 확장 (gen_random_uuid 사용)
create extension if not exists "pgcrypto";

-- 할 일 테이블
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  due_date date not null,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 일기/메모 테이블 (user_id + entry_date로 하루당 1건 유니크)
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

-- 인덱스: 사용자+날짜 조회 성능 향상
create index if not exists idx_todos_user_date on public.todos (user_id, due_date);
create index if not exists idx_journal_user_date on public.journal_entries (user_id, entry_date);

-- 활동 기록 테이블 (이모지+라벨+날짜 조합 유니크)
create table if not exists public.daily_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_date date not null,
  emoji text not null,
  label text not null,
  hours numeric not null default 0,
  start_time text not null default '00:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activity_date, emoji, label)
);

alter table public.daily_activities
  add column if not exists start_time text not null default '00:00';

alter table public.daily_activities
  add column if not exists end_time text not null default '00:00';

create index if not exists idx_daily_activities_user_date
on public.daily_activities (user_id, activity_date);

-- RLS(Row Level Security): 각 사용자는 본인 데이터만 조회/수정 가능
alter table public.todos enable row level security;
alter table public.journal_entries enable row level security;
alter table public.daily_activities enable row level security;

-- 정책: auth.uid() = user_id일 때만 허용
create policy if not exists "Users can read their own todos"
on public.todos for select
using (auth.uid() = user_id);

create policy if not exists "Users can insert own todos"
on public.todos for insert
with check (auth.uid() = user_id);

create policy if not exists "Users can update own todos"
on public.todos for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "Users can delete own todos"
on public.todos for delete
using (auth.uid() = user_id);

create policy if not exists "Users can read own journal entries"
on public.journal_entries for select
using (auth.uid() = user_id);

create policy if not exists "Users can insert own journal entries"
on public.journal_entries for insert
with check (auth.uid() = user_id);

create policy if not exists "Users can update own journal entries"
on public.journal_entries for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "Users can delete own journal entries"
on public.journal_entries for delete
using (auth.uid() = user_id);

create policy if not exists "Users can read own daily activities"
on public.daily_activities for select
using (auth.uid() = user_id);

create policy if not exists "Users can insert own daily activities"
on public.daily_activities for insert
with check (auth.uid() = user_id);

create policy if not exists "Users can update own daily activities"
on public.daily_activities for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy if not exists "Users can delete own daily activities"
on public.daily_activities for delete
using (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거 함수
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_todos on public.todos;
create trigger set_updated_at_todos
  before update on public.todos
  for each row
  execute procedure public.handle_updated_at();

drop trigger if exists set_updated_at_journal on public.journal_entries;
create trigger set_updated_at_journal
  before update on public.journal_entries
  for each row
  execute procedure public.handle_updated_at();
