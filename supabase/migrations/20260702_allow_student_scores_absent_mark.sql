-- Allow academic exam absences to be stored without a numeric mark.
-- Frontend saves TH as: is_absent = true, mark = null, grade fields = null.

do $$
declare
  constraint_record record;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_scores'
  ) then
    raise notice 'student_scores table does not exist; skipping absent mark migration.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'student_scores'
      and column_name = 'is_absent'
  ) then
    alter table public.student_scores
      add column is_absent boolean not null default false;
  else
    update public.student_scores
    set is_absent = false
    where is_absent is null;

    alter table public.student_scores
      alter column is_absent set default false,
      alter column is_absent set not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'student_scores'
      and column_name = 'mark'
  ) then
    alter table public.student_scores
      alter column mark drop not null;

    for constraint_record in
      select
        c.conname,
        pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'student_scores'
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%mark%'
        and (
          pg_get_constraintdef(c.oid) ilike '%>=%'
          or pg_get_constraintdef(c.oid) ilike '%<=%'
          or pg_get_constraintdef(c.oid) ilike '%between%'
        )
    loop
      execute format(
        'alter table public.student_scores drop constraint if exists %I',
        constraint_record.conname
      );
    end loop;

    alter table public.student_scores
      drop constraint if exists student_scores_mark_absent_check;

    alter table public.student_scores
      add constraint student_scores_mark_absent_check
      check (
        mark is null
        or (mark >= 0 and mark <= 100)
      );
  end if;
end;
$$;
