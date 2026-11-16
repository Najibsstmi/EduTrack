export const DEFAULT_MINIMUM_GRADE = 'C'

export const RPM_SUBJECT_CONFIG = [
  {
    key: 'bm',
    label: 'Bahasa Melayu',
    shortLabel: 'BM',
    aliases: ['BM', 'BAHASA MELAYU', 'BAHASA MALAYSIA', '1103'],
  },
  {
    key: 'bi',
    label: 'Bahasa Inggeris',
    shortLabel: 'BI',
    aliases: ['BI', 'BAHASA INGGERIS', 'ENGLISH', '1119'],
  },
  {
    key: 'matematik',
    label: 'Matematik',
    shortLabel: 'Matematik',
    aliases: ['MATEMATIK', 'MATHEMATICS', 'MATH', '1449'],
  },
  {
    key: 'sejarah',
    label: 'Sejarah',
    shortLabel: 'Sejarah',
    aliases: ['SEJARAH', 'HISTORY', '1249'],
  },
]

const FALLBACK_GRADE_ORDER = [
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'D',
  'E',
  'F',
  'G',
]

export const normalizeGrade = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[−–—]/g, '-')

export const normalizeSubjectToken = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const getSubjectTokens = (subject = {}) =>
  [
    subject.subject_code,
    subject.code,
    subject.subject_name,
    subject.name,
    subject.subject_label,
  ]
    .map(normalizeSubjectToken)
    .filter(Boolean)

export const getRpmSubjectKey = (subject, config = RPM_SUBJECT_CONFIG) => {
  const tokens = getSubjectTokens(subject)

  return (
    config.find((item) => {
      const aliases = (item.aliases || []).map(normalizeSubjectToken)
      return tokens.some((token) => aliases.includes(token))
    })?.key || null
  )
}

export const buildRpmSubjectMap = (subjects = [], config = RPM_SUBJECT_CONFIG) => {
  const result = Object.fromEntries(config.map((item) => [item.key, []]))

  subjects.forEach((subject) => {
    const key = getRpmSubjectKey(subject, config)
    if (key) result[key].push(subject)
  })

  return result
}

const parseTimestamp = (row = {}) => {
  const value = row.updated_at || row.created_at || ''
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

const preferLatestRow = (current, candidate) => {
  if (!current) return candidate

  const currentTime = parseTimestamp(current)
  const candidateTime = parseTimestamp(candidate)
  if (candidateTime !== currentTime) return candidateTime > currentTime ? candidate : current

  return String(candidate.id || '').localeCompare(String(current.id || '')) >= 0
    ? candidate
    : current
}

export const dedupeAssessmentRows = (rows = [], options = {}) => {
  const examField = options.examField || 'exam_key'
  const result = new Map()

  rows.forEach((row) => {
    const enrollmentId = row.student_enrollment_id
    const subjectId = row.subject_id
    const examKey = String(row[examField] || '').trim().toUpperCase()
    if (!enrollmentId || !subjectId || !examKey) return

    const key = `${enrollmentId}__${subjectId}__${examKey}`
    result.set(key, preferLatestRow(result.get(key), row))
  })

  return Array.from(result.values())
}

export const findGradeFromMark = (mark, gradeScales = [], level = '') => {
  if (mark === null || mark === undefined || mark === '' || Number.isNaN(Number(mark))) {
    return null
  }

  const numericMark = Math.round(Number(mark))
  const normalizedLevel = String(level || '').trim().toLowerCase()
  const candidates = (gradeScales || []).filter((scale) => {
    const scaleLevel = String(
      scale.tingkatan ?? scale.grade_label ?? scale.form_level ?? scale.level ?? ''
    )
      .trim()
      .toLowerCase()
    return !normalizedLevel || !scaleLevel || scaleLevel === normalizedLevel
  })

  const match = candidates.find((scale) => {
    if (normalizeGrade(scale.grade_name ?? scale.grade) === 'TH') return false
    const minimum = Number(scale.min_mark ?? scale.min_score ?? 0)
    const maximum = Number(scale.max_mark ?? scale.max_score ?? 100)
    return numericMark >= minimum && numericMark <= maximum
  })

  return match ? normalizeGrade(match.grade_name ?? match.grade) : null
}

const getGradePoint = (grade, gradeScales = [], level = '') => {
  const normalizedGrade = normalizeGrade(grade)
  const normalizedLevel = String(level || '').trim().toLowerCase()
  const match = (gradeScales || []).find((scale) => {
    const scaleGrade = normalizeGrade(scale.grade_name ?? scale.grade)
    const scaleLevel = String(
      scale.tingkatan ?? scale.grade_label ?? scale.form_level ?? scale.level ?? ''
    )
      .trim()
      .toLowerCase()
    return (
      scaleGrade === normalizedGrade &&
      (!normalizedLevel || !scaleLevel || scaleLevel === normalizedLevel)
    )
  })
  const point = match?.grade_point ?? match?.point_value ?? match?.grade_value
  return point === null || point === undefined || point === '' || Number.isNaN(Number(point))
    ? null
    : Number(point)
}

export const isGradeAtLeastMinimum = (
  grade,
  minimumGrade = DEFAULT_MINIMUM_GRADE,
  gradeScales = [],
  level = ''
) => {
  const normalizedGrade = normalizeGrade(grade)
  const normalizedMinimum = normalizeGrade(minimumGrade)
  if (!normalizedGrade || normalizedGrade === 'TH') return false

  const gradePoint = getGradePoint(normalizedGrade, gradeScales, level)
  const minimumPoint = getGradePoint(normalizedMinimum, gradeScales, level)
  if (gradePoint !== null && minimumPoint !== null) return gradePoint <= minimumPoint

  const gradeIndex = FALLBACK_GRADE_ORDER.indexOf(normalizedGrade)
  const minimumIndex = FALLBACK_GRADE_ORDER.indexOf(normalizedMinimum)
  return gradeIndex >= 0 && minimumIndex >= 0 && gradeIndex <= minimumIndex
}

export const normalizeMetric = (row, options = {}) => {
  if (!row) return { state: 'missing', grade: null, mark: null, isAbsent: false }
  if (row.is_absent === true || normalizeGrade(row.grade_name) === 'TH') {
    return { state: 'absent', grade: 'TH', mark: null, isAbsent: true, row }
  }

  const grade =
    normalizeGrade(row.grade_name ?? row.grade) ||
    findGradeFromMark(row.mark ?? row.target_mark, options.gradeScales, options.level)

  if (!grade) {
    return {
      state: 'missing',
      grade: null,
      mark: row.mark ?? row.target_mark ?? null,
      isAbsent: false,
      row,
    }
  }

  return {
    state: isGradeAtLeastMinimum(
      grade,
      options.minimumGrade,
      options.gradeScales,
      options.level
    )
      ? 'achieved'
      : 'below',
    grade,
    mark: row.mark ?? row.target_mark ?? null,
    isAbsent: false,
    row,
  }
}

export const buildAssessmentIndex = (rows = [], examField = 'exam_key') => {
  const index = new Map()
  dedupeAssessmentRows(rows, { examField }).forEach((row) => {
    const key = `${row.student_enrollment_id}__${row.subject_id}__${String(
      row[examField] || ''
    )
      .trim()
      .toUpperCase()}`
    index.set(key, row)
  })
  return index
}

export const analyzeFourSubjects = ({
  students = [],
  subjectMap = {},
  assessmentIndex = new Map(),
  examKey,
  gradeScales = [],
  minimumGrade = DEFAULT_MINIMUM_GRADE,
  subjectConfig = RPM_SUBJECT_CONFIG,
}) => {
  const normalizedExamKey = String(examKey || '').trim().toUpperCase()

  return students.map((student) => {
    const subjectResults = {}

    subjectConfig.forEach((configItem) => {
      const candidates = subjectMap[configItem.key] || []
      let chosenMetric = null
      let chosenSubject = null

      candidates.some((subject) => {
        const row = assessmentIndex.get(
          `${student.enrollment_id}__${subject.id}__${normalizedExamKey}`
        )
        if (!row) return false
        chosenSubject = subject
        chosenMetric = normalizeMetric(row, {
          gradeScales,
          minimumGrade,
          level: student.tingkatan,
        })
        return true
      })

      subjectResults[configItem.key] = {
        ...(chosenMetric || { state: 'missing', grade: null, mark: null, isAbsent: false }),
        subject: chosenSubject || candidates[0] || null,
        label: configItem.label,
        shortLabel: configItem.shortLabel,
      }
    })

    const results = Object.values(subjectResults)
    const belowCount = results.filter((result) => result.state === 'below').length
    const incompleteCount = results.filter(
      (result) => result.state === 'missing' || result.state === 'absent'
    ).length
    const achievedCount = results.filter((result) => result.state === 'achieved').length
    const isComplete = incompleteCount === 0
    const status = belowCount > 0 ? 'Belum Capai' : isComplete ? 'Capai' : 'Tidak Lengkap'

    return {
      ...student,
      subjects: subjectResults,
      achievedCount,
      belowCount,
      incompleteCount,
      isComplete,
      status,
      interventionSubjects: results
        .filter((result) => result.state === 'below')
        .map((result) => result.label),
    }
  })
}

export const summarizeFourSubjectResults = (rows = []) => {
  const completeRows = rows.filter((row) => row.isComplete)
  const achievedRows = rows.filter((row) => row.status === 'Capai')
  const belowRows = rows.filter((row) => row.status === 'Belum Capai')
  const incompleteRows = rows.filter((row) => !row.isComplete)

  return {
    totalStudents: rows.length,
    completeCount: completeRows.length,
    achievedCount: achievedRows.length,
    belowCount: belowRows.length,
    incompleteCount: incompleteRows.length,
    achievementRate: completeRows.length ? (achievedRows.length / completeRows.length) * 100 : null,
    cohortRate: rows.length ? (achievedRows.length / rows.length) * 100 : null,
    coverageRate: rows.length ? (completeRows.length / rows.length) * 100 : null,
    belowByCount: [1, 2, 3, 4].reduce((result, count) => {
      result[count] = rows.filter((row) => row.belowCount === count).length
      return result
    }, {}),
  }
}

export const summarizeSubject = ({
  students = [],
  subject,
  assessmentIndex = new Map(),
  examKey,
  gradeScales = [],
  minimumGrade = DEFAULT_MINIMUM_GRADE,
}) => {
  const normalizedExamKey = String(examKey || '').trim().toUpperCase()
  const studentResults = students.map((student) => {
    const row = assessmentIndex.get(
      `${student.enrollment_id}__${subject.id}__${normalizedExamKey}`
    )
    const metric = normalizeMetric(row, {
      gradeScales,
      minimumGrade,
      level: student.tingkatan,
    })
    return { ...student, metric }
  })
  const evaluated = studentResults.filter((row) =>
    ['achieved', 'below'].includes(row.metric.state)
  )
  const minimumCCount = studentResults.filter((row) => row.metric.state === 'achieved').length
  const belowCount = studentResults.filter((row) => row.metric.state === 'below').length
  const absentCount = studentResults.filter((row) => row.metric.state === 'absent').length
  const missingCount = studentResults.filter((row) => row.metric.state === 'missing').length

  return {
    subject,
    studentResults,
    evaluatedCount: evaluated.length,
    minimumCCount,
    belowCount,
    absentCount,
    missingCount,
    noDataCount: absentCount + missingCount,
    minimumCRate: evaluated.length ? (minimumCCount / evaluated.length) * 100 : null,
  }
}

export const formatPercentage = (value, digits = 1) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? 'Tiada Data'
    : `${Number(value).toFixed(digits)}%`

