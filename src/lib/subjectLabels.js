export const formatSubjectName = (value) =>
  String(value || '').trim().toLocaleUpperCase('ms-MY')

export const uppercaseSubjectInput = (value) =>
  String(value || '').toLocaleUpperCase('ms-MY')

export const normalizeSubjectRow = (subject) => ({
  ...subject,
  subject_name: formatSubjectName(subject?.subject_name),
  subject_code: subject?.subject_code ? formatSubjectName(subject.subject_code) : subject?.subject_code,
})

export const normalizeSubjectRows = (subjects = []) =>
  (subjects || []).map((subject) => normalizeSubjectRow(subject))
