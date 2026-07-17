-- ============================================================
-- ЭСКИЗ AI · схема Supabase (идемпотентно — можно гонять повторно)
-- ============================================================

create extension if not exists pgcrypto;

-- -------- таблица проектов --------
create table if not exists public.design_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Изделие',
  brief text,
  spec jsonb,
  summary text,
  image_prompt text,
  base_photo_path text,
  render_path text,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists design_projects_user_idx
  on public.design_projects (user_id, created_at desc);

alter table public.design_projects enable row level security;

drop policy if exists "design_projects_select_own" on public.design_projects;
create policy "design_projects_select_own"
  on public.design_projects for select
  using (auth.uid() = user_id);

drop policy if exists "design_projects_insert_own" on public.design_projects;
create policy "design_projects_insert_own"
  on public.design_projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "design_projects_update_own" on public.design_projects;
create policy "design_projects_update_own"
  on public.design_projects for update
  using (auth.uid() = user_id);

drop policy if exists "design_projects_delete_own" on public.design_projects;
create policy "design_projects_delete_own"
  on public.design_projects for delete
  using (auth.uid() = user_id);

-- -------- бакет хранилища (публичное чтение превью) --------
insert into storage.buckets (id, name, public)
values ('design-projects', 'design-projects', true)
on conflict (id) do nothing;

drop policy if exists "design_projects_storage_read" on storage.objects;
create policy "design_projects_storage_read"
  on storage.objects for select
  using (bucket_id = 'design-projects');

drop policy if exists "design_projects_storage_insert" on storage.objects;
create policy "design_projects_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'design-projects'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "design_projects_storage_update" on storage.objects;
create policy "design_projects_storage_update"
  on storage.objects for update
  using (
    bucket_id = 'design-projects'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "design_projects_storage_delete" on storage.objects;
create policy "design_projects_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'design-projects'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
