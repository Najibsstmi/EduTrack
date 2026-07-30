-- EduTrack Dialog Prestasi Peperiksaan (DPP)
-- Stores subject-level post-exam dialog reports, intervention plans and scoreboard rows.

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

create table if not exists public.performance_dialog_reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year integer not null,
  grade_label text not null,
  class_id uuid references public.classes(id) on delete set null,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  exam_key text not null,
  exam_name text,
  report_title text,
  issue_statement text,
  teacher_names jsonb not null default '[]'::jsonb,
  problem_causes jsonb not null default '{"teacher":[],"student":[]}'::jsonb,
  target_group_note text,
  traffic_bands jsonb not null default '[
    {"key":"green","label":"Hijau","min":70,"max":100,"grades":["A+","A","A-"]},
    {"key":"yellow","label":"Kuning","min":50,"max":69,"grades":["B+","B","C+","C"]},
    {"key":"red","label":"Merah","min":0,"max":49,"grades":["D","E","G"]}
  ]'::jsonb,
  student_interventions jsonb not null default '{"green":[],"yellow":[],"red":[]}'::jsonb,
  teacher_interventions jsonb not null default '[]'::jsonb,
  scoreboard_rows jsonb not null default '[]'::jsonb,
  implementation_window jsonb not null default '{"start_date":"","end_date":"","label":""}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists performance_dialog_reports_context_unique
  on public.performance_dialog_reports (
    school_id,
    academic_year,
    grade_label,
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    subject_id,
    upper(exam_key)
  );

create index if not exists performance_dialog_reports_school_year_idx
  on public.performance_dialog_reports (school_id, academic_year, grade_label, subject_id);

drop trigger if exists set_performance_dialog_reports_updated_at
on public.performance_dialog_reports;
create trigger set_performance_dialog_reports_updated_at
before update on public.performance_dialog_reports
for each row execute function public.set_updated_at();

create or replace function public.validate_performance_dialog_report_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.exam_key = upper(trim(new.exam_key));

  if new.subject_id is not null and not exists (
    select 1
    from public.subjects s
    where s.id = new.subject_id
      and s.school_id = new.school_id
  ) then
    raise exception 'subject_id bukan milik sekolah yang dipilih.';
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

  return new;
end;
$$;

drop trigger if exists validate_performance_dialog_report_scope_trigger
on public.performance_dialog_reports;
create trigger validate_performance_dialog_report_scope_trigger
before insert or update on public.performance_dialog_reports
for each row execute function public.validate_performance_dialog_report_scope();

alter table public.performance_dialog_reports enable row level security;

drop policy if exists "School members can read performance dialog reports"
on public.performance_dialog_reports;
drop policy if exists "School members can insert performance dialog reports"
on public.performance_dialog_reports;
drop policy if exists "School members can update performance dialog reports"
on public.performance_dialog_reports;
drop policy if exists "School admins can delete performance dialog reports"
on public.performance_dialog_reports;

create policy "School members can read performance dialog reports"
on public.performance_dialog_reports
for select
to authenticated
using (
  public.is_active_school_member(school_id)
);

create policy "School members can insert performance dialog reports"
on public.performance_dialog_reports
for insert
to authenticated
with check (
  public.is_active_school_member(school_id)
);

create policy "School members can update performance dialog reports"
on public.performance_dialog_reports
for update
to authenticated
using (
  public.is_active_school_member(school_id)
)
with check (
  public.is_active_school_member(school_id)
);

create policy "School admins can delete performance dialog reports"
on public.performance_dialog_reports
for delete
to authenticated
using (
  public.is_active_school_admin(school_id)
);
