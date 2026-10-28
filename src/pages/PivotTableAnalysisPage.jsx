import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Grid3X3,
  Table2,
  Users,
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

const DEFAULT_GRADE_COLUMNS = ['A+', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'E', 'G', 'TH']

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLocaleUpperCase('ms-MY')
    .replace(/\s+/g, ' ')

const normalizeExamKey = (value) => normalizeText(value).replace(/\s+/g, '')

const getLevelNumber = (value) => String(value || '').match(/\d+/)?.[0] || ''

const isSameLevel = (left, right) => {
  const leftKey = normalizeText(left)
  const rightKey = normalizeText(right)
  if (leftKey && rightKey && leftKey === rightKey) return true

  const leftNumber = getLevelNumber(left)
  const rightNumber = getLevelNumber(right)
  return Boolean(leftNumber && rightNumber && leftNumber === rightNumber)
}

const getDefaultExamOrder = (examKey) => {
  const key = normalizeExamKey(examKey)
  if (key === 'TOV') return 0

  const otrMatch = key.match(/^OTR(\d+)$/)
  if (otrMatch) return Number(otrMatch[1]) * 10

  const arMatch = key.match(/^AR(\d+)$/)
  if (arMatch) return Number(arMatch[1]) * 10 + 1

  if (key === 'PAT') return 40
  if (key === 'ETR') return 999

  return 500
}

const isTargetExamKey = (value) => {
  const key = normalizeExamKey(value)
  return key === 'ETR' || key.startsWith('OTR')
}

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

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

  const lookupMark = Math.round(numericMark)
  const levelKey = normalizeText(gradeLabel)
  const matched = (gradeScales || []).find((scale) => {
    const scaleGrade = normalizeText(scale.grade_name ?? scale.grade ?? '')
    if (scaleGrade === 'TH') return false

    const scaleLevel = normalizeText(
      scale.tingkatan ?? scale.grade_label ?? scale.form_level ?? scale.level ?? ''
    )
    const min = Number(scale.min_mark ?? scale.min_score ?? 0)
    const max = Number(scale.max_mark ?? scale.max_score ?? 100)
    return scaleLevel === levelKey && lookupMark >= min && lookupMark <= max
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

const getMetricForExam = ({ scores, enrollmentId, subjectId, examKey, gradeLabel, gradeScales }) => {
  const key = normalizeExamKey(examKey)
  const scoreRow = (scores || []).find(
    (score) =>
      String(score.student_enrollment_id) === String(enrollmentId) &&
      String(score.subject_id) === String(subjectId) &&
      normalizeExamKey(score.exam_key) === key
  )

  if (!scoreRow) return { mark: null, grade_name: null, grade_point: null, is_absent: false }

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

const normalizePivotGrade = (metric) => {
  const grade = normalizeText(metric?.is_absent ? 'TH' : metric?.grade_name)
  if (!grade) return ''
  if (grade === 'T') return 'TH'
  return grade
}

const isPassGrade = (grade) => {
  const value = normalizeText(grade)
  return Boolean(value && !['G', 'F', 'TH', 'T'].includes(value))
}

const isFailGrade = (grade) => ['G', 'F'].includes(normalizeText(grade))

const isAbsentGrade = (grade) => ['TH', 'T'].includes(normalizeText(grade))

const formatPercent = (count, total) => {
  if (!total) return '0.00%'
  return `${((Number(count || 0) / total) * 100).toFixed(2)}%`
}

const formatMetric = (metric) => {
  if (metric?.is_absent) return 'TH'
  const parts = []
  if (metric?.mark !== null && metric?.mark !== undefined) parts.push(metric.mark)
  if (metric?.grade_name) parts.push(metric.grade_name)
  return parts.length ? parts.join(' | ') : '-'
}

const getGradeColumnsForLevel = (gradeScales, gradeLabel) => {
  const scaleColumns = (gradeScales || [])
    .filter((scale) =>
      isSameLevel(
        scale.tingkatan ?? scale.grade_label ?? scale.form_level ?? scale.level ?? '',
        gradeLabel
      )
    )
    .sort((a, b) => {
      const minA = Number(a.min_mark ?? a.min_score ?? 0)
      const minB = Number(b.min_mark ?? b.min_score ?? 0)
      return minB - minA
    })
    .map((scale) => normalizeText(scale.grade_name ?? scale.grade ?? ''))
    .filter((grade) => grade && !isAbsentGrade(grade))

  const columns = scaleColumns.length ? scaleColumns : DEFAULT_GRADE_COLUMNS.filter((grade) => grade !== 'TH')
  return [...new Set([...columns, 'TH'])]
}

const getAxisLabel = (grade, index) => `(${index}) ${grade === 'TH' ? 'TH' : grade}`

const getShortSubjectName = (subject) => normalizeText(subject?.subject_name || 'SUBJEK')

export default function PivotTableAnalysisPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [contextLoading, setContextLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [availableYears, setAvailableYears] = useState([])
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('')
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [studentRows, setStudentRows] = useState([])
  const [scores, setScores] = useState([])
  const [gradeScales, setGradeScales] = useState([])
  const [examConfigs, setExamConfigs] = useState([])
  const [levelMappings, setLevelMappings] = useState([])
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedExamKey, setSelectedExamKey] = useState('')
  const [selectedSubjectAId, setSelectedSubjectAId] = useState('')
  const [selectedSubjectBId, setSelectedSubjectBId] = useState('')
  const [selectedCell, setSelectedCell] = useState(null)

  const dashboardPath = getDashboardPath(profile)

  const loadInitialContext = useCallback(async () => {
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

      const schoolId = profileData.school_id
      const [
        { data: setupRows, error: setupError },
        { data: yearRows, error: yearError },
        { data: schoolData, error: schoolError },
      ] = await Promise.all([
        supabase
          .from('school_setup_configs')
          .select('current_academic_year')
          .eq('school_id', schoolId)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1),
        supabase.from('classes').select('academic_year').eq('school_id', schoolId),
        supabase
          .from('schools')
          .select('id, school_name, school_code')
          .eq('id', schoolId)
          .maybeSingle(),
      ])

      if (setupError) throw setupError
      if (yearError) throw yearError
      if (schoolError) throw schoolError

      const currentYear = new Date().getFullYear()
      const setupYear = setupRows?.[0]?.current_academic_year || currentYear
      const yearOptions = [
        ...new Set([
          setupYear,
          currentYear,
          ...(yearRows || []).map((row) => row.academic_year).filter(Boolean),
        ]),
      ]
        .map(String)
        .sort((a, b) => Number(b) - Number(a))

      setProfile(profileData)
      setSchoolInfo(schoolData || null)
      setAvailableYears(yearOptions)
      setSelectedAcademicYear(String(setupYear))
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan Pivot Table.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const loadYearData = useCallback(async () => {
    if (!profile?.school_id || !selectedAcademicYear) return

    setContextLoading(true)
    setErrorMessage('')

    try {
      const schoolId = profile.school_id
      const year = Number(selectedAcademicYear)
      const [
        classResult,
        subjectResult,
        enrollmentResult,
        scoreResult,
        gradeScaleResult,
        examConfigResult,
        loadedLevelMappings,
      ] = await Promise.all([
        supabase
          .from('classes')
          .select('id, tingkatan, class_name, academic_year, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', year),
        supabase
          .from('subjects')
          .select('*')
          .eq('school_id', schoolId)
          .eq('is_active', true),
        supabase
          .from('student_enrollments')
          .select(`
            id,
            class_id,
            academic_year,
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
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true),
        supabase
          .from('student_scores')
          .select('student_enrollment_id, subject_id, exam_key, mark, grade_name, grade_point, is_absent')
          .eq('school_id', schoolId)
          .eq('academic_year', year),
        supabase.from('grade_scales').select('*').eq('school_id', schoolId),
        supabase
          .from('exam_configs')
          .select('grade_label, exam_key, exam_name, exam_order, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', year),
        fetchSchoolLevelLabels({ schoolId, academicYear: year }),
      ])

      if (classResult.error) throw classResult.error
      if (subjectResult.error) throw subjectResult.error
      if (enrollmentResult.error) throw enrollmentResult.error
      if (scoreResult.error) throw scoreResult.error
      if (gradeScaleResult.error) throw gradeScaleResult.error
      if (examConfigResult.error) throw examConfigResult.error

      const mappedStudents = (enrollmentResult.data || []).map((row) => ({
        enrollment_id: row.id,
        class_id: row.class_id,
        student_profile_id: row.student_profile_id,
        full_name: row.student_profiles?.full_name || '',
        ic_number: row.student_profiles?.ic_number || '',
        gender: row.student_profiles?.gender || '',
        tingkatan: row.classes?.tingkatan || '',
        class_name: row.classes?.class_name || '',
      }))

      setClasses((classResult.data || []).filter((classRow) => classRow.is_active !== false))
      setSubjects(normalizeSubjectRows(subjectResult.data || []))
      setStudentRows(mappedStudents)
      setScores(scoreResult.data || [])
      setGradeScales(gradeScaleResult.data || [])
      setExamConfigs(examConfigResult.data || [])
      setLevelMappings(loadedLevelMappings || [])
      setSelectedCell(null)
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan data Pivot Table.')
    } finally {
      setContextLoading(false)
    }
  }, [profile?.school_id, selectedAcademicYear])

  useEffect(() => {
    loadInitialContext()
  }, [loadInitialContext])

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

  useEffect(() => {
    if (!availableGrades.length) {
      if (selectedGrade) setSelectedGrade('')
      return
    }

    if (!selectedGrade || !availableGrades.some((grade) => isSameLevel(grade, selectedGrade))) {
      setSelectedGrade(availableGrades[0])
    }
  }, [availableGrades, selectedGrade])

  const filteredStudents = useMemo(
    () =>
      studentRows
        .filter((student) => !selectedGrade || isSameLevel(student.tingkatan, selectedGrade))
        .sort((a, b) =>
          String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ms', {
            sensitivity: 'base',
          })
        ),
    [selectedGrade, studentRows]
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

  useEffect(() => {
    if (!availableSubjects.length) {
      setSelectedSubjectAId('')
      setSelectedSubjectBId('')
      return
    }

    if (!availableSubjects.some((subject) => String(subject.id) === String(selectedSubjectAId))) {
      setSelectedSubjectAId(String(availableSubjects[0].id))
    }
  }, [availableSubjects, selectedSubjectAId])

  useEffect(() => {
    const candidates = availableSubjects.filter(
      (subject) => String(subject.id) !== String(selectedSubjectAId)
    )

    if (!candidates.length) {
      setSelectedSubjectBId('')
      return
    }

    if (!candidates.some((subject) => String(subject.id) === String(selectedSubjectBId))) {
      setSelectedSubjectBId(String(candidates[0].id))
    }
  }, [availableSubjects, selectedSubjectAId, selectedSubjectBId])

  const selectedSubjectA = useMemo(
    () => availableSubjects.find((subject) => String(subject.id) === String(selectedSubjectAId)) || null,
    [availableSubjects, selectedSubjectAId]
  )

  const selectedSubjectB = useMemo(
    () => availableSubjects.find((subject) => String(subject.id) === String(selectedSubjectBId)) || null,
    [availableSubjects, selectedSubjectBId]
  )

  const examOptions = useMemo(() => {
    const options = new Map()
    const addOption = ({ key, name, order, source = 'score' }) => {
      const normalizedKey = normalizeExamKey(key)
      if (!normalizedKey || isTargetExamKey(normalizedKey)) return

      const next = {
        key: normalizedKey,
        name: name || normalizedKey,
        order: Number.isFinite(Number(order)) ? Number(order) : getDefaultExamOrder(normalizedKey),
        source,
      }
      const current = options.get(normalizedKey)

      if (
        !current ||
        next.source === 'config' ||
        (current.source !== 'config' && next.order < current.order)
      ) {
        options.set(normalizedKey, { ...current, ...next })
      }
    }

    ;(examConfigs || [])
      .filter((exam) => exam.is_active !== false)
      .filter((exam) => !selectedGrade || isSameLevel(exam.grade_label, selectedGrade))
      .forEach((exam) =>
        addOption({
          key: exam.exam_key,
          name: exam.exam_name || exam.exam_key,
          order: exam.exam_order,
          source: 'config',
        })
      )

    const enrollmentIds = new Set(filteredStudents.map((student) => String(student.enrollment_id)))
    const selectedSubjectIds = new Set(
      [selectedSubjectAId, selectedSubjectBId].filter(Boolean).map(String)
    )

    ;(scores || [])
      .filter((score) => enrollmentIds.has(String(score.student_enrollment_id)))
      .filter((score) => !selectedSubjectIds.size || selectedSubjectIds.has(String(score.subject_id)))
      .forEach((score) => addOption({ key: score.exam_key, name: score.exam_key, source: 'score' }))

    return [...options.values()].sort(
      (a, b) => a.order - b.order || String(a.name || '').localeCompare(String(b.name || ''), 'ms')
    )
  }, [
    examConfigs,
    filteredStudents,
    scores,
    selectedGrade,
    selectedSubjectAId,
    selectedSubjectBId,
  ])

  useEffect(() => {
    if (!examOptions.length) {
      if (selectedExamKey) setSelectedExamKey('')
      return
    }

    if (!examOptions.some((exam) => exam.key === normalizeExamKey(selectedExamKey))) {
      setSelectedExamKey(examOptions[0].key)
    }
  }, [examOptions, selectedExamKey])

  useEffect(() => {
    setSelectedCell(null)
  }, [
    selectedAcademicYear,
    selectedExamKey,
    selectedGrade,
    selectedSubjectAId,
    selectedSubjectBId,
  ])

  const gradeColumns = useMemo(
    () => getGradeColumnsForLevel(gradeScales, selectedGrade),
    [gradeScales, selectedGrade]
  )

  const pivotAnalysis = useMemo(() => {
    const emptyCounts = Object.fromEntries(gradeColumns.map((grade) => [grade, 0]))
    const matrix = Object.fromEntries(
      gradeColumns.map((rowGrade) => [
        rowGrade,
        Object.fromEntries(gradeColumns.map((columnGrade) => [columnGrade, 0])),
      ])
    )
    const rowTotals = { ...emptyCounts }
    const columnTotals = { ...emptyCounts }
    const entries = []
    const summary = {
      bothPass: 0,
      subjectAPassSubjectBFail: 0,
      subjectAFailSubjectBPass: 0,
      bothFail: 0,
      subjectAPassSubjectBAbsent: 0,
      subjectBPassSubjectAAbsent: 0,
      subjectAFailSubjectBAbsent: 0,
      subjectBFailSubjectAAbsent: 0,
      bothAbsent: 0,
    }

    if (!selectedSubjectAId || !selectedSubjectBId || !selectedExamKey || selectedSubjectAId === selectedSubjectBId) {
      return {
        matrix,
        rowTotals,
        columnTotals,
        grandTotal: 0,
        missingCount: filteredStudents.length,
        entries,
        summary,
      }
    }

    const validGradeSet = new Set(gradeColumns)

    filteredStudents.forEach((student) => {
      const gradeLabel = student.tingkatan || selectedGrade
      const subjectAMetric = getMetricForExam({
        scores,
        enrollmentId: student.enrollment_id,
        subjectId: selectedSubjectAId,
        examKey: selectedExamKey,
        gradeLabel,
        gradeScales,
      })
      const subjectBMetric = getMetricForExam({
        scores,
        enrollmentId: student.enrollment_id,
        subjectId: selectedSubjectBId,
        examKey: selectedExamKey,
        gradeLabel,
        gradeScales,
      })
      const subjectAGrade = normalizePivotGrade(subjectAMetric)
      const subjectBGrade = normalizePivotGrade(subjectBMetric)

      if (!validGradeSet.has(subjectAGrade) || !validGradeSet.has(subjectBGrade)) return

      matrix[subjectAGrade][subjectBGrade] += 1
      rowTotals[subjectAGrade] += 1
      columnTotals[subjectBGrade] += 1

      const entry = {
        student,
        subjectAGrade,
        subjectBGrade,
        subjectAMetric,
        subjectBMetric,
      }
      entries.push(entry)

      const subjectAPass = isPassGrade(subjectAGrade)
      const subjectBPass = isPassGrade(subjectBGrade)
      const subjectAFail = isFailGrade(subjectAGrade)
      const subjectBFail = isFailGrade(subjectBGrade)
      const subjectAAbsent = isAbsentGrade(subjectAGrade)
      const subjectBAbsent = isAbsentGrade(subjectBGrade)

      if (subjectAPass && subjectBPass) summary.bothPass += 1
      if (subjectAPass && subjectBFail) summary.subjectAPassSubjectBFail += 1
      if (subjectAFail && subjectBPass) summary.subjectAFailSubjectBPass += 1
      if (subjectAFail && subjectBFail) summary.bothFail += 1
      if (subjectAPass && subjectBAbsent) summary.subjectAPassSubjectBAbsent += 1
      if (subjectBPass && subjectAAbsent) summary.subjectBPassSubjectAAbsent += 1
      if (subjectAFail && subjectBAbsent) summary.subjectAFailSubjectBAbsent += 1
      if (subjectBFail && subjectAAbsent) summary.subjectBFailSubjectAAbsent += 1
      if (subjectAAbsent && subjectBAbsent) summary.bothAbsent += 1
    })

    const grandTotal = entries.length

    return {
      matrix,
      rowTotals,
      columnTotals,
      grandTotal,
      missingCount: Math.max(0, filteredStudents.length - grandTotal),
      entries,
      summary,
    }
  }, [
    filteredStudents,
    gradeColumns,
    gradeScales,
    scores,
    selectedExamKey,
    selectedGrade,
    selectedSubjectAId,
    selectedSubjectBId,
  ])

  const selectedExam = useMemo(
    () => examOptions.find((exam) => exam.key === normalizeExamKey(selectedExamKey)) || null,
    [examOptions, selectedExamKey]
  )

  const selectedCellStudents = useMemo(() => {
    if (!selectedCell) return []

    return pivotAnalysis.entries
      .filter(
        (entry) =>
          entry.subjectAGrade === selectedCell.subjectAGrade &&
          entry.subjectBGrade === selectedCell.subjectBGrade
      )
      .sort((a, b) =>
        String(a.student.full_name || '').localeCompare(String(b.student.full_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [pivotAnalysis.entries, selectedCell])

  const summaryRows = useMemo(() => {
    const subjectAName = getShortSubjectName(selectedSubjectA)
    const subjectBName = getShortSubjectName(selectedSubjectB)

    return [
      {
        key: 'both-pass',
        label: `LULUS ${subjectAName} LULUS ${subjectBName}`,
        count: pivotAnalysis.summary.bothPass,
        tone: 'emerald',
      },
      {
        key: 'a-pass-b-fail',
        label: `LULUS ${subjectAName} GAGAL ${subjectBName}`,
        count: pivotAnalysis.summary.subjectAPassSubjectBFail,
        tone: 'amber',
      },
      {
        key: 'a-fail-b-pass',
        label: `GAGAL ${subjectAName} LULUS ${subjectBName}`,
        count: pivotAnalysis.summary.subjectAFailSubjectBPass,
        tone: 'amber',
      },
      {
        key: 'both-fail',
        label: `GAGAL ${subjectAName} GAGAL ${subjectBName}`,
        count: pivotAnalysis.summary.bothFail,
        tone: 'rose',
      },
      {
        key: 'a-pass-b-absent',
        label: `LULUS ${subjectAName} TH ${subjectBName}`,
        count: pivotAnalysis.summary.subjectAPassSubjectBAbsent,
        tone: 'slate',
      },
      {
        key: 'b-pass-a-absent',
        label: `LULUS ${subjectBName} TH ${subjectAName}`,
        count: pivotAnalysis.summary.subjectBPassSubjectAAbsent,
        tone: 'slate',
      },
      {
        key: 'a-fail-b-absent',
        label: `GAGAL ${subjectAName} TH ${subjectBName}`,
        count: pivotAnalysis.summary.subjectAFailSubjectBAbsent,
        tone: 'slate',
      },
      {
        key: 'b-fail-a-absent',
        label: `GAGAL ${subjectBName} TH ${subjectAName}`,
        count: pivotAnalysis.summary.subjectBFailSubjectAAbsent,
        tone: 'slate',
      },
      {
        key: 'both-absent',
        label: `TH ${subjectAName} DAN ${subjectBName}`,
        count: pivotAnalysis.summary.bothAbsent,
        tone: 'slate',
      },
    ]
  }, [pivotAnalysis.summary, selectedSubjectA, selectedSubjectB])

  if (loading) {
    return <div className="p-6 text-slate-600">Loading Pivot Table...</div>
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto min-w-0 max-w-7xl space-y-4">
        <AppHeader
          title="Pivot Table"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Dashboard
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/analysis/subject')}
              className="border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
            >
              Prestasi Subjek
            </button>
          }
        />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Grid3X3 className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                <h1 className="text-xl font-bold text-slate-950">Analisis Silang Dua Subjek</h1>
              </div>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
                Pilih dua subjek untuk melihat bilangan murid mengikut kombinasi gred, seperti
                pivot table silang BM dan Sejarah.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {schoolInfo?.school_name || 'Sekolah'}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SelectField
              label="Tahun"
              value={selectedAcademicYear}
              onChange={(value) => setSelectedAcademicYear(value)}
              options={availableYears.map((year) => ({ value: year, label: year }))}
            />
            <SelectField
              label="Tingkatan"
              value={selectedGrade}
              onChange={(value) => setSelectedGrade(value)}
              options={availableGrades.map((grade) => ({
                value: grade,
                label: getDisplayLevel(grade, levelMappings),
              }))}
            />
            <SelectField
              label="Jenis Peperiksaan"
              value={selectedExamKey}
              onChange={(value) => setSelectedExamKey(value)}
              options={examOptions.map((exam) => ({ value: exam.key, label: exam.name }))}
            />
            <SelectField
              label="Subjek Baris"
              value={selectedSubjectAId}
              onChange={(value) => setSelectedSubjectAId(value)}
              options={availableSubjects.map((subject) => ({
                value: String(subject.id),
                label: subject.subject_name,
                disabled: String(subject.id) === String(selectedSubjectBId),
              }))}
            />
            <SelectField
              label="Subjek Kolum"
              value={selectedSubjectBId}
              onChange={(value) => setSelectedSubjectBId(value)}
              options={availableSubjects.map((subject) => ({
                value: String(subject.id),
                label: subject.subject_name,
                disabled: String(subject.id) === String(selectedSubjectAId),
              }))}
            />
          </div>

          {contextLoading ? (
            <div className="mt-4 text-sm text-slate-500">Memuatkan data tahun akademik...</div>
          ) : null}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="Calon Ambil"
            value={pivotAnalysis.grandTotal}
            detail={`${filteredStudents.length} murid dalam ${getDisplayLevel(selectedGrade, levelMappings) || '-'}`}
            icon={Users}
          />
          <MetricCard
            title="Lulus Kedua-dua"
            value={pivotAnalysis.summary.bothPass}
            detail={formatPercent(pivotAnalysis.summary.bothPass, pivotAnalysis.grandTotal)}
            icon={CheckCircle2}
            tone="emerald"
          />
          <MetricCard
            title={`${getShortSubjectName(selectedSubjectA)} Lulus`}
            value={pivotAnalysis.summary.subjectAPassSubjectBFail}
            detail={`${getShortSubjectName(selectedSubjectB)} gagal`}
            icon={AlertTriangle}
            tone="amber"
          />
          <MetricCard
            title={`${getShortSubjectName(selectedSubjectB)} Lulus`}
            value={pivotAnalysis.summary.subjectAFailSubjectBPass}
            detail={`${getShortSubjectName(selectedSubjectA)} gagal`}
            icon={AlertTriangle}
            tone="amber"
          />
          <MetricCard
            title="Data Tidak Lengkap"
            value={pivotAnalysis.missingCount}
            detail="Tiada gred salah satu subjek"
            icon={Table2}
          />
        </section>

        <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Pivot Table Silang {selectedSubjectA?.subject_name || '-'} -{' '}
                  {selectedSubjectB?.subject_name || '-'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedExam?.name || '-'} | {getDisplayLevel(selectedGrade, levelMappings) || '-'} | Tahun{' '}
                  {selectedAcademicYear || '-'}
                </p>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                Klik nombor untuk senarai murid
              </span>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[980px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="border-r border-slate-700 px-3 py-2 text-left" colSpan={2}>
                      {selectedSubjectA ? `GRED ${getShortSubjectName(selectedSubjectA)}` : 'GRED SUBJEK BARIS'}
                    </th>
                    <th className="px-3 py-2 text-center" colSpan={gradeColumns.length + 1}>
                      {selectedSubjectB ? `GRED ${getShortSubjectName(selectedSubjectB)}` : 'GRED SUBJEK KOLUM'}
                    </th>
                  </tr>
                  <tr className="bg-slate-50">
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Gred
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700">
                      Label
                    </th>
                    {gradeColumns.map((grade, index) => (
                      <th
                        key={grade}
                        className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-700"
                      >
                        {getAxisLabel(grade, index)}
                      </th>
                    ))}
                    <th className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-center font-semibold text-slate-900">
                      Grand Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gradeColumns.map((rowGrade, rowIndex) => (
                    <tr key={rowGrade} className="border-b border-slate-100">
                      <th className="bg-slate-50 px-3 py-2 text-left font-semibold text-slate-800">
                        {getAxisLabel(rowGrade, rowIndex)}
                      </th>
                      <td className="px-3 py-2 text-center text-slate-500">{rowGrade}</td>
                      {gradeColumns.map((columnGrade) => {
                        const count = pivotAnalysis.matrix[rowGrade]?.[columnGrade] || 0
                        const active =
                          selectedCell?.subjectAGrade === rowGrade &&
                          selectedCell?.subjectBGrade === columnGrade

                        return (
                          <td key={`${rowGrade}-${columnGrade}`} className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedCell({
                                  subjectAGrade: rowGrade,
                                  subjectBGrade: columnGrade,
                                })
                              }
                              disabled={!count}
                              className={`min-h-9 min-w-10 rounded-lg px-2 text-sm font-bold tabular-nums ${
                                active
                                  ? 'bg-indigo-600 text-white'
                                  : count
                                    ? 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100'
                                    : 'bg-slate-50 text-slate-300'
                              }`}
                            >
                              {count || ''}
                            </button>
                          </td>
                        )
                      })}
                      <td className="bg-slate-50 px-3 py-2 text-center font-black tabular-nums text-slate-950">
                        {pivotAnalysis.rowTotals[rowGrade] || ''}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-black text-slate-950">
                    <th className="px-3 py-2 text-left" colSpan={2}>
                      Grand Total
                    </th>
                    {gradeColumns.map((grade) => (
                      <td key={`total-${grade}`} className="px-3 py-2 text-center tabular-nums">
                        {pivotAnalysis.columnTotals[grade] || ''}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center tabular-nums">{pivotAnalysis.grandTotal || ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <SummaryPanel rows={summaryRows} total={pivotAnalysis.grandTotal} />
        </section>

        <StudentListPanel
          selectedCell={selectedCell}
          rows={selectedCellStudents}
          subjectA={selectedSubjectA}
          subjectB={selectedSubjectB}
          levelMappings={levelMappings}
        />
      </div>
    </div>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-normal text-slate-900 outline-none focus:border-indigo-500"
      >
        <option value="">Pilih {label}</option>
        {(options || []).map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function MetricCard({ title, value, detail, icon: Icon, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-950',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
  }[tone]

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</div>
        {Icon ? <Icon className="h-4 w-4 opacity-70" aria-hidden="true" /> : null}
      </div>
      <div className="mt-2 truncate text-2xl font-black tabular-nums">{value}</div>
      <div className="mt-1 truncate text-xs opacity-70">{detail}</div>
    </div>
  )
}

function SummaryPanel({ rows, total }) {
  const toneClass = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    rose: 'text-rose-700',
    slate: 'text-slate-700',
  }

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-950">Ringkasan LMS</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {total} calon
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                Kategori
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                Bil.
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-right font-semibold text-slate-700">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-slate-100 last:border-b-0">
                <td className={`px-3 py-2 text-xs font-bold ${toneClass[row.tone] || toneClass.slate}`}>
                  {row.label}
                </td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-950">{row.count}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {formatPercent(row.count, total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StudentListPanel({ selectedCell, rows, subjectA, subjectB, levelMappings }) {
  const subjectAName = getShortSubjectName(subjectA)
  const subjectBName = getShortSubjectName(subjectB)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Senarai Murid Berkaitan</h2>
          <p className="mt-1 text-sm text-slate-500">
            {selectedCell
              ? `${subjectAName} ${selectedCell.subjectAGrade} dan ${subjectBName} ${selectedCell.subjectBGrade}`
              : 'Klik nombor dalam pivot table untuk melihat senarai murid.'}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {rows.length} murid
        </span>
      </div>

      {selectedCell ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                  Nama
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                  Kelas
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                  {subjectAName}
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                  {subjectBName}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.student.enrollment_id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2 font-medium text-slate-950">{row.student.full_name}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {getDisplayClassLabel(row.student.tingkatan, row.student.class_name, levelMappings)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{formatMetric(row.subjectAMetric)}</td>
                    <td className="px-3 py-2 text-slate-600">{formatMetric(row.subjectBMetric)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-5 text-center text-slate-500">
                    Tiada murid untuk kombinasi gred ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
          Pilih mana-mana nombor dalam pivot table untuk memaparkan senarai murid bagi kombinasi
          gred tersebut.
        </div>
      )}
    </section>
  )
}
