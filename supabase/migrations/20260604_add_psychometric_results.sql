-- EduTrack psychometric import module
-- Run this migration once in Supabase before using Input Data Psikometrik.

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

create table if not exists public.psychometric_import_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assessment_type text not null
    constraint psychometric_import_batches_type_check
    check (assessment_type in ('career_interest', 'personality', 'aptitude')),
  assessment_name text not null,
  academic_year integer not null,
  grade_label text not null,
  source_filename text,
  total_rows integer not null default 0,
  matched_rows integer not null default 0,
  review_rows integer not null default 0,
  unmatched_rows integer not null default 0,
  error_rows integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.psychometric_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_profile_id uuid references public.student_profiles(id) on delete set null,
  student_enrollment_id uuid references public.student_enrollments(id) on delete set null,
  academic_year integer not null,
  grade_label text not null,
  class_id uuid references public.classes(id) on delete set null,
  class_name text,
  assessment_type text not null
    constraint psychometric_results_type_check
    check (assessment_type in ('career_interest', 'personality', 'aptitude')),
  assessment_name text not null,
  source_filename text,
  source_student_name text,
  source_ic_number text,
  match_status text not null default 'unmatched'
    constraint psychometric_results_match_status_check
    check (match_status in ('matched', 'review', 'unmatched')),
  match_note text,
  raw_data jsonb not null default '{}'::jsonb,
  dominant_code text,
  primary_dimension text,
  secondary_dimension text,
  tertiary_dimension text,
  import_batch_id uuid references public.psychometric_import_batches(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint psychometric_results_student_year_instrument_unique
    unique (school_id, student_enrollment_id, academic_year, assessment_name)
);

create index if not exists psychometric_import_batches_school_year_idx
  on public.psychometric_import_batches (school_id, academic_year, assessment_name);
create index if not exists psychometric_results_school_year_idx
  on public.psychometric_results (school_id, academic_year);
create index if not exists psychometric_results_analysis_idx
  on public.psychometric_results (school_id, academic_year, assessment_type, assessment_name, dominant_code);
create index if not exists psychometric_results_grade_class_idx
  on public.psychometric_results (school_id, academic_year, grade_label, class_id);
create index if not exists psychometric_results_enrollment_idx
  on public.psychometric_results (student_enrollment_id);

drop trigger if exists set_psychometric_results_updated_at on public.psychometric_results;
create trigger set_psychometric_results_updated_at
before update on public.psychometric_results
for each row execute function public.set_updated_at();

create or replace function public.validate_psychometric_result_school_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.import_batch_id is not null and not exists (
    select 1
    from public.psychometric_import_batches b
    where b.id = new.import_batch_id
      and b.school_id = new.school_id
      and b.academic_year = new.academic_year
      and b.assessment_type = new.assessment_type
      and b.assessment_name = new.assessment_name
  ) then
    raise exception 'import_batch_id tidak sepadan dengan sekolah atau instrumen.';
  end if;

  if new.student_profile_id is not null and not exists (
    select 1
    from public.student_profiles sp
    where sp.id = new.student_profile_id
      and sp.school_id = new.school_id
  ) then
    raise exception 'student_profile_id bukan milik sekolah yang dipilih.';
  end if;

  if new.class_id is not null and not exists (
    select 1
    from public.classes c
    where c.id = new.class_id
      and c.school_id = new.school_id
      and c.academic_year = new.academic_year
  ) then
    raise exception 'class_id bukan milik sekolah atau tahun akademik yang dipilih.';
  end if;

  if new.student_enrollment_id is not null and not exists (
    select 1
    from public.student_enrollments se
    where se.id = new.student_enrollment_id
      and se.school_id = new.school_id
      and se.academic_year = new.academic_year
      and (new.student_profile_id is null or se.student_profile_id = new.student_profile_id)
      and (new.class_id is null or se.class_id = new.class_id)
  ) then
    raise exception 'student_enrollment_id tidak sepadan dengan sekolah, tahun, murid atau kelas.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_psychometric_result_school_scope_trigger
on public.psychometric_results;
create trigger validate_psychometric_result_school_scope_trigger
before insert or update on public.psychometric_results
for each row execute function public.validate_psychometric_result_school_scope();

alter table public.psychometric_import_batches enable row level security;
alter table public.psychometric_results enable row level security;

drop policy if exists "School members can read psychometric batches"
on public.psychometric_import_batches;
drop policy if exists "School admins can insert psychometric batches"
on public.psychometric_import_batches;
drop policy if exists "School admins can delete psychometric batches"
on public.psychometric_import_batches;

create policy "School members can read psychometric batches"
on public.psychometric_import_batches
for select
to authenticated
using (
  public.is_master_admin()
  or public.is_active_school_member(school_id)
);

create policy "School admins can insert psychometric batches"
on public.psychometric_import_batches
for insert
to authenticated
with check (
  public.is_master_admin()
  or public.is_active_school_admin(school_id)
);

create policy "School admins can delete psychometric batches"
on public.psychometric_import_batches
for delete
to authenticated
using (
  public.is_master_admin()
  or public.is_active_school_admin(school_id)
);

drop policy if exists "School members can read psychometric results"
on public.psychometric_results;
drop policy if exists "School admins can insert psychometric results"
on public.psychometric_results;
drop policy if exists "School admins can update psychometric results"
on public.psychometric_results;
drop policy if exists "School admins can delete psychometric results"
on public.psychometric_results;

create policy "School members can read psychometric results"
on public.psychometric_results
for select
to authenticated
using (
  public.is_master_admin()
  or public.is_active_school_member(school_id)
);

create policy "School admins can insert psychometric results"
on public.psychometric_results
for insert
to authenticated
with check (
  public.is_master_admin()
  or public.is_active_school_admin(school_id)
);

create policy "School admins can update psychometric results"
on public.psychometric_results
for update
to authenticated
using (
  public.is_master_admin()
  or public.is_active_school_admin(school_id)
)
with check (
  public.is_master_admin()
  or public.is_active_school_admin(school_id)
);

create policy "School admins can delete psychometric results"
on public.psychometric_results
for delete
to authenticated
using (
  public.is_master_admin()
  or public.is_active_school_admin(school_id)
);
