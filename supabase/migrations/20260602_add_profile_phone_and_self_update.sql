-- Add optional user contact phone and a narrow self-profile update RPC.
-- Safe to rerun.

alter table public.profiles
add column if not exists phone text;

create or replace function public.update_my_profile(
  profile_full_name text,
  profile_designation text,
  profile_phone text
)
returns table (
  id uuid,
  full_name text,
  email text,
  designation text,
  phone text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
    update public.profiles p
    set
      full_name = nullif(btrim(coalesce(profile_full_name, '')), ''),
      designation = nullif(btrim(coalesce(profile_designation, '')), ''),
      phone = nullif(btrim(coalesce(profile_phone, '')), ''),
      updated_at = now()
    where p.id = auth.uid()
    returning p.id, p.full_name, p.email, p.designation, p.phone;

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text) to authenticated;
