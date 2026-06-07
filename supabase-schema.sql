create table if not exists public.fitness_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  app_version text not null default '1.1.0',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.fitness_snapshots enable row level security;

create policy "fitness_snapshots_insert_own"
on public.fitness_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "fitness_snapshots_select_own"
on public.fitness_snapshots
for select
to authenticated
using (auth.uid() = user_id);

create index if not exists fitness_snapshots_user_created_idx
on public.fitness_snapshots (user_id, created_at desc);
