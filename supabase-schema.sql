create table if not exists public.fitness_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  app_version text not null default '1.5.44',
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

create table if not exists public.fitness_sync_records (
  user_id uuid not null default auth.uid(),
  record_type text not null check (record_type in ('workout', 'metric', 'exercise', 'template', 'preference')),
  record_id text not null,
  payload jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  source_device_id text not null,
  primary key (user_id, record_type, record_id)
);

alter table public.fitness_sync_records enable row level security;

grant select, insert, update on public.fitness_sync_records to authenticated;

drop policy if exists "fitness_sync_records_select_own" on public.fitness_sync_records;
create policy "fitness_sync_records_select_own"
on public.fitness_sync_records
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "fitness_sync_records_insert_own" on public.fitness_sync_records;
create policy "fitness_sync_records_insert_own"
on public.fitness_sync_records
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "fitness_sync_records_update_own" on public.fitness_sync_records;
create policy "fitness_sync_records_update_own"
on public.fitness_sync_records
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists fitness_sync_records_user_updated_idx
on public.fitness_sync_records (user_id, updated_at, record_type, record_id);

create or replace function public.apply_fitness_sync_change(
  p_record_type text,
  p_record_id text,
  p_payload jsonb,
  p_deleted boolean,
  p_base_revision bigint,
  p_source_device_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_record public.fitness_sync_records%rowtype;
  saved_record public.fitness_sync_records%rowtype;
begin
  select * into current_record
  from public.fitness_sync_records
  where user_id = auth.uid()
    and record_type = p_record_type
    and record_id = p_record_id
  for update;

  if not found then
    if coalesce(p_base_revision, 0) <> 0 then
      return jsonb_build_object('status', 'conflict', 'record', null);
    end if;

    insert into public.fitness_sync_records (
      user_id, record_type, record_id, payload, revision, updated_at, deleted_at, source_device_id
    ) values (
      auth.uid(), p_record_type, p_record_id, p_payload, 1, now(),
      case when p_deleted then now() else null end,
      p_source_device_id
    )
    on conflict (user_id, record_type, record_id) do nothing
    returning * into saved_record;

    if saved_record.user_id is null then
      select * into current_record
      from public.fitness_sync_records
      where user_id = auth.uid()
        and record_type = p_record_type
        and record_id = p_record_id;
      return jsonb_build_object('status', 'conflict', 'record', to_jsonb(current_record));
    end if;

    return jsonb_build_object('status', 'applied', 'record', to_jsonb(saved_record));
  end if;

  if current_record.revision <> coalesce(p_base_revision, 0) then
    return jsonb_build_object('status', 'conflict', 'record', to_jsonb(current_record));
  end if;

  update public.fitness_sync_records
  set payload = p_payload,
      revision = current_record.revision + 1,
      updated_at = now(),
      deleted_at = case when p_deleted then now() else null end,
      source_device_id = p_source_device_id
  where user_id = auth.uid()
    and record_type = p_record_type
    and record_id = p_record_id
  returning * into saved_record;

  return jsonb_build_object('status', 'applied', 'record', to_jsonb(saved_record));
end;
$$;

grant execute on function public.apply_fitness_sync_change(text, text, jsonb, boolean, bigint, text) to authenticated;
