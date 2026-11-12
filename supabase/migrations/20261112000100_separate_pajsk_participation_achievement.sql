-- Keep PAJSK participation roles and competition achievements independent.
-- Scores follow the verified Sekolah Menengah PAJSK tables (pages 12-13).

alter table public.pajsk_activities
  add column if not exists competition_category text;

alter table public.pajsk_activity_participants
  add column if not exists participation_score numeric(5,2),
  add column if not exists achievement_score numeric(5,2);

alter table public.pajsk_activities
  drop constraint if exists pajsk_activities_competition_category_length_check;
alter table public.pajsk_activities
  add constraint pajsk_activities_competition_category_length_check
  check (competition_category is null or char_length(competition_category) <= 300);

alter table public.pajsk_activity_participants
  drop constraint if exists pajsk_activity_participants_independent_scores_check;
alter table public.pajsk_activity_participants
  add constraint pajsk_activity_participants_independent_scores_check
  check (
    (participation_score is null or participation_score between 0 and 20)
    and (achievement_score is null or achievement_score between 0 and 20)
  );

update public.pajsk_classification_options
set description = case value
  when 'PENGLIBATAN_I' then 'Peserta berdaftar, atlet atau peserta pertandingan/program.'
  when 'PENGLIBATAN_II' then 'AJK pelaksana, petugas teknikal atau persembahan selingan.'
  when 'PENGLIBATAN_III' then 'Penyokong, kumpulan sorak atau penglibatan untuk memeriahkan program.'
  else description
end,
updated_at = now()
where option_type = 'participation_type'
  and value in ('PENGLIBATAN_I', 'PENGLIBATAN_II', 'PENGLIBATAN_III');

create or replace function public.pajsk_participation_score(
  p_level text,
  p_participation_type text
)
returns numeric
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select case p_level
    when 'ANTARABANGSA' then case p_participation_type
      when 'PENGLIBATAN_I' then 20 when 'PENGLIBATAN_II' then 15 when 'PENGLIBATAN_III' then 10 end
    when 'KEBANGSAAN' then case p_participation_type
      when 'PENGLIBATAN_I' then 17 when 'PENGLIBATAN_II' then 12 when 'PENGLIBATAN_III' then 8 end
    when 'NEGERI' then case p_participation_type
      when 'PENGLIBATAN_I' then 14 when 'PENGLIBATAN_II' then 10 when 'PENGLIBATAN_III' then 6 end
    when 'DAERAH_ZON' then case p_participation_type
      when 'PENGLIBATAN_I' then 11 when 'PENGLIBATAN_II' then 8 when 'PENGLIBATAN_III' then 4 end
    when 'SEKOLAH' then case p_participation_type
      when 'PENGLIBATAN_I' then 0 when 'PENGLIBATAN_II' then 0 when 'PENGLIBATAN_III' then 0 end
  end;
$$;

create or replace function public.pajsk_achievement_score(
  p_level text,
  p_achievement_result text
)
returns numeric
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select case
    when p_achievement_result = 'TIADA' then 0
    else case p_level
      when 'ANTARABANGSA' then case p_achievement_result
        when 'JOHAN' then 20 when 'NAIB_JOHAN' then 19 when 'KETIGA' then 18 when 'KEEMPAT' then 17 when 'KELIMA' then 16 end
      when 'KEBANGSAAN' then case p_achievement_result
        when 'JOHAN' then 17 when 'NAIB_JOHAN' then 16 when 'KETIGA' then 15 when 'KEEMPAT' then 14 when 'KELIMA' then 13 end
      when 'NEGERI' then case p_achievement_result
        when 'JOHAN' then 14 when 'NAIB_JOHAN' then 13 when 'KETIGA' then 12 when 'KEEMPAT' then 11 when 'KELIMA' then 10 end
      when 'DAERAH_ZON' then case p_achievement_result
        when 'JOHAN' then 11 when 'NAIB_JOHAN' then 10 when 'KETIGA' then 9 when 'KEEMPAT' then 8 when 'KELIMA' then 7 end
      when 'SEKOLAH' then case p_achievement_result
        when 'JOHAN' then 8 when 'NAIB_JOHAN' then 7 when 'KETIGA' then 6 when 'KEEMPAT' then 5 when 'KELIMA' then 4 end
    end
  end;
$$;

update public.pajsk_activity_participants participant
set participation_score = public.pajsk_participation_score(activity.level, participant.participation_type),
    achievement_score = public.pajsk_achievement_score(activity.level, participant.achievement_result)
from public.pajsk_activities activity
where activity.id = participant.activity_id;

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
  v_participation_score numeric;
  v_contribution_type text;
  v_achievement_result text;
  v_achievement_score numeric;
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

  if (p_activity->>'category' = 'KOKURIKULUM' and p_activity->>'component' = 'EKSTRA_KURIKULUM')
     or (p_activity->>'category' = 'EKSTRA_KURIKULUM' and p_activity->>'component' <> 'EKSTRA_KURIKULUM') then
    raise exception 'Komponen tidak sepadan dengan kategori aktiviti.' using errcode = '22023';
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
      competition_category, category, component, level, teacher_in_charge,
      evidence_url, remarks, created_by_access_id, updated_by_access_id
    ) values (
      p_school_id,
      (p_activity->>'academic_year')::integer,
      btrim(p_activity->>'activity_name'),
      (p_activity->>'activity_date')::date,
      nullif(btrim(p_activity->>'organiser'), ''),
      nullif(btrim(p_activity->>'competition_category'), ''),
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
        competition_category = nullif(btrim(p_activity->>'competition_category'), ''),
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
    v_participation_type := nullif(v_item->>'participation_type', '');
    v_contribution_type := nullif(v_item->>'contribution_type', '');
    v_achievement_result := coalesce(nullif(v_item->>'achievement_result', ''), 'TIADA');

    if v_profile_id is null or v_enrollment_id is null then
      raise exception 'Pengenal murid tidak lengkap.' using errcode = '22023';
    end if;

    if v_participation_type is null or not exists (
      select 1 from public.pajsk_classification_options
      where option_type = 'participation_type' and value = v_participation_type and is_active = true
    ) then
      raise exception 'Jenis penglibatan mesti dipilih secara jelas bagi setiap murid.' using errcode = '22023';
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

    v_participation_score := public.pajsk_participation_score(p_activity->>'level', v_participation_type);
    v_achievement_score := public.pajsk_achievement_score(p_activity->>'level', v_achievement_result);
    if v_participation_score is null or v_achievement_score is null then
      raise exception 'Gabungan peringkat dan klasifikasi PAJSK tidak sah.' using errcode = '22023';
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
      participation_type, participation_score, contribution_type,
      achievement_result, achievement_score, remarks, is_active,
      created_by_access_id, updated_by_access_id
    ) values (
      v_activity_id, p_school_id, v_profile_id, v_enrollment_id,
      v_student_name, v_form, v_class_name, v_art_field,
      v_participation_type, v_participation_score, v_contribution_type,
      v_achievement_result, v_achievement_score,
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
        participation_score = excluded.participation_score,
        contribution_type = excluded.contribution_type,
        achievement_result = excluded.achievement_result,
        achievement_score = excluded.achievement_score,
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

drop view if exists public.pajsk_student_activity_history;
create view public.pajsk_student_activity_history
with (security_invoker = true)
as
select
  a.school_id,
  a.academic_year,
  a.id as activity_id,
  a.activity_name,
  a.activity_date,
  a.organiser,
  a.competition_category,
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
  p.participation_score,
  p.contribution_type,
  p.achievement_result,
  p.achievement_score,
  p.remarks as participant_remarks,
  a.created_at,
  a.updated_at
from public.pajsk_activities a
join public.pajsk_activity_participants p
  on p.activity_id = a.id
 and p.school_id = a.school_id
 and p.is_active = true
where a.status = 'submitted';

revoke all on function public.pajsk_participation_score(text, text) from public, anon, authenticated;
revoke all on function public.pajsk_achievement_score(text, text) from public, anon, authenticated;
grant execute on function public.pajsk_participation_score(text, text) to service_role;
grant execute on function public.pajsk_achievement_score(text, text) to service_role;

comment on column public.pajsk_activities.competition_category is
  'Optional competition category stored once at activity level.';
comment on column public.pajsk_activity_participants.participation_score is
  'Official PAJSK participation score calculated only from activity level and participation type.';
comment on column public.pajsk_activity_participants.achievement_score is
  'Official PAJSK achievement score calculated only from activity level and achievement result.';
comment on column public.pajsk_activity_participants.achievement_note is
  'Legacy field retained for historical compatibility; no longer written or shown by PAJSK Entry.';
comment on column public.pajsk_classification_options.score is
  'Single-option scores only; participation and achievement use separate level matrices instead.';
comment on view public.pajsk_student_activity_history is
  'Read-only EduTrack view with independent PAJSK participation and achievement fields and scores.';
