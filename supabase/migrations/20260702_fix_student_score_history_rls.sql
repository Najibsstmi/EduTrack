-- Fix audit history RLS for student_scores upserts.
-- Safe to rerun. This allows approved school users to write score audit rows
-- created by the student_scores audit trigger.

do $$
declare
  has_history_table boolean;
  has_school_id boolean;
  has_student_score_id boolean;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_score_history'
  )
  into has_history_table;

  if not has_history_table then
    raise notice 'student_score_history table does not exist; skipping RLS policy fix.';
    return;
  end if;

  execute 'alter table public.student_score_history enable row level security';
  execute 'grant select, insert on public.student_score_history to authenticated';

  execute 'drop policy if exists "School members can read score history" on public.student_score_history';
  execute 'drop policy if exists "School members can insert score history" on public.student_score_history';
  execute 'drop policy if exists "School score history audit insert" on public.student_score_history';

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'student_score_history'
      and column_name = 'school_id'
  )
  into has_school_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'student_score_history'
      and column_name = 'student_score_id'
  )
  into has_student_score_id;

  if has_school_id then
    execute $policy$
      create policy "School members can read score history"
      on public.student_score_history
      for select
      to authenticated
      using (public.is_active_school_member(school_id))
    $policy$;

    execute $policy$
      create policy "School members can insert score history"
      on public.student_score_history
      for insert
      to authenticated
      with check (public.is_active_school_member(school_id))
    $policy$;

    return;
  end if;

  if has_student_score_id then
    execute $policy$
      create policy "School members can read score history"
      on public.student_score_history
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.student_scores ss
          where ss.id = student_score_id
            and public.is_active_school_member(ss.school_id)
        )
      )
    $policy$;

    execute $policy$
      create policy "School members can insert score history"
      on public.student_score_history
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.student_scores ss
          where ss.id = student_score_id
            and public.is_active_school_member(ss.school_id)
        )
      )
    $policy$;

    return;
  end if;

  raise notice 'student_score_history has no school_id or student_score_id column; no RLS policy was created.';
end;
$$;
