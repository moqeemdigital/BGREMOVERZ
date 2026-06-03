-- ─────────────────────────────────────────────────────────────
--  MAKS BG Remover — Supabase Schema
--  Run this in your Supabase project:
--  Dashboard → SQL Editor → New query → paste → Run
-- ─────────────────────────────────────────────────────────────

-- Image processing jobs table
create table if not exists public.image_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  filename      text not null,
  original_size bigint not null,   -- bytes
  result_size   bigint,            -- bytes, null until complete
  status        text not null default 'pending'
                  check (status in ('pending','processing','complete','error')),
  error_msg     text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- Index for fast per-user queries
create index if not exists image_jobs_user_id_idx on public.image_jobs(user_id);

-- Row-level security: users can only see and modify their own rows
alter table public.image_jobs enable row level security;

create policy "Users can read own jobs"
  on public.image_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert own jobs"
  on public.image_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own jobs"
  on public.image_jobs for update
  using (auth.uid() = user_id);

-- Helpful view for dashboard stats (optional but convenient)
create or replace view public.user_stats as
select
  user_id,
  count(*)                                          as total_uploads,
  count(*) filter (where status = 'complete')       as total_complete,
  count(*) filter (where status = 'error')          as total_errors,
  coalesce(sum(original_size), 0)                   as total_original_bytes,
  coalesce(sum(result_size) filter (where status = 'complete'), 0) as total_result_bytes
from public.image_jobs
group by user_id;
