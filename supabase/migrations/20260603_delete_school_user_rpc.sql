-- Allow an approved school admin to delete a non-admin user from their own school.
-- Safe to rerun.

create or replace function public.delete_school_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requester public.profiles%rowtype;
  target_user public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into requester
  from public.profiles
  where id = auth.uid();

  if requester.id is null then
    raise exception 'Profil admin tidak ditemui.';
  end if;

  if requester.is_active is not true
    or requester.approval_status <> 'approved'
    or (
      requester.is_school_admin is not true
      and requester.role <> 'school_admin'
    )
  then
    raise exception 'Hanya admin sekolah aktif boleh padam pengguna.';
  end if;

  select *
    into target_user
  from public.profiles
  where id = target_user_id
  for update;

  if target_user.id is null then
    raise exception 'Pengguna tidak ditemui.';
  end if;

  if target_user.id = requester.id then
    raise exception 'Admin sekolah tidak boleh padam akaun sendiri.';
  end if;

  if target_user.school_id is distinct from requester.school_id then
    raise exception 'Admin sekolah hanya boleh padam pengguna sekolah sendiri.';
  end if;

  if target_user.is_master_admin is true or target_user.role = 'master_admin' then
    raise exception 'Akaun master admin tidak boleh dipadam oleh admin sekolah.';
  end if;

  if target_user.is_school_admin is true or target_user.role = 'school_admin' then
    raise exception 'Akaun admin sekolah tidak boleh dipadam terus.';
  end if;

  delete from public.profiles
  where id = target_user_id;

  delete from auth.users
  where id = target_user_id;
end;
$$;

revoke all on function public.delete_school_user(uuid) from public;
grant execute on function public.delete_school_user(uuid) to authenticated;
