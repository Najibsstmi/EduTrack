-- Additive only. Existing pupil activity and scores are not backfilled or rewritten.
alter table public.pajsk_activities
  add column if not exists activity_kind text check (activity_kind is null or activity_kind in ('UTAMA', 'TAMBAHAN')),
  add column if not exists program_type text check (program_type is null or program_type in ('PERTANDINGAN', 'KEJOHANAN', 'PERKHEMAHAN', 'KURSUS', 'KARNIVAL', 'LAIN')),
  add column if not exists program_mode text check (program_mode is null or program_mode in ('BERSEMUKA', 'DALAM_TALIAN')),
  add column if not exists program_ranked text check (program_ranked is null or program_ranked in ('YA', 'TIDAK')),
  add column if not exists program_live text check (program_live is null or program_live in ('YA', 'TIDAK')),
  add column if not exists evidence_note text check (evidence_note is null or char_length(evidence_note) <= 2000);
alter table public.pajsk_activity_participants
  add column if not exists participation_role text check (participation_role is null or participation_role in ('PESERTA', 'PELAKSANA', 'LAWATAN', 'PENONTON')),
  add column if not exists contribution_score numeric(5,2) check (contribution_score is null or contribution_score between 0 and 10);

insert into public.pajsk_classification_options (school_id, option_type, value, label, description, sort_order, score) values
  (null, 'level', 'BAHAGIAN', 'Bahagian (Sabah/Sarawak)', null, 35, null),
  (null, 'contribution_type', 'JAWATANKUASA', 'Jawatankuasa', 'Ahli jawatankuasa program peringkat sekolah.', 30, 8)
on conflict do nothing;

create or replace function public.pajsk_contribution_score(p_type text)
returns numeric language sql immutable strict set search_path = public, pg_temp as $$
  select case p_type when 'ATLET_PESERTA' then 10 when 'KEMAHIRAN_KHUSUS' then 10 when 'JAWATANKUASA' then 8 when 'SOKONGAN' then 5 end;
$$;
revoke all on function public.pajsk_contribution_score(text) from public, anon, authenticated;

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
    when 'BAHAGIAN' then case p_participation_type
      when 'PENGLIBATAN_I' then 12 when 'PENGLIBATAN_II' then 9 when 'PENGLIBATAN_III' then 5 end
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
      when 'BAHAGIAN' then case p_achievement_result
        when 'JOHAN' then 14 when 'NAIB_JOHAN' then 13 when 'KETIGA' then 12 when 'KEEMPAT' then 11 when 'KELIMA' then 10 end
      when 'DAERAH_ZON' then case p_achievement_result
        when 'JOHAN' then 11 when 'NAIB_JOHAN' then 10 when 'KETIGA' then 9 when 'KEEMPAT' then 8 when 'KELIMA' then 7 end
      when 'SEKOLAH' then case p_achievement_result
        when 'JOHAN' then 8 when 'NAIB_JOHAN' then 7 when 'KETIGA' then 6 when 'KEEMPAT' then 5 when 'KELIMA' then 4 end
    end
  end;
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
  v_participation_score numeric;
  v_contribution_type text;
  v_old_contribution_type text;
  v_old_contribution_score numeric;
  v_contribution_score numeric;
  v_legacy_contribution boolean;
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

  update public.pajsk_activities set
    activity_kind = nullif(p_activity->>'activity_kind', ''),
    program_type = nullif(p_activity->>'program_type', ''),
    program_mode = nullif(p_activity->>'program_mode', ''),
    program_ranked = nullif(p_activity->>'program_ranked', ''),
    program_live = nullif(p_activity->>'program_live', ''),
    evidence_note = nullif(btrim(p_activity->>'evidence_note'), '')
  where id = v_activity_id and school_id = p_school_id;

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

    -- An unchanged historical contribution is kept but is not inferred or scored.
    select contribution_type, contribution_score into v_old_contribution_type, v_old_contribution_score
      from public.pajsk_activity_participants
      where activity_id = v_activity_id and student_profile_id = v_profile_id and is_active;
    v_legacy_contribution := coalesce(v_before is not null
      and v_before->>'activity_kind' is null
      and v_before->>'category' = p_activity->>'category'
      and v_before->>'level' = p_activity->>'level'
      and nullif(p_activity->>'activity_kind', '') is null
      and v_contribution_type is not null
      and v_contribution_type = v_old_contribution_type, false);
    v_contribution_score := null;
    if v_legacy_contribution then
      v_contribution_score := v_old_contribution_score;
    elsif v_contribution_type is not null then
      if p_activity->>'category' <> 'KOKURIKULUM' or p_activity->>'level' <> 'SEKOLAH'
        or coalesce(p_activity->>'activity_kind', '') <> 'UTAMA'
        or (nullif(btrim(p_activity->>'evidence_url'), '') is null and nullif(btrim(p_activity->>'evidence_note'), '') is null) then
        raise exception 'Khidmat sumbangan memerlukan aktiviti utama peringkat sekolah dan bukti.' using errcode = '22023';
      end if;
      v_contribution_score := public.pajsk_contribution_score(v_contribution_type);
      if v_contribution_score is null then
        raise exception 'Kategori khidmat sumbangan tidak sah.' using errcode = '22023';
      end if;
    end if;

    if v_contribution_type is not null and not v_legacy_contribution and not exists (
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
      participation_type, participation_score, participation_role, contribution_type, contribution_score,
      achievement_result, achievement_score, remarks, is_active,
      created_by_access_id, updated_by_access_id
    ) values (
      v_activity_id, p_school_id, v_profile_id, v_enrollment_id,
      v_student_name, v_form, v_class_name, v_art_field,
      v_participation_type, v_participation_score, nullif(v_item->>'participation_role', ''), v_contribution_type, v_contribution_score,
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
        participation_role = excluded.participation_role,
        contribution_type = excluded.contribution_type,
        contribution_score = excluded.contribution_score,
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

