-- Include Bahagian in the existing student activity analysis. No record backfill.
create or replace function public.pajsk_analysis_student_rows(
  p_school_id uuid,
  p_academic_year integer,
  p_form text default null,
  p_class_name text default null,
  p_art_field text default null,
  p_component text default null,
  p_level text default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  student_profile_id uuid,
  student_name text,
  form text,
  class_name text,
  art_field text,
  activity_count bigint,
  achievement_count bigint,
  latest_activity_date date,
  state_or_higher_count bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select h.*
    from public.pajsk_student_activity_history h
    where h.school_id = p_school_id
      and h.academic_year = p_academic_year
      and (nullif(btrim(p_form), '') is null or h.form_snapshot = btrim(p_form))
      and (nullif(btrim(p_class_name), '') is null or h.class_name_snapshot = btrim(p_class_name))
      and (nullif(btrim(p_art_field), '') is null or h.art_field_snapshot = btrim(p_art_field))
      and (nullif(btrim(p_component), '') is null or h.component = btrim(p_component))
      and (nullif(btrim(p_level), '') is null or h.level = btrim(p_level))
      and (
        nullif(btrim(p_search), '') is null
        or h.student_name_snapshot ilike '%' || btrim(p_search) || '%'
      )
  ), grouped as (
    select
      h.student_profile_id,
      max(h.student_name_snapshot) as student_name,
      max(h.form_snapshot) as form,
      max(h.class_name_snapshot) as class_name,
      max(h.art_field_snapshot) as art_field,
      count(distinct h.activity_id) as activity_count,
      count(*) filter (where h.achievement_result <> 'TIADA') as achievement_count,
      max(h.activity_date) as latest_activity_date,
      count(*) filter (where h.level in ('BAHAGIAN', 'NEGERI', 'KEBANGSAAN', 'ANTARABANGSA')) as state_or_higher_count
    from filtered h
    group by h.student_profile_id
  ), counted as (
    select g.*, count(*) over () as total_count
    from grouped g
  )
  select
    c.student_profile_id,
    c.student_name,
    c.form,
    c.class_name,
    c.art_field,
    c.activity_count,
    c.achievement_count,
    c.latest_activity_date,
    c.state_or_higher_count,
    c.total_count
  from counted c
  order by c.activity_count desc, c.student_name
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;


-- A separate paged RPC preserves the existing search signature and grants.
create or replace function public.pajsk_search_students_paged(
  p_school_id uuid,
  p_academic_year integer,
  p_query text default null,
  p_form text default null,
  p_class_id uuid default null,
  p_art_field text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  student_profile_id uuid,
  student_enrollment_id uuid,
  full_name text,
  academic_year integer,
  class_id uuid,
  form text,
  class_name text,
  art_field text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    sp.id,
    se.id,
    sp.full_name,
    se.academic_year,
    c.id,
    c.tingkatan,
    c.class_name,
    sp.art_field
  from public.student_enrollments se
  join public.student_profiles sp
    on sp.id = se.student_profile_id
   and sp.school_id = se.school_id
  join public.classes c
    on c.id = se.class_id
   and c.school_id = se.school_id
   and c.academic_year = se.academic_year
  where se.school_id = p_school_id
    and se.academic_year = p_academic_year
    and se.is_active = true
    and c.is_active = true
    and (nullif(btrim(p_query), '') is null or sp.full_name ilike '%' || btrim(p_query) || '%')
    and (nullif(btrim(p_form), '') is null or c.tingkatan = btrim(p_form))
    and (p_class_id is null or c.id = p_class_id)
    and (nullif(btrim(p_art_field), '') is null or sp.art_field = btrim(p_art_field))
  order by sp.full_name, sp.id, se.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.pajsk_search_students_paged(uuid, integer, text, text, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.pajsk_search_students_paged(uuid, integer, text, text, uuid, text, integer, integer) to service_role;
