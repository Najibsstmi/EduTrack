-- Allow approved school admins to edit active students from the Urus Murid page.
-- Safe to rerun. This RPC updates the profile and enrollment in one transaction.
-- Existing RLS policies are intentionally left unchanged to avoid disrupting
-- current student read, import, add, and remove flows.

create or replace function public.update_school_student(
  target_enrollment_id uuid,
  target_student_profile_id uuid,
  target_academic_year integer,
  new_full_name text,
  new_ic_number text,
  new_gender text,
  new_class_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_school_id uuid;
  current_school_year integer;
  enrollment_row public.student_enrollments%rowtype;
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
    raise exception 'Hanya admin sekolah aktif boleh edit murid.';
  end if;

  select s.current_academic_year::integer
    into current_school_year
  from public.school_setup_configs s
  where s.school_id = requester_school_id
  limit 1;

  if current_school_year is null or target_academic_year <> current_school_year then
    raise exception 'Hanya enrollment aktif tahun semasa boleh diedit.';
  end if;

  if nullif(btrim(new_full_name), '') is null then
    raise exception 'Nama murid diperlukan.';
  end if;

  if nullif(btrim(new_ic_number), '') is null then
    raise exception 'No IC / MyKid / Dokumen diperlukan.';
  end if;

  if nullif(btrim(coalesce(new_gender, '')), '') is not null
    and upper(btrim(new_gender)) not in ('LELAKI', 'PEREMPUAN')
  then
    raise exception 'Jantina mesti Lelaki atau Perempuan.';
  end if;

  select se.*
    into enrollment_row
  from public.student_enrollments se
  where se.id = target_enrollment_id
    and se.student_profile_id = target_student_profile_id
    and se.school_id = requester_school_id
    and se.academic_year = target_academic_year
    and se.is_active = true
  for update;

  if enrollment_row.id is null then
    raise exception 'Enrollment aktif murid tidak ditemui dalam sekolah anda.';
  end if;

  if not exists (
    select 1
    from public.student_profiles sp
    where sp.id = target_student_profile_id
      and sp.school_id = requester_school_id
  ) then
    raise exception 'Profil murid tidak ditemui dalam sekolah anda.';
  end if;

  if not exists (
    select 1
    from public.classes c
    where c.id = new_class_id
      and c.school_id = requester_school_id
      and c.academic_year = target_academic_year
      and c.is_active = true
  ) then
    raise exception 'Kelas yang dipilih tidak sah untuk sekolah dan tahun akademik ini.';
  end if;

  if exists (
    select 1
    from public.student_profiles sp
    where sp.school_id = requester_school_id
      and sp.ic_number = btrim(new_ic_number)
      and sp.id <> target_student_profile_id
  ) then
    raise exception 'No IC / MyKid / Dokumen telah digunakan oleh murid lain dalam sekolah ini.';
  end if;

  if exists (
    select 1
    from public.student_enrollments se
    where se.school_id = requester_school_id
      and se.student_profile_id = target_student_profile_id
      and se.academic_year = target_academic_year
      and se.is_active = true
      and se.id <> target_enrollment_id
  ) then
    raise exception 'Murid mempunyai lebih daripada satu enrollment aktif untuk tahun ini.';
  end if;

  update public.student_profiles
  set
    full_name = btrim(new_full_name),
    ic_number = btrim(new_ic_number),
    gender = case upper(btrim(coalesce(new_gender, '')))
      when 'LELAKI' then 'Lelaki'
      when 'PEREMPUAN' then 'Perempuan'
      else null
    end
  where id = target_student_profile_id
    and school_id = requester_school_id;

  update public.student_enrollments
  set class_id = new_class_id
  where id = target_enrollment_id
    and student_profile_id = target_student_profile_id
    and school_id = requester_school_id
    and academic_year = target_academic_year
    and is_active = true;
end;
$$;

revoke all on function public.update_school_student(uuid, uuid, integer, text, text, text, uuid) from public;
grant execute on function public.update_school_student(uuid, uuid, integer, text, text, text, uuid) to authenticated;
