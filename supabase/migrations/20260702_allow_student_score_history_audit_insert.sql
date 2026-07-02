-- Allow student_scores audit trigger to insert score history rows.
-- Run this if student_scores upsert fails with:
-- "new row violates row-level security policy for table student_score_history".
--
-- The audit table is written by a trigger during authenticated mark entry.
-- Some deployed databases have a student_score_history shape that does not
-- include school_id/student_score_id, so the stricter policy migration cannot
-- always infer school membership. This narrow insert policy unblocks the audit
-- trigger while keeping read/update/delete behavior controlled by existing
-- grants and policies.

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'student_score_history'
  ) then
    raise notice 'student_score_history table does not exist; skipping audit insert policy.';
    return;
  end if;

  execute 'alter table public.student_score_history enable row level security';
  execute 'grant insert on public.student_score_history to authenticated';

  execute 'drop policy if exists "Authenticated users can insert score audit history" on public.student_score_history';

  execute $policy$
    create policy "Authenticated users can insert score audit history"
    on public.student_score_history
    for insert
    to authenticated
    with check (true)
  $policy$;
end;
$$;
