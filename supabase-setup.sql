-- KITA TABUNG - Supabase Setup
-- Jalankan seluruh file ini di Supabase Dashboard > SQL Editor > New query > Run.

begin;

create table if not exists public.user_finance_state (
  user_id uuid primary key
    references auth.users(id)
    on delete cascade,
  data jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_finance_state
  enable row level security;

-- Least privilege: browser yang belum login tidak boleh mengakses tabel.
revoke all on table public.user_finance_state from anon;
grant select, insert, update, delete
  on table public.user_finance_state
  to authenticated;

-- Policy dibuat ulang agar script aman dijalankan ulang.
drop policy if exists "Users can read own finance state"
  on public.user_finance_state;
create policy "Users can read own finance state"
  on public.user_finance_state
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own finance state"
  on public.user_finance_state;
create policy "Users can insert own finance state"
  on public.user_finance_state
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own finance state"
  on public.user_finance_state;
create policy "Users can update own finance state"
  on public.user_finance_state
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own finance state"
  on public.user_finance_state;
create policy "Users can delete own finance state"
  on public.user_finance_state
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_finance_state_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_set_finance_state_metadata
  on public.user_finance_state;
create trigger trigger_set_finance_state_metadata
  before insert or update
  on public.user_finance_state
  for each row
  execute function public.set_finance_state_metadata();

commit;
