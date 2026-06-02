const normalizeGender = (value) =>
  String(value || '').trim().toLocaleUpperCase('ms-MY')

export const getStudentGenderRank = (gender) => {
  const normalized = normalizeGender(gender)

  if (normalized === 'LELAKI' || normalized === 'L' || normalized === 'MALE') return 1
  if (normalized === 'PEREMPUAN' || normalized === 'P' || normalized === 'FEMALE') return 2

  return 3
}

export const compareStudentsByGenderThenName = (studentA, studentB) => {
  const genderCompare =
    getStudentGenderRank(studentA?.gender) - getStudentGenderRank(studentB?.gender)

  if (genderCompare !== 0) return genderCompare

  return String(studentA?.full_name || '').localeCompare(String(studentB?.full_name || ''), 'ms', {
    sensitivity: 'base',
  })
}
