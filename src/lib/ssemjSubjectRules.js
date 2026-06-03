const SSEMJ_SCHOOL_NAME_KEY = 'SEKOLAHSENIMALAYSIAJOHOR'
const SSEMJ_SCHOOL_CODE_KEYS = new Set(['SSEMJ', 'SSMJ'])

export const normalizeSubjectName = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('ms-MY')
    .replace(/&/g, 'DAN')
    .replace(/[^A-Z0-9]+/g, '')

const CORE_ACADEMIC_SUBJECT_KEYS = new Set(
  [
    'Bahasa Melayu',
    'Bahasa Inggeris',
    'Sejarah',
    'Pendidikan Islam',
    'Pendidikan Moral',
    'Sains',
    'Matematik',
  ].map(normalizeSubjectName)
)

const PJPK_SUBJECT_KEYS = new Set(
  [
    'PJPK',
    'PJK',
    'Pendidikan Jasmani dan Pendidikan Kesihatan',
    'Pendidikan Jasmani Kesihatan',
    'Pendidikan Jasmani',
  ].map(normalizeSubjectName)
)

const getSchoolName = (schoolInfo) =>
  schoolInfo?.school_name ||
  schoolInfo?.schoolName ||
  schoolInfo?.name ||
  schoolInfo?.schools?.school_name ||
  schoolInfo?.school?.school_name ||
  ''

const getSchoolType = (schoolInfo) =>
  schoolInfo?.school_type ||
  schoolInfo?.schoolType ||
  schoolInfo?.type ||
  schoolInfo?.schools?.school_type ||
  schoolInfo?.school?.school_type ||
  ''

const getSchoolCode = (schoolInfo) =>
  schoolInfo?.school_code ||
  schoolInfo?.schoolCode ||
  schoolInfo?.code ||
  schoolInfo?.schools?.school_code ||
  schoolInfo?.school?.school_code ||
  ''

const normalizeExamKey = (examKey) =>
  String(examKey || '').trim().toLocaleUpperCase('ms-MY')

const isEtrExam = (examKey) => normalizeExamKey(examKey) === 'ETR'

export const isSsemjSchool = (schoolInfo) => {
  const schoolNameKey = normalizeSubjectName(getSchoolName(schoolInfo))
  const schoolTypeKey = normalizeSubjectName(getSchoolType(schoolInfo))
  const schoolCodeKey = normalizeSubjectName(getSchoolCode(schoolInfo))
  const isNamedSsemj = schoolNameKey === SSEMJ_SCHOOL_NAME_KEY
  const isCodeSsemj = SSEMJ_SCHOOL_CODE_KEYS.has(schoolCodeKey)

  return isNamedSsemj || (schoolTypeKey === 'SENI' && isCodeSsemj)
}

export const isUpperForm = (tingkatan) => {
  const match = String(tingkatan || '').match(/\d+/)
  const formNumber = match ? Number(match[0]) : null

  return formNumber === 4 || formNumber === 5
}

export const isPjpkSubject = (subjectName) =>
  PJPK_SUBJECT_KEYS.has(normalizeSubjectName(subjectName))

export const isCoreAcademicSubject = (subjectName) =>
  CORE_ACADEMIC_SUBJECT_KEYS.has(normalizeSubjectName(subjectName))

const isSsemjUpperForm = ({ schoolInfo, tingkatan }) =>
  isSsemjSchool(schoolInfo) && isUpperForm(tingkatan)

export const canInputExamMark = ({
  schoolInfo,
  tingkatan,
  subjectName,
  examKey,
}) => {
  if (!isSsemjUpperForm({ schoolInfo, tingkatan })) return true
  if (isEtrExam(examKey)) return true

  return isCoreAcademicSubject(subjectName) || isPjpkSubject(subjectName)
}

export const shouldCountInStudentOverallGp = ({
  schoolInfo,
  tingkatan,
  subjectName,
  examKey,
}) => {
  if (!isSsemjUpperForm({ schoolInfo, tingkatan })) return true
  if (isEtrExam(examKey)) return !isPjpkSubject(subjectName)

  return isCoreAcademicSubject(subjectName)
}

export const shouldCountInSchoolGps = ({
  schoolInfo,
  tingkatan,
  subjectName,
  examKey,
}) => {
  if (!isSsemjUpperForm({ schoolInfo, tingkatan })) return true
  if (isEtrExam(examKey)) {
    return shouldCountInEtrTargetGps({ schoolInfo, tingkatan, subjectName })
  }

  return isCoreAcademicSubject(subjectName)
}

export const shouldShowSubjectGpmp = ({
  schoolInfo,
  tingkatan,
  subjectName,
  examKey,
}) => {
  if (!isSsemjUpperForm({ schoolInfo, tingkatan })) return true
  if (isEtrExam(examKey)) return true

  return isCoreAcademicSubject(subjectName) || isPjpkSubject(subjectName)
}

export const shouldCountInEtrTargetGps = ({
  schoolInfo,
  tingkatan,
  subjectName,
}) => {
  if (!isSsemjUpperForm({ schoolInfo, tingkatan })) return true

  return !isPjpkSubject(subjectName)
}

export const getSubjectRuleName = (subject) =>
  subject?.subject_name || subject?.subject_code || ''
