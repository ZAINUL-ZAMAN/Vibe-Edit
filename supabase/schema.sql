-- Vibe Edit: Page 3 (Dashboard) database schema
-- HOW TO RUN THIS:
-- 1. Go to your Supabase project -> SQL Editor (left sidebar)
-- 2. Click "New Query"
-- 3. Paste this whole file in, click "Run"
-- You only need to do this once.

-- Table: projects
-- Stores each user's video projects (metadata only for now -- the actual
-- video code/footage editing happens in Page 4, not stored here yet).
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Project',
  aspect_ratio text not null check (aspect_ratio in ('16:9', '9:16')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index so "fetch my projects" queries stay fast as the table grows
create index if not exists projects_user_id_idx on public.projects(user_id);

-- Row Level Security: without this, ANY logged-in user could read or edit
-- ANY other user's projects just by knowing the ID. This is the actual
-- security boundary, not just a nice-to-have.
alter table public.projects enable row level security;

-- Policy: users can only SEE their own projects
create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

-- Policy: users can only CREATE projects owned by themselves
create policy "Users can create their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

-- Policy: users can only UPDATE their own projects
create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id);

-- Policy: users can only DELETE their own projects
create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Keep updated_at fresh automatically whenever a project row changes
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.projects;
create trigger set_updated_at
  before update on public.projects
  for each row
  execute function public.handle_updated_at();
