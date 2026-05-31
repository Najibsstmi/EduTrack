-- EduTrack PBS migration
-- Copy-paste this whole file into Supabase SQL Editor and run it once.
-- It is written to be safe to rerun for tables, indexes, triggers, functions and policies.

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

create table if not exists public.student_pbd_scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_enrollment_id uuid not null references public.student_enrollments(id) on delete cascade,
  academic_year integer not null,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  tp_level integer not null constraint student_pbd_scores_tp_level_check check (tp_level between 1 and 6),
  evidence_note text,
  assessment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint student_pbd_scores_unique_subject_year
    unique (student_enrollment_id, subject_id, academic_year)
);

create table if not exists public.student_ppsi_results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_enrollment_id uuid not null references public.student_enrollments(id) on delete cascade,
  academic_year integer not null,
  subject_id uuid references public.subjects(id) on delete set null,
  instrument_name text not null,
  domain_name text not null default 'Umum',
  result_label text,
  numeric_score numeric(6,2),
  interpretation text,
  assessment_date date,
  raw_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint student_ppsi_results_unique_domain_year
    unique (student_enrollment_id, academic_year, instrument_name, domain_name)
);

create table if not exists public.student_pajsk_segak (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_enrollment_id uuid not null references public.student_enrollments(id) on delete cascade,
  academic_year integer not null,
  subject_id uuid references public.subjects(id) on delete set null,
  height_cm numeric(6,2),
  weight_kg numeric(6,2),
  bmi numeric(5,2),
  kategori_bmi text,
  skor_segak numeric(5,2) constraint student_pajsk_segak_score_check
    check (skor_segak is null or (skor_segak >= 0 and skor_segak <= 100)),
  gred_segak text,
  assessment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint student_pajsk_segak_unique_year
    unique (student_enrollment_id, academic_year)
);

create table if not exists public.student_pajsk_kokurikulum (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_enrollment_id uuid not null references public.student_enrollments(id) on delete cascade,
  academic_year integer not null,
  subject_id uuid references public.subjects(id) on delete set null,
  unit_type text,
  activity_name text,
  score numeric(5,2) constraint student_pajsk_kokurikulum_score_check
    check (score is null or (score >= 0 and score <= 100)),
  grade text,
  remarks text,
  assessment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint student_pajsk_kokurikulum_unique_year
    unique (student_enrollment_id, academic_year)
);

create table if not exists public.student_pajsk_ekstra (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_enrollment_id uuid not null references public.student_enrollments(id) on delete cascade,
  academic_year integer not null,
  subject_id uuid references public.subjects(id) on delete set null,
  activity_name text,
  score numeric(5,2) constraint student_pajsk_ekstra_score_check
    check (score is null or (score >= 0 and score <= 100)),
  grade text,
  remarks text,
  assessment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint student_pajsk_ekstra_unique_year
    unique (student_enrollment_id, academic_year)
);

-- Compatibility for databases that already ran an earlier draft of this migration.
alter table public.student_ppsi_results
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;
alter table public.student_pajsk_segak
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;
alter table public.student_pajsk_kokurikulum
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;
alter table public.student_pajsk_ekstra
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;

create index if not exists student_pbd_scores_school_year_idx
  on public.student_pbd_scores (school_id, academic_year);
create index if not exists student_pbd_scores_enrollment_idx
  on public.student_pbd_scores (student_enrollment_id);
create index if not exists student_pbd_scores_subject_idx
  on public.student_pbd_scores (subject_id);
create index if not exists student_pbd_scores_analysis_idx
  on public.student_pbd_scores (school_id, academic_year, subject_id, tp_level);

create index if not exists student_ppsi_results_school_year_idx
  on public.student_ppsi_results (school_id, academic_year);
create index if not exists student_ppsi_results_enrollment_idx
  on public.student_ppsi_results (student_enrollment_id);
create index if not exists student_ppsi_results_subject_idx
  on public.student_ppsi_results (subject_id);

create index if not exists student_pajsk_segak_school_year_idx
  on public.student_pajsk_segak (school_id, academic_year);
create index if not exists student_pajsk_segak_enrollment_idx
  on public.student_pajsk_segak (student_enrollment_id);
create index if not exists student_pajsk_segak_subject_idx
  on public.student_pajsk_segak (subject_id);

create index if not exists student_pajsk_kokurikulum_school_year_idx
  on public.student_pajsk_kokurikulum (school_id, academic_year);
create index if not exists student_pajsk_kokurikulum_enrollment_idx
  on public.student_pajsk_kokurikulum (student_enrollment_id);
create index if not exists student_pajsk_kokurikulum_subject_idx
  on public.student_pajsk_kokurikulum (subject_id);

create index if not exists student_pajsk_ekstra_school_year_idx
  on public.student_pajsk_ekstra (school_id, academic_year);
create index if not exists student_pajsk_ekstra_enrollment_idx
  on public.student_pajsk_ekstra (student_enrollment_id);
create index if not exists student_pajsk_ekstra_subject_idx
  on public.student_pajsk_ekstra (subject_id);

drop trigger if exists set_student_pbd_scores_updated_at on public.student_pbd_scores;
create trigger set_student_pbd_scores_updated_at
before update on public.student_pbd_scores
for each row execute function public.set_updated_at();

drop trigger if exists set_student_ppsi_results_updated_at on public.student_ppsi_results;
create trigger set_student_ppsi_results_updated_at
before update on public.student_ppsi_results
for each row execute function public.set_updated_at();

drop trigger if exists set_student_pajsk_segak_updated_at on public.student_pajsk_segak;
create trigger set_student_pajsk_segak_updated_at
before update on public.student_pajsk_segak
for each row execute function public.set_updated_at();

drop trigger if exists set_student_pajsk_kokurikulum_updated_at on public.student_pajsk_kokurikulum;
create trigger set_student_pajsk_kokurikulum_updated_at
before update on public.student_pajsk_kokurikulum
for each row execute function public.set_updated_at();

drop trigger if exists set_student_pajsk_ekstra_updated_at on public.student_pajsk_ekstra;
create trigger set_student_pajsk_ekstra_updated_at
before update on public.student_pajsk_ekstra
for each row execute function public.set_updated_at();

alter table public.student_pbd_scores enable row level security;
alter table public.student_ppsi_results enable row level security;
alter table public.student_pajsk_segak enable row level security;
alter table public.student_pajsk_kokurikulum enable row level security;
alter table public.student_pajsk_ekstra enable row level security;

drop policy if exists "School members can read PBD scores" on public.student_pbd_scores;
drop policy if exists "School members can insert PBD scores" on public.student_pbd_scores;
drop policy if exists "School members can update PBD scores" on public.student_pbd_scores;
drop policy if exists "School admins can delete PBD scores" on public.student_pbd_scores;

create policy "School members can read PBD scores"
on public.student_pbd_scores
for select
to authenticated
using (public.is_active_school_member(school_id));

create policy "School members can insert PBD scores"
on public.student_pbd_scores
for insert
to authenticated
with check (public.is_active_school_member(school_id));

create policy "School members can update PBD scores"
on public.student_pbd_scores
for update
to authenticated
using (public.is_active_school_member(school_id))
with check (public.is_active_school_member(school_id));

create policy "School admins can delete PBD scores"
on public.student_pbd_scores
for delete
to authenticated
using (public.is_active_school_admin(school_id));

drop policy if exists "School members can read PPsi results" on public.student_ppsi_results;
drop policy if exists "School members can insert PPsi results" on public.student_ppsi_results;
drop policy if exists "School members can update PPsi results" on public.student_ppsi_results;
drop policy if exists "School admins can delete PPsi results" on public.student_ppsi_results;

create policy "School members can read PPsi results"
on public.student_ppsi_results
for select
to authenticated
using (public.is_active_school_member(school_id));

create policy "School members can insert PPsi results"
on public.student_ppsi_results
for insert
to authenticated
with check (public.is_active_school_member(school_id));

create policy "School members can update PPsi results"
on public.student_ppsi_results
for update
to authenticated
using (public.is_active_school_member(school_id))
with check (public.is_active_school_member(school_id));

create policy "School admins can delete PPsi results"
on public.student_ppsi_results
for delete
to authenticated
using (public.is_active_school_admin(school_id));

drop policy if exists "School members can read PAJSK SEGAK" on public.student_pajsk_segak;
drop policy if exists "School members can insert PAJSK SEGAK" on public.student_pajsk_segak;
drop policy if exists "School members can update PAJSK SEGAK" on public.student_pajsk_segak;
drop policy if exists "School admins can delete PAJSK SEGAK" on public.student_pajsk_segak;

create policy "School members can read PAJSK SEGAK"
on public.student_pajsk_segak
for select
to authenticated
using (public.is_active_school_member(school_id));

create policy "School members can insert PAJSK SEGAK"
on public.student_pajsk_segak
for insert
to authenticated
with check (public.is_active_school_member(school_id));

create policy "School members can update PAJSK SEGAK"
on public.student_pajsk_segak
for update
to authenticated
using (public.is_active_school_member(school_id))
with check (public.is_active_school_member(school_id));

create policy "School admins can delete PAJSK SEGAK"
on public.student_pajsk_segak
for delete
to authenticated
using (public.is_active_school_admin(school_id));

drop policy if exists "School members can read PAJSK kokurikulum" on public.student_pajsk_kokurikulum;
drop policy if exists "School members can insert PAJSK kokurikulum" on public.student_pajsk_kokurikulum;
drop policy if exists "School members can update PAJSK kokurikulum" on public.student_pajsk_kokurikulum;
drop policy if exists "School admins can delete PAJSK kokurikulum" on public.student_pajsk_kokurikulum;

create policy "School members can read PAJSK kokurikulum"
on public.student_pajsk_kokurikulum
for select
to authenticated
using (public.is_active_school_member(school_id));

create policy "School members can insert PAJSK kokurikulum"
on public.student_pajsk_kokurikulum
for insert
to authenticated
with check (public.is_active_school_member(school_id));

create policy "School members can update PAJSK kokurikulum"
on public.student_pajsk_kokurikulum
for update
to authenticated
using (public.is_active_school_member(school_id))
with check (public.is_active_school_member(school_id));

create policy "School admins can delete PAJSK kokurikulum"
on public.student_pajsk_kokurikulum
for delete
to authenticated
using (public.is_active_school_admin(school_id));

drop policy if exists "School members can read PAJSK ekstra" on public.student_pajsk_ekstra;
drop policy if exists "School members can insert PAJSK ekstra" on public.student_pajsk_ekstra;
drop policy if exists "School members can update PAJSK ekstra" on public.student_pajsk_ekstra;
drop policy if exists "School admins can delete PAJSK ekstra" on public.student_pajsk_ekstra;

create policy "School members can read PAJSK ekstra"
on public.student_pajsk_ekstra
for select
to authenticated
using (public.is_active_school_member(school_id));

create policy "School members can insert PAJSK ekstra"
on public.student_pajsk_ekstra
for insert
to authenticated
with check (public.is_active_school_member(school_id));

create policy "School members can update PAJSK ekstra"
on public.student_pajsk_ekstra
for update
to authenticated
using (public.is_active_school_member(school_id))
with check (public.is_active_school_member(school_id));

create policy "School admins can delete PAJSK ekstra"
on public.student_pajsk_ekstra
for delete
to authenticated
using (public.is_active_school_admin(school_id));

-- SAMPLE QUERY 1:
-- Analisis PBD mengikut tingkatan, kelas, subjek dan TP.
-- Ganti nilai dalam CTE params:
--   school_id: UUID sekolah
--   academic_year: tahun akademik
--   subject_id: isi UUID subjek tertentu atau biarkan null untuk semua subjek
/*
with params as (
  select
    '00000000-0000-0000-0000-000000000000'::uuid as school_id,
    2025::integer as academic_year,
    null::uuid as subject_id
),
class_subject_students as (
  select
    c.id as class_id,
    c.tingkatan,
    c.class_name,
    s.id as subject_id,
    s.subject_name,
    se.id as student_enrollment_id
  from params p
  join public.classes c
    on c.school_id = p.school_id
   and c.academic_year = p.academic_year
   and c.is_active = true
  join public.subjects s
    on s.school_id = c.school_id
   and s.tingkatan = c.tingkatan
   and s.is_active = true
   and (p.subject_id is null or s.id = p.subject_id)
  join public.student_enrollments se
    on se.school_id = c.school_id
   and se.class_id = c.id
   and se.academic_year = p.academic_year
   and se.is_active = true
  where
    coalesce(s.subject_type, 'core') <> 'selective'
    or exists (
      select 1
      from public.student_subject_enrollments sse
      where sse.school_id = p.school_id
        and sse.academic_year = p.academic_year
        and sse.student_enrollment_id = se.id
        and sse.subject_id = s.id
        and sse.is_active = true
    )
)
select
  css.tingkatan,
  css.class_name,
  css.subject_name,
  count(*) filter (where pbd.tp_level = 1) as tp1_bil,
  round(count(*) filter (where pbd.tp_level = 1)::numeric / nullif(count(*), 0) * 100, 2) as tp1_percent,
  count(*) filter (where pbd.tp_level = 2) as tp2_bil,
  round(count(*) filter (where pbd.tp_level = 2)::numeric / nullif(count(*), 0) * 100, 2) as tp2_percent,
  count(*) filter (where pbd.tp_level = 3) as tp3_bil,
  round(count(*) filter (where pbd.tp_level = 3)::numeric / nullif(count(*), 0) * 100, 2) as tp3_percent,
  count(*) filter (where pbd.tp_level = 4) as tp4_bil,
  round(count(*) filter (where pbd.tp_level = 4)::numeric / nullif(count(*), 0) * 100, 2) as tp4_percent,
  count(*) filter (where pbd.tp_level = 5) as tp5_bil,
  round(count(*) filter (where pbd.tp_level = 5)::numeric / nullif(count(*), 0) * 100, 2) as tp5_percent,
  count(*) filter (where pbd.tp_level = 6) as tp6_bil,
  round(count(*) filter (where pbd.tp_level = 6)::numeric / nullif(count(*), 0) * 100, 2) as tp6_percent,
  count(*) as jumlah_murid,
  count(*) filter (where pbd.tp_level between 3 and 6) as tahap_minimum_tp3_tp6,
  round(count(*) filter (where pbd.tp_level between 3 and 6)::numeric / nullif(count(*), 0) * 100, 2) as minimum_percent_tp3_tp6
from class_subject_students css
left join public.student_pbd_scores pbd
  on pbd.student_enrollment_id = css.student_enrollment_id
 and pbd.subject_id = css.subject_id
 and pbd.academic_year = (select academic_year from params)
 and pbd.school_id = (select school_id from params)
group by css.tingkatan, css.class_name, css.subject_name
order by css.tingkatan, css.class_name, css.subject_name;
*/

-- SAMPLE QUERY 2:
-- Rumusan PBD keseluruhan mengikut tingkatan dan subjek.
/*
with params as (
  select
    '00000000-0000-0000-0000-000000000000'::uuid as school_id,
    2025::integer as academic_year,
    null::uuid as subject_id
),
class_subject_students as (
  select
    c.tingkatan,
    s.id as subject_id,
    s.subject_name,
    se.id as student_enrollment_id
  from params p
  join public.classes c
    on c.school_id = p.school_id
   and c.academic_year = p.academic_year
   and c.is_active = true
  join public.subjects s
    on s.school_id = c.school_id
   and s.tingkatan = c.tingkatan
   and s.is_active = true
   and (p.subject_id is null or s.id = p.subject_id)
  join public.student_enrollments se
    on se.school_id = c.school_id
   and se.class_id = c.id
   and se.academic_year = p.academic_year
   and se.is_active = true
  where
    coalesce(s.subject_type, 'core') <> 'selective'
    or exists (
      select 1
      from public.student_subject_enrollments sse
      where sse.school_id = p.school_id
        and sse.academic_year = p.academic_year
        and sse.student_enrollment_id = se.id
        and sse.subject_id = s.id
        and sse.is_active = true
    )
)
select
  css.tingkatan,
  css.subject_name,
  count(*) filter (where pbd.tp_level = 1) as tp1_bil,
  count(*) filter (where pbd.tp_level = 2) as tp2_bil,
  count(*) filter (where pbd.tp_level = 3) as tp3_bil,
  count(*) filter (where pbd.tp_level = 4) as tp4_bil,
  count(*) filter (where pbd.tp_level = 5) as tp5_bil,
  count(*) filter (where pbd.tp_level = 6) as tp6_bil,
  count(*) as jumlah_murid,
  count(*) filter (where pbd.tp_level between 3 and 6) as tahap_minimum_tp3_tp6,
  round(count(*) filter (where pbd.tp_level between 3 and 6)::numeric / nullif(count(*), 0) * 100, 2) as minimum_percent_tp3_tp6
from class_subject_students css
left join public.student_pbd_scores pbd
  on pbd.student_enrollment_id = css.student_enrollment_id
 and pbd.subject_id = css.subject_id
 and pbd.academic_year = (select academic_year from params)
 and pbd.school_id = (select school_id from params)
group by css.tingkatan, css.subject_name
order by css.tingkatan, css.subject_name;
*/
