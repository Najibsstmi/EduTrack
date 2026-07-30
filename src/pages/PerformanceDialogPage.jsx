import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Eye,
  FileText,
  Menu,
  Plus,
  Printer,
  Save,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { getDashboardPath } from '../lib/dashboardPath.js'
import {
  fetchSchoolLevelLabels,
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import { normalizeSubjectRows } from '../lib/subjectLabels.js'
import { supabase } from '../lib/supabaseClient.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const DEFAULT_TRAFFIC_BANDS = [
  { key: 'green', label: 'Hijau', min: 70, max: 100, grades: ['A+', 'A', 'A-'] },
  { key: 'yellow', label: 'Kuning', min: 50, max: 69, grades: ['B+', 'B', 'C+', 'C'] },
  { key: 'red', label: 'Merah', min: 0, max: 49, grades: ['D', 'E', 'G'] },
]

const DPP_EXAM_PRESETS = [
  { key: 'TOV', name: 'TOV', order: 0 },
  { key: 'OTR1', name: 'OTR1', order: 10 },
  { key: 'AR1', name: 'PPT', order: 11 },
  { key: 'UP1', name: 'UP1', order: 12 },
  { key: 'OTR2', name: 'OTR2', order: 20 },
  { key: 'AR2', name: 'PPC', order: 21 },
  { key: 'OTR3', name: 'OTR3', order: 30 },
  { key: 'PAT', name: 'PAT', order: 40 },
  { key: 'ETR', name: 'ETR', order: 999 },
]

const DPP_EXAM_ALIASES = {
  PPT: 'AR1',
  PPC: 'AR2',
}

const DPP_EXAM_DISPLAY_NAMES = {
  AR1: 'PPT',
  AR2: 'PPC',
}

const EMPTY_INTERVENTION = {
  title: '',
  details: '',
  start_date: '',
  end_date: '',
  duration: '',
  status: 'Dirancang',
}

const EMPTY_SCOREBOARD_ROW = {
  program: '',
  target: '',
  achieved: '',
  gap: '',
  implementation_percent: '',
  status: 'Dirancang',
  support_notes: '',
  start_date: '',
  end_date: '',
}

const TRAFFIC_STYLES = {
  green: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    badge: 'bg-emerald-100 text-emerald-800',
    bar: 'bg-emerald-500',
  },
  yellow: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    badge: 'bg-amber-100 text-amber-800',
    bar: 'bg-amber-500',
  },
  red: {
    border: 'border-rose-200',
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    badge: 'bg-rose-100 text-rose-800',
    bar: 'bg-rose-500',
  },
}

const INTERVENTION_TONE_CLASSES = {
  green: 'border-emerald-200 bg-emerald-50',
  yellow: 'border-amber-200 bg-amber-50',
  red: 'border-rose-200 bg-rose-50',
  neutral: 'border-slate-200 bg-slate-50',
}

const getCurrentYear = () => new Date().getFullYear()

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLocaleUpperCase('ms-MY')
    .replace(/\s+/g, ' ')

const normalizeExamKey = (value) => normalizeText(value).replace(/\s+/g, '')

const getCanonicalDppExamKey = (value) => {
  const key = normalizeExamKey(value)
  return DPP_EXAM_ALIASES[key] || key
}

const getDppExamLookupKeys = (value) => {
  const canonicalKey = getCanonicalDppExamKey(value)
  const aliasKeys = Object.entries(DPP_EXAM_ALIASES)
    .filter(([, targetKey]) => targetKey === canonicalKey)
    .map(([aliasKey]) => aliasKey)

  return [...new Set([canonicalKey, ...aliasKeys].filter(Boolean))]
}

const getDppExamDisplayName = (key, fallbackName) => {
  const canonicalKey = getCanonicalDppExamKey(key)
  return DPP_EXAM_DISPLAY_NAMES[canonicalKey] || fallbackName || canonicalKey
}

const getGradeNumber = (value) => String(value || '').match(/\d+/)?.[0] || ''

const isSameLevel = (left, right) => {
  const leftKey = normalizeText(left)
  const rightKey = normalizeText(right)
  if (leftKey && rightKey && leftKey === rightKey) return true

  const leftNumber = getGradeNumber(left)
  const rightNumber = getGradeNumber(right)
  return Boolean(leftNumber && rightNumber && leftNumber === rightNumber)
}

const getDefaultExamOrder = (examKey) => {
  const key = normalizeExamKey(examKey)
  if (key === 'TOV') return 0
  if (key === 'ETR') return 999
  const otrMatch = key.match(/^OTR(\d+)$/)
  if (otrMatch) return Number(otrMatch[1]) * 10
  const arMatch = key.match(/^AR(\d+)$/)
  if (arMatch) return Number(arMatch[1]) * 10 + 1
  return 500
}

const getDppComparisonTargetKey = (examKey) => {
  const key = getCanonicalDppExamKey(examKey)
  if (!key || key === 'TOV' || key === 'ETR' || key.startsWith('OTR')) return ''

  if (key.includes('PERCUBAAN')) return 'OTR2'
  if (key.includes('PERTENGAHAN')) return 'OTR1'
  if (key === 'PAT' || key === 'UASA' || key.includes('AKHIR')) return 'OTR3'

  const progressMatch = key.match(/^(?:AR|UP)(\d+)$/)
  if (progressMatch) return `OTR${progressMatch[1]}`

  return ''
}

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const average = (values = []) => {
  const numericValues = values
    .map((value) => toNumberOrNull(value))
    .filter((value) => value !== null)

  return numericValues.length
    ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
    : null
}

const formatDecimal = (value, digits = 2) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? '-'
    : Number(value).toFixed(digits)

const formatPercent = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? '-'
    : `${Number(value).toFixed(1)}%`

const getGradePointFromScale = (gradeName, gradeLabel, gradeScales) => {
  const gradeKey = normalizeText(gradeName)
  const levelKey = normalizeText(gradeLabel)

  const matched = (gradeScales || []).find((scale) => {
    const scaleGrade = normalizeText(scale.grade_name ?? scale.grade ?? '')
    const scaleLevel = normalizeText(
      scale.tingkatan ?? scale.grade_label ?? scale.form_level ?? scale.level ?? ''
    )
    return scaleGrade === gradeKey && scaleLevel === levelKey
  })

  const point = matched?.grade_point ?? matched?.point_value ?? matched?.grade_value
  return point === null || point === undefined || point === '' ? null : Number(point)
}

const findGradeFromMark = (mark, gradeLabel, gradeScales) => {
  const numericMark = toNumberOrNull(mark)
  if (numericMark === null) return { grade_name: null, grade_point: null }

  const levelKey = normalizeText(gradeLabel)
  const matched = (gradeScales || []).find((scale) => {
    const scaleGrade = normalizeText(scale.grade_name ?? scale.grade ?? '')
    if (scaleGrade === 'TH') return false

    const scaleLevel = normalizeText(
      scale.tingkatan ?? scale.grade_label ?? scale.form_level ?? scale.level ?? ''
    )
    const min = Number(scale.min_mark ?? scale.min_score ?? 0)
    const max = Number(scale.max_mark ?? scale.max_score ?? 100)
    return scaleLevel === levelKey && numericMark >= min && numericMark <= max
  })

  if (!matched) return { grade_name: null, grade_point: null }

  return {
    grade_name: matched.grade_name ?? matched.grade ?? null,
    grade_point: matched.grade_point ?? matched.point_value ?? matched.grade_value ?? null,
  }
}

const normalizeMetric = (metric, gradeLabel, gradeScales) => {
  if (!metric) return { mark: null, grade_name: null, grade_point: null, is_absent: false }
  if (metric.is_absent === true) {
    return { mark: null, grade_name: 'TH', grade_point: null, is_absent: true }
  }

  const mark = toNumberOrNull(metric.mark)
  const gradeInfo = metric.grade_name
    ? {
        grade_name: metric.grade_name,
        grade_point:
          metric.grade_point ?? getGradePointFromScale(metric.grade_name, gradeLabel, gradeScales),
      }
    : findGradeFromMark(mark, gradeLabel, gradeScales)

  return {
    mark,
    grade_name: gradeInfo.grade_name,
    grade_point:
      gradeInfo.grade_point === null ||
      gradeInfo.grade_point === undefined ||
      gradeInfo.grade_point === ''
        ? null
        : Number(gradeInfo.grade_point),
    is_absent: false,
  }
}

const getMetricForExam = ({
  scores,
  targets,
  enrollmentId,
  subjectId,
  examKey,
  gradeLabel,
  gradeScales,
}) => {
  const lookupKeys = getDppExamLookupKeys(examKey)
  const scoreRow = (scores || []).find(
    (score) =>
      String(score.student_enrollment_id) === String(enrollmentId) &&
      String(score.subject_id) === String(subjectId) &&
      lookupKeys.includes(normalizeExamKey(score.exam_key))
  )
  const targetRow = (targets || []).find(
    (target) =>
      String(target.student_enrollment_id) === String(enrollmentId) &&
      String(target.subject_id) === String(subjectId) &&
      lookupKeys.includes(normalizeExamKey(target.target_key))
  )

  if (scoreRow) {
    return normalizeMetric(
      {
        mark: scoreRow.mark,
        grade_name: scoreRow.grade_name,
        grade_point: scoreRow.grade_point,
        is_absent: scoreRow.is_absent === true,
      },
      gradeLabel,
      gradeScales
    )
  }

  if (targetRow) {
    return normalizeMetric(
      {
        mark: targetRow.target_mark,
        grade_name: targetRow.grade_name,
        grade_point: targetRow.grade_point,
      },
      gradeLabel,
      gradeScales
    )
  }

  return { mark: null, grade_name: null, grade_point: null, is_absent: false }
}

const isPassGrade = (grade) => {
  const value = normalizeText(grade)
  return Boolean(value && !['G', 'TH'].includes(value))
}

const splitLines = (value) =>
  String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)

const joinLines = (items) => (items || []).filter(Boolean).join('\n')

const getDefaultDraft = ({ subjectName = '', examName = '', academicYear = getCurrentYear() }) => ({
  report_title: `DIALOG PRESTASI PANITIA ${subjectName || 'SUBJEK'} ${academicYear}`,
  issue_statement: '',
  teacher_names: [''],
  problem_causes: {
    teacher: [''],
    student: [''],
  },
  target_group_note: '',
  traffic_bands: DEFAULT_TRAFFIC_BANDS,
  student_interventions: {
    green: [{ ...EMPTY_INTERVENTION }],
    yellow: [{ ...EMPTY_INTERVENTION }],
    red: [{ ...EMPTY_INTERVENTION }],
  },
  teacher_interventions: [{ ...EMPTY_INTERVENTION }],
  scoreboard_rows: [
    {
      ...EMPTY_SCOREBOARD_ROW,
      program: 'Modul PdPc',
      status: 'Dalam Pelaksanaan',
    },
  ],
  implementation_window: {
    start_date: '',
    end_date: '',
    label: examName ? `Pasca ${examName}` : '',
  },
  notes: '',
})

const normalizeDraft = (row, defaults) => ({
  ...defaults,
  report_title: row?.report_title || defaults.report_title,
  issue_statement: row?.issue_statement || defaults.issue_statement,
  teacher_names: Array.isArray(row?.teacher_names) ? row.teacher_names : defaults.teacher_names,
  problem_causes: {
    teacher: Array.isArray(row?.problem_causes?.teacher)
      ? row.problem_causes.teacher
      : defaults.problem_causes.teacher,
    student: Array.isArray(row?.problem_causes?.student)
      ? row.problem_causes.student
      : defaults.problem_causes.student,
  },
  target_group_note: row?.target_group_note || defaults.target_group_note,
  traffic_bands: Array.isArray(row?.traffic_bands) ? row.traffic_bands : defaults.traffic_bands,
  student_interventions: {
    green: Array.isArray(row?.student_interventions?.green)
      ? row.student_interventions.green
      : defaults.student_interventions.green,
    yellow: Array.isArray(row?.student_interventions?.yellow)
      ? row.student_interventions.yellow
      : defaults.student_interventions.yellow,
    red: Array.isArray(row?.student_interventions?.red)
      ? row.student_interventions.red
      : defaults.student_interventions.red,
  },
  teacher_interventions: Array.isArray(row?.teacher_interventions)
    ? row.teacher_interventions
    : defaults.teacher_interventions,
  scoreboard_rows: Array.isArray(row?.scoreboard_rows)
    ? row.scoreboard_rows
    : defaults.scoreboard_rows,
  implementation_window: {
    ...defaults.implementation_window,
    ...(row?.implementation_window || {}),
  },
  notes: row?.notes || defaults.notes,
})

const getBandStyle = (bandKey) => TRAFFIC_STYLES[bandKey] || TRAFFIC_STYLES.red

const getInterventionToneClass = (toneKey) =>
  INTERVENTION_TONE_CLASSES[toneKey] || INTERVENTION_TONE_CLASSES.neutral

export default function PerformanceDialogPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  const [loading, setLoading] = useState(true)
  const [contextLoading, setContextLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [scores, setScores] = useState([])
  const [targets, setTargets] = useState([])
  const [gradeScales, setGradeScales] = useState([])
  const [examConfigs, setExamConfigs] = useState([])
  const [levelMappings, setLevelMappings] = useState([])
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedExamKey, setSelectedExamKey] = useState('')
  const [reportRecord, setReportRecord] = useState(null)
  const [draft, setDraft] = useState(getDefaultDraft({}))

  const dashboardPath = getDashboardPath(profile)

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        navigate('/login', { replace: true })
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || !profileData) {
        navigate('/login', { replace: true })
        return
      }

      const { data: setupRows, error: setupError } = await supabase
        .from('school_setup_configs')
        .select('current_academic_year')
        .eq('school_id', profileData.school_id)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (setupError) throw setupError

      const year = setupRows?.[0]?.current_academic_year || getCurrentYear()

      setProfile(profileData)
      setAcademicYear(String(year))
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan Dialog Prestasi.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const loadYearData = useCallback(async () => {
    if (!profile?.school_id || !academicYear) return
    setContextLoading(true)
    setErrorMessage('')

    try {
      const [
        classResult,
        subjectResult,
        enrollmentResult,
        scoreResult,
        targetResult,
        gradeScaleResult,
        examConfigResult,
        schoolResult,
        loadedLevelMappings,
      ] = await Promise.all([
        supabase
          .from('classes')
          .select('id, tingkatan, class_name, academic_year, is_active')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .eq('is_active', true),
        supabase
          .from('subjects')
          .select('*')
          .eq('school_id', profile.school_id)
          .eq('is_active', true),
        supabase
          .from('student_enrollments')
          .select(`
            id,
            class_id,
            student_profile_id,
            is_active,
            classes (
              id,
              tingkatan,
              class_name
            ),
            student_profiles (
              id,
              full_name,
              ic_number,
              gender
            )
          `)
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .eq('is_active', true),
        supabase
          .from('student_scores')
          .select('student_enrollment_id, subject_id, exam_key, mark, grade_name, grade_point, is_absent')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear)),
        supabase
          .from('student_targets')
          .select('student_enrollment_id, subject_id, target_key, target_mark, grade_name, grade_point')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear)),
        supabase.from('grade_scales').select('*').eq('school_id', profile.school_id),
        supabase
          .from('exam_configs')
          .select('grade_label, exam_key, exam_name, exam_order, is_active')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear)),
        supabase
          .from('schools')
          .select('id, school_name, school_code')
          .eq('id', profile.school_id)
          .maybeSingle(),
        fetchSchoolLevelLabels({
          schoolId: profile.school_id,
          academicYear: Number(academicYear),
        }),
      ])

      if (classResult.error) throw classResult.error
      if (subjectResult.error) throw subjectResult.error
      if (enrollmentResult.error) throw enrollmentResult.error
      if (scoreResult.error) throw scoreResult.error
      if (targetResult.error) throw targetResult.error
      if (gradeScaleResult.error) throw gradeScaleResult.error
      if (examConfigResult.error) throw examConfigResult.error
      if (schoolResult.error) throw schoolResult.error

      const normalizedSubjects = normalizeSubjectRows(subjectResult.data || [])
      const classRows = classResult.data || []

      setClasses(classRows)
      setSubjects(normalizedSubjects)
      setEnrollments(enrollmentResult.data || [])
      setScores(scoreResult.data || [])
      setTargets(targetResult.data || [])
      setGradeScales(gradeScaleResult.data || [])
      setExamConfigs(examConfigResult.data || [])
      setSchoolInfo(schoolResult.data || null)
      setLevelMappings(loadedLevelMappings || [])

    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan data Dialog Prestasi.')
    } finally {
      setContextLoading(false)
    }
  }, [academicYear, profile?.school_id])

  useEffect(() => {
    if (checkingAuth) return
    loadInitialData()
  }, [checkingAuth, loadInitialData])

  useEffect(() => {
    loadYearData()
  }, [loadYearData])

  const availableGrades = useMemo(
    () =>
      sortLevelsByDisplayOrder(
        [...new Set(classes.map((classRow) => classRow.tingkatan).filter(Boolean))],
        levelMappings
      ),
    [classes, levelMappings]
  )

  const availableClasses = useMemo(
    () =>
      classes
        .filter((classRow) => !selectedGrade || isSameLevel(classRow.tingkatan, selectedGrade))
        .sort((a, b) =>
          getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
            getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
            'ms',
            { numeric: true, sensitivity: 'base' }
          )
        ),
    [classes, levelMappings, selectedGrade]
  )

  const availableSubjects = useMemo(
    () =>
      subjects
        .filter((subject) => !selectedGrade || isSameLevel(subject.tingkatan, selectedGrade))
        .sort((a, b) =>
          String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
            sensitivity: 'base',
          })
        ),
    [selectedGrade, subjects]
  )

  const examOptions = useMemo(
    () => {
      const optionMap = new Map()
      const addOption = ({ key, name, order, source }) => {
        const sourceKey = normalizeExamKey(key)
        const normalizedKey = getCanonicalDppExamKey(sourceKey)
        if (!normalizedKey) return

        const current = optionMap.get(normalizedKey)
        const next = {
          key: normalizedKey,
          name: getDppExamDisplayName(normalizedKey, name || sourceKey || normalizedKey),
          order: Number.isFinite(Number(order)) ? Number(order) : getDefaultExamOrder(normalizedKey),
          source,
        }

        if (
          !current ||
          next.source === 'config' ||
          (current.source !== 'config' && next.order < current.order)
        ) {
          optionMap.set(normalizedKey, { ...current, ...next })
        }
      }

      DPP_EXAM_PRESETS.forEach((exam) => addOption({ ...exam, source: 'preset' }))

      examConfigs
        .filter((exam) => exam.is_active !== false)
        .filter((exam) => !selectedGrade || isSameLevel(exam.grade_label, selectedGrade))
        .forEach((exam) =>
          addOption({
            key: exam.exam_key,
          name: exam.exam_name || exam.exam_key,
          order: Number.isFinite(Number(exam.exam_order))
            ? Number(exam.exam_order)
            : getDefaultExamOrder(exam.exam_key),
            source: 'config',
          })
        )

      scores
        .filter((score) => !selectedSubjectId || String(score.subject_id) === String(selectedSubjectId))
        .forEach((score) =>
          addOption({
            key: score.exam_key,
            name: score.exam_key,
            source: 'score',
          })
        )

      targets
        .filter((target) => !selectedSubjectId || String(target.subject_id) === String(selectedSubjectId))
        .forEach((target) =>
          addOption({
            key: target.target_key,
            name: target.target_key,
            source: 'target',
          })
        )

      return [...optionMap.values()].sort(
        (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ms')
      )
    },
    [examConfigs, scores, selectedGrade, selectedSubjectId, targets]
  )

  useEffect(() => {
    if (!selectedGrade && availableGrades[0]) setSelectedGrade(availableGrades[0])
  }, [availableGrades, selectedGrade])

  useEffect(() => {
    if (
      selectedSubjectId &&
      availableSubjects.some((subject) => String(subject.id) === String(selectedSubjectId))
    ) {
      return
    }
    setSelectedSubjectId(availableSubjects[0]?.id || '')
  }, [availableSubjects, selectedSubjectId])

  useEffect(() => {
    const canonicalSelectedExamKey = getCanonicalDppExamKey(selectedExamKey)
    if (
      selectedExamKey &&
      canonicalSelectedExamKey &&
      examOptions.some((exam) => exam.key === canonicalSelectedExamKey)
    ) {
      if (selectedExamKey !== canonicalSelectedExamKey) {
        setSelectedExamKey(canonicalSelectedExamKey)
      }
      return
    }
    setSelectedExamKey(examOptions.find((exam) => !['TOV', 'ETR'].includes(exam.key))?.key || examOptions[0]?.key || '')
  }, [examOptions, selectedExamKey])

  const selectedSubject = useMemo(
    () => availableSubjects.find((subject) => String(subject.id) === String(selectedSubjectId)) || null,
    [availableSubjects, selectedSubjectId]
  )

  const selectedExam = useMemo(
    () => examOptions.find((exam) => exam.key === selectedExamKey) || null,
    [examOptions, selectedExamKey]
  )

  const selectedClassLabelForPreview = useMemo(() => {
    if (selectedClassId === 'all') return 'Semua Kelas'

    const classRow = availableClasses.find(
      (item) => String(item.id) === String(selectedClassId)
    )

    return getDisplayClassLabel(classRow?.tingkatan, classRow?.class_name, levelMappings)
  }, [availableClasses, levelMappings, selectedClassId])

  const comparisonTargetKey = useMemo(
    () => getDppComparisonTargetKey(selectedExamKey),
    [selectedExamKey]
  )

  const comparisonTargetLabel = useMemo(
    () =>
      examOptions.find((exam) => exam.key === comparisonTargetKey)?.name ||
      comparisonTargetKey,
    [comparisonTargetKey, examOptions]
  )

  const contextStudents = useMemo(
    () =>
      enrollments
        .filter((enrollment) => {
          const classRow = enrollment.classes
          if (!classRow) return false
          if (selectedGrade && !isSameLevel(classRow.tingkatan, selectedGrade)) return false
          if (selectedClassId !== 'all' && String(enrollment.class_id) !== String(selectedClassId)) {
            return false
          }
          return true
        })
        .sort((a, b) =>
          String(a.student_profiles?.full_name || '').localeCompare(
            String(b.student_profiles?.full_name || ''),
            'ms',
            { sensitivity: 'base' }
          )
        ),
    [enrollments, selectedClassId, selectedGrade]
  )

  const reportDefaults = useMemo(
    () =>
      getDefaultDraft({
        subjectName: selectedSubject?.subject_name || '',
        examName: selectedExam?.name || selectedExamKey,
        academicYear: academicYear || getCurrentYear(),
      }),
    [academicYear, selectedExam?.name, selectedExamKey, selectedSubject?.subject_name]
  )

  const loadSavedReport = useCallback(async () => {
    if (!profile?.school_id || !academicYear || !selectedGrade || !selectedSubjectId || !selectedExamKey) {
      return
    }

    setSuccessMessage('')

    try {
      const reportLookupKeys = getDppExamLookupKeys(selectedExamKey)
      let query = supabase
        .from('performance_dialog_reports')
        .select('*')
        .eq('school_id', profile.school_id)
        .eq('academic_year', Number(academicYear))
        .eq('grade_label', selectedGrade)
        .eq('subject_id', selectedSubjectId)
        .in('exam_key', reportLookupKeys)
        .order('updated_at', { ascending: false })
        .limit(1)

      query =
        selectedClassId === 'all'
          ? query.is('class_id', null)
          : query.eq('class_id', selectedClassId)

      const { data, error } = await query.maybeSingle()

      if (error) throw error

      setReportRecord(data || null)
      setDraft(normalizeDraft(data, reportDefaults))
    } catch (error) {
      console.error(error)
      setReportRecord(null)
      setDraft(reportDefaults)
      setErrorMessage(
        error.message?.includes('performance_dialog_reports')
          ? 'Jadual Dialog Prestasi belum tersedia. Jalankan migration performance_dialog_reports di Supabase.'
          : error.message || 'Gagal memuatkan laporan Dialog Prestasi.'
      )
    }
  }, [
    academicYear,
    profile?.school_id,
    reportDefaults,
    selectedClassId,
    selectedExamKey,
    selectedGrade,
    selectedSubjectId,
  ])

  useEffect(() => {
    loadSavedReport()
  }, [loadSavedReport])

  const analysisRows = useMemo(() => {
    if (!selectedSubjectId || !selectedExamKey) return []

    return contextStudents.map((student) => {
      const current = getMetricForExam({
        scores,
        targets,
        enrollmentId: student.id,
        subjectId: selectedSubjectId,
        examKey: selectedExamKey,
        gradeLabel: student.classes?.tingkatan || selectedGrade,
        gradeScales,
      })
      const tov = getMetricForExam({
        scores,
        targets,
        enrollmentId: student.id,
        subjectId: selectedSubjectId,
        examKey: 'TOV',
        gradeLabel: student.classes?.tingkatan || selectedGrade,
        gradeScales,
      })
      const etr = getMetricForExam({
        scores,
        targets,
        enrollmentId: student.id,
        subjectId: selectedSubjectId,
        examKey: 'ETR',
        gradeLabel: student.classes?.tingkatan || selectedGrade,
        gradeScales,
      })
      const comparisonTarget = comparisonTargetKey
        ? getMetricForExam({
            scores,
            targets,
            enrollmentId: student.id,
            subjectId: selectedSubjectId,
            examKey: comparisonTargetKey,
            gradeLabel: student.classes?.tingkatan || selectedGrade,
            gradeScales,
          })
        : { mark: null, grade_name: null, grade_point: null, is_absent: false }

      return { student, current, tov, etr, comparisonTarget }
    })
  }, [
    comparisonTargetKey,
    contextStudents,
    gradeScales,
    scores,
    selectedExamKey,
    selectedGrade,
    selectedSubjectId,
    targets,
  ])

  const reportAnalytics = useMemo(() => {
    const scoredRows = analysisRows.filter(
      (row) => row.current.mark !== null && row.current.is_absent !== true
    )
    const bands = draft.traffic_bands?.length ? draft.traffic_bands : DEFAULT_TRAFFIC_BANDS
    const traffic = Object.fromEntries(
      bands.map((band) => [
        band.key,
        {
          ...band,
          rows: [],
        },
      ])
    )
    const unbanded = []
    const gradeCounts = new Map()

    scoredRows.forEach((row) => {
      const grade = row.current.grade_name || 'Tiada Gred'
      gradeCounts.set(grade, (gradeCounts.get(grade) || 0) + 1)

      const mark = Number(row.current.mark)
      const band = bands.find(
        (item) => mark >= Number(item.min || 0) && mark <= Number(item.max || 100)
      )
      if (band && traffic[band.key]) traffic[band.key].rows.push(row)
      else unbanded.push(row)
    })

    const gpmp = average(scoredRows.map((row) => row.current.grade_point))
    const tovGpmp = average(
      analysisRows
        .filter((row) => row.tov.grade_point !== null)
        .map((row) => row.tov.grade_point)
    )
    const etrGpmp = average(
      analysisRows
        .filter((row) => row.etr.grade_point !== null)
        .map((row) => row.etr.grade_point)
    )
    const comparisonTargetGpmp = comparisonTargetKey
      ? average(
          analysisRows
            .filter((row) => row.comparisonTarget.grade_point !== null)
            .map((row) => row.comparisonTarget.grade_point)
        )
      : null
    const passCount = scoredRows.filter((row) => isPassGrade(row.current.grade_name)).length

    return {
      totalStudents: contextStudents.length,
      scoredCount: scoredRows.length,
      averageMark: average(scoredRows.map((row) => row.current.mark)),
      gpmp,
      tovGpmp,
      etrGpmp,
      comparisonTargetGpmp,
      gapTargetKey: comparisonTargetKey,
      gapTargetLabel: comparisonTargetLabel,
      gpmpGap:
        gpmp !== null && comparisonTargetGpmp !== null
          ? gpmp - comparisonTargetGpmp
          : null,
      passRate: scoredRows.length ? (passCount / scoredRows.length) * 100 : null,
      gradeDistribution: [...gradeCounts.entries()]
        .map(([grade, count]) => ({ grade, count }))
        .sort((a, b) => a.grade.localeCompare(b.grade, 'ms', { numeric: true })),
      traffic,
      unbanded,
      bands,
    }
  }, [
    analysisRows,
    comparisonTargetKey,
    comparisonTargetLabel,
    contextStudents.length,
    draft.traffic_bands,
  ])

  const generatedIssueStatement = useMemo(() => {
    if (!selectedSubject || !selectedExam) return ''
    if (reportAnalytics.gpmp === null) {
      return `Data markah ${selectedSubject.subject_name} bagi ${selectedExam.name} belum lengkap untuk menjana penyataan masalah automatik.`
    }

    const gapText =
      reportAnalytics.gpmpGap === null || !reportAnalytics.gapTargetLabel
        ? ''
        : ` dengan jurang ${formatDecimal(reportAnalytics.gpmpGap)} berbanding target ${reportAnalytics.gapTargetLabel}`

    return `Pencapaian GPMP ${selectedSubject.subject_name} ialah ${formatDecimal(
      reportAnalytics.gpmp
    )}${gapText} bagi ${selectedExam.name} ${academicYear}.`
  }, [
    academicYear,
    reportAnalytics.gapTargetLabel,
    reportAnalytics.gpmp,
    reportAnalytics.gpmpGap,
    selectedExam,
    selectedSubject,
  ])

  const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }))

  const updateTrafficBand = (bandKey, field, value) => {
    updateDraft({
      traffic_bands: draft.traffic_bands.map((band) =>
        band.key === bandKey
          ? {
              ...band,
              [field]:
                field === 'grades'
                  ? value.split(',').map((item) => item.trim()).filter(Boolean)
                  : value,
            }
          : band
      ),
    })
  }

  const updateIntervention = (groupKey, index, field, value) => {
    const rows = draft.student_interventions[groupKey] || []
    updateDraft({
      student_interventions: {
        ...draft.student_interventions,
        [groupKey]: rows.map((row, rowIndex) =>
          rowIndex === index ? { ...row, [field]: value } : row
        ),
      },
    })
  }

  const addIntervention = (groupKey) => {
    updateDraft({
      student_interventions: {
        ...draft.student_interventions,
        [groupKey]: [...(draft.student_interventions[groupKey] || []), { ...EMPTY_INTERVENTION }],
      },
    })
  }

  const removeIntervention = (groupKey, index) => {
    updateDraft({
      student_interventions: {
        ...draft.student_interventions,
        [groupKey]: (draft.student_interventions[groupKey] || []).filter((_, rowIndex) => rowIndex !== index),
      },
    })
  }

  const updateTeacherIntervention = (index, field, value) => {
    updateDraft({
      teacher_interventions: draft.teacher_interventions.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      ),
    })
  }

  const updateScoreboardRow = (index, field, value) => {
    updateDraft({
      scoreboard_rows: draft.scoreboard_rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      ),
    })
  }

  const saveReport = async () => {
    if (!profile?.school_id || !selectedSubjectId || !selectedExamKey || !selectedGrade) {
      setErrorMessage('Sila pilih tingkatan, subjek dan peperiksaan dahulu.')
      return
    }

    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const payload = {
        school_id: profile.school_id,
        academic_year: Number(academicYear),
        grade_label: selectedGrade,
        class_id: selectedClassId === 'all' ? null : selectedClassId,
        subject_id: selectedSubjectId,
        exam_key: getCanonicalDppExamKey(selectedExamKey),
        exam_name: selectedExam?.name || selectedExamKey,
        report_title: draft.report_title,
        issue_statement: draft.issue_statement || generatedIssueStatement,
        teacher_names: (draft.teacher_names || []).map((item) => String(item || '').trim()).filter(Boolean),
        problem_causes: {
          teacher: (draft.problem_causes?.teacher || []).map((item) => String(item || '').trim()).filter(Boolean),
          student: (draft.problem_causes?.student || []).map((item) => String(item || '').trim()).filter(Boolean),
        },
        target_group_note: draft.target_group_note,
        traffic_bands: draft.traffic_bands,
        student_interventions: draft.student_interventions,
        teacher_interventions: draft.teacher_interventions,
        scoreboard_rows: draft.scoreboard_rows,
        implementation_window: draft.implementation_window,
        notes: draft.notes,
        updated_by: profile.id,
      }

      let result
      if (reportRecord?.id) {
        result = await supabase
          .from('performance_dialog_reports')
          .update(payload)
          .eq('id', reportRecord.id)
          .select()
          .single()
      } else {
        result = await supabase
          .from('performance_dialog_reports')
          .insert({ ...payload, created_by: profile.id })
          .select()
          .single()
      }

      if (result.error) throw result.error

      setReportRecord(result.data)
      setDraft(normalizeDraft(result.data, reportDefaults))
      setSuccessMessage('Laporan Dialog Prestasi berjaya disimpan.')
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error.message?.includes('performance_dialog_reports')
          ? 'Jadual Dialog Prestasi belum tersedia. Jalankan migration performance_dialog_reports di Supabase.'
          : error.message || 'Gagal menyimpan laporan Dialog Prestasi.'
      )
    } finally {
      setSaving(false)
    }
  }

  const printPreview = () => {
    setPreviewOpen(true)
    setMobileActionsOpen(false)
    window.setTimeout(() => window.print(), 150)
  }

  const openPreview = () => {
    setPreviewOpen(true)
    setMobileActionsOpen(false)
  }

  const saveReportFromAction = () => {
    setMobileActionsOpen(false)
    saveReport()
  }

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Dialog Prestasi...</div>
  }

  return (
    <div className={`min-h-screen overflow-x-hidden bg-slate-50 p-3 sm:p-4 md:p-6 ${previewOpen ? 'dpp-preview-open' : ''}`}>
      <div className="dpp-screen-only mx-auto min-w-0 max-w-7xl space-y-4">
        <AppHeader
          title="Dialog Prestasi"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              Kembali ke Dashboard
            </button>
          }
          actionRight={
            <div className="relative flex min-w-0 flex-wrap gap-2">
              <div className="block sm:hidden">
                <button
                  type="button"
                  onClick={() => setMobileActionsOpen((current) => !current)}
                  aria-expanded={mobileActionsOpen}
                  aria-controls="dpp-mobile-actions"
                  className="inline-flex shrink-0 items-center gap-2 border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                >
                  <Menu className="h-4 w-4" aria-hidden="true" />
                  Tindakan
                </button>
              </div>

              <div
                id="dpp-mobile-actions"
                className={`absolute right-0 top-full z-30 mt-2 grid w-60 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl sm:static sm:z-auto sm:mt-0 sm:flex sm:w-auto sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none ${
                  mobileActionsOpen ? 'grid' : 'hidden'
                }`}
              >
                <button
                  type="button"
                  onClick={saveReportFromAction}
                  disabled={saving}
                  className="inline-flex w-full shrink-0 items-center gap-2 bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving ? 'Menyimpan...' : 'Simpan Laporan'}
                </button>
                <button
                  type="button"
                  onClick={openPreview}
                  className="inline-flex w-full shrink-0 items-center gap-2 border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 sm:w-auto"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={printPreview}
                  className="inline-flex w-full shrink-0 items-center gap-2 border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 sm:w-auto"
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  Cetak
                </button>
              </div>
            </div>
          }
        />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}
        {successMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-950">Laporan Dialog Prestasi Panitia</h1>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
                Jana DPP pasca peperiksaan mengikut subjek: punca masalah, kumpulan sasaran,
                traffic light, intervensi murid/guru dan scoreboard semasa.
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              Tahun akademik: {academicYear}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Tahun
              <input
                type="number"
                value={academicYear}
                onChange={(event) => {
                  setAcademicYear(event.target.value)
                  setSelectedGrade('')
                  setSelectedClassId('all')
                }}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Tingkatan
              <select
                value={selectedGrade}
                onChange={(event) => {
                  setSelectedGrade(event.target.value)
                  setSelectedClassId('all')
                }}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
              >
                <option value="">Pilih Tingkatan</option>
                {availableGrades.map((grade) => (
                  <option key={grade} value={grade}>
                    {getDisplayLevel(grade, levelMappings)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Kelas
              <select
                value={selectedClassId}
                onChange={(event) => setSelectedClassId(event.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
              >
                <option value="all">Semua Kelas</option>
                {availableClasses.map((classRow) => (
                  <option key={classRow.id} value={classRow.id}>
                    {getDisplayClassLabel(classRow.tingkatan, classRow.class_name, levelMappings)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Subjek
              <select
                value={selectedSubjectId}
                onChange={(event) => setSelectedSubjectId(event.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
              >
                <option value="">Pilih Subjek</option>
                {availableSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.subject_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Peperiksaan
              <select
                value={selectedExamKey}
                onChange={(event) => setSelectedExamKey(event.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
              >
                <option value="">Pilih Peperiksaan</option>
                {examOptions.map((exam) => (
                  <option key={exam.key} value={exam.key}>
                    {exam.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {contextLoading ? (
            <div className="mt-4 text-sm text-slate-500">Memuatkan data tahun akademik...</div>
          ) : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-5">
          <MetricCard title="Bilangan Murid" value={reportAnalytics.totalStudents} detail={`${reportAnalytics.scoredCount} ada markah`} />
          <MetricCard
            title="GPMP Semasa"
            value={formatDecimal(reportAnalytics.gpmp)}
            detail={
              reportAnalytics.gapTargetLabel
                ? `${reportAnalytics.gapTargetLabel} ${formatDecimal(reportAnalytics.comparisonTargetGpmp)}`
                : 'Target pembanding belum ditetapkan'
            }
            tone="indigo"
          />
          <MetricCard
            title={`Jurang ${reportAnalytics.gapTargetLabel || 'Target'}`}
            value={formatDecimal(reportAnalytics.gpmpGap)}
            detail={
              reportAnalytics.gapTargetLabel
                ? `GPMP ${selectedExam?.name || 'Semasa'} - GPMP ${reportAnalytics.gapTargetLabel}`
                : 'Pilih peperiksaan sebenar seperti PPT/PPC/PAT'
            }
            tone={
              reportAnalytics.gpmpGap === null
                ? 'slate'
                : reportAnalytics.gpmpGap > 0
                  ? 'amber'
                  : 'emerald'
            }
          />
          <MetricCard title="Peratus Lulus" value={formatPercent(reportAnalytics.passRate)} detail="Tidak termasuk TH/tiada markah" tone="emerald" />
          <MetricCard title="Purata Markah" value={formatDecimal(reportAnalytics.averageMark, 1)} detail={selectedExam?.name || '-'} />
        </section>

        <section className="grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="min-w-0 space-y-4">
            <DppContextEditor
              draft={draft}
              generatedIssueStatement={generatedIssueStatement}
              updateDraft={updateDraft}
            />
            <TrafficBandEditor
              bands={draft.traffic_bands}
              analytics={reportAnalytics}
              updateTrafficBand={updateTrafficBand}
            />
            <CauseEditor draft={draft} updateDraft={updateDraft} />
          </div>

          <div className="min-w-0 space-y-4">
            <StudentInterventionEditor
              bands={draft.traffic_bands}
              interventions={draft.student_interventions}
              updateIntervention={updateIntervention}
              addIntervention={addIntervention}
              removeIntervention={removeIntervention}
            />
            <TeacherInterventionEditor
              rows={draft.teacher_interventions}
              updateRow={updateTeacherIntervention}
              addRow={() =>
                updateDraft({
                  teacher_interventions: [...draft.teacher_interventions, { ...EMPTY_INTERVENTION }],
                })
              }
              removeRow={(index) =>
                updateDraft({
                  teacher_interventions: draft.teacher_interventions.filter((_, rowIndex) => rowIndex !== index),
                })
              }
            />
          </div>
        </section>

        <ScoreboardEditor
          rows={draft.scoreboard_rows}
          updateRow={updateScoreboardRow}
          addRow={() =>
            updateDraft({
              scoreboard_rows: [...draft.scoreboard_rows, { ...EMPTY_SCOREBOARD_ROW }],
            })
          }
          removeRow={(index) =>
            updateDraft({
              scoreboard_rows: draft.scoreboard_rows.filter((_, rowIndex) => rowIndex !== index),
            })
          }
        />
      </div>

      {previewOpen ? (
        <DppPreviewModal
          onClose={() => setPreviewOpen(false)}
          schoolInfo={schoolInfo}
          academicYear={academicYear}
          selectedGrade={selectedGrade}
          selectedClassLabel={selectedClassLabelForPreview}
          subject={selectedSubject}
          exam={selectedExam}
          draft={draft}
          analytics={reportAnalytics}
        />
      ) : null}
    </div>
  )
}

function DppPreviewModal({
  onClose,
  schoolInfo,
  academicYear,
  selectedGrade,
  selectedClassLabel,
  subject,
  exam,
  draft,
  analytics,
}) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      className="dpp-print-root fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-sm md:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dpp-print-content mx-auto min-w-0 max-w-6xl rounded-2xl bg-white p-3 shadow-2xl md:p-5">
        <div className="dpp-print-toolbar sticky top-0 z-20 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <div>
            <div className="text-sm font-bold text-slate-950">Preview Laporan DPP</div>
            <div className="mt-0.5 text-xs text-slate-500">
              Semak susun atur laporan sebelum cetak.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Cetak
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Tutup
            </button>
          </div>
        </div>

        <DppReportPreview
          schoolInfo={schoolInfo}
          academicYear={academicYear}
          selectedGrade={selectedGrade}
          selectedClassLabel={selectedClassLabel}
          subject={subject}
          exam={exam}
          draft={draft}
          analytics={analytics}
        />
      </div>
    </div>
  )
}

function MetricCard({ title, value, detail, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-950',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
  }[tone]

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-xs opacity-70">{detail}</div>
    </div>
  )
}

function Panel({ title, children, icon: Icon, tone = 'default' }) {
  const isNavy = tone === 'navy'

  return (
    <section
      className={`min-w-0 rounded-2xl border p-4 shadow-sm md:p-5 ${
        isNavy
          ? 'border-indigo-900 bg-indigo-950 text-white shadow-indigo-950/10'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-2">
        {Icon ? (
          <Icon
            className={`h-4 w-4 ${isNavy ? 'text-indigo-200' : 'text-slate-500'}`}
            aria-hidden="true"
          />
        ) : null}
        <h2 className={`text-base font-semibold ${isNavy ? 'text-white' : 'text-slate-900'}`}>
          {title}
        </h2>
      </div>
      <div
        className={`mt-4 ${
          isNavy
            ? '[&_input]:border-indigo-200 [&_input]:bg-white [&_input]:text-slate-950 [&_input]:placeholder:text-slate-400 [&_label]:text-indigo-50 [&_select]:border-indigo-200 [&_select]:bg-white [&_select]:text-slate-950 [&_textarea]:border-indigo-200 [&_textarea]:bg-white [&_textarea]:text-slate-950 [&_textarea]:placeholder:text-slate-400'
            : ''
        }`}
      >
        {children}
      </div>
    </section>
  )
}

function DppContextEditor({ draft, generatedIssueStatement, updateDraft }) {
  return (
    <Panel title="Maklumat DPP" icon={FileText} tone="navy">
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Nama laporan
          <input
            value={draft.report_title}
            onChange={(event) => updateDraft({ report_title: event.target.value })}
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Penyataan masalah
          <textarea
            value={draft.issue_statement || generatedIssueStatement}
            onChange={(event) => updateDraft({ issue_statement: event.target.value })}
            rows={3}
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Nama guru subjek terlibat
          <textarea
            value={joinLines(draft.teacher_names)}
            onChange={(event) => updateDraft({ teacher_names: splitLines(event.target.value) })}
            rows={3}
            placeholder="Satu nama guru setiap baris"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Tarikh mula
            <input
              type="date"
              value={draft.implementation_window?.start_date || ''}
              onChange={(event) =>
                updateDraft({
                  implementation_window: {
                    ...draft.implementation_window,
                    start_date: event.target.value,
                  },
                })
              }
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Tarikh tamat
            <input
              type="date"
              value={draft.implementation_window?.end_date || ''}
              onChange={(event) =>
                updateDraft({
                  implementation_window: {
                    ...draft.implementation_window,
                    end_date: event.target.value,
                  },
                })
              }
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
            />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Kumpulan sasaran
          <textarea
            value={draft.target_group_note}
            onChange={(event) => updateDraft({ target_group_note: event.target.value })}
            rows={3}
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
          />
        </label>
      </div>
    </Panel>
  )
}

function CauseEditor({ draft, updateDraft }) {
  return (
    <Panel title="Punca Masalah Guru dan Murid" icon={Users} tone="navy">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Punca guru
          <textarea
            value={joinLines(draft.problem_causes.teacher)}
            onChange={(event) =>
              updateDraft({
                problem_causes: {
                  ...draft.problem_causes,
                  teacher: splitLines(event.target.value),
                },
              })
            }
            rows={7}
            placeholder="Satu punca setiap baris"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Punca murid
          <textarea
            value={joinLines(draft.problem_causes.student)}
            onChange={(event) =>
              updateDraft({
                problem_causes: {
                  ...draft.problem_causes,
                  student: splitLines(event.target.value),
                },
              })
            }
            rows={7}
            placeholder="Satu punca setiap baris"
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
          />
        </label>
      </div>
    </Panel>
  )
}

function TrafficBandEditor({ bands, analytics, updateTrafficBand }) {
  return (
    <Panel title="Tetapan Traffic Light">
      <div className="grid gap-3">
        {(bands || []).map((band) => {
          const style = getBandStyle(band.key)
          const count = analytics.traffic?.[band.key]?.rows.length || 0

          return (
            <div key={band.key} className={`min-w-0 rounded-xl border ${style.border} ${style.bg} p-3`}>
              <div className="flex items-center justify-between gap-3">
                <div className={`font-semibold ${style.text}`}>{band.label}</div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.badge}`}>
                  {count} murid
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_90px_minmax(0,1.3fr)]">
                <input
                  value={band.label}
                  onChange={(event) => updateTrafficBand(band.key, 'label', event.target.value)}
                  className="min-w-0 rounded-lg border border-white/80 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={band.min}
                  onChange={(event) => updateTrafficBand(band.key, 'min', event.target.value)}
                  className="min-w-0 rounded-lg border border-white/80 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={band.max}
                  onChange={(event) => updateTrafficBand(band.key, 'max', event.target.value)}
                  className="min-w-0 rounded-lg border border-white/80 px-3 py-2 text-sm"
                />
                <input
                  value={(band.grades || []).join(', ')}
                  onChange={(event) => updateTrafficBand(band.key, 'grades', event.target.value)}
                  className="min-w-0 rounded-lg border border-white/80 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function StudentInterventionEditor({
  bands,
  interventions,
  updateIntervention,
  addIntervention,
  removeIntervention,
}) {
  return (
    <Panel title="Intervensi Murid Mengikut Traffic Light" icon={CalendarDays}>
      <div className="grid gap-4">
        {(bands || []).map((band) => {
          const rows = interventions?.[band.key] || []
          const style = getBandStyle(band.key)

          return (
            <div key={band.key} className="min-w-0 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className={`font-semibold ${style.text}`}>{band.label}</h3>
                <button
                  type="button"
                  onClick={() => addIntervention(band.key)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  Tambah
                </button>
              </div>
              <div className="mt-3 grid gap-3">
                {rows.map((row, index) => (
                  <InterventionFields
                    key={`${band.key}-${index}`}
                    row={row}
                    onChange={(field, value) => updateIntervention(band.key, index, field, value)}
                    onRemove={() => removeIntervention(band.key, index)}
                    toneKey={band.key}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function TeacherInterventionEditor({ rows, updateRow, addRow, removeRow }) {
  return (
    <Panel title="Intervensi Guru" icon={CalendarDays} tone="navy">
      <div className="grid gap-3">
        {(rows || []).map((row, index) => (
          <InterventionFields
            key={index}
            row={row}
            onChange={(field, value) => updateRow(index, field, value)}
            onRemove={() => removeRow(index)}
          />
        ))}
        <button
          type="button"
          onClick={addRow}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-indigo-100 bg-white px-4 py-2 text-sm font-semibold text-indigo-950 hover:bg-indigo-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tambah Intervensi Guru
        </button>
      </div>
    </Panel>
  )
}

function InterventionFields({ row, onChange, onRemove, toneKey = 'neutral' }) {
  const toneClass = getInterventionToneClass(toneKey)

  return (
    <div className={`min-w-0 rounded-xl border p-3 ${toneClass}`}>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_150px]">
        <input
          value={row.title || ''}
          onChange={(event) => onChange('title', event.target.value)}
          placeholder="Nama intervensi / program"
          className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={row.status || 'Dirancang'}
          onChange={(event) => onChange('status', event.target.value)}
          className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option>Dirancang</option>
          <option>Dalam Pelaksanaan</option>
          <option>Selesai</option>
          <option>Ditangguh</option>
        </select>
      </div>
      <textarea
        value={row.details || ''}
        onChange={(event) => onChange('details', event.target.value)}
        placeholder="Butiran intervensi"
        rows={2}
        className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <input
          type="date"
          value={row.start_date || ''}
          onChange={(event) => onChange('start_date', event.target.value)}
          className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={row.end_date || ''}
          onChange={(event) => onChange('end_date', event.target.value)}
          className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <input
          value={row.duration || ''}
          onChange={(event) => onChange('duration', event.target.value)}
          placeholder="Tempoh"
          className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center justify-center rounded-lg border border-rose-200 px-3 py-2 text-rose-700 hover:bg-rose-50"
          title="Buang intervensi"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function ScoreboardEditor({ rows, updateRow, addRow, removeRow }) {
  return (
    <Panel title="Scoreboard Semasa">
      <div className="grid gap-3">
        {(rows || []).map((row, index) => (
          <div key={index} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid gap-2 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_90px_90px_90px_150px_auto]">
              <input
                value={row.program || ''}
                onChange={(event) => updateRow(index, 'program', event.target.value)}
                placeholder="Nama program"
                className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={row.target || ''}
                onChange={(event) => updateRow(index, 'target', event.target.value)}
                placeholder="Sasaran"
                className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={row.achieved || ''}
                onChange={(event) => updateRow(index, 'achieved', event.target.value)}
                placeholder="Capai"
                className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={row.gap || ''}
                onChange={(event) => updateRow(index, 'gap', event.target.value)}
                placeholder="Jurang"
                className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={row.implementation_percent || ''}
                onChange={(event) => updateRow(index, 'implementation_percent', event.target.value)}
                placeholder="%"
                className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={row.status || 'Dirancang'}
                onChange={(event) => updateRow(index, 'status', event.target.value)}
                className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option>Dirancang</option>
                <option>Dalam Pelaksanaan</option>
                <option>Selesai</option>
                <option>Ditangguh</option>
              </select>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="inline-flex items-center justify-center rounded-lg border border-rose-200 px-3 py-2 text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <textarea
              value={row.support_notes || ''}
              onChange={(event) => updateRow(index, 'support_notes', event.target.value)}
              rows={2}
              placeholder="Sokongan kepakaran / catatan"
              className="mt-2 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tambah Program Scoreboard
        </button>
      </div>
    </Panel>
  )
}

const getFilledTextRows = (rows = []) =>
  (rows || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)

const hasInterventionContent = (item) =>
  ['title', 'details', 'start_date', 'end_date', 'duration'].some((field) =>
    String(item?.[field] || '').trim()
  )

const getFilledInterventions = (rows = []) => (rows || []).filter(hasInterventionContent)

const formatDateForDisplay = (dateText) => {
  if (!dateText) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return dateText

  const [year, month, day] = dateText.split('-')
  return `${day}/${month}/${year}`
}

const formatInterventionPeriod = (item) => {
  const startDate = formatDateForDisplay(item?.start_date)
  const endDate = formatDateForDisplay(item?.end_date)
  const dateRange =
    startDate && endDate ? `${startDate} hingga ${endDate}` : startDate || endDate
  const duration = String(item?.duration || '').trim()
  const status = String(item?.status || '').trim()
  const parts = []

  if (dateRange) parts.push(dateRange)
  if (duration) parts.push(`Tempoh: ${duration}`)
  if (status) parts.push(status)

  return parts.length ? parts.join(' | ') : 'Jangka masa belum ditetapkan.'
}

function DppReportPreview({
  schoolInfo,
  academicYear,
  selectedGrade,
  selectedClassLabel,
  subject,
  exam,
  draft,
  analytics,
}) {
  const issueStatement = draft.issue_statement || ''
  const title = draft.report_title || `DIALOG PRESTASI PANITIA ${subject?.subject_name || ''}`

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Preview Laporan DPP</h2>
          <p className="mt-1 text-sm text-slate-500">
            Struktur ini disusun berdasarkan format PPT DPP: isu, punca, traffic light,
            intervensi, scoreboard dan senarai murid sasaran.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {subject?.subject_name || 'Subjek'} | {exam?.name || 'Peperiksaan'}
        </span>
      </div>

      <div className="mt-5 grid gap-4">
        <article className="rounded-2xl border border-indigo-200 bg-indigo-950 p-5 text-white">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
            {schoolInfo?.school_name || 'Nama Sekolah'}
          </div>
          <h3 className="mt-3 text-2xl font-black uppercase leading-tight">{title}</h3>
          <p className="mt-2 text-sm text-indigo-100">
            {subject?.subject_name || '-'} | {exam?.name || '-'} | {getDisplayLevel(selectedGrade)} |{' '}
            {selectedClassLabel} | {academicYear}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold uppercase text-slate-950">Masalah, Punca dan What Next</h3>
          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Penyataan Masalah
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {issueStatement || 'Penyataan masalah belum diisi.'}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <SmallStat label="GPMP" value={formatDecimal(analytics.gpmp)} />
                <SmallStat
                  label={`Jurang ${analytics.gapTargetLabel || 'Target'}`}
                  value={formatDecimal(analytics.gpmpGap)}
                />
                <SmallStat label="Lulus" value={formatPercent(analytics.passRate)} />
                <SmallStat label="Bil. Murid" value={analytics.totalStudents} />
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <CauseList title="Punca Guru" rows={draft.problem_causes.teacher} />
                <CauseList title="Punca Murid" rows={draft.problem_causes.student} />
              </div>
              <div className="mt-4 text-sm leading-6 text-slate-600">
                <strong>Kumpulan sasaran:</strong>{' '}
                {draft.target_group_note || 'Belum diisi.'}
              </div>
            </div>
          </div>
          <DppWhatNextMatrix
            draft={draft}
            analytics={analytics}
            issueStatement={issueStatement}
          />
        </article>

        <article className="rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold uppercase text-slate-950">Traffic Light dan Intervensi</h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {(analytics.bands || []).map((band) => {
              const style = getBandStyle(band.key)
              const rows = analytics.traffic?.[band.key]?.rows || []
              const interventions = draft.student_interventions?.[band.key] || []

              return (
                <div key={band.key} className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <h4 className={`font-bold ${style.text}`}>{band.label}</h4>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.badge}`}>
                      {rows.length} murid
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    Julat {band.min}-{band.max} | {(band.grades || []).join(', ')}
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-5 text-slate-700">
                    {interventions.filter((item) => item.title || item.details).length ? (
                      interventions
                        .filter((item) => item.title || item.details)
                        .map((item, index) => (
                          <li key={index}>
                            <strong>{item.title || 'Intervensi'}</strong>
                            {item.details ? ` - ${item.details}` : ''}
                            {item.start_date || item.end_date ? (
                              <span className="block text-xs text-slate-500">
                                {item.start_date || '-'} hingga {item.end_date || '-'} | {item.status}
                              </span>
                            ) : null}
                          </li>
                        ))
                    ) : (
                      <li>Intervensi belum diisi.</li>
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold uppercase text-slate-950">Scoreboard Semasa</h3>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[980px] border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Program', 'Sasaran', 'Capai', 'Jurang', '% Laksana', 'Status', 'Sokongan / Catatan'].map((header) => (
                    <th key={header} className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(draft.scoreboard_rows || []).map((row, index) => (
                  <tr key={index} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.program || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.target || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.achieved || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.gap || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.implementation_percent || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.status || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.support_notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold uppercase text-slate-950">Senarai Murid Mengikut Traffic Light</h3>
          <div className="mt-3 grid gap-4">
            {(analytics.bands || []).map((band) => (
                <StudentTargetTable
                key={band.key}
                band={band}
                rows={analytics.traffic?.[band.key]?.rows || []}
                examName={exam?.name || 'Semasa'}
                targetKey={analytics.gapTargetKey}
                targetName={analytics.gapTargetLabel}
              />
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}

function DppWhatNextMatrix({ draft, analytics, issueStatement }) {
  const bands = analytics.bands?.length ? analytics.bands : DEFAULT_TRAFFIC_BANDS
  const teacherInterventions = getFilledInterventions(draft.teacher_interventions)
  const timelineRows = [
    ...bands.flatMap((band) => {
      const style = getBandStyle(band.key)
      return getFilledInterventions(draft.student_interventions?.[band.key]).map((item, index) => ({
        key: `${band.key}-${index}`,
        group: band.label,
        item,
        style,
      }))
    }),
    ...teacherInterventions.map((item, index) => ({
      key: `teacher-${index}`,
      group: 'Guru',
      item,
      style: { text: 'text-slate-700' },
    })),
  ]

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-300">
      <div className="bg-slate-900 px-4 py-2 text-center text-xs font-black uppercase tracking-[0.12em] text-white">
        Penyataan Masalah
      </div>
      <div className="bg-indigo-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-700">
        {issueStatement || 'Penyataan masalah belum diisi.'}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1040px] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white">
              {['Punca Masalah', 'Intervensi', 'Jangka Masa Pelaksanaan'].map((header) => (
                <th
                  key={header}
                  className="border-r border-slate-600 px-4 py-2 text-left text-xs font-black uppercase tracking-wide last:border-r-0"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="align-top">
              <td className="w-[34%] border-r border-slate-300 bg-indigo-50 p-4">
                <PreviewMatrixBlock title="Guru">
                  <PreviewBulletList rows={draft.problem_causes?.teacher} />
                </PreviewMatrixBlock>
                <PreviewMatrixBlock title="Murid">
                  <PreviewBulletList rows={draft.problem_causes?.student} />
                </PreviewMatrixBlock>
                <PreviewMatrixBlock title="Kumpulan Sasaran Murid">
                  <p className="text-sm leading-6 text-slate-700">
                    {draft.target_group_note || 'Belum diisi.'}
                  </p>
                </PreviewMatrixBlock>
                <PreviewMatrixBlock title="Traffic Light">
                  <ul className="space-y-1 text-sm leading-6 text-slate-700">
                    {bands.map((band) => {
                      const style = getBandStyle(band.key)
                      const count = analytics.traffic?.[band.key]?.rows?.length || 0
                      const grades = (band.grades || []).join(', ') || '-'

                      return (
                        <li key={band.key}>
                          <span className={`font-black ${style.text}`}>{band.label}</span>{' '}
                          [{count}] [{grades}] - Julat {band.min}-{band.max}
                        </li>
                      )
                    })}
                  </ul>
                </PreviewMatrixBlock>
                <PreviewMatrixBlock title="Guru Subjek">
                  <PreviewBulletList rows={draft.teacher_names} fallback="Nama guru belum diisi." />
                </PreviewMatrixBlock>
              </td>
              <td className="w-[40%] border-r border-slate-300 bg-indigo-50 p-4">
                <PreviewMatrixBlock title="Murid">
                  <div className="space-y-3">
                    {bands.map((band) => {
                      const style = getBandStyle(band.key)
                      const interventions = getFilledInterventions(
                        draft.student_interventions?.[band.key]
                      )

                      return (
                        <div key={band.key}>
                          <div className={`font-black ${style.text}`}>{band.label}</div>
                          <PreviewInterventionList
                            rows={interventions}
                            emptyText="Intervensi belum diisi."
                          />
                        </div>
                      )
                    })}
                  </div>
                </PreviewMatrixBlock>
                <PreviewMatrixBlock title="Guru">
                  <PreviewInterventionList
                    rows={teacherInterventions}
                    emptyText="Intervensi guru belum diisi."
                  />
                </PreviewMatrixBlock>
              </td>
              <td className="w-[26%] bg-indigo-50 p-4">
                <PreviewMatrixBlock title="Pelaksanaan">
                  {timelineRows.length ? (
                    <ul className="space-y-3">
                      {timelineRows.map((row) => (
                        <li key={row.key} className="rounded-lg bg-white/70 p-2">
                          <div className={`text-xs font-black uppercase ${row.style.text}`}>
                            {row.group}
                          </div>
                          <div className="mt-1 font-semibold text-slate-900">
                            {row.item.title || 'Intervensi'}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-600">
                            {formatInterventionPeriod(row.item)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm leading-6 text-slate-600">
                      Jangka masa pelaksanaan belum diisi.
                    </p>
                  )}
                </PreviewMatrixBlock>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PreviewMatrixBlock({ title, children }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600">
        {title}
      </div>
      {children}
    </div>
  )
}

function PreviewBulletList({ rows, fallback = 'Belum diisi.' }) {
  const items = getFilledTextRows(rows)

  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
      {items.length ? items.map((item, index) => <li key={index}>{item}</li>) : <li>{fallback}</li>}
    </ul>
  )
}

function PreviewInterventionList({ rows, emptyText }) {
  if (!rows.length) {
    return <p className="mt-1 text-xs italic leading-5 text-slate-500">{emptyText}</p>
  }

  return (
    <ul className="mt-1 list-disc space-y-2 pl-5 text-sm leading-5 text-slate-700">
      {rows.map((item, index) => (
        <li key={index}>
          <span className="font-semibold text-slate-900">{item.title || 'Intervensi'}</span>
          {item.details ? <span className="block text-slate-700">{item.details}</span> : null}
        </li>
      ))}
    </ul>
  )
}

function SmallStat({ label, value }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-950">{value}</div>
    </div>
  )
}

function CauseList({ title, rows }) {
  const items = (rows || []).filter(Boolean)
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-slate-700">
        {items.length ? items.map((item, index) => <li key={index}>{item}</li>) : <li>Belum diisi.</li>}
      </ul>
    </div>
  )
}

function StudentTargetTable({ band, rows, examName, targetKey, targetName }) {
  const style = getBandStyle(band.key)
  const visibleRows = rows.slice(0, 20)
  const examLabel = examName || 'Semasa'
  const scoreColumns = []
  const usedColumnKeys = new Set()
  const addScoreColumn = (column) => {
    const normalizedLabel = normalizeExamKey(column.label)
    if (!normalizedLabel || usedColumnKeys.has(normalizedLabel)) return
    usedColumnKeys.add(normalizedLabel)
    scoreColumns.push(column)
  }

  addScoreColumn({
    key: 'tov',
    label: 'TOV',
    getMetric: (row) => row.tov,
    markClass: 'text-slate-600',
  })
  addScoreColumn({
    key: 'comparisonTarget',
    label: targetName || targetKey,
    getMetric: (row) => row.comparisonTarget,
    markClass: 'font-semibold text-indigo-800',
  })
  addScoreColumn({
    key: 'current',
    label: examLabel,
    getMetric: (row) => row.current,
    markClass: 'font-semibold text-slate-900',
  })
  addScoreColumn({
    key: 'etr',
    label: 'ETR',
    getMetric: (row) => row.etr,
    markClass: 'text-slate-600',
  })

  const headers = [
    { key: 'bil', label: 'Bil' },
    { key: 'name', label: 'Nama Murid' },
    ...scoreColumns.flatMap((column) => [
      { key: `${column.key}-mark`, label: column.label },
      { key: `${column.key}-grade`, label: 'Gred' },
    ]),
  ]

  return (
    <div className={`rounded-xl border ${style.border}`}>
      <div className={`flex items-center justify-between gap-3 rounded-t-xl ${style.bg} px-4 py-3`}>
        <h4 className={`font-bold ${style.text}`}>{band.label}</h4>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.badge}`}>
          {rows.length} murid
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">Tiada murid dalam kumpulan ini.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[980px] border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr>
                {headers.map((header) => (
                  <th
                    key={header.key}
                    className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700"
                  >
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.student.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {row.student.student_profiles?.full_name || '-'}
                  </td>
                  {scoreColumns.flatMap((column) => {
                    const metric = column.getMetric(row)
                    return [
                      <td key={`${column.key}-mark`} className={`px-3 py-2 ${column.markClass}`}>
                        {metric?.mark ?? '-'}
                      </td>,
                      <td key={`${column.key}-grade`} className="px-3 py-2 text-slate-600">
                        {metric?.grade_name || '-'}
                      </td>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > visibleRows.length ? (
            <div className="px-4 py-2 text-xs text-slate-500">
              {rows.length - visibleRows.length} murid lagi tidak dipaparkan dalam preview ringkas.
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
