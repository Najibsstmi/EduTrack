export const PAJSK_ART_FIELDS = ['Seni Tari', 'Seni Muzik', 'Seni Teater', 'Seni Visual']

export const PAJSK_PARTICIPATION_TYPES = [
  'PENGLIBATAN_I',
  'PENGLIBATAN_II',
  'PENGLIBATAN_III',
]

const participationLabel = (value) =>
  ({
    PENGLIBATAN_I: 'Penglibatan I',
    PENGLIBATAN_II: 'Penglibatan II',
    PENGLIBATAN_III: 'Penglibatan III',
  })[value] || value || 'Tidak dinyatakan'

const increment = (record, key) => {
  const safeKey = key || 'Tidak dinyatakan'
  record[safeKey] = (record[safeKey] || 0) + 1
}

const validScore = (value) => {
  if (value === null || value === undefined || value === '') return 0
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function filterPajskRows(rows = [], filters = {}) {
  const {
    form = '',
    className = '',
    artField = '',
    component = '',
    level = '',
    allowedStudentIds = null,
  } = filters

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (allowedStudentIds && !allowedStudentIds.has(String(row.student_profile_id))) return false
    if (form && row.form_snapshot !== form) return false
    if (className && row.class_name_snapshot !== className) return false
    if (artField && row.art_field_snapshot !== artField) return false
    if (component && row.component !== component) return false
    if (level && row.level !== level) return false
    return true
  })
}

export function calculatePajskAnalytics(rows = [], totalStudents = 0) {
  const safeRows = Array.isArray(rows) ? rows : []
  const studentIds = new Set()
  const activityIds = new Set()
  const byLevel = {}
  const byArtField = {}
  const byClass = {}
  const byForm = {}
  const byComponent = {}
  const byMonth = {}
  const byParticipation = {}
  const achievementByLevel = {}
  const achievementByArtField = {}
  const achievementByClass = {}
  const achievementByResult = {}
  const students = new Map()
  let achievementCount = 0
  let totalRecordedScore = 0

  safeRows.forEach((row) => {
    studentIds.add(String(row.student_profile_id))
    activityIds.add(String(row.activity_id))
    increment(byLevel, row.level)
    increment(byArtField, row.art_field_snapshot)
    increment(byClass, row.class_name_snapshot)
    increment(byForm, row.form_snapshot)
    increment(byComponent, row.component)
    increment(byParticipation, participationLabel(row.participation_type))

    const month = String(row.activity_date || '').slice(0, 7)
    if (month) increment(byMonth, month)

    const hasAchievement = Boolean(row.achievement_result && row.achievement_result !== 'TIADA')
    if (hasAchievement) {
      achievementCount += 1
      increment(achievementByLevel, row.level)
      increment(achievementByArtField, row.art_field_snapshot)
      increment(achievementByClass, row.class_name_snapshot)
      increment(achievementByResult, row.achievement_result)
    }

    totalRecordedScore += validScore(row.participation_score) + validScore(row.achievement_score)

    const studentKey = String(row.student_profile_id)
    const current = students.get(studentKey) || {
      student_profile_id: row.student_profile_id,
      student_name: row.student_name_snapshot,
      form: row.form_snapshot,
      class_name: row.class_name_snapshot,
      art_field: row.art_field_snapshot,
      activityIds: new Set(),
      achievement_count: 0,
      state_or_higher_count: 0,
      latest_activity_date: '',
    }
    current.activityIds.add(String(row.activity_id))
    if (hasAchievement) current.achievement_count += 1
    if (['NEGERI', 'KEBANGSAAN', 'ANTARABANGSA'].includes(row.level)) {
      current.state_or_higher_count += 1
    }
    if (!current.latest_activity_date || row.activity_date > current.latest_activity_date) {
      current.latest_activity_date = row.activity_date
    }
    students.set(studentKey, current)
  })

  const studentRows = [...students.values()]
    .map((row) => ({ ...row, activity_count: row.activityIds.size, activityIds: undefined }))
    .sort((a, b) => b.activity_count - a.activity_count || a.student_name.localeCompare(b.student_name, 'ms'))

  return {
    totalStudents,
    studentsWithRecords: studentIds.size,
    studentsWithoutRecords: Math.max(0, Number(totalStudents || 0) - studentIds.size),
    activityCount: activityIds.size,
    participationRecordCount: safeRows.length,
    achievementCount,
    totalRecordedScore,
    byLevel,
    byArtField,
    byClass,
    byForm,
    byComponent,
    byMonth,
    byParticipation,
    achievementByLevel,
    achievementByArtField,
    achievementByClass,
    achievementByResult,
    studentRows,
  }
}

export function toChartRows(record = {}) {
  return Object.entries(record)
    .map(([label, value]) => ({ label, value: Number(value || 0) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'ms'))
}
