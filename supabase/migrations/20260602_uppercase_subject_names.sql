update public.subjects
set
  subject_name = upper(trim(subject_name)),
  subject_code = nullif(upper(trim(coalesce(subject_code, ''))), '')
where subject_name is not null
  and (
    subject_name <> upper(trim(subject_name))
    or coalesce(subject_code, '') <> coalesce(nullif(upper(trim(coalesce(subject_code, ''))), ''), '')
  );
