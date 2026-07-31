import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import readXlsxFile from 'read-excel-file/node'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_WORKBOOK_PATH =
  'G:\\My Drive\\1. SSEM\\12. SU HEADCOUNT\\HC 2025\\HC AKADEMIK\\LAPORAN AKADEMIK\\LAPORAN HC PENGISIAN MARKAH UASA F1-F3 2025.xlsx'

const SOURCE_TO_TARGET_GRADE = new Map([
  ['TINGKATAN 1', 'Tingkatan 2'],
  ['TINGKATAN 2', 'Tingkatan 3'],
  ['TINGKATAN 3', 'Tingkatan 4'],
])

const SOURCE_SHEETS = [...SOURCE_TO_TARGET_GRADE.keys()]
const EXAM_KEY = 'TOV'
const ABSENT_MARK_TEXT = 'TH'

const SUBJECT_ALIASES = new Map([
  ['BAHASA MELAYU', ['BAHASA MELAYU', 'BM']],
  ['BAHASA INGGERIS', ['BAHASA INGGERIS', 'BI']],
  [
    'PENDIDIKAN ISLAM/MORAL',
    [
      'PENDIDIKAN ISLAM/MORAL',
      'PENDIDIKAN ISLAM MORAL',
      'PENDIDIKAN ISLAM',
      'PENDIDIKAN MORAL',
    ],
  ],
  ['SEJARAH', ['SEJARAH']],
  ['MATEMATIK', ['MATEMATIK']],
  ['SAINS', ['SAINS']],
  [
    'PJK',
    [
      'PJK',
      'PJPK',
      'PENDIDIKAN JASMANI',
      'PENDIDIKAN JASMANI KESIHATAN',
      'PENDIDIKAN JASMANI DAN PENDIDIKAN KESIHATAN',
    ],
  ],
  ['SENI MUZIK', ['SENI MUZIK', 'MUZIK']],
  ['SENI TARI', ['SENI TARI', 'TARI']],
  ['SENI TEATER', ['SENI TEATER', 'TEATER']],
  ['SENI VISUAL', ['SENI VISUAL', 'VISUAL']],
])

const CORE_ACADEMIC_SUBJECT_KEYS = new Set(
  [
    'Bahasa Melayu',
    'Bahasa Inggeris',
    'Sejarah',
    'Pendidikan Islam',
    'Pendidikan Moral',
    'Sains',
    'Matematik',
  ].map(normalizeSubjectRuleName)
)

const PJPK_SUBJECT_KEYS = new Set(
  [
    'PJPK',
    'PJK',
    'Pendidikan Jasmani dan Pendidikan Kesihatan',
    'Pendidikan Jasmani Kesihatan',
    'Pendidikan Jasmani',
  ].map(normalizeSubjectRuleName)
)

function parseArgs(argv) {
  const options = {
    workbookPath: DEFAULT_WORKBOOK_PATH,
    apply: false,
    json: false,
    outputDir: path.join(process.env.TEMP || 'C:\\tmp', 'edutrack-uasa-tov-import'),
    enteredBy: '',
    schoolId: process.env.SUPABASE_SCHOOL_ID || '',
    schoolCode: '',
    schoolName: '',
    listSchools: false,
    exportCsvOnly: false,
    csvPath: '',
    includeDisallowedSubjects: false,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--apply') {
      options.apply = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--include-disallowed-subjects') {
      options.includeDisallowedSubjects = true
    } else if (arg === '--file' && next) {
      options.workbookPath = next
      index += 1
    } else if (arg === '--output-dir' && next) {
      options.outputDir = next
      index += 1
    } else if (arg === '--entered-by' && next) {
      options.enteredBy = next
      index += 1
    } else if (arg === '--school-id' && next) {
      options.schoolId = next
      index += 1
    } else if (arg === '--school-code' && next) {
      options.schoolCode = next
      index += 1
    } else if (arg === '--school-name' && next) {
      options.schoolName = next
      index += 1
    } else if (arg === '--list-schools') {
      options.listSchools = true
    } else if (arg === '--export-csv-only') {
      options.exportCsvOnly = true
    } else if (arg === '--csv-path' && next) {
      options.csvPath = next
      index += 1
    } else {
      throw new Error(`Argumen tidak dikenali: ${arg}`)
    }
  }

  return options
}

function readEnvFile(filePath) {
  return fs
    .readFile(filePath, 'utf8')
    .then((text) => {
      const values = {}

      text.split(/\r?\n/).forEach((line) => {
        const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
        if (!match) return

        values[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
      })

      return values
    })
    .catch((error) => {
      if (error.code === 'ENOENT') return {}
      throw error
    })
}

function normalizeSpaces(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeCompareText(value) {
  return normalizeSpaces(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' DAN ')
    .replace(/[_./-]+/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ms-MY')
}

function normalizeSubjectLookupText(value) {
  return normalizeCompareText(value)
}

function normalizeSubjectRuleName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('ms-MY')
    .replace(/&/g, 'DAN')
    .replace(/[^A-Z0-9]+/g, '')
}

function normalizeGradeLabel(value) {
  const normalized = normalizeCompareText(value)
  const match =
    normalized.match(/^(?:tingkatan|tahun|form|ting|f|t)?\s*(\d+)$/) ||
    normalized.match(/\b(?:tingkatan|tahun|form|ting|f|t)\s*(\d+)\b/)

  return match ? `tingkatan ${match[1]}` : normalized
}

function normalizeIc(value) {
  const digits = String(value ?? '')
    .trim()
    .replace(/\D/g, '')

  return digits ? digits.padStart(12, '0') : ''
}

function normalizeSheetName(value) {
  return normalizeSpaces(value).toLocaleUpperCase('ms-MY')
}

function isNumericMark(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= 100
  }

  const text = normalizeSpaces(value)
  if (!text) return false
  if (text.toLocaleUpperCase('ms-MY') === ABSENT_MARK_TEXT) return false

  const mark = Number(text)
  return Number.isFinite(mark) && mark >= 0 && mark <= 100
}

function toNumericMark(value) {
  return typeof value === 'number' ? value : Number(normalizeSpaces(value))
}

function normalizeSubject(subject) {
  return {
    ...subject,
    subject_name: normalizeSpaces(subject.subject_name).toLocaleUpperCase('ms-MY'),
    subject_code: subject.subject_code
      ? normalizeSpaces(subject.subject_code).toLocaleUpperCase('ms-MY')
      : subject.subject_code,
  }
}

function subjectTypeIsSelective(subject) {
  return normalizeSpaces(subject?.subject_type).toLocaleLowerCase('ms-MY') === 'selective'
}

function isSsemjSchool(schoolInfo) {
  const schoolNameKey = normalizeSubjectRuleName(schoolInfo?.school_name)
  const schoolTypeKey = normalizeSubjectRuleName(schoolInfo?.school_type)
  const schoolCodeKey = normalizeSubjectRuleName(schoolInfo?.school_code)

  return (
    schoolNameKey === 'SEKOLAHSENIMALAYSIAJOHOR' ||
    schoolCodeKey === 'SSEMJ' ||
    schoolCodeKey === 'SSMJ' ||
    (schoolTypeKey === 'SENI' && (schoolCodeKey === 'SSEMJ' || schoolCodeKey === 'SSMJ'))
  )
}

function isUpperForm(tingkatan) {
  const match = String(tingkatan || '').match(/\d+/)
  const formNumber = match ? Number(match[0]) : null

  return formNumber === 4 || formNumber === 5
}

function canInputExamMark({ schoolInfo, tingkatan, subjectName, includeDisallowedSubjects }) {
  if (includeDisallowedSubjects) return true
  if (!isSsemjSchool(schoolInfo) || !isUpperForm(tingkatan)) return true

  const subjectKey = normalizeSubjectRuleName(subjectName)
  return CORE_ACADEMIC_SUBJECT_KEYS.has(subjectKey) || PJPK_SUBJECT_KEYS.has(subjectKey)
}

function findGradeFromMark(mark, gradeScales = []) {
  const numericMark = Number(mark)
  if (!Number.isFinite(numericMark)) return { grade_name: null, grade_point: null }

  const matched = gradeScales.find((grade) => {
    const gradeName = normalizeSpaces(grade.grade_name ?? grade.grade).toLocaleUpperCase('ms-MY')
    if (gradeName === ABSENT_MARK_TEXT) return false

    const min = Number(grade.min_mark ?? grade.min_score ?? 0)
    const max = Number(grade.max_mark ?? grade.max_score ?? 100)
    return numericMark >= min && numericMark <= max
  })

  if (!matched) return { grade_name: null, grade_point: null }

  return {
    grade_name: matched.grade_name ?? matched.grade ?? null,
    grade_point: matched.grade_point ?? matched.point_value ?? matched.grade_value ?? null,
  }
}

async function readWorkbookRows(workbookPath) {
  const sheets = await readXlsxFile(workbookPath, { sheets: SOURCE_SHEETS })
  const sourceSheets = Array.isArray(sheets) ? sheets : []
  const rows = []
  const summary = []

  for (const sheet of sourceSheets) {
    const sheetName = normalizeSheetName(sheet.sheet)
    const targetGrade = SOURCE_TO_TARGET_GRADE.get(sheetName)
    if (!targetGrade) continue

    const [headers = [], ...dataRows] = sheet.data || []
    const headerByIndex = headers.map((header) => normalizeSpaces(header))
    const subjectColumns = headerByIndex
      .map((header, index) => ({ header, index }))
      .filter(({ header, index }) => index >= 6 && header)

    let sourceStudentCount = 0
    let sourceNumericMarks = 0
    let sourceBlankMarks = 0
    let sourceNonNumericMarks = 0

    dataRows.forEach((row, rowIndex) => {
      const sourceName = normalizeSpaces(row[3])
      const sourceIc = normalizeIc(row[1])
      const sourceClass = normalizeSpaces(row[4])
      const sourceField = normalizeSpaces(row[5])

      if (!sourceName && !sourceIc) return

      sourceStudentCount += 1

      subjectColumns.forEach(({ header, index }) => {
        const rawMark = row[index]
        const base = {
          source_sheet: sheetName,
          source_row: rowIndex + 2,
          source_grade: sheetName.replace('TINGKATAN', 'Tingkatan').replace(/\s+/, ' '),
          target_grade: targetGrade,
          source_ic: sourceIc,
          source_name: sourceName,
          source_class: sourceClass,
          source_field: sourceField,
          subject_header: header,
          raw_mark: rawMark,
        }

        if (rawMark === null || rawMark === undefined || normalizeSpaces(rawMark) === '') {
          sourceBlankMarks += 1
          rows.push({ ...base, status: 'blank_mark' })
          return
        }

        if (!isNumericMark(rawMark)) {
          sourceNonNumericMarks += 1
          rows.push({ ...base, status: 'non_numeric_mark' })
          return
        }

        sourceNumericMarks += 1
        rows.push({ ...base, status: 'numeric_mark', mark: toNumericMark(rawMark) })
      })
    })

    summary.push({
      sheet: sheetName,
      target_grade: targetGrade,
      source_students: sourceStudentCount,
      numeric_marks: sourceNumericMarks,
      blank_marks: sourceBlankMarks,
      non_numeric_marks: sourceNonNumericMarks,
      subject_headers: subjectColumns.map((column) => column.header),
    })
  }

  return { rows, summary }
}

function buildSubjectIndexes(subjects) {
  const byGradeAndAlias = new Map()

  subjects.forEach((subject) => {
    const gradeKey = normalizeGradeLabel(subject.tingkatan)
    const names = [subject.subject_name, subject.subject_code].filter(Boolean)

    names.forEach((name) => {
      const key = `${gradeKey}__${normalizeSubjectLookupText(name)}`
      if (!byGradeAndAlias.has(key)) byGradeAndAlias.set(key, [])
      byGradeAndAlias.get(key).push(subject)
    })
  })

  return { byGradeAndAlias }
}

function getSubjectAliases(sourceHeader) {
  const normalizedHeader = normalizeSpaces(sourceHeader).toLocaleUpperCase('ms-MY')
  return SUBJECT_ALIASES.get(normalizedHeader) || [normalizedHeader]
}

function resolveSubject({ sourceHeader, targetGrade, subjectsIndex, enrolledSubjectIds }) {
  const gradeKey = normalizeGradeLabel(targetGrade)
  const candidates = []
  const seenSubjectIds = new Set()

  getSubjectAliases(sourceHeader).forEach((alias) => {
    const key = `${gradeKey}__${normalizeSubjectLookupText(alias)}`
    const matchedSubjects = subjectsIndex.byGradeAndAlias.get(key) || []

    matchedSubjects.forEach((subject) => {
      if (seenSubjectIds.has(subject.id)) return
      seenSubjectIds.add(subject.id)
      candidates.push(subject)
    })
  })

  if (candidates.length <= 1) return candidates[0] || null

  const enrolledCandidates = candidates.filter((subject) => enrolledSubjectIds.has(String(subject.id)))
  if (enrolledCandidates.length === 1) return enrolledCandidates[0]

  const coreCandidates = candidates.filter((subject) => subject.is_core === true)
  if (coreCandidates.length === 1) return coreCandidates[0]

  return {
    ambiguous: true,
    candidates,
  }
}

function buildEnrollmentIndexes(classes, enrollments) {
  const classById = new Map(classes.map((item) => [String(item.id), item]))
  const byTargetGradeAndIc = new Map()
  const byTargetGradeAndName = new Map()

  enrollments.forEach((enrollment) => {
    const classRow = classById.get(String(enrollment.class_id))
    const studentProfile = enrollment.student_profiles
    if (!classRow || !studentProfile) return

    const gradeKey = normalizeGradeLabel(classRow.tingkatan)
    const icKey = `${gradeKey}__${normalizeIc(studentProfile.ic_number)}`
    const nameKey = `${gradeKey}__${normalizeCompareText(studentProfile.full_name)}`
    const bundle = { enrollment, classRow, studentProfile }

    if (normalizeIc(studentProfile.ic_number)) byTargetGradeAndIc.set(icKey, bundle)

    if (!byTargetGradeAndName.has(nameKey)) byTargetGradeAndName.set(nameKey, [])
    byTargetGradeAndName.get(nameKey).push(bundle)
  })

  return { byTargetGradeAndIc, byTargetGradeAndName }
}

function resolveEnrollment({ row, enrollmentIndexes }) {
  const gradeKey = normalizeGradeLabel(row.target_grade)
  const sourceIc = normalizeIc(row.source_ic)

  if (sourceIc) {
    const byIc = enrollmentIndexes.byTargetGradeAndIc.get(`${gradeKey}__${sourceIc}`)
    if (byIc) return byIc
  }

  const nameCandidates =
    enrollmentIndexes.byTargetGradeAndName.get(`${gradeKey}__${normalizeCompareText(row.source_name)}`) ||
    []

  if (nameCandidates.length === 1) return nameCandidates[0]
  if (nameCandidates.length > 1) return { ambiguousName: true, candidates: nameCandidates }

  return null
}

function summarizeBy(items, key) {
  return items.reduce((acc, item) => {
    const value = typeof key === 'function' ? key(item) : item[key]
    const label = value || 'unknown'
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})
}

function buildContextSummary(context) {
  const classById = new Map(context.classes.map((item) => [String(item.id), item]))

  return {
    allClassesByYear: summarizeBy(context.allClasses, (item) => item.academic_year),
    allEnrollmentsByYear: summarizeBy(context.allEnrollments, (item) => item.academic_year),
    activeClassesByYear: summarizeBy(
      context.allClasses.filter((item) => item.is_active === true),
      (item) => item.academic_year
    ),
    activeEnrollmentsByYear: summarizeBy(
      context.allEnrollments.filter((item) => item.is_active === true),
      (item) => item.academic_year
    ),
    classesByGrade: summarizeBy(context.classes, (item) => item.tingkatan),
    subjectsByGrade: summarizeBy(context.subjects, (item) => item.tingkatan),
    enrollmentsByGrade: summarizeBy(context.enrollments, (item) => {
      const classRow = classById.get(String(item.class_id))
      return classRow?.tingkatan || 'unknown'
    }),
    activeTovExamConfigsByGrade: summarizeBy(
      context.examConfigs.filter((item) => item.is_active !== false),
      (item) => item.grade_label
    ),
    adminProfilesAvailable: context.importerProfiles.length,
  }
}

function compactSkippedSamples(items, status, limit = 15) {
  return items
    .filter((item) => item.status === status)
    .slice(0, limit)
    .map((item) => ({
      source_sheet: item.source_sheet,
      source_row: item.source_row,
      target_grade: item.target_grade,
      source_name: item.source_name,
      source_ic: item.source_ic,
      subject_header: item.subject_header,
      raw_mark: item.raw_mark,
      reason: item.reason,
    }))
}

async function fetchAll(queryBuilder, chunkSize = 1000) {
  const rows = []
  let from = 0

  while (true) {
    const to = from + chunkSize - 1
    const { data, error } = await queryBuilder().range(from, to)
    if (error) throw error

    rows.push(...(data || []))
    if (!data || data.length < chunkSize) break

    from += chunkSize
  }

  return rows
}

async function listSchools({ supabase }) {
  return fetchAll(() =>
    supabase
      .from('schools')
      .select('id, school_name, school_code, school_type')
      .order('school_name', { ascending: true })
  )
}

function selectSchool({ schools, schoolId, schoolCode, schoolName }) {
  let candidates = schools || []

  if (schoolId) {
    candidates = candidates.filter((school) => String(school.id) === String(schoolId))
  }

  if (schoolCode) {
    const normalizedCode = normalizeSubjectRuleName(schoolCode)
    candidates = candidates.filter(
      (school) => normalizeSubjectRuleName(school.school_code) === normalizedCode
    )
  }

  if (schoolName) {
    const normalizedName = normalizeCompareText(schoolName)
    candidates = candidates.filter((school) =>
      normalizeCompareText(school.school_name).includes(normalizedName)
    )
  }

  if (candidates.length === 1) return candidates[0]

  if (candidates.length === 0) {
    throw new Error('Tiada sekolah sepadan. Jalankan --list-schools dan pilih --school-id.')
  }

  throw new Error(
    `Lebih daripada satu sekolah boleh diakses (${candidates.length}). Jalankan --list-schools dan pilih --school-id.`
  )
}

async function loadContext({ supabase, schoolId, schoolCode, schoolName, academicYear }) {
  let schoolQuery = supabase
    .from('schools')
    .select('id, school_name, school_code, school_type')

  if (schoolId) schoolQuery = schoolQuery.eq('id', schoolId)
  if (schoolCode) schoolQuery = schoolQuery.eq('school_code', schoolCode)
  if (schoolName) schoolQuery = schoolQuery.ilike('school_name', `%${schoolName}%`)

  const { data: schools, error: schoolError } = await schoolQuery
  if (schoolError) throw schoolError
  if (!schools?.length) throw new Error('Tiada sekolah ditemui melalui akses Supabase semasa.')

  const school = selectSchool({ schools, schoolId, schoolCode, schoolName })

  const { data: setupRows, error: setupError } = await supabase
    .from('school_setup_configs')
    .select('current_academic_year, exam_structure, active_grade_labels')
    .eq('school_id', school.id)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (setupError) throw setupError

  const setupConfig = setupRows?.[0] || null
  const currentAcademicYear =
    academicYear || setupConfig?.current_academic_year || new Date().getFullYear()

  const [
    allClasses,
    allEnrollments,
    classes,
    subjects,
    gradeScales,
    enrollments,
    subjectEnrollments,
    examConfigs,
    importerProfiles,
  ] = await Promise.all([
    fetchAll(() =>
      supabase
        .from('classes')
        .select('id, class_name, tingkatan, academic_year, is_active')
        .eq('school_id', school.id)
        .order('academic_year', { ascending: false })
        .order('tingkatan', { ascending: true })
    ),
    fetchAll(() =>
      supabase
        .from('student_enrollments')
        .select('id, class_id, academic_year, is_active')
        .eq('school_id', school.id)
        .order('academic_year', { ascending: false })
    ),
    fetchAll(() =>
      supabase
        .from('classes')
        .select('id, class_name, tingkatan, academic_year, is_active')
        .eq('school_id', school.id)
        .eq('academic_year', currentAcademicYear)
        .eq('is_active', true)
        .order('tingkatan', { ascending: true })
        .order('class_name', { ascending: true })
    ),
    fetchAll(() =>
      supabase
        .from('subjects')
        .select('id, subject_name, subject_code, tingkatan, subject_type, is_core')
        .eq('school_id', school.id)
        .eq('is_active', true)
        .order('tingkatan', { ascending: true })
        .order('subject_name', { ascending: true })
    ),
    fetchAll(() =>
      supabase
        .from('grade_scales')
        .select('*')
        .eq('school_id', school.id)
        .eq('academic_year', currentAcademicYear)
    ),
    fetchAll(() =>
      supabase
        .from('student_enrollments')
        .select(
          `
          id,
          class_id,
          student_profile_id,
          academic_year,
          is_active,
          student_profiles (
            id,
            full_name,
            ic_number
          )
        `
        )
        .eq('school_id', school.id)
        .eq('academic_year', currentAcademicYear)
        .eq('is_active', true)
    ),
    fetchAll(() =>
      supabase
        .from('student_subject_enrollments')
        .select('student_enrollment_id, subject_id, academic_year, is_active')
        .eq('school_id', school.id)
        .eq('academic_year', currentAcademicYear)
        .eq('is_active', true)
    ),
    fetchAll(() =>
      supabase
        .from('exam_configs')
        .select('id, grade_label, exam_key, exam_name, is_active')
        .eq('school_id', school.id)
        .eq('academic_year', currentAcademicYear)
        .eq('exam_key', EXAM_KEY)
    ),
    fetchAll(() =>
      supabase
        .from('profiles')
        .select('id, school_id, role, is_school_admin')
        .eq('school_id', school.id)
        .or('role.eq.school_admin,is_school_admin.eq.true')
        .limit(5)
    ),
  ])

  return {
    school,
    setupConfig,
    academicYear: currentAcademicYear,
    allClasses,
    allEnrollments,
    classes,
    subjects: subjects.map(normalizeSubject),
    gradeScales,
    enrollments,
    subjectEnrollments,
    examConfigs,
    importerProfiles,
  }
}

function buildImportPlan({ sourceRows, context, options }) {
  const subjectsIndex = buildSubjectIndexes(context.subjects)
  const enrollmentIndexes = buildEnrollmentIndexes(context.classes, context.enrollments)
  const subjectEnrollmentMap = new Map()
  const examConfigByGrade = new Map()
  const rows = []
  const upserts = []

  context.subjectEnrollments.forEach((enrollment) => {
    const key = String(enrollment.student_enrollment_id)
    if (!subjectEnrollmentMap.has(key)) subjectEnrollmentMap.set(key, new Set())
    subjectEnrollmentMap.get(key).add(String(enrollment.subject_id))
  })

  context.examConfigs.forEach((examConfig) => {
    const key = normalizeGradeLabel(examConfig.grade_label)
    if (normalizeSpaces(examConfig.exam_key).toLocaleUpperCase('ms-MY') !== EXAM_KEY) return
    if (examConfig.is_active === false) return
    examConfigByGrade.set(key, examConfig)
  })

  const fallbackEnteredBy = options.enteredBy || context.importerProfiles?.[0]?.id || null

  sourceRows.forEach((sourceRow) => {
    const planned = { ...sourceRow }

    if (sourceRow.status !== 'numeric_mark') {
      planned.reason =
        sourceRow.status === 'blank_mark'
          ? 'Sel markah kosong.'
          : `Nilai markah bukan nombor: ${normalizeSpaces(sourceRow.raw_mark) || '(kosong)'}.`
      rows.push(planned)
      return
    }

    const matchedBundle = resolveEnrollment({ row: sourceRow, enrollmentIndexes })

    if (!matchedBundle) {
      rows.push({
        ...planned,
        status: 'skipped_student_not_found',
        reason: 'Murid tidak ditemui dalam EduTrack untuk tingkatan semasa.',
      })
      return
    }

    if (matchedBundle.ambiguousName) {
      rows.push({
        ...planned,
        status: 'skipped_ambiguous_student_name',
        reason: 'Nama murid berpadanan lebih daripada sekali dan IC tidak membantu.',
      })
      return
    }

    const enrolledSubjectIds =
      subjectEnrollmentMap.get(String(matchedBundle.enrollment.id)) || new Set()
    const matchedSubject = resolveSubject({
      sourceHeader: sourceRow.subject_header,
      targetGrade: matchedBundle.classRow.tingkatan,
      subjectsIndex,
      enrolledSubjectIds,
    })

    if (!matchedSubject) {
      rows.push({
        ...planned,
        status: 'skipped_subject_not_found',
        matched_student_name: matchedBundle.studentProfile.full_name,
        matched_class: `${matchedBundle.classRow.tingkatan} ${matchedBundle.classRow.class_name}`.trim(),
        reason: 'Subjek laporan tidak ditemui dalam senarai subjek aktif EduTrack.',
      })
      return
    }

    if (matchedSubject.ambiguous) {
      rows.push({
        ...planned,
        status: 'skipped_ambiguous_subject',
        matched_student_name: matchedBundle.studentProfile.full_name,
        matched_class: `${matchedBundle.classRow.tingkatan} ${matchedBundle.classRow.class_name}`.trim(),
        reason: `Subjek boleh jadi: ${matchedSubject.candidates
          .map((subject) => subject.subject_name)
          .join(', ')}.`,
      })
      return
    }

    if (
      subjectTypeIsSelective(matchedSubject) &&
      !enrolledSubjectIds.has(String(matchedSubject.id))
    ) {
      rows.push({
        ...planned,
        status: 'skipped_subject_not_enrolled',
        matched_student_name: matchedBundle.studentProfile.full_name,
        matched_class: `${matchedBundle.classRow.tingkatan} ${matchedBundle.classRow.class_name}`.trim(),
        matched_subject: matchedSubject.subject_name,
        reason: 'Murid tidak didaftarkan untuk subjek elektif/seni ini.',
      })
      return
    }

    if (
      !canInputExamMark({
        schoolInfo: context.school,
        tingkatan: matchedBundle.classRow.tingkatan,
        subjectName: matchedSubject.subject_name || matchedSubject.subject_code,
        includeDisallowedSubjects: options.includeDisallowedSubjects,
      })
    ) {
      rows.push({
        ...planned,
        status: 'skipped_subject_not_allowed_for_exam',
        matched_student_name: matchedBundle.studentProfile.full_name,
        matched_class: `${matchedBundle.classRow.tingkatan} ${matchedBundle.classRow.class_name}`.trim(),
        matched_subject: matchedSubject.subject_name,
        reason: 'Subjek ini tidak dibenarkan untuk input markah peperiksaan TOV bagi tingkatan semasa.',
      })
      return
    }

    const examConfig = examConfigByGrade.get(normalizeGradeLabel(matchedBundle.classRow.tingkatan))

    if (!examConfig?.id) {
      rows.push({
        ...planned,
        status: 'skipped_exam_not_active',
        matched_student_name: matchedBundle.studentProfile.full_name,
        matched_class: `${matchedBundle.classRow.tingkatan} ${matchedBundle.classRow.class_name}`.trim(),
        matched_subject: matchedSubject.subject_name,
        reason: 'Peperiksaan TOV belum dibuka/aktif untuk tingkatan semasa.',
      })
      return
    }

    const gradeScalesForTingkatan = context.gradeScales.filter((grade) => {
      const label = grade.tingkatan ?? grade.grade_label ?? grade.form_level ?? grade.level ?? ''
      return normalizeGradeLabel(label) === normalizeGradeLabel(matchedBundle.classRow.tingkatan)
    })
    const gradeInfo = findGradeFromMark(sourceRow.mark, gradeScalesForTingkatan)
    const upsert = {
      school_id: context.school.id,
      academic_year: context.academicYear,
      class_id: matchedBundle.classRow.id,
      student_enrollment_id: matchedBundle.enrollment.id,
      student_profile_id: matchedBundle.enrollment.student_profile_id,
      subject_id: matchedSubject.id,
      exam_config_id: examConfig.id,
      exam_key: EXAM_KEY,
      mark: sourceRow.mark,
      grade_name: gradeInfo.grade_name,
      grade_point: gradeInfo.grade_point,
      is_absent: false,
      remarks: 'Diimport daripada UASA 2025 sebagai TOV.',
      entered_by: fallbackEnteredBy,
      verified_by: null,
      verified_at: null,
      updated_at: new Date().toISOString(),
    }

    rows.push({
      ...planned,
      status: 'ready',
      matched_student_name: matchedBundle.studentProfile.full_name,
      matched_student_ic: normalizeIc(matchedBundle.studentProfile.ic_number),
      matched_class: `${matchedBundle.classRow.tingkatan} ${matchedBundle.classRow.class_name}`.trim(),
      matched_subject: matchedSubject.subject_name,
      grade_name: gradeInfo.grade_name,
      grade_point: gradeInfo.grade_point,
    })
    upserts.push(upsert)
  })

  return { rows, upserts, enteredBy: fallbackEnteredBy }
}

async function writeReport({ outputDir, report }) {
  await fs.mkdir(outputDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(outputDir, `uasa-2025-tov-${timestamp}.json`)

  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return reportPath
}

async function upsertScores({ supabase, rows }) {
  const chunkSize = 500
  let saved = 0

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const { error } = await supabase.from('student_scores').upsert(chunk, {
      onConflict: 'student_enrollment_id,subject_id,academic_year,exam_key',
    })

    if (error) throw error
    saved += chunk.length
  }

  return saved
}

function printHumanSummary(report) {
  console.log(`Mode: ${report.apply ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Sekolah: ${report.school.school_name || report.school.id}`)
  console.log(`Tahun akademik EduTrack: ${report.academicYear}`)
  console.log(`Workbook: ${report.workbookPath}`)
  console.log(`Semua kelas ikut tahun: ${Object.entries(report.contextSummary.allClassesByYear)
    .map(([year, count]) => `${year}=${count}`)
    .join(', ') || '-'}`)
  console.log(`Semua enrollment ikut tahun: ${Object.entries(report.contextSummary.allEnrollmentsByYear)
    .map(([year, count]) => `${year}=${count}`)
    .join(', ') || '-'}`)
  console.log(`Kelas aktif ikut tahun: ${Object.entries(report.contextSummary.activeClassesByYear)
    .map(([year, count]) => `${year}=${count}`)
    .join(', ') || '-'}`)
  console.log(`Enrollment aktif ikut tahun: ${Object.entries(report.contextSummary.activeEnrollmentsByYear)
    .map(([year, count]) => `${year}=${count}`)
    .join(', ') || '-'}`)
  console.log(`Kelas aktif: ${Object.entries(report.contextSummary.classesByGrade)
    .map(([grade, count]) => `${grade}=${count}`)
    .join(', ') || '-'}`)
  console.log(`Enrollment aktif: ${Object.entries(report.contextSummary.enrollmentsByGrade)
    .map(([grade, count]) => `${grade}=${count}`)
    .join(', ') || '-'}`)
  console.log(`TOV aktif: ${Object.entries(report.contextSummary.activeTovExamConfigsByGrade)
    .map(([grade, count]) => `${grade}=${count}`)
    .join(', ') || '-'}`)
  console.log('')
  console.log('Ringkasan sumber:')
  report.workbookSummary.forEach((item) => {
    console.log(
      `- ${item.sheet} -> ${item.target_grade}: ${item.source_students} murid, ${item.numeric_marks} markah bernombor, ${item.blank_marks} kosong, ${item.non_numeric_marks} bukan nombor`
    )
  })
  console.log('')
  console.log('Ringkasan padanan/import:')
  Object.entries(report.statusCounts).forEach(([status, count]) => {
    console.log(`- ${status}: ${count}`)
  })
  console.log('')
  console.log(`Jumlah markah ${report.apply ? 'disimpan' : 'sedia untuk import'}: ${report.savedCount}`)
  console.log(`Laporan audit: ${report.reportPath}`)
}

function escapeCsvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function formatMarkForCsv(value) {
  const numberValue = Number(value)
  return Number.isInteger(numberValue) ? String(numberValue) : String(numberValue)
}

function formatIcForCsv(value) {
  const normalizedIc = normalizeIc(value)
  return normalizedIc ? `="${normalizedIc}"` : normalizeSpaces(value)
}

async function exportLegacyCsv({ workbookData, options }) {
  const csvPath =
    options.csvPath ||
    path.join(process.cwd(), 'outputs', 'uasa-2025-as-tov-edutrack-import.csv')
  const rows = workbookData.rows
    .filter((row) => row.status === 'numeric_mark')
    .map((row) => [
      row.target_grade,
      formatIcForCsv(row.source_ic),
      row.source_name,
      row.subject_header,
      EXAM_KEY,
      formatMarkForCsv(row.mark),
    ])

  const headers = ['tingkatan', 'no_ic', 'nama_murid', 'subjek', 'jenis_peperiksaan', 'markah']
  const csv = [
    headers.map(escapeCsvValue).join(','),
    ...rows.map((row) => row.map(escapeCsvValue).join(',')),
  ].join('\r\n')

  await fs.mkdir(path.dirname(csvPath), { recursive: true })
  await fs.writeFile(csvPath, `\uFEFF${csv}\r\n`, 'utf8')

  return { csvPath, rowCount: rows.length }
}

async function main() {
  const options = parseArgs(process.argv)
  const envFile = await readEnvFile(path.join(process.cwd(), '.env'))
  const supabaseUrl = process.env.SUPABASE_URL || envFile.VITE_SUPABASE_URL
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    envFile.VITE_SUPABASE_ANON_KEY
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN || ''
  const academicYear = process.env.EDUTRACK_ACADEMIC_YEAR
    ? Number(process.env.EDUTRACK_ACADEMIC_YEAR)
    : null

  if (!supabaseUrl || !supabaseKey) {
    if (!options.exportCsvOnly) {
      throw new Error('VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY tidak ditemui dalam .env.')
    }
  }

  if (options.exportCsvOnly) {
    const workbookData = await readWorkbookRows(options.workbookPath)
    const exportResult = await exportLegacyCsv({ workbookData, options })

    console.log(`CSV import EduTrack berjaya dijana: ${exportResult.csvPath}`)
    console.log(`Jumlah baris markah bernombor: ${exportResult.rowCount}`)
    workbookData.summary.forEach((item) => {
      console.log(
        `- ${item.sheet} -> ${item.target_grade}: ${item.numeric_marks} markah masuk CSV, ${item.blank_marks} kosong, ${item.non_numeric_marks} bukan nombor`
      )
    })
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  })

  if (options.listSchools) {
    const schools = await listSchools({ supabase })
    console.log(JSON.stringify(schools, null, 2))
    return
  }

  const [workbookData, context] = await Promise.all([
    readWorkbookRows(options.workbookPath),
    loadContext({
      supabase,
      schoolId: options.schoolId,
      schoolCode: options.schoolCode,
      schoolName: options.schoolName,
      academicYear,
    }),
  ])

  const plan = buildImportPlan({
    sourceRows: workbookData.rows,
    context,
    options,
  })
  const statusCounts = summarizeBy(plan.rows, 'status')
  let savedCount = plan.upserts.length

  if (options.apply) {
    savedCount = await upsertScores({ supabase, rows: plan.upserts })
  }

  const report = {
    apply: options.apply,
    workbookPath: options.workbookPath,
    school: context.school,
    academicYear: context.academicYear,
    contextSummary: buildContextSummary(context),
    sourceToTargetGrade: Object.fromEntries(SOURCE_TO_TARGET_GRADE),
    workbookSummary: workbookData.summary,
    statusCounts,
    byTargetGradeReady: summarizeBy(
      plan.rows.filter((row) => row.status === 'ready'),
      'target_grade'
    ),
    bySubjectReady: summarizeBy(
      plan.rows.filter((row) => row.status === 'ready'),
      'matched_subject'
    ),
    enteredBy: plan.enteredBy,
    savedCount,
    skippedSamples: {
      studentNotFound: compactSkippedSamples(plan.rows, 'skipped_student_not_found'),
      blankMark: compactSkippedSamples(plan.rows, 'blank_mark'),
      nonNumericMark: compactSkippedSamples(plan.rows, 'non_numeric_mark'),
      subjectNotFound: compactSkippedSamples(plan.rows, 'skipped_subject_not_found'),
      subjectNotEnrolled: compactSkippedSamples(plan.rows, 'skipped_subject_not_enrolled'),
      subjectNotAllowedForExam: compactSkippedSamples(
        plan.rows,
        'skipped_subject_not_allowed_for_exam'
      ),
      ambiguousSubject: compactSkippedSamples(plan.rows, 'skipped_ambiguous_subject'),
      inactiveExam: compactSkippedSamples(plan.rows, 'skipped_exam_not_active'),
    },
    rows: plan.rows,
  }

  const reportPath = await writeReport({ outputDir: options.outputDir, report })
  report.reportPath = reportPath
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printHumanSummary(report)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
