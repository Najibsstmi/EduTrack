-- EduTrack PBD current + snapshot module
-- Copy-paste this whole file into Supabase SQL Editor and run it once.
-- PBD stays separate from exam_configs, student_scores and student_targets.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_active_school_member(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.school_id = target_school_id
      and p.is_active = true
      and p.approval_status = 'approved'
  );
$$;

create or replace function public.is_active_school_admin(target_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.school_id = target_school_id
      and p.is_active = true
      and p.approval_status = 'approved'
      and (
        p.is_school_admin = true
        or p.role in ('school_admin', 'admin')
      )
  );
$$;

create or replace function public.is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.is_master_admin = true
        or p.role = 'master_admin'
      )
  );
$$;

create table if not exists public.pbd_windows (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year integer not null,
  period_key text not null
    constraint pbd_windows_period_key_check
    check (period_key in ('PENGGAL_1', 'PENGGAL_2')),
  period_name text not null,
  is_open boolean not null default false,
  is_locked boolean not null default false,
  opened_at timestamptz,
  opened_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  locked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pbd_windows_open_locked_check check (not (is_open = true and is_locked = true)),
  constraint pbd_windows_school_year_period_unique
    unique (school_id, academic_year, period_key)
);

create table if not exists public.student_pbd_current (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year integer not null,
  student_enrollment_id uuid not null references public.student_enrollments(id) on delete cascade,
  student_profile_id uuid references public.student_profiles(id) on delete set null,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  tp integer constraint student_pbd_current_tp_check check (tp between 1 and 6),
  evidence_note text,
  teacher_note text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_pbd_current_enrollment_subject_year_unique
    unique (student_enrollment_id, subject_id, academic_year)
);

create table if not exists public.student_pbd_snapshots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year integer not null,
  period_key text not null
    constraint student_pbd_snapshots_period_key_check
    check (period_key in ('PENGGAL_1', 'PENGGAL_2')),
  period_name text not null,
  student_enrollment_id uuid not null references public.student_enrollments(id) on delete cascade,
  student_profile_id uuid references public.student_profiles(id) on delete set null,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  tp integer constraint student_pbd_snapshots_tp_check check (tp between 1 and 6),
  evidence_note text,
  teacher_note text,
  snapshot_at timestamptz not null default now(),
  snapshot_by uuid references public.profiles(id) on delete set null,
  constraint student_pbd_snapshots_school_year_period_student_subject_unique
    unique (school_id, academic_year, period_key, student_enrollment_id, subject_id)
);

create index if not exists pbd_windows_school_year_idx
  on public.pbd_windows (school_id, academic_year);
create index if not exists pbd_windows_status_idx
  on public.pbd_windows (school_id, academic_year, period_key, is_open, is_locked);

create index if not exists student_pbd_current_school_year_idx
  on public.student_pbd_current (school_id, academic_year);
create index if not exists student_pbd_current_class_subject_idx
  on public.student_pbd_current (school_id, academic_year, class_id, subject_id);
create index if not exists student_pbd_current_subject_tp_idx
  on public.student_pbd_current (school_id, academic_year, subject_id, tp);
create index if not exists student_pbd_current_enrollment_idx
  on public.student_pbd_current (student_enrollment_id);

create index if not exists student_pbd_snapshots_school_year_period_idx
  on public.student_pbd_snapshots (school_id, academic_year, period_key);
create index if not exists student_pbd_snapshots_class_subject_idx
  on public.student_pbd_snapshots (school_id, academic_year, period_key, class_id, subject_id);
create index if not exists student_pbd_snapshots_subject_tp_idx
  on public.student_pbd_snapshots (school_id, academic_year, period_key, subject_id, tp);
create index if not exists student_pbd_snapshots_enrollment_idx
  on public.student_pbd_snapshots (student_enrollment_id);

drop trigger if exists set_pbd_windows_updated_at on public.pbd_windows;
create trigger set_pbd_windows_updated_at
before update on public.pbd_windows
for each row execute function public.set_updated_at();

drop trigger if exists set_student_pbd_current_updated_at on public.student_pbd_current;
create trigger set_student_pbd_current_updated_at
before update on public.student_pbd_current
for each row execute function public.set_updated_at();

create or replace function public.prevent_pbd_locked_window_reopen()
returns trigger
language plpgsql
as $$
begin
  if old.is_locked = true and (new.is_locked = false or new.is_open = true) then
    raise exception 'PBD window yang telah dikunci tidak boleh dibuka semula.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_pbd_locked_window_reopen_trigger on public.pbd_windows;
create trigger prevent_pbd_locked_window_reopen_trigger
before update on public.pbd_windows
for each row execute function public.prevent_pbd_locked_window_reopen();

create or replace function public.prevent_pbd_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Snapshot PBD yang telah disimpan tidak boleh diubah atau dipadam.';
end;
$$;

drop trigger if exists prevent_pbd_snapshot_update_trigger on public.student_pbd_snapshots;
create trigger prevent_pbd_snapshot_update_trigger
before update or delete on public.student_pbd_snapshots
for each row execute function public.prevent_pbd_snapshot_mutation();

create or replace function public.is_pbd_window_open(
  target_school_id uuid,
  target_academic_year integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pbd_windows w
    where w.school_id = target_school_id
      and w.academic_year = target_academic_year
      and w.is_open = true
      and w.is_locked = false
      and w.period_key in ('PENGGAL_1', 'PENGGAL_2')
  );
$$;

create or replace function public.lock_pbd_window(
  target_school_id uuid,
  target_academic_year integer,
  target_period_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_window public.pbd_windows%rowtype;
  inserted_count integer := 0;
begin
  if target_period_key not in ('PENGGAL_1', 'PENGGAL_2') then
    raise exception 'period_key tidak sah.';
  end if;

  if not public.is_active_school_admin(target_school_id) then
    raise exception 'Hanya admin sekolah boleh kunci PBD.';
  end if;

  select *
  into target_window
  from public.pbd_windows
  where school_id = target_school_id
    and academic_year = target_academic_year
    and period_key = target_period_key
  for update;

  if not found then
    raise exception 'Window PBD belum diwujudkan.';
  end if;

  if target_window.is_locked = true then
    raise exception 'Window PBD ini sudah dikunci.';
  end if;

  if target_window.is_open = false then
    raise exception 'Window PBD perlu dibuka sebelum dikunci.';
  end if;

  insert into public.student_pbd_snapshots (
    school_id,
    academic_year,
    period_key,
    period_name,
    student_enrollment_id,
    student_profile_id,
    class_id,
    subject_id,
    tp,
    evidence_note,
    teacher_note,
    snapshot_at,
    snapshot_by
  )
  select
    c.school_id,
    c.academic_year,
    target_window.period_key,
    target_window.period_name,
    c.student_enrollment_id,
    c.student_profile_id,
    c.class_id,
    c.subject_id,
    c.tp,
    c.evidence_note,
    c.teacher_note,
    now(),
    auth.uid()
  from public.student_pbd_current c
  where c.school_id = target_school_id
    and c.academic_year = target_academic_year
    and c.tp is not null
  on conflict (school_id, academic_year, period_key, student_enrollment_id, subject_id)
  do nothing;

  get diagnostics inserted_count = row_count;

  update public.pbd_windows
  set is_open = false,
      is_locked = true,
      locked_at = now(),
      locked_by = auth.uid()
  where id = target_window.id;

  return jsonb_build_object(
    'period_key', target_window.period_key,
    'period_name', target_window.period_name,
    'inserted_count', inserted_count
  );
end;
$$;

grant execute on function public.lock_pbd_window(uuid, integer, text) to authenticated;

alter table public.pbd_windows enable row level security;
alter table public.student_pbd_current enable row level security;
alter table public.student_pbd_snapshots enable row level security;

drop policy if exists "School members can read PBD windows" on public.pbd_windows;
drop policy if exists "School admins can insert PBD windows" on public.pbd_windows;
drop policy if exists "School admins can update PBD windows" on public.pbd_windows;
drop policy if exists "School admins can delete PBD windows" on public.pbd_windows;

create policy "School members can read PBD windows"
on public.pbd_windows
for select
to authenticated
using (
  public.is_master_admin()
  or public.is_active_school_member(school_id)
);

create policy "School admins can insert PBD windows"
on public.pbd_windows
for insert
to authenticated
with check (public.is_active_school_admin(school_id));

create policy "School admins can update PBD windows"
on public.pbd_windows
for update
to authenticated
using (public.is_active_school_admin(school_id))
with check (public.is_active_school_admin(school_id));

create policy "School admins can delete PBD windows"
on public.pbd_windows
for delete
to authenticated
using (public.is_active_school_admin(school_id));

drop policy if exists "School members can read PBD current" on public.student_pbd_current;
drop policy if exists "School members can insert PBD current while open" on public.student_pbd_current;
drop policy if exists "School members can update PBD current while open" on public.student_pbd_current;
drop policy if exists "School admins can delete PBD current while open" on public.student_pbd_current;

create policy "School members can read PBD current"
on public.student_pbd_current
for select
to authenticated
using (
  public.is_master_admin()
  or public.is_active_school_member(school_id)
);

create policy "School members can insert PBD current while open"
on public.student_pbd_current
for insert
to authenticated
with check (
  public.is_active_school_member(school_id)
  and public.is_pbd_window_open(school_id, academic_year)
);

create policy "School members can update PBD current while open"
on public.student_pbd_current
for update
to authenticated
using (public.is_active_school_member(school_id))
with check (
  public.is_active_school_member(school_id)
  and public.is_pbd_window_open(school_id, academic_year)
);

create policy "School admins can delete PBD current while open"
on public.student_pbd_current
for delete
to authenticated
using (
  public.is_active_school_admin(school_id)
  and public.is_pbd_window_open(school_id, academic_year)
);

drop policy if exists "School members can read PBD snapshots" on public.student_pbd_snapshots;
drop policy if exists "School admins can insert PBD snapshots" on public.student_pbd_snapshots;

create policy "School members can read PBD snapshots"
on public.student_pbd_snapshots
for select
to authenticated
using (
  public.is_master_admin()
  or public.is_active_school_member(school_id)
);

create policy "School admins can insert PBD snapshots"
on public.student_pbd_snapshots
for insert
to authenticated
with check (public.is_active_school_admin(school_id));

-- Optional analysis query: TP distribution by form, class, subject and period.
-- Replace the values in the where clause before running.
--
-- select
--   c.tingkatan,
--   c.class_name,
--   s.subject_name,
--   p.period_key,
--   p.tp,
--   count(*) as bilangan_murid
-- from public.student_pbd_snapshots p
-- join public.classes c on c.id = p.class_id and c.school_id = p.school_id
-- join public.subjects s on s.id = p.subject_id and s.school_id = p.school_id
-- where p.school_id = '00000000-0000-0000-0000-000000000000'
--   and p.academic_year = 2026
--   and p.period_key = 'PENGGAL_1'
-- group by c.tingkatan, c.class_name, s.subject_name, p.period_key, p.tp
-- order by c.tingkatan, c.class_name, s.subject_name, p.tp;
