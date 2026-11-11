-- PAJSK Entry MVP: secure teacher-code access and activity-first recording.
-- Raw participation data is intentionally separate from PAJSK score calculations.

create extension if not exists pgcrypto;

create table if not exists public.pajsk_teacher_access (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  display_name text not null,
  role text not null default 'teacher'
    constraint pajsk_teacher_access_role_check
    check (role in ('admin', 'teacher', 'viewer')),
  code_lookup text not null unique,
  code_hash text not null,
  code_salt text not null,
  is_active boolean not null default true,
  failed_attempts integer not null default 0
    constraint pajsk_teacher_access_failed_attempts_check
    check (failed_attempts >= 0),
  locked_until timestamptz,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_access_id uuid references public.pajsk_teacher_access(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pajsk_teacher_access_display_name_check
    check (char_length(display_name) between 1 and 160)
);

create table if not exists public.pajsk_teacher_sessions (
  id uuid primary key default gen_random_uuid(),
  access_id uuid not null references public.pajsk_teacher_access(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pajsk_teacher_sessions_expiry_check check (expires_at > created_at)
);

create table if not exists public.pajsk_login_attempts (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools(id) on delete set null,
  access_id uuid references public.pajsk_teacher_access(id) on delete set null,
  ip_hash text not null,
  code_fingerprint text not null,
  was_successful boolean not null default false,
  attempted_at timestamptz not null default now()
);

create table if not exists public.pajsk_classification_options (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  option_type text not null,
  value text not null,
  label text not null,
  description text,
  sort_order integer not null default 0,
  score numeric(8,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pajsk_classification_options_scope_unique
  on public.pajsk_classification_options (
    coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid),
    option_type,
    value
  );

create table if not exists public.pajsk_activities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year integer not null
    constraint pajsk_activities_academic_year_check
    check (academic_year between 2000 and 2200),
  activity_name text not null,
  activity_date date not null,
  organiser text,
  category text not null,
  component text not null,
  level text not null,
  teacher_in_charge text not null,
  evidence_url text,
  remarks text,
  status text not null default 'submitted'
    constraint pajsk_activities_status_check
    check (status in ('submitted', 'cancelled')),
  created_by_access_id uuid references public.pajsk_teacher_access(id) on delete set null,
  updated_by_access_id uuid references public.pajsk_teacher_access(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pajsk_activities_text_lengths_check
    check (
      char_length(activity_name) between 1 and 300
      and char_length(teacher_in_charge) between 1 and 160
      and (organiser is null or char_length(organiser) <= 200)
      and (evidence_url is null or char_length(evidence_url) <= 2000)
      and (remarks is null or char_length(remarks) <= 2000)
    ),
  constraint pajsk_activities_evidence_url_check
    check (evidence_url is null or evidence_url ~* '^https?://')
);

create unique index if not exists pajsk_activities_duplicate_guard
  on public.pajsk_activities (
    school_id,
    academic_year,
    lower(btrim(activity_name)),
    activity_date,
    lower(btrim(coalesce(organiser, ''))),
    category,
    component,
    level
  )
  where status = 'submitted';

create table if not exists public.pajsk_activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.pajsk_activities(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_profile_id uuid not null references public.student_profiles(id) on delete restrict,
  student_enrollment_id uuid references public.student_enrollments(id) on delete set null,
  student_name_snapshot text not null,
  form_snapshot text,
  class_name_snapshot text,
  art_field_snapshot text,
  participation_type text not null,
  contribution_type text,
  achievement_result text not null default 'TIADA',
  achievement_note text,
  remarks text,
  is_active boolean not null default true,
  created_by_access_id uuid references public.pajsk_teacher_access(id) on delete set null,
  updated_by_access_id uuid references public.pajsk_teacher_access(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pajsk_activity_participants_unique_student
    unique (activity_id, student_profile_id),
  constraint pajsk_activity_participants_text_lengths_check
    check (
      char_length(student_name_snapshot) between 1 and 300
      and (achievement_note is null or char_length(achievement_note) <= 1000)
      and (remarks is null or char_length(remarks) <= 1000)
    )
);

create table if not exists public.pajsk_audit_logs (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools(id) on delete set null,
  actor_access_id uuid references public.pajsk_teacher_access(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists pajsk_teacher_access_school_active_idx
  on public.pajsk_teacher_access (school_id, is_active, role);
create index if not exists pajsk_teacher_sessions_token_active_idx
  on public.pajsk_teacher_sessions (token_hash, expires_at)
  where revoked_at is null;
create index if not exists pajsk_login_attempts_ip_time_idx
  on public.pajsk_login_attempts (ip_hash, attempted_at desc);
create index if not exists pajsk_login_attempts_code_time_idx
  on public.pajsk_login_attempts (code_fingerprint, attempted_at desc);
create index if not exists pajsk_activities_school_year_date_idx
  on public.pajsk_activities (school_id, academic_year, activity_date desc)
  where status = 'submitted';
create index if not exists pajsk_activity_participants_school_student_idx
  on public.pajsk_activity_participants (school_id, student_profile_id, created_at desc)
  where is_active = true;
create index if not exists pajsk_activity_participants_activity_idx
  on public.pajsk_activity_participants (activity_id, is_active);
create index if not exists pajsk_audit_logs_school_time_idx
  on public.pajsk_audit_logs (school_id, created_at desc);
create index if not exists student_profiles_school_art_name_idx
  on public.student_profiles (school_id, art_field, lower(full_name));
create index if not exists student_enrollments_school_year_active_idx
  on public.student_enrollments (school_id, academic_year, is_active, class_id);

create or replace function public.set_pajsk_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pajsk_teacher_access_updated_at on public.pajsk_teacher_access;
create trigger set_pajsk_teacher_access_updated_at
before update on public.pajsk_teacher_access
for each row execute function public.set_pajsk_updated_at();

drop trigger if exists set_pajsk_classification_options_updated_at on public.pajsk_classification_options;
create trigger set_pajsk_classification_options_updated_at
before update on public.pajsk_classification_options
for each row execute function public.set_pajsk_updated_at();

drop trigger if exists set_pajsk_activities_updated_at on public.pajsk_activities;
create trigger set_pajsk_activities_updated_at
before update on public.pajsk_activities
for each row execute function public.set_pajsk_updated_at();

drop trigger if exists set_pajsk_activity_participants_updated_at on public.pajsk_activity_participants;
create trigger set_pajsk_activity_participants_updated_at
before update on public.pajsk_activity_participants
for each row execute function public.set_pajsk_updated_at();

alter table public.pajsk_teacher_access enable row level security;
alter table public.pajsk_teacher_sessions enable row level security;
alter table public.pajsk_login_attempts enable row level security;
alter table public.pajsk_classification_options enable row level security;
alter table public.pajsk_activities enable row level security;
alter table public.pajsk_activity_participants enable row level security;
alter table public.pajsk_audit_logs enable row level security;

revoke all on table public.pajsk_teacher_access from anon, authenticated;
revoke all on table public.pajsk_teacher_sessions from anon, authenticated;
revoke all on table public.pajsk_login_attempts from anon, authenticated;
revoke all on table public.pajsk_classification_options from anon, authenticated;
revoke all on table public.pajsk_activities from anon, authenticated;
revoke all on table public.pajsk_activity_participants from anon, authenticated;
revoke all on table public.pajsk_audit_logs from anon, authenticated;

grant select on table public.pajsk_classification_options to authenticated;
grant select on table public.pajsk_activities to authenticated;
grant select on table public.pajsk_activity_participants to authenticated;
grant select on table public.pajsk_audit_logs to authenticated;

drop policy if exists "School members can read PAJSK Entry options" on public.pajsk_classification_options;
create policy "School members can read PAJSK Entry options"
on public.pajsk_classification_options
for select
to authenticated
using (school_id is null or public.is_active_school_member(school_id));

drop policy if exists "School members can read PAJSK Entry activities" on public.pajsk_activities;
create policy "School members can read PAJSK Entry activities"
on public.pajsk_activities
for select
to authenticated
using (public.is_active_school_member(school_id));

drop policy if exists "School members can read PAJSK Entry participants" on public.pajsk_activity_participants;
create policy "School members can read PAJSK Entry participants"
on public.pajsk_activity_participants
for select
to authenticated
using (public.is_active_school_member(school_id));

drop policy if exists "School admins can read PAJSK Entry audit" on public.pajsk_audit_logs;
create policy "School admins can read PAJSK Entry audit"
on public.pajsk_audit_logs
for select
to authenticated
using (school_id is not null and public.is_active_school_admin(school_id));

insert into public.pajsk_classification_options
  (school_id, option_type, value, label, description, sort_order, score)
values
  (null, 'activity_category', 'KOKURIKULUM', 'Kokurikulum', 'Aktiviti kokurikulum rasmi.', 10, null),
  (null, 'activity_category', 'EKSTRA_KURIKULUM', 'Ekstra Kurikulum', 'Kegiatan sukarela yang bermanfaat pada atau di luar waktu persekolahan.', 20, null),
  (null, 'component', 'KELAB_PERSATUAN', 'Kelab/Persatuan', null, 10, null),
  (null, 'component', 'PASUKAN_BADAN_BERUNIFORM', 'Pasukan Badan Beruniform', null, 20, null),
  (null, 'component', 'SUKAN_PERMAINAN', 'Sukan/Permainan', null, 30, null),
  (null, 'component', 'EKSTRA_KURIKULUM', 'Ekstra Kurikulum', null, 40, null),
  (null, 'level', 'SEKOLAH', 'Sekolah', null, 10, null),
  (null, 'level', 'DAERAH_ZON', 'Daerah/Zon', null, 20, null),
  (null, 'level', 'NEGERI', 'Negeri', null, 30, null),
  (null, 'level', 'KEBANGSAAN', 'Kebangsaan', null, 40, null),
  (null, 'level', 'ANTARABANGSA', 'Antarabangsa', null, 50, null),
  (null, 'participation_type', 'PENGLIBATAN_I', 'Penglibatan I', 'Atlet atau peserta perkhemahan, kejohanan, kursus, karnival atau program pertandingan.', 10, null),
  (null, 'participation_type', 'PENGLIBATAN_II', 'Penglibatan II', 'Jawatankuasa pelaksana, petugas teknikal atau persembahan selingan.', 20, null),
  (null, 'participation_type', 'PENGLIBATAN_III', 'Penglibatan III', 'Penyokong, kumpulan sorak atau penglibatan yang meramaikan majlis.', 30, null),
  (null, 'contribution_type', 'ATLET_PESERTA', 'Atlet/Peserta', 'Murid yang didaftarkan sebagai atlet atau peserta program, pertandingan, karnival atau kursus.', 10, null),
  (null, 'contribution_type', 'KEMAHIRAN_KHUSUS', 'Kemahiran Khusus', 'Pengadil, jurulatih pasukan atau peranan teknikal yang berkaitan.', 20, null),
  (null, 'contribution_type', 'PERSEMBAHAN', 'Persembahan', 'Penglibatan dalam persembahan selingan.', 30, null),
  (null, 'contribution_type', 'SOKONGAN', 'Sokongan', 'Membantu menjayakan aktiviti, perbarisan, persembahan atau kumpulan sorak.', 40, null),
  (null, 'achievement_result', 'TIADA', 'Tiada', null, 10, null),
  (null, 'achievement_result', 'JOHAN', 'Johan', null, 20, null),
  (null, 'achievement_result', 'NAIB_JOHAN', 'Naib Johan', null, 30, null),
  (null, 'achievement_result', 'KETIGA', 'Ketiga', null, 40, null),
  (null, 'achievement_result', 'KEEMPAT', 'Keempat', null, 50, null),
  (null, 'achievement_result', 'KELIMA', 'Kelima', null, 60, null)
on conflict do nothing;

create or replace function public.pajsk_search_students(
  p_school_id uuid,
  p_academic_year integer,
  p_query text default null,
  p_form text default null,
  p_class_id uuid default null,
  p_art_field text default null,
  p_limit integer default 50
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
  order by sp.full_name
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.pajsk_save_activity(
  p_school_id uuid,
  p_access_id uuid,
  p_activity jsonb,
  p_participants jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_activity_id uuid;
  v_duplicate_id uuid;
  v_access_role text;
  v_access_name text;
  v_item jsonb;
  v_profile_id uuid;
  v_enrollment_id uuid;
  v_student_name text;
  v_form text;
  v_class_name text;
  v_art_field text;
  v_before jsonb;
  v_after jsonb;
  v_participation_type text;
  v_contribution_type text;
  v_achievement_result text;
begin
  select role, display_name
    into v_access_role, v_access_name
  from public.pajsk_teacher_access
  where id = p_access_id
    and school_id = p_school_id
    and is_active = true
    and (expires_at is null or expires_at > now());

  if not found or v_access_role not in ('admin', 'teacher') then
    raise exception 'Akses tidak dibenarkan untuk menyimpan aktiviti.' using errcode = '42501';
  end if;

  if nullif(btrim(p_activity->>'activity_name'), '') is null
     or nullif(p_activity->>'activity_date', '') is null
     or nullif(p_activity->>'academic_year', '') is null
     or nullif(p_activity->>'category', '') is null
     or nullif(p_activity->>'component', '') is null
     or nullif(p_activity->>'level', '') is null then
    raise exception 'Maklumat wajib aktiviti belum lengkap.' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_participants), '') <> 'array' or jsonb_array_length(p_participants) = 0 then
    raise exception 'Sekurang-kurangnya seorang murid perlu dipilih.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.pajsk_classification_options
    where option_type = 'activity_category' and value = p_activity->>'category' and is_active = true
  ) or not exists (
    select 1 from public.pajsk_classification_options
    where option_type = 'component' and value = p_activity->>'component' and is_active = true
  ) or not exists (
    select 1 from public.pajsk_classification_options
    where option_type = 'level' and value = p_activity->>'level' and is_active = true
  ) then
    raise exception 'Klasifikasi aktiviti tidak sah.' using errcode = '22023';
  end if;

  if nullif(p_activity->>'id', '') is not null then
    v_activity_id := (p_activity->>'id')::uuid;
    select to_jsonb(a) into v_before
    from public.pajsk_activities a
    where a.id = v_activity_id and a.school_id = p_school_id and a.status = 'submitted';
    if v_before is null then
      raise exception 'Rekod aktiviti tidak ditemui.' using errcode = 'P0002';
    end if;
  end if;

  select a.id into v_duplicate_id
  from public.pajsk_activities a
  where a.school_id = p_school_id
    and a.academic_year = (p_activity->>'academic_year')::integer
    and lower(btrim(a.activity_name)) = lower(btrim(p_activity->>'activity_name'))
    and a.activity_date = (p_activity->>'activity_date')::date
    and lower(btrim(coalesce(a.organiser, ''))) = lower(btrim(coalesce(p_activity->>'organiser', '')))
    and a.category = p_activity->>'category'
    and a.component = p_activity->>'component'
    and a.level = p_activity->>'level'
    and a.status = 'submitted'
    and (v_activity_id is null or a.id <> v_activity_id)
  limit 1;

  if v_duplicate_id is not null then
    raise exception 'Aktiviti yang sama telah direkodkan.'
      using errcode = '23505', detail = v_duplicate_id::text;
  end if;

  if v_activity_id is null then
    insert into public.pajsk_activities (
      school_id, academic_year, activity_name, activity_date, organiser,
      category, component, level, teacher_in_charge, evidence_url, remarks,
      created_by_access_id, updated_by_access_id
    ) values (
      p_school_id,
      (p_activity->>'academic_year')::integer,
      btrim(p_activity->>'activity_name'),
      (p_activity->>'activity_date')::date,
      nullif(btrim(p_activity->>'organiser'), ''),
      p_activity->>'category',
      p_activity->>'component',
      p_activity->>'level',
      coalesce(nullif(btrim(p_activity->>'teacher_in_charge'), ''), v_access_name),
      nullif(btrim(p_activity->>'evidence_url'), ''),
      nullif(btrim(p_activity->>'remarks'), ''),
      p_access_id,
      p_access_id
    ) returning id into v_activity_id;
  else
    update public.pajsk_activities
    set academic_year = (p_activity->>'academic_year')::integer,
        activity_name = btrim(p_activity->>'activity_name'),
        activity_date = (p_activity->>'activity_date')::date,
        organiser = nullif(btrim(p_activity->>'organiser'), ''),
        category = p_activity->>'category',
        component = p_activity->>'component',
        level = p_activity->>'level',
        teacher_in_charge = coalesce(nullif(btrim(p_activity->>'teacher_in_charge'), ''), v_access_name),
        evidence_url = nullif(btrim(p_activity->>'evidence_url'), ''),
        remarks = nullif(btrim(p_activity->>'remarks'), ''),
        updated_by_access_id = p_access_id
    where id = v_activity_id and school_id = p_school_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_participants)
  loop
    v_profile_id := nullif(v_item->>'student_profile_id', '')::uuid;
    v_enrollment_id := nullif(v_item->>'student_enrollment_id', '')::uuid;
    v_participation_type := v_item->>'participation_type';
    v_contribution_type := nullif(v_item->>'contribution_type', '');
    v_achievement_result := coalesce(nullif(v_item->>'achievement_result', ''), 'TIADA');

    if v_profile_id is null or v_enrollment_id is null then
      raise exception 'Pengenal murid tidak lengkap.' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.pajsk_classification_options
      where option_type = 'participation_type' and value = v_participation_type and is_active = true
    ) then
      raise exception 'Jenis penglibatan murid tidak sah.' using errcode = '22023';
    end if;

    if v_contribution_type is not null and not exists (
      select 1 from public.pajsk_classification_options
      where option_type = 'contribution_type' and value = v_contribution_type and is_active = true
    ) then
      raise exception 'Jenis khidmat sumbangan murid tidak sah.' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.pajsk_classification_options
      where option_type = 'achievement_result' and value = v_achievement_result and is_active = true
    ) then
      raise exception 'Pencapaian murid tidak sah.' using errcode = '22023';
    end if;

    select sp.full_name, c.tingkatan, c.class_name, sp.art_field
      into v_student_name, v_form, v_class_name, v_art_field
    from public.student_enrollments se
    join public.student_profiles sp
      on sp.id = se.student_profile_id and sp.school_id = se.school_id
    join public.classes c
      on c.id = se.class_id and c.school_id = se.school_id and c.academic_year = se.academic_year
    where se.id = v_enrollment_id
      and se.student_profile_id = v_profile_id
      and se.school_id = p_school_id
      and se.academic_year = (p_activity->>'academic_year')::integer
      and se.is_active = true
      and c.is_active = true;

    if not found then
      raise exception 'Murid tidak sepadan dengan sekolah, tahun atau enrollment aktif.' using errcode = '22023';
    end if;

    insert into public.pajsk_activity_participants (
      activity_id, school_id, student_profile_id, student_enrollment_id,
      student_name_snapshot, form_snapshot, class_name_snapshot, art_field_snapshot,
      participation_type, contribution_type, achievement_result, achievement_note,
      remarks, is_active, created_by_access_id, updated_by_access_id
    ) values (
      v_activity_id, p_school_id, v_profile_id, v_enrollment_id,
      v_student_name, v_form, v_class_name, v_art_field,
      v_participation_type, v_contribution_type, v_achievement_result,
      nullif(btrim(v_item->>'achievement_note'), ''),
      nullif(btrim(v_item->>'remarks'), ''),
      true, p_access_id, p_access_id
    )
    on conflict (activity_id, student_profile_id) do update
    set student_enrollment_id = excluded.student_enrollment_id,
        student_name_snapshot = excluded.student_name_snapshot,
        form_snapshot = excluded.form_snapshot,
        class_name_snapshot = excluded.class_name_snapshot,
        art_field_snapshot = excluded.art_field_snapshot,
        participation_type = excluded.participation_type,
        contribution_type = excluded.contribution_type,
        achievement_result = excluded.achievement_result,
        achievement_note = excluded.achievement_note,
        remarks = excluded.remarks,
        is_active = true,
        updated_by_access_id = p_access_id;
  end loop;

  update public.pajsk_activity_participants existing
  set is_active = false,
      updated_by_access_id = p_access_id
  where existing.activity_id = v_activity_id
    and existing.is_active = true
    and not exists (
      select 1
      from jsonb_array_elements(p_participants) selected
      where nullif(selected->>'student_profile_id', '')::uuid = existing.student_profile_id
    );

  select to_jsonb(a) into v_after
  from public.pajsk_activities a
  where a.id = v_activity_id;

  insert into public.pajsk_audit_logs (
    school_id, actor_access_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_school_id,
    p_access_id,
    case when v_before is null then 'create' else 'update' end,
    'activity',
    v_activity_id::text,
    v_before,
    v_after
  );

  return v_activity_id;
end;
$$;

create or replace function public.pajsk_cancel_activity(
  p_school_id uuid,
  p_access_id uuid,
  p_activity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_before jsonb;
begin
  select role into v_role
  from public.pajsk_teacher_access
  where id = p_access_id
    and school_id = p_school_id
    and is_active = true
    and (expires_at is null or expires_at > now());

  if not found or v_role <> 'admin' then
    raise exception 'Hanya admin boleh membatalkan rekod.' using errcode = '42501';
  end if;

  select to_jsonb(a) into v_before
  from public.pajsk_activities a
  where id = p_activity_id and school_id = p_school_id and status = 'submitted';

  if v_before is null then
    raise exception 'Rekod aktiviti tidak ditemui.' using errcode = 'P0002';
  end if;

  update public.pajsk_activities
  set status = 'cancelled', updated_by_access_id = p_access_id
  where id = p_activity_id and school_id = p_school_id;

  update public.pajsk_activity_participants
  set is_active = false, updated_by_access_id = p_access_id
  where activity_id = p_activity_id and school_id = p_school_id;

  insert into public.pajsk_audit_logs (
    school_id, actor_access_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_school_id,
    p_access_id,
    'cancel',
    'activity',
    p_activity_id::text,
    v_before,
    jsonb_build_object('status', 'cancelled')
  );
end;
$$;

create or replace function public.pajsk_import_art_fields(
  p_school_id uuid,
  p_access_id uuid,
  p_academic_year integer,
  p_rows jsonb,
  p_apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_item jsonb;
  v_ic text;
  v_source_name text;
  v_source_class text;
  v_art_field text;
  v_profile_id uuid;
  v_profile_name text;
  v_current_art_field text;
  v_enrollment_class text;
  v_source_duplicate_count integer;
  v_profile_count integer;
  v_enrollment_count integer;
  v_status text;
  v_result_rows jsonb := '[]'::jsonb;
  v_matched_count integer := 0;
  v_updated_count integer := 0;
  v_exception_count integer := 0;
begin
  select role into v_role
  from public.pajsk_teacher_access
  where id = p_access_id
    and school_id = p_school_id
    and is_active = true
    and (expires_at is null or expires_at > now());

  if not found or v_role <> 'admin' then
    raise exception 'Hanya admin boleh menyemak atau mengimport bidang seni.' using errcode = '42501';
  end if;

  if p_academic_year < 2000 or p_academic_year > 2200 then
    raise exception 'Tahun akademik tidak sah.' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_rows), '') <> 'array'
     or jsonb_array_length(p_rows) = 0
     or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Senarai import mesti mengandungi antara 1 hingga 1000 murid.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_ic := regexp_replace(coalesce(v_item->>'normalized_ic', ''), '\D', '', 'g');
    v_source_name := nullif(regexp_replace(btrim(coalesce(v_item->>'student_name', '')), '\s+', ' ', 'g'), '');
    v_source_class := nullif(upper(regexp_replace(btrim(coalesce(v_item->>'document_class', '')), '\s+', ' ', 'g')), '');
    v_art_field := nullif(btrim(coalesce(v_item->>'art_field', '')), '');
    v_profile_id := null;
    v_profile_name := null;
    v_current_art_field := null;
    v_enrollment_class := null;
    v_source_duplicate_count := 0;
    v_profile_count := 0;
    v_enrollment_count := 0;
    v_status := 'PADAN';

    if char_length(v_ic) <> 12 then
      v_status := 'IC_TIDAK_SAH';
    elsif v_art_field not in ('Seni Tari', 'Seni Muzik', 'Seni Teater', 'Seni Visual') then
      v_status := 'BIDANG_TIDAK_SAH';
    else
      select count(*)::integer into v_source_duplicate_count
      from jsonb_array_elements(p_rows) duplicate_row
      where regexp_replace(coalesce(duplicate_row->>'normalized_ic', ''), '\D', '', 'g') = v_ic;

      if v_source_duplicate_count > 1 then
        v_status := 'IC_BERGANDA_DALAM_FAIL';
      else
        select count(*)::integer into v_profile_count
        from public.student_profiles sp
        where sp.school_id = p_school_id
          and regexp_replace(coalesce(sp.ic_number, ''), '\D', '', 'g') = v_ic;

        if v_profile_count = 0 then
          v_status := 'TIADA_PADANAN_MURID';
        elsif v_profile_count > 1 then
          v_status := 'IC_BERGANDA_DALAM_EDUTRACK';
        else
          select sp.id, sp.full_name, sp.art_field
            into v_profile_id, v_profile_name, v_current_art_field
          from public.student_profiles sp
          where sp.school_id = p_school_id
            and regexp_replace(coalesce(sp.ic_number, ''), '\D', '', 'g') = v_ic;

          select count(*)::integer into v_enrollment_count
          from public.student_enrollments se
          join public.classes c
            on c.id = se.class_id
           and c.school_id = se.school_id
           and c.academic_year = se.academic_year
          where se.school_id = p_school_id
            and se.student_profile_id = v_profile_id
            and se.academic_year = p_academic_year
            and se.is_active = true
            and c.is_active = true;

          if v_enrollment_count = 0 then
            v_status := 'TIADA_ENROLMEN_AKTIF_ATAU_MURID_PINDAH';
          elsif v_enrollment_count > 1 then
            v_status := 'ENROLMEN_AKTIF_BERGANDA';
          else
            select upper(
              regexp_replace(
                btrim(
                  concat_ws(
                    ' ',
                    nullif(regexp_replace(coalesce(c.tingkatan, ''), '\D', '', 'g'), ''),
                    c.class_name
                  )
                ),
                '\s+',
                ' ',
                'g'
              )
            ) into v_enrollment_class
            from public.student_enrollments se
            join public.classes c
              on c.id = se.class_id
             and c.school_id = se.school_id
             and c.academic_year = se.academic_year
            where se.school_id = p_school_id
              and se.student_profile_id = v_profile_id
              and se.academic_year = p_academic_year
              and se.is_active = true
              and c.is_active = true;

            if v_source_name is null
               or upper(regexp_replace(v_source_name, '\s+', ' ', 'g'))
                  <> upper(regexp_replace(coalesce(v_profile_name, ''), '\s+', ' ', 'g')) then
              v_status := 'NAMA_TIDAK_SEPADAN';
            elsif v_source_class is null or v_source_class <> v_enrollment_class then
              v_status := 'KELAS_TIDAK_SEPADAN';
            end if;
          end if;
        end if;
      end if;
    end if;

    if v_status = 'PADAN' then
      v_matched_count := v_matched_count + 1;
      if p_apply and v_current_art_field is distinct from v_art_field then
        update public.student_profiles
        set art_field = v_art_field
        where id = v_profile_id
          and school_id = p_school_id;
        v_updated_count := v_updated_count + 1;
      end if;
    else
      v_exception_count := v_exception_count + 1;
    end if;

    v_result_rows := v_result_rows || jsonb_build_array(
      jsonb_build_object(
        'document_row', nullif(v_item->>'document_row', ''),
        'student_name', v_source_name,
        'document_class', v_source_class,
        'art_field', v_art_field,
        'current_art_field', v_current_art_field,
        'edutrack_name', v_profile_name,
        'edutrack_class', v_enrollment_class,
        'status', v_status
      )
    );
  end loop;

  if p_apply then
    insert into public.pajsk_audit_logs (
      school_id, actor_access_id, action, entity_type, after_data
    ) values (
      p_school_id,
      p_access_id,
      'import_art_fields',
      'student_profiles',
      jsonb_build_object(
        'academic_year', p_academic_year,
        'source_count', jsonb_array_length(p_rows),
        'matched_count', v_matched_count,
        'updated_count', v_updated_count,
        'exception_count', v_exception_count
      )
    );
  end if;

  return jsonb_build_object(
    'applied', p_apply,
    'source_count', jsonb_array_length(p_rows),
    'matched_count', v_matched_count,
    'updated_count', v_updated_count,
    'exception_count', v_exception_count,
    'rows', v_result_rows
  );
end;
$$;

revoke all on function public.pajsk_search_students(uuid, integer, text, text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.pajsk_save_activity(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.pajsk_cancel_activity(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.pajsk_import_art_fields(uuid, uuid, integer, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.pajsk_search_students(uuid, integer, text, text, uuid, text, integer) to service_role;
grant execute on function public.pajsk_save_activity(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.pajsk_cancel_activity(uuid, uuid, uuid) to service_role;
grant execute on function public.pajsk_import_art_fields(uuid, uuid, integer, jsonb, boolean) to service_role;

create or replace view public.pajsk_student_activity_history
with (security_invoker = true)
as
select
  a.school_id,
  a.academic_year,
  a.id as activity_id,
  a.activity_name,
  a.activity_date,
  a.organiser,
  a.category,
  a.component,
  a.level,
  a.teacher_in_charge,
  p.student_profile_id,
  p.student_enrollment_id,
  p.student_name_snapshot,
  p.form_snapshot,
  p.class_name_snapshot,
  p.art_field_snapshot,
  p.participation_type,
  p.contribution_type,
  p.achievement_result,
  p.achievement_note,
  p.remarks as participant_remarks,
  a.created_at,
  a.updated_at
from public.pajsk_activities a
join public.pajsk_activity_participants p
  on p.activity_id = a.id
 and p.school_id = a.school_id
where a.status = 'submitted'
  and p.is_active = true;

revoke all on table public.pajsk_student_activity_history from anon, authenticated;
grant select on table public.pajsk_student_activity_history to authenticated;

comment on table public.pajsk_activities is
  'Raw PAJSK activity records created by the standalone PAJSK Entry frontend.';
comment on table public.pajsk_activity_participants is
  'Participant-level raw involvement and achievement records with historical snapshots.';
comment on column public.pajsk_classification_options.score is
  'Reserved for a verified future scoring engine; intentionally null in the MVP.';
comment on view public.pajsk_student_activity_history is
  'Read-only EduTrack view of submitted PAJSK activities and active participants.';
