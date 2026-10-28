-- Preserve historical PBD snapshots when a student leaves the school.
-- The active enrollment is deactivated instead of deleted, and future PBD
-- snapshots only include students whose enrollment is still active.

create or replace function public.withdraw_school_student(
  target_enrollment_id uuid,
  target_academic_year integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_school_id uuid;
  current_school_year integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select p.school_id
    into requester_school_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
    and p.approval_status = 'approved'
    and (
      p.is_school_admin = true
      or p.role in ('school_admin', 'admin')
    );

  if requester_school_id is null then
    raise exception 'Hanya admin sekolah aktif boleh singkir murid.';
  end if;

  select s.current_academic_year::integer
    into current_school_year
  from public.school_setup_configs s
  where s.school_id = requester_school_id
  limit 1;

  if current_school_year is null or target_academic_year <> current_school_year then
    raise exception 'Hanya enrollment aktif tahun semasa boleh disingkirkan.';
  end if;

  update public.student_enrollments
  set is_active = false
  where id = target_enrollment_id
    and school_id = requester_school_id
    and academic_year = target_academic_year
    and is_active = true;

  if not found then
    raise exception 'Enrollment aktif murid tidak ditemui dalam sekolah anda.';
  end if;
end;
$$;

revoke all on function public.withdraw_school_student(uuid, integer) from public;
grant execute on function public.withdraw_school_student(uuid, integer) to authenticated;

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
  join public.student_enrollments se
    on se.id = c.student_enrollment_id
   and se.school_id = c.school_id
   and se.academic_year = c.academic_year
   and se.is_active = true
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
