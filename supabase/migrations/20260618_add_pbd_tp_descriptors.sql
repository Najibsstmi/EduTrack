-- Pernyataan Tahap Penguasaan untuk slip PBD individu.
-- school_id null menyimpan descriptor umum; baris sekolah mengatasi descriptor umum.

create extension if not exists pgcrypto;

create table if not exists public.pbd_tp_descriptors (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  tingkatan text,
  subject_name text not null check (btrim(subject_name) <> ''),
  tp_level integer not null check (tp_level between 1 and 6),
  statement text not null check (btrim(statement) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.normalize_pbd_tp_descriptor()
returns trigger
language plpgsql
as $$
begin
  new.subject_name = upper(regexp_replace(btrim(new.subject_name), '\s+', ' ', 'g'));
  new.tingkatan = nullif(regexp_replace(btrim(new.tingkatan), '\s+', ' ', 'g'), '');
  return new;
end;
$$;

drop trigger if exists normalize_pbd_tp_descriptor_trigger on public.pbd_tp_descriptors;
create trigger normalize_pbd_tp_descriptor_trigger
before insert or update on public.pbd_tp_descriptors
for each row execute function public.normalize_pbd_tp_descriptor();

drop trigger if exists set_pbd_tp_descriptors_updated_at on public.pbd_tp_descriptors;
create trigger set_pbd_tp_descriptors_updated_at
before update on public.pbd_tp_descriptors
for each row execute function public.set_updated_at();

create unique index if not exists pbd_tp_descriptors_general_unique_idx
  on public.pbd_tp_descriptors (coalesce(tingkatan, ''), subject_name, tp_level)
  where school_id is null;

create unique index if not exists pbd_tp_descriptors_school_unique_idx
  on public.pbd_tp_descriptors (school_id, coalesce(tingkatan, ''), subject_name, tp_level)
  where school_id is not null;

create index if not exists pbd_tp_descriptors_lookup_idx
  on public.pbd_tp_descriptors (school_id, subject_name, tp_level);

alter table public.pbd_tp_descriptors enable row level security;

drop policy if exists "School members can read PBD TP descriptors"
on public.pbd_tp_descriptors;
drop policy if exists "School admins can insert PBD TP descriptors"
on public.pbd_tp_descriptors;
drop policy if exists "School admins can update PBD TP descriptors"
on public.pbd_tp_descriptors;
drop policy if exists "School admins can delete PBD TP descriptors"
on public.pbd_tp_descriptors;

create policy "School members can read PBD TP descriptors"
on public.pbd_tp_descriptors
for select
to authenticated
using (
  public.is_master_admin()
  or school_id is null
  or public.is_active_school_member(school_id)
);

create policy "School admins can insert PBD TP descriptors"
on public.pbd_tp_descriptors
for insert
to authenticated
with check (
  public.is_master_admin()
  or (school_id is not null and public.is_active_school_admin(school_id))
);

create policy "School admins can update PBD TP descriptors"
on public.pbd_tp_descriptors
for update
to authenticated
using (
  public.is_master_admin()
  or (school_id is not null and public.is_active_school_admin(school_id))
)
with check (
  public.is_master_admin()
  or (school_id is not null and public.is_active_school_admin(school_id))
);

create policy "School admins can delete PBD TP descriptors"
on public.pbd_tp_descriptors
for delete
to authenticated
using (
  public.is_master_admin()
  or (school_id is not null and public.is_active_school_admin(school_id))
);

grant select, insert, update, delete on public.pbd_tp_descriptors to authenticated;

comment on table public.pbd_tp_descriptors is
  'Pernyataan TP umum dan override sekolah untuk laporan PBD individu.';
