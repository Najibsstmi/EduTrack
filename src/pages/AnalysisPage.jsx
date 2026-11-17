import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import ExamAnalysisPrintView from '../components/ExamAnalysisPrintView.jsx'
import { getDashboardPath } from '../lib/dashboardPath'
import {
  buildClassExamOptions,
  getExamStructureForGrade,
  normalizeSetupConfigWithExamConfigs,
} from '../lib/examConfig'
import {
  generateOtrMarks,
  getOtrKeysForTingkatan,
  shouldAutoRecalculateOtrs,
} from '../lib/otrGeneration.js'
import {
  fetchSchoolLevelLabels,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels'
import { normalizeSubjectRows } from '../lib/subjectLabels.js'
import { buildClassAnalysis, buildClassInterventions, comparisonSignature, rankClasses } from '../lib/classPerformance.js'
import { buildAssessmentIndex } from '../lib/minimumCAnalysis.js'
import { indexFirstAssessmentRows } from '../lib/analysisLookup.js'
import ClassDeepAnalysis from '../components/ClassDeepAnalysis.jsx'
import {
  getSubjectRuleName,
  shouldCountInSchoolGps,
  shouldShowSubjectGpmp,
} from '../lib/ssemjSubjectRules.js'

const ChevronLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
)

const getExamMetric = (analysis, examKey) => {
  const key = String(examKey || '').toUpperCase()
  return analysis?.[key] || { mark: null, grade_name: null, grade_point: null, is_absent: false }
}

const normalizeAnalysisExamKey = (value) =>
  String(value || '').trim().toUpperCase()

async function fetchAllRows(buildQuery) {
  const rows = []
  const size = 1000
  for (let offset = 0; ; offset += size) {
    const { data, error } = await buildQuery().range(offset, offset + size - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if ((data || []).length < size) return { data: rows, error: null }
  }
}

const isTargetExamKey = (value) => {
  const key = normalizeAnalysisExamKey(value)
  return key === 'ETR' || key.startsWith('OTR')
}

const getDefaultExamOrder = (examKey) => {
  const key = String(examKey || '').trim().toUpperCase()

  if (key === 'TOV') return 0
  if (key === 'ETR') return 999

  const otrMatch = key.match(/^OTR(\d+)$/)
  if (otrMatch) return Number(otrMatch[1]) * 10

  const arMatch = key.match(/^AR(\d+)$/)
  if (arMatch) return Number(arMatch[1]) * 10 + 1

  return 500
}

const isPassGrade = (grade) => {
  const value = String(grade || '').trim().toUpperCase()
  return ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E'].includes(value)
}

const isFailGrade = (grade) => {
  const value = String(grade || '').trim().toUpperCase()
  return value === 'G'
}

const isMinimumCGrade = (grade) => {
  const value = String(grade || '').trim().toUpperCase().replace(/[−–—]/g, '-')
  return ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'].includes(value)
}

const isBelowMinimumCGrade = (grade) => {
  const value = String(grade || '').trim().toUpperCase().replace(/[−–—]/g, '-')
  return ['D', 'E', 'F', 'G'].includes(value)
}

const isTHGrade = (grade) => {
  return String(grade || '').trim().toUpperCase() === 'TH'
}

const formatMetricMark = (metric) =>
  metric?.is_absent === true ? 'TH' : metric?.mark ?? '-'

const formatMetricGrade = (metric) =>
  metric?.is_absent === true ? 'TH' : metric?.grade_name ?? '-'


const getCurrentGradePoint = (gradeName, tingkatan, gradeScales) => {
  const grade = String(gradeName || '').trim().toUpperCase()
  const form = String(tingkatan || '').trim().toLowerCase()

  const matched = (gradeScales || []).find((item) => {
    const itemGrade = String(item.grade_name ?? item.grade ?? '').trim().toUpperCase()
    const itemForm = String(
      item.tingkatan ?? item.grade_label ?? item.form_level ?? item.level ?? ''
    )
      .trim()
      .toLowerCase()

    return itemGrade === grade && itemForm === form
  })

  const point = matched?.grade_point
  return point === null || point === undefined || point === ''
    ? null
    : Number(point)
}

const findGradeFromMark = (mark, tingkatan, gradeScales) => {
  const numericMark = Number(mark)
  if (Number.isNaN(numericMark)) return { grade_name: null, grade_point: null }

  const gradeLookupMark = Math.round(numericMark)

  const form = String(tingkatan || '').trim().toLowerCase()
  const matched = (gradeScales || []).find((item) => {
    const gradeName = String(item.grade_name ?? item.grade ?? '').trim().toUpperCase()
    if (gradeName === 'TH') return false

    const itemForm = String(
      item.tingkatan ?? item.grade_label ?? item.form_level ?? item.level ?? ''
    )
      .trim()
      .toLowerCase()
    const min = Number(item.min_mark ?? item.min_score ?? 0)
    const max = Number(item.max_mark ?? item.max_score ?? 100)

    return itemForm === form && gradeLookupMark >= min && gradeLookupMark <= max
  })

  if (!matched) return { grade_name: null, grade_point: null }

  return {
    grade_name: matched.grade_name ?? matched.grade ?? null,
    grade_point:
      matched.grade_point ??
      matched.point_value ??
      matched.grade_value ??
      null,
  }
}

const normalizeMetric = (metric, tingkatan, gradeScales) => {
  if (metric?.is_absent === true) {
    return {
      mark: null,
      grade_name: 'TH',
      grade_point: null,
      is_absent: true,
      label: metric?.label,
    }
  }

  const mark = metric?.mark

  if (mark === null || mark === undefined || mark === '' || Number.isNaN(Number(mark))) {
    return {
      mark: mark ?? null,
      grade_name: metric?.grade_name ?? null,
      grade_point: metric?.grade_point ?? null,
      is_absent: false,
      label: metric?.label,
    }
  }

  if (metric?.grade_name) return metric

  const computedGrade = findGradeFromMark(mark, tingkatan, gradeScales)

  return {
    ...metric,
    grade_name: computedGrade.grade_name,
    grade_point: computedGrade.grade_point,
  }
}

const getGradeBand = (grade) => {
  const value = String(grade || '').trim().toUpperCase()
  if (['A+', 'A', 'A-'].includes(value)) return 'A+/A'
  if (['B+', 'B', 'B-'].includes(value)) return 'B'
  if (['C+', 'C'].includes(value)) return 'C'
  if (value === 'D') return 'D'
  if (['E', 'F', 'G'].includes(value)) return 'E/G'
  return ''
}

const average = (values = []) => {
  const validValues = values
    .filter((value) => value !== null && value !== undefined && !Number.isNaN(Number(value)))
    .map(Number)

  if (!validValues.length) return null

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length
}

const formatDecimal = (value, digits = 2) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? '-'
    : Number(value).toFixed(digits)

const formatPercent = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? '-'
    : `${Number(value).toFixed(1)}%`

export default function AnalysisPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [studentRows, setStudentRows] = useState([])
  const [scores, setScores] = useState([])
  const [targets, setTargets] = useState([])
  const [gradeScales, setGradeScales] = useState([])
  const [subjectEnrollments, setSubjectEnrollments] = useState([])
  const [classDataError, setClassDataError] = useState('')
  const [examConfigs, setExamConfigs] = useState([])
  const [setupConfig, setSetupConfig] = useState(null)
  const [levelMappings, setLevelMappings] = useState([])

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedClassExamKey, setSelectedClassExamKey] = useState('')
  const [isPrintingAnalysis, setIsPrintingAnalysis] = useState(false)
  const [repairingOtr, setRepairingOtr] = useState(false)

  const dashboardPath = getDashboardPath(profile)
  const isSubjectPerformancePage = location.pathname === '/analysis/subject'
  const pageTitle = isSubjectPerformancePage ? 'Prestasi Subjek (GPMP)' : 'Prestasi Kelas'

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    setSelectedClassId('all')
    setSelectedSubjectId('')
    setSelectedClassExamKey('')
  }, [selectedTingkatan])

  const loadInitialData = async () => {
    setLoading(true)

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
      .single()

    if (profileError || !profileData) {
      alert('Profil pengguna tidak ditemui.')
      navigate('/login', { replace: true })
      return
    }

    setProfile(profileData)

    const schoolId = profileData.school_id
    const { data: activeSetup } = await supabase.from('school_setup_configs').select('current_academic_year').eq('school_id', schoolId).order('updated_at', { ascending: false }).order('created_at', { ascending: false }).limit(1)
    const currentYear = activeSetup?.[0]?.current_academic_year || new Date().getFullYear()

    const [
      { data: classesData, error: classesError },
      { data: subjectsData, error: subjectsError },
      { data: enrollmentsData, error: enrollmentsError },
      { data: scoresData, error: scoresError },
      { data: targetsData, error: targetsError },
      { data: gradeScalesData, error: gradeScalesError },
      { data: setupConfigRows, error: setupConfigError },
      { data: schoolData, error: schoolError },
      { data: subjectEnrollmentData, error: subjectEnrollmentError },
      { data: examConfigRows, error: examConfigError },
      loadedLevelMappings,
    ] = await Promise.all([
      supabase
        .from('classes')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', currentYear),

      supabase
        .from('subjects')
        .select('*')
        .eq('school_id', schoolId)
        .eq('is_active', true),

      fetchAllRows(() => supabase
        .from('student_enrollments')
        .select(`
          id,
          class_id,
          academic_year,
          student_profile_id,
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
        .eq('academic_year', currentYear)
        .eq('is_active', true).order('id')),

      fetchAllRows(() => supabase
        .from('student_scores')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', currentYear).order('id')),

      fetchAllRows(() => supabase
        .from('student_targets')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', currentYear).order('id')),

      supabase
        .from('grade_scales')
        .select('*')
        .eq('school_id', schoolId),

      supabase
        .from('school_setup_configs')
        .select('*')
        .eq('school_id', schoolId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1),

      supabase
        .from('schools')
        .select('id, school_name, school_code, school_type, logo_url')
        .eq('id', schoolId)
        .maybeSingle(),
      fetchAllRows(() => supabase.from('student_subject_enrollments').select('id, student_enrollment_id, subject_id').eq('school_id', schoolId).eq('is_active', true).order('id')),
      supabase.from('exam_configs').select('grade_label, exam_key, exam_name, exam_order, is_active').eq('school_id', schoolId).eq('academic_year', currentYear),
      fetchSchoolLevelLabels({ schoolId, academicYear: currentYear }),
    ])

    if (classesError) console.error(classesError)
    if (subjectsError) console.error(subjectsError)
    if (enrollmentsError) console.error(enrollmentsError)
    if (scoresError) console.error(scoresError)
    if (targetsError) console.error(targetsError)
    if (gradeScalesError) console.error(gradeScalesError)
    if (setupConfigError) console.error(setupConfigError)
    if (schoolError) console.error(schoolError)
    if (subjectEnrollmentError) console.error(subjectEnrollmentError)
    const analysisError = classesError || subjectsError || enrollmentsError || scoresError || targetsError || gradeScalesError || subjectEnrollmentError
    setClassDataError(analysisError?.message || '')

    if (examConfigError) console.error(examConfigError)

    const mappedStudents = (enrollmentsData || []).map((row) => ({
      enrollment_id: row.id,
      class_id: row.class_id,
      student_profile_id: row.student_profile_id,
      full_name: row.student_profiles?.full_name || '',
      ic_number: row.student_profiles?.ic_number || '',
      gender: row.student_profiles?.gender || '',
      tingkatan: row.classes?.tingkatan || '',
      class_name: row.classes?.class_name || '',
    }))

    setClasses(classesData || [])
    setSchoolInfo(schoolData || null)
    setSubjects(normalizeSubjectRows(subjectsData))
    setStudentRows(mappedStudents)
    setScores(scoresData || [])
    setTargets(targetsData || [])
    setGradeScales(gradeScalesData || [])
    setSubjectEnrollments(subjectEnrollmentData || [])
    setExamConfigs(examConfigRows || [])
    setLevelMappings(loadedLevelMappings)
    setSetupConfig(
      normalizeSetupConfigWithExamConfigs(setupConfigRows?.[0] || null, examConfigRows || [])
    )

    const availableTingkatan = sortLevelsByDisplayOrder(
      [...new Set((classesData || []).map((c) => c.tingkatan).filter(Boolean))],
      loadedLevelMappings
    )

    if (availableTingkatan.length > 0) {
      setSelectedTingkatan(availableTingkatan[0])
    }

    setLoading(false)
  }

  const availableTingkatan = useMemo(() => {
    return sortLevelsByDisplayOrder(
      [...new Set(classes.map((c) => c.tingkatan).filter(Boolean))],
      levelMappings
    )
  }, [classes, levelMappings])

  const availableClasses = useMemo(() => {
    return classes
      .filter((c) => c.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        String(a.class_name || '').localeCompare(String(b.class_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [classes, selectedTingkatan])

  const classExamOptions = useMemo(
    () => buildClassExamOptions(examConfigs, selectedTingkatan),
    [examConfigs, selectedTingkatan]
  )

  useEffect(() => {
    if (isSubjectPerformancePage) return
    if (!availableClasses.length) {
      if (selectedClassId !== 'all') setSelectedClassId('all')
      return
    }

    const selectedClassStillValid = availableClasses.some(
      (item) => String(item.id) === String(selectedClassId)
    )

    if (!selectedClassStillValid || selectedClassId === 'all') {
      setSelectedClassId(String(availableClasses[0].id))
    }
  }, [availableClasses, isSubjectPerformancePage, selectedClassId])

  useEffect(() => {
    if (isSubjectPerformancePage) return
    if (!classExamOptions.length) {
      if (selectedClassExamKey) setSelectedClassExamKey('')
      return
    }

    const selectedExamStillValid = classExamOptions.some(
      (exam) => exam.key === normalizeAnalysisExamKey(selectedClassExamKey)
    )

    if (!selectedExamStillValid) {
      setSelectedClassExamKey(classExamOptions[0].key)
    }
  }, [classExamOptions, isSubjectPerformancePage, selectedClassExamKey])

  const selectedClassData = useMemo(
    () =>
      availableClasses.find((item) => String(item.id) === String(selectedClassId)) ||
      null,
    [availableClasses, selectedClassId]
  )

  const classStudents = useMemo(() => {
    if (!selectedClassData) return []

    return studentRows
      .filter((student) => String(student.class_id) === String(selectedClassData.id))
      .sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [studentRows, selectedClassData])

  const classSubjectRows = useMemo(() => {
    if (!selectedTingkatan || !selectedClassExamKey) {
      return { chartSubjects: [], gpsSubjects: [] }
    }

    const baseSubjects = (subjects || [])
      .filter((subject) => subject.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )

    return {
      chartSubjects: baseSubjects.filter((subject) =>
        shouldShowSubjectGpmp({
          schoolInfo,
          tingkatan: subject?.tingkatan,
          subjectName: getSubjectRuleName(subject),
          examKey: selectedClassExamKey,
        })
      ),
      gpsSubjects: baseSubjects.filter((subject) =>
        shouldCountInSchoolGps({
          schoolInfo,
          tingkatan: subject?.tingkatan,
          subjectName: getSubjectRuleName(subject),
          examKey: selectedClassExamKey,
        })
      ),
    }
  }, [subjects, selectedTingkatan, selectedClassExamKey, schoolInfo])

  const subjectEnrollmentSet = useMemo(() => new Set(subjectEnrollments.map((row) => `${row.student_enrollment_id}__${row.subject_id}`)), [subjectEnrollments])
  const scoreIndex = useMemo(() => buildAssessmentIndex(scores, 'exam_key'), [scores])
  const targetIndex = useMemo(() => buildAssessmentIndex(targets, 'target_key'), [targets])
  const classMetric = useCallback((student, subject, examKey) => {
    const key = normalizeAnalysisExamKey(examKey)
    const target = isTargetExamKey(key)
    const row = (target ? targetIndex : scoreIndex).get(`${student.enrollment_id}__${subject.id}__${key}`)
    if (!row) return { mark: null, grade_name: null, grade_point: null, is_absent: false }
    return normalizeMetric({ mark: target ? row.target_mark : row.mark, grade_name: row.grade_name, grade_point: row.grade_point, is_absent: !target && row.is_absent === true }, student.tingkatan, gradeScales)
  }, [scoreIndex, targetIndex, gradeScales])
  const analysisYear = setupConfig?.current_academic_year || new Date().getFullYear()
  const detailedClassRows = useMemo(() => buildClassAnalysis({
    students: classStudents, subjects: classSubjectRows.chartSubjects,
    enrollmentSet: subjectEnrollmentSet, gradeScales, academicYear: analysisYear,
    examKey: selectedClassExamKey, getMetric: classMetric, isPassGrade,
  }), [classStudents, classSubjectRows.chartSubjects, subjectEnrollmentSet, gradeScales, analysisYear, selectedClassExamKey, classMetric])
  const gpsClassRows = useMemo(() => {
    const gpsIds = new Set(classSubjectRows.gpsSubjects.map((subject) => String(subject.id)))
    return detailedClassRows.filter((row) => gpsIds.has(String(row.subject.id)))
  }, [detailedClassRows, classSubjectRows.gpsSubjects])
  const classTrend = useMemo(() => classExamOptions.map((exam) => {
    const examSubjects = subjects.filter((subject) => subject.tingkatan === selectedTingkatan && shouldCountInSchoolGps({schoolInfo, tingkatan: subject.tingkatan, subjectName: getSubjectRuleName(subject), examKey: exam.key}))
    const rows = buildClassAnalysis({ students: classStudents, subjects: examSubjects, enrollmentSet: subjectEnrollmentSet, gradeScales, academicYear: analysisYear, examKey: exam.key, getMetric: classMetric, isPassGrade })
    const valid = rows.flatMap((row) => row.valid)
    return { ...exam, rows, gps: average(valid.map((item) => item.point)), passRate: valid.length ? valid.filter((item) => item.passed).length / valid.length * 100 : null, minimumRate: valid.filter((item) => item.minimumC !== null).length ? valid.filter((item) => item.minimumC === true).length / valid.filter((item) => item.minimumC !== null).length * 100 : null, count: valid.length, signature: comparisonSignature(rows), isTarget: isTargetExamKey(exam.key) }
  }), [classExamOptions, subjects, selectedTingkatan, schoolInfo, classStudents, subjectEnrollmentSet, gradeScales, analysisYear, classMetric])
  const classInterventions = useMemo(() => {
    const index = classTrend.findIndex((exam) => exam.key === selectedClassExamKey)
    const current = classTrend[index]
    const previous = current && !current.isTarget ? classTrend.slice(0, index).reverse().find((exam) => exam.count > 0 && !exam.isTarget) : null
    return buildClassInterventions(detailedClassRows, previous, classMetric)
  }, [detailedClassRows, classTrend, selectedClassExamKey, classMetric])

  const classStudentRankings = useMemo(() => {
    return classStudents
      .map((student) => {
        const scoredResults = gpsClassRows.flatMap((row) => row.valid.filter((item) => item.student.enrollment_id === student.enrollment_id))
        const gradePoints = scoredResults.map((item) => item.point)
        const grades = scoredResults.map((item) => item.grade)
        const gp = average(gradePoints)
        const bilA = grades.filter((grade) =>
          ['A+', 'A', 'A-'].includes(String(grade || '').trim().toUpperCase())
        ).length
        const bilLulus = scoredResults.filter((item) => item.passed).length

        return {
          ...student,
          gp,
          bilA,
          bilLulus,
          scoredSubjectCount: scoredResults.length,
        }
      })
      .sort((a, b) => {
        if (a.gp === null && b.gp !== null) return 1
        if (a.gp !== null && b.gp === null) return -1
        if (a.gp !== null && b.gp !== null && a.gp !== b.gp) return a.gp - b.gp
        if (a.bilA !== b.bilA) return b.bilA - a.bilA
        return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ms', {
          sensitivity: 'base',
        })
      })
      .map((student, index) => ({ ...student, rank: index + 1 }))
  }, [classStudents, gpsClassRows])

  const classSubjectPerformanceRows = useMemo(() => {
    return detailedClassRows.map((row) => ({ subject_id: row.subject.id, subject_name: row.subject.subject_name || '-', gp: row.gp, passRate: row.passRate, scoredCount: row.scoredCount, passCount: row.passCount, failCount: row.failCount }))
      .filter((row) => row.scoredCount > 0)
  }, [detailedClassRows])

  const classGradeDistribution = useMemo(() => {
    const counts = { 'A+/A': 0, B: 0, C: 0, D: 0, 'E/G': 0 }

    gpsClassRows.forEach((row) => {
      row.valid.forEach(({ grade }) => {
        const band = getGradeBand(grade)
        if (band) counts[band] += 1
      })
    })

    return counts
  }, [gpsClassRows])

  const classRankingRows = useMemo(() => {
    return rankClasses(availableClasses
      .map((classItem) => {
        const studentsInClass = studentRows.filter(
          (student) => String(student.class_id) === String(classItem.id)
        )
        const rows = buildClassAnalysis({ students: studentsInClass, subjects: classSubjectRows.gpsSubjects, enrollmentSet: subjectEnrollmentSet, gradeScales, academicYear: analysisYear, examKey: selectedClassExamKey, getMetric: classMetric, isPassGrade })
        const points = rows.flatMap((row) => row.valid.map((item) => item.point))

        return {
          id: classItem.id,
          class_name: classItem.class_name,
          gps: average(points),
          scoredCount: points.length,
        }
      })
      .filter((row) => row.scoredCount > 0))
  }, [availableClasses, studentRows, classSubjectRows.gpsSubjects, subjectEnrollmentSet, gradeScales, analysisYear, selectedClassExamKey, classMetric])

  const selectedClassRanking = useMemo(
    () =>
      classRankingRows.find((row) => String(row.id) === String(selectedClassData?.id)) ||
      null,
    [classRankingRows, selectedClassData]
  )

  const classSummary = useMemo(() => {
    const gpsPoints = []
    const marks = []
    let passCount = 0
    let gradedCount = 0

    gpsClassRows.forEach((row) => {
      row.valid.forEach(({ metric, point, passed }) => {
          gpsPoints.push(point)
          gradedCount += 1
          if (passed) passCount += 1

        if (metric?.mark !== null && metric?.mark !== undefined && !Number.isNaN(Number(metric.mark))) {
          marks.push(Number(metric.mark))
        }
      })
    })

    const studentsWithMarks = new Set(detailedClassRows.flatMap((row) => row.valid.map((item) => item.student.enrollment_id))).size

    return {
      totalStudents: classStudents.length,
      studentsWithMarks,
      gps: average(gpsPoints),
      passRate: gradedCount ? (passCount / gradedCount) * 100 : null,
      classRank: selectedClassRanking?.rank || null,
      classRankTotal: classRankingRows.length,
      highest: marks.length ? Math.max(...marks) : null,
      averageMark: average(marks),
    }
  }, [classStudents, gpsClassRows, detailedClassRows, selectedClassRanking, classRankingRows])

  const subjectGpmpSubjects = useMemo(
    () =>
      subjects.filter((subject) =>
        shouldShowSubjectGpmp({
          schoolInfo,
          tingkatan: subject?.tingkatan,
          subjectName: getSubjectRuleName(subject),
        })
      ),
    [subjects, schoolInfo]
  )

  const examSubjectIdSet = useMemo(
    () => new Set(subjectGpmpSubjects.map((subject) => String(subject.id))),
    [subjectGpmpSubjects]
  )

  const examScores = useMemo(
    () => scores.filter((score) => examSubjectIdSet.has(String(score.subject_id))),
    [scores, examSubjectIdSet]
  )

  const examTargets = useMemo(
    () => targets.filter((target) => examSubjectIdSet.has(String(target.subject_id))),
    [targets, examSubjectIdSet]
  )

  const availableSubjects = useMemo(() => {
    return subjectGpmpSubjects
      .filter((s) => s.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [subjectGpmpSubjects, selectedTingkatan])

  useEffect(() => {
    if (!selectedSubjectId) return

    const subjectStillAllowed = availableSubjects.some(
      (subject) => String(subject.id) === String(selectedSubjectId)
    )

    if (!subjectStillAllowed) {
      setSelectedSubjectId('')
    }
  }, [availableSubjects, selectedSubjectId])

  const filteredStudents = useMemo(() => {
    let result = [...studentRows]

    if (selectedTingkatan) {
      result = result.filter((s) => s.tingkatan === selectedTingkatan)
    }

    if (selectedClassId !== 'all') {
      result = result.filter((s) => s.class_id === selectedClassId)
    }

    result.sort((a, b) => {
      const classCompare = String(a.class_name || '').localeCompare(
        String(b.class_name || ''),
        'ms',
        { sensitivity: 'base' }
      )
      if (classCompare !== 0) return classCompare

      const genderRank = (g) => {
        const x = String(g || '').trim().toUpperCase()
        if (x === 'LELAKI') return 1
        if (x === 'PEREMPUAN') return 2
        return 3
      }

      const genderCompare = genderRank(a.gender) - genderRank(b.gender)
      if (genderCompare !== 0) return genderCompare

      return String(a.full_name || '').localeCompare(
        String(b.full_name || ''),
        'ms',
        { sensitivity: 'base' }
      )
    })

    return result
  }, [studentRows, selectedTingkatan, selectedClassId])

  const analysisColumns = useMemo(() => {
    const examMap = new Map()

    const addExam = ({ key, name, order }) => {
      const normalizedKey = String(key || '').trim().toUpperCase()
      if (!normalizedKey) return

      const current = examMap.get(normalizedKey)
      examMap.set(normalizedKey, {
        key: normalizedKey,
        name: name || current?.name || normalizedKey,
        order: Number.isFinite(Number(order))
          ? Number(order)
          : current?.order ?? getDefaultExamOrder(normalizedKey),
      })
    }

    addExam({ key: 'TOV', name: 'TOV', order: 0 })

    getExamStructureForGrade(setupConfig, selectedTingkatan).forEach((exam) => {
      addExam({
        key: exam.key,
        name: exam.name || exam.key,
        order: getDefaultExamOrder(exam.key),
      })
    })

    const selectedEnrollmentIds = new Set(
      filteredStudents.map((student) => student.enrollment_id)
    )

    ;(examScores || [])
      .filter(
        (score) =>
          (!selectedSubjectId || String(score.subject_id) === String(selectedSubjectId)) &&
          selectedEnrollmentIds.has(String(score.student_enrollment_id))
      )
      .forEach((score) => {
        addExam({ key: score.exam_key, name: score.exam_key })
      })

    ;(examTargets || [])
      .filter(
        (target) =>
          (!selectedSubjectId || String(target.subject_id) === String(selectedSubjectId)) &&
          selectedEnrollmentIds.has(String(target.student_enrollment_id))
      )
      .forEach((target) => {
        addExam({ key: target.target_key, name: target.target_key })
      })

    return Array.from(examMap.values()).sort((a, b) => {
      const orderDiff = a.order - b.order
      if (orderDiff !== 0) return orderDiff

      return String(a.name || '').localeCompare(String(b.name || ''), 'ms', {
        sensitivity: 'base',
      })
    })
  }, [setupConfig, selectedTingkatan, filteredStudents, examScores, examTargets, selectedSubjectId])

  const gradeColumns = useMemo(() => {
    return (gradeScales || [])
      .filter((grade) => {
        const label =
          grade.tingkatan ??
          grade.grade_label ??
          grade.form_level ??
          grade.level ??
          ''

        return String(label).trim().toLowerCase() === String(selectedTingkatan).trim().toLowerCase()
      })
      .sort((a, b) => {
        const minA = Number(a.min_mark ?? a.min_score ?? 0)
        const minB = Number(b.min_mark ?? b.min_score ?? 0)
        return minB - minA
      })
      .map((grade) => grade.grade_name ?? grade.grade ?? '')
      .filter(Boolean)
  }, [gradeScales, selectedTingkatan])

  const subjectScoresIndex = useMemo(() => selectedSubjectId ? indexFirstAssessmentRows(examScores, 'exam_key') : new Map(), [examScores, selectedSubjectId])
  const subjectTargetsIndex = useMemo(() => selectedSubjectId ? indexFirstAssessmentRows(examTargets, 'target_key') : new Map(), [examTargets, selectedSubjectId])

  const mergedRows = useMemo(() => {
    if (!selectedSubjectId) return []

    return filteredStudents.map((student) => {
      const analysis = {}

      analysisColumns.forEach((exam) => {
        const key = String(exam.key || '').toUpperCase()

        if (key.startsWith('OTR') || key === 'ETR') {
          const targetRow = subjectTargetsIndex.get(`${student.enrollment_id}__${selectedSubjectId}__${key}`)

          analysis[key] = normalizeMetric({
            mark: targetRow?.target_mark ?? null,
            grade_name: targetRow?.grade_name ?? null,
            grade_point: targetRow?.grade_point ?? null,
            is_absent: false,
            label: exam.name || key,
          }, student.tingkatan, gradeScales)
        } else {
          const scoreRow = subjectScoresIndex.get(`${student.enrollment_id}__${selectedSubjectId}__${key}`)

          analysis[key] = normalizeMetric({
            mark: scoreRow?.mark ?? null,
            grade_name: scoreRow?.grade_name ?? null,
            grade_point: scoreRow?.grade_point ?? null,
            is_absent: scoreRow?.is_absent === true,
            label: exam.name || key,
          }, student.tingkatan, gradeScales)
        }
      })

      return {
        ...student,
        analysis,
      }
    })
  }, [filteredStudents, subjectScoresIndex, subjectTargetsIndex, selectedSubjectId, analysisColumns, gradeScales])

  const summaryExamKey = useMemo(() => {
    const firstRealExam = analysisColumns.find((exam) => {
      const key = String(exam.key || '').toUpperCase()
      return key === 'TOV' || /^AR\d+$/.test(key) || key === 'ETR' || key.startsWith('OTR')
    })
    return String(firstRealExam?.key || '').toUpperCase()
  }, [analysisColumns])

  const summaryStats = useMemo(() => {
    if (!summaryExamKey) {
      return {
        totalStudents: filteredStudents.length,
        totalWithScore: 0,
        highest: null,
        lowest: null,
        average: null,
        gpmp: null,
      }
    }

    const examRows = mergedRows.map((row) => getExamMetric(row.analysis, summaryExamKey))

    const marks = examRows
      .map((item) => item.mark)
      .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
      .map((v) => Number(v))

    const points = mergedRows
      .map((row) => {
        const metric = getExamMetric(row.analysis, summaryExamKey)
        return getCurrentGradePoint(metric.grade_name, row.tingkatan, gradeScales)
      })
      .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
      .map((v) => Number(v))

    return {
      totalStudents: filteredStudents.length,
      totalWithScore: marks.length,
      highest: marks.length ? Math.max(...marks) : null,
      lowest: marks.length ? Math.min(...marks) : null,
      average: marks.length
        ? Number((marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(2))
        : null,
      gpmp: points.length
        ? Number((points.reduce((a, b) => a + b, 0) / points.length).toFixed(2))
        : null,
    }
  }, [filteredStudents, mergedRows, summaryExamKey, gradeScales])

  const summaryTableRows = useMemo(() => {
    if (!analysisColumns.length) return []

    return analysisColumns.map((exam) => {
      const examKey = String(exam.key || '').toUpperCase()
      const examLabel = exam.name || examKey

      const examData = mergedRows.map((row) => getExamMetric(row.analysis, examKey))

      const grades = examData.map((item) => item.grade_name || null)

      const gradeCounts = {}
      gradeColumns.forEach((grade) => {
        gradeCounts[grade] = grades.filter(
          (g) => String(g || '').trim().toUpperCase() === String(grade).trim().toUpperCase()
        ).length
      })

      const jumlahMurid = mergedRows.length

      const thCount = grades.filter((g) => isTHGrade(g)).length

      const hadir = grades.filter((g) => {
        const value = String(g || '').trim().toUpperCase()
        return value && value !== 'TH'
      }).length

      const tidakHadir = thCount
      const belumIsi = Math.max(0, jumlahMurid - hadir - tidakHadir)

      const lulus = grades.filter((g) => isPassGrade(g)).length
      const gagal = grades.filter((g) => isFailGrade(g)).length
      const minimumC = grades.filter((g) => isMinimumCGrade(g)).length
      const bawahC = grades.filter((g) => isBelowMinimumCGrade(g)).length

      const points = mergedRows
        .map((row) => {
          const metric = getExamMetric(row.analysis, examKey)
          return getCurrentGradePoint(metric.grade_name, row.tingkatan, gradeScales)
        })
        .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
        .map((v) => Number(v))

      const gpmp =
        points.length > 0
          ? Number((points.reduce((a, b) => a + b, 0) / points.length).toFixed(2))
          : null

      return {
        examKey,
        examLabel,
        jumlahMurid,
        hadir,
        tidakHadir,
        belumIsi,
        ...gradeCounts,
        lulus,
        minimumC,
        peratusMinimumC: hadir ? Number(((minimumC / hadir) * 100).toFixed(2)) : null,
        bawahC,
        peratusLulus: hadir ? Number(((lulus / hadir) * 100).toFixed(2)) : 0,
        gagal,
        peratusGagal: hadir ? Number(((gagal / hadir) * 100).toFixed(2)) : 0,
        gpmp,
      }
    })
  }, [analysisColumns, mergedRows, gradeColumns, gradeScales])

  const academicYear = setupConfig?.current_academic_year || new Date().getFullYear()

  const selectedSubjectName = useMemo(() => {
    return (
      availableSubjects.find((subject) => String(subject.id) === String(selectedSubjectId))
        ?.subject_name || ''
    )
  }, [availableSubjects, selectedSubjectId])

  const selectedClassExamLabel =
    classExamOptions.find((exam) => exam.key === selectedClassExamKey)?.name ||
    selectedClassExamKey ||
    '-'

  const missingSummaryRows = useMemo(
    () => summaryTableRows.filter((row) => Number(row.belumIsi || 0) > 0),
    [summaryTableRows]
  )
  const missingOtrKeys = useMemo(
    () => missingSummaryRows
      .map((row) => String(row.examKey || '').trim().toUpperCase())
      .filter((key) => key.startsWith('OTR')),
    [missingSummaryRows]
  )
  const canRegenerateMissingOtr = Boolean(
    profile?.id &&
    profile?.school_id &&
    selectedSubjectId &&
    missingOtrKeys.length > 0 &&
    shouldAutoRecalculateOtrs(setupConfig)
  )

  const handleRegenerateMissingOtr = useCallback(async () => {
    if (!canRegenerateMissingOtr || repairingOtr) return

    setRepairingOtr(true)

    try {
      const academicYearForTargets = setupConfig?.current_academic_year || new Date().getFullYear()
      const missingOtrKeySet = new Set(missingOtrKeys)
      const enrollmentIds = new Set(filteredStudents.map((student) => String(student.enrollment_id)))
      const tovByEnrollmentId = new Map(
        scores
          .filter(
            (score) =>
              String(score.subject_id) === String(selectedSubjectId) &&
              enrollmentIds.has(String(score.student_enrollment_id)) &&
              normalizeAnalysisExamKey(score.exam_key) === 'TOV' &&
              score.is_absent !== true &&
              score.mark !== null &&
              score.mark !== undefined &&
              score.mark !== ''
          )
          .map((score) => [String(score.student_enrollment_id), score.mark])
      )
      const etrByEnrollmentId = new Map(
        targets
          .filter(
            (target) =>
              String(target.subject_id) === String(selectedSubjectId) &&
              enrollmentIds.has(String(target.student_enrollment_id)) &&
              normalizeAnalysisExamKey(target.target_key) === 'ETR' &&
              target.target_mark !== null &&
              target.target_mark !== undefined &&
              target.target_mark !== ''
          )
          .map((target) => [String(target.student_enrollment_id), target.target_mark])
      )
      const mergedRowByEnrollmentId = new Map(
        mergedRows.map((row) => [String(row.enrollment_id), row])
      )
      const generatedRows = []
      const updatedAt = new Date().toISOString()

      filteredStudents.forEach((student) => {
        const tovMark = tovByEnrollmentId.get(String(student.enrollment_id))
        const etrMark = etrByEnrollmentId.get(String(student.enrollment_id))
        if (tovMark === undefined || etrMark === undefined) return

        const generatedMarks = generateOtrMarks({
          tingkatan: student.tingkatan,
          tovMark,
          etrMark,
          setupConfig,
          otrKeys: getOtrKeysForTingkatan(student.tingkatan, setupConfig),
        })

        Object.entries(generatedMarks).forEach(([targetKey, targetMark]) => {
          const normalizedTargetKey = normalizeAnalysisExamKey(targetKey)
          const currentMetric = getExamMetric(
            mergedRowByEnrollmentId.get(String(student.enrollment_id))?.analysis,
            normalizedTargetKey
          )
          const currentGrade = String(currentMetric?.grade_name || '').trim().toUpperCase()
          if (!missingOtrKeySet.has(normalizedTargetKey) || (currentGrade && currentGrade !== 'TH')) return

          generatedRows.push({
            school_id: profile.school_id,
            academic_year: academicYearForTargets,
            student_enrollment_id: student.enrollment_id,
            student_profile_id: student.student_profile_id,
            class_id: student.class_id,
            subject_id: selectedSubjectId,
            target_key: normalizedTargetKey,
            target_mark: targetMark,
            grade_name: null,
            grade_point: null,
            generated_by_system: true,
            manually_adjusted: false,
            remarks: 'Dijana semula daripada TOV dan ETR',
            entered_by: profile.id,
            updated_at: updatedAt,
          })
        })
      })

      if (!generatedRows.length) {
        alert('Tiada OTR boleh dijana. Pastikan TOV dan ETR murid lengkap dahulu.')
        return
      }

      const { data: savedRows, error } = await supabase
        .from('student_targets')
        .upsert(generatedRows, {
          onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
        })
        .select('*')

      if (error) throw error

      const savedKeySet = new Set(
        (savedRows || generatedRows).map(
          (row) => `${row.student_enrollment_id}__${row.subject_id}__${normalizeAnalysisExamKey(row.target_key)}`
        )
      )
      setTargets((current) => [
        ...(savedRows || generatedRows),
        ...current.filter(
          (row) =>
            !savedKeySet.has(
              `${row.student_enrollment_id}__${row.subject_id}__${normalizeAnalysisExamKey(row.target_key)}`
            )
        ),
      ])
      alert(`${savedRows?.length || generatedRows.length} rekod OTR berjaya dijana semula.`)
    } catch (error) {
      console.error('regenerate missing OTR error:', error)
      alert(error.message || 'Gagal jana semula OTR.')
    } finally {
      setRepairingOtr(false)
    }
  }, [
    canRegenerateMissingOtr,
    filteredStudents,
    mergedRows,
    missingOtrKeys,
    profile,
    repairingOtr,
    scores,
    selectedSubjectId,
    setupConfig,
    targets,
  ])

  const canPrintAnalysis = isSubjectPerformancePage
    ? Boolean(selectedSubjectId && !loading)
    : Boolean(selectedClassData && selectedClassExamKey && !loading)

  const handlePrintAnalysis = useCallback(() => {
    if (!canPrintAnalysis) return
    setIsPrintingAnalysis(true)
  }, [canPrintAnalysis])

  useEffect(() => {
    const stopPrintingAnalysis = () => setIsPrintingAnalysis(false)
    window.addEventListener('afterprint', stopPrintingAnalysis)
    return () => window.removeEventListener('afterprint', stopPrintingAnalysis)
  }, [])

  useEffect(() => {
    if (!isPrintingAnalysis) return undefined

    document.body.classList.add('exam-analysis-print-mode')
    let cancelled = false
    let printTimer
    let printScheduled = false

    const schedulePrint = () => {
      if (cancelled || printScheduled) return
      printScheduled = true
      printTimer = window.setTimeout(() => window.print(), 100)
    }

    const imageWaitTimer = window.setTimeout(schedulePrint, 1500)
    const images = [...document.querySelectorAll('.exam-analysis-print-root img')]
    const imagePromises = images.map((image) => {
      if (image.complete) return Promise.resolve()

      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      })
    })

    Promise.all(imagePromises).then(() => {
      window.clearTimeout(imageWaitTimer)
      schedulePrint()
    })

    return () => {
      cancelled = true
      document.body.classList.remove('exam-analysis-print-mode')
      window.clearTimeout(imageWaitTimer)
      if (printTimer) window.clearTimeout(printTimer)
    }
  }, [isPrintingAnalysis])

  const classPrintReport = useMemo(
    () => ({
      selectedClassId: selectedClassData?.id || null,
      summary: classSummary,
      subjectRows: classSubjectPerformanceRows,
      studentRankings: classStudentRankings,
      gradeDistribution: classGradeDistribution,
      classRankingRows,
      detailedRows: detailedClassRows,
      trend: classTrend,
      interventions: classInterventions,
    }),
    [
      selectedClassData,
      classSummary,
      classSubjectPerformanceRows,
      classStudentRankings,
      classGradeDistribution,
      classRankingRows,
      detailedClassRows,
      classTrend,
      classInterventions,
    ]
  )

  const subjectPrintReport = useMemo(
    () => ({
      summary: summaryStats,
      summaryRows: summaryTableRows,
      gradeColumns,
      studentRows: mergedRows,
      analysisColumns,
    }),
    [summaryStats, summaryTableRows, gradeColumns, mergedRows, analysisColumns]
  )

  const printFilterLabels = useMemo(() => {
    const levelLabel = selectedTingkatan
      ? getDisplayLevel(selectedTingkatan, levelMappings)
      : 'Semua Tingkatan'

    if (isSubjectPerformancePage) {
      const classLabel =
        selectedClassId === 'all'
          ? 'Semua Kelas'
          : availableClasses.find((item) => String(item.id) === String(selectedClassId))
              ?.class_name || 'Kelas dipilih'

      return {
        level: levelLabel,
        className: classLabel,
        subject: selectedSubjectName || 'Subjek belum dipilih',
      }
    }

    return {
      level: levelLabel,
      className: selectedClassData?.class_name || 'Kelas belum dipilih',
      exam: selectedClassExamLabel,
    }
  }, [
    availableClasses,
    isSubjectPerformancePage,
    levelMappings,
    selectedClassData,
    selectedClassExamLabel,
    selectedClassId,
    selectedSubjectName,
    selectedTingkatan,
  ])

  if (loading) return <div className="min-h-screen bg-slate-50 p-6" aria-label={`Memuatkan ${pageTitle}`}><div className="mx-auto max-w-7xl space-y-4"><div className="h-24 animate-pulse rounded-2xl bg-slate-200"/><div className="h-32 animate-pulse rounded-2xl bg-slate-200"/><div className="grid grid-cols-2 gap-4 md:grid-cols-5">{[1,2,3,4,5].map((n) => <div key={n} className="h-24 animate-pulse rounded-xl bg-slate-200"/>)}</div></div></div>

  if (!isSubjectPerformancePage) {
    const selectedTrendIndex = classTrend.findIndex((row) => row.key === selectedClassExamKey)
    const selectedTrend = classTrend[selectedTrendIndex]
    const previousTrend = !selectedTrend?.isTarget ? classTrend.slice(0, selectedTrendIndex).reverse().find((row) => !row.isTarget && row.gps !== null) : null
    const gpsChange = previousTrend && selectedTrend?.gps !== null && previousTrend.signature === selectedTrend?.signature ? selectedTrend.gps - previousTrend.gps : null
    const subjectGpRows = [...classSubjectPerformanceRows]
      .filter((row) => row.gp !== null)
      .sort((a, b) => a.gp - b.gp)
      .map((row) => ({
        label: row.subject_name,
        value: row.gp,
        meta: `${row.scoredCount} calon · GPS lebih rendah lebih baik`,
      }))

    const subjectPassRows = [...classSubjectPerformanceRows]
      .filter((row) => row.passRate !== null)
      .sort((a, b) => a.passRate - b.passRate)
      .map((row) => ({
        label: row.subject_name,
        value: row.passRate,
        meta: `${row.passCount}/${row.scoredCount} lulus · ${row.failCount} tidak lulus`,
      }))

    return (
      <>
        <div className="exam-analysis-screen min-h-screen overflow-x-hidden bg-slate-50 p-3 sm:p-4 md:p-6">
        <div className="mx-auto min-w-0 max-w-7xl space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  EduTrack
                </p>
                <h1 className="text-3xl font-bold text-slate-900">Prestasi Kelas</h1>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate('/analysis/student')}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Prestasi Murid
                </button>
                <button
                  onClick={() => navigate('/analysis/subject')}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Prestasi Subjek (GPMP)
                </button>
                <button
                  type="button"
                  onClick={handlePrintAnalysis}
                  disabled={!canPrintAnalysis}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300 md:px-4 md:py-2"
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  <span>{isPrintingAnalysis ? 'Menyediakan...' : 'Cetak Laporan Analisis'}</span>
                </button>
                <button
                  onClick={() => navigate(dashboardPath)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1.5"
                >
                  <ChevronLeftIcon />
                  <span>Dashboard</span>
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
            <h2 className="mb-4 text-lg md:text-xl font-semibold text-slate-900">Penapis Prestasi</h2>

            <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-3">
              <select
                value={selectedTingkatan}
                onChange={(e) => setSelectedTingkatan(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2.5 md:px-4 md:py-3 text-sm w-full"
              >
                {availableTingkatan.map((item) => (
                  <option key={item} value={item}>
                    {getDisplayLevel(item, levelMappings)}
                  </option>
                ))}
              </select>

              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2.5 md:px-4 md:py-3 text-sm w-full"
              >
                {availableClasses.length === 0 ? (
                  <option value="all">Tiada kelas</option>
                ) : (
                  availableClasses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.class_name}
                    </option>
                  ))
                )}
              </select>

              <select
                value={selectedClassExamKey}
                onChange={(e) => setSelectedClassExamKey(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2.5 md:px-4 md:py-3 text-sm w-full"
              >
                {classExamOptions.length === 0 ? (
                  <option value="">Tiada peperiksaan aktif</option>
                ) : (
                  classExamOptions.map((exam) => (
                    <option key={exam.key} value={exam.key}>
                      {exam.name || exam.key}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {classDataError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Data analisis tidak dapat dimuatkan: {classDataError}</div> : !selectedClassData || !selectedClassExamKey ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-500">
              Tiada data kelas atau peperiksaan aktif untuk paparan ini.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-5">
                <Card title="Bil Murid" value={classSummary.totalStudents} hint="Jumlah murid berdaftar aktif dalam kelas." />
                <Card title="Kelengkapan Markah" value={`${classSummary.studentsWithMarks}/${classSummary.totalStudents}`} hint="Bilangan murid yang mempunyai sekurang-kurangnya satu keputusan sah; tidak bermaksud semua subjek lengkap." />
                <Card title="GPS Kelas" value={formatDecimal(classSummary.gps)} hint="Nilai GPS lebih rendah menunjukkan prestasi akademik yang lebih baik." note={gpsChange === null ? '' : `${gpsChange < 0 ? 'Meningkat' : gpsChange > 0 ? 'Merosot' : 'Tiada perubahan'} ${Math.abs(gpsChange).toFixed(2)} berbanding ${previousTrend.name}`} noteTone={gpsChange < 0 ? 'text-emerald-700' : gpsChange > 0 ? 'text-red-700' : 'text-slate-500'} />
                <Card title="% Lulus" value={formatPercent(classSummary.passRate)} hint="Jumlah keputusan subjek yang lulus dibahagi jumlah keputusan subjek yang mempunyai mata gred sah. Ini bukan peratus murid lulus semua subjek." />
                <Card
                  title="Kedudukan Kelas"
                  hint="Kedudukan dalam tingkatan dan peperiksaan yang sama. GPS sama mendapat kedudukan yang sama."
                  value={
                    classSummary.classRank
                      ? `${classSummary.classRank} daripada ${classSummary.classRankTotal}`
                      : '-'
                  }
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <HorizontalBarChart
                  title="GP Setiap Subjek"
                  rows={subjectGpRows}
                  valueFormatter={(value) => formatDecimal(value)}
                  emptyText="Tiada data GP subjek untuk peperiksaan ini."
                  tone="indigo"
                  axisLabel="GPMP (lebih rendah lebih baik)"
                />
                <HorizontalBarChart
                  title="Peratus Lulus Setiap Subjek"
                  rows={subjectPassRows}
                  valueFormatter={(value) => formatPercent(value)}
                  maxValue={100}
                  emptyText="Tiada data peratus lulus subjek untuk peperiksaan ini."
                  tone="emerald"
                />
              </div>

              <ClassDeepAnalysis rows={detailedClassRows} trend={classTrend} gradeScales={gradeScales} level={selectedTingkatan} academicYear={analysisYear} interventionRows={classInterventions} navigate={navigate} />

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm lg:col-span-2">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg md:text-xl font-semibold text-slate-900">Kedudukan Murid</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedClassData.class_name} · {selectedClassExamLabel}
                      </p>
                    </div>
                    <div className="text-xs md:text-sm text-slate-500">
                      Rekod: <strong>{classStudentRankings.length}</strong>
                    </div>
                  </div>

                  {classStudentRankings.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                      Tiada markah murid untuk peperiksaan ini.
                    </div>
                  ) : (
                    <div className="overflow-x-auto -mx-4 md:mx-0">
                      <table className="w-full min-w-[760px] border-collapse text-xs md:text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="border-b px-3 py-3 text-left font-semibold">Kedudukan</th>
                            <th className="border-b px-3 py-3 text-left font-semibold">Nama</th>
                            <th className="border-b px-3 py-3 text-left font-semibold">GP Murid</th>
                            <th className="border-b px-3 py-3 text-left font-semibold">Bil A</th>
                            <th className="border-b px-3 py-3 text-left font-semibold">Bil Lulus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {classStudentRankings.map((student) => (
                            <tr key={student.enrollment_id} className="border-b border-slate-100">
                              <td className="px-3 py-3 font-semibold text-slate-900">{student.rank}</td>
                              <td className="px-3 py-3 font-medium text-slate-800">{student.full_name}</td>
                              <td className="px-3 py-3">{formatDecimal(student.gp)}</td>
                              <td className="px-3 py-3">{student.bilA}</td>
                              <td className="px-3 py-3">{student.bilLulus}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
                    <h2 className="mb-4 text-lg md:text-xl font-semibold text-slate-900">Taburan Gred Kelas</h2>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(classGradeDistribution).map(([grade, count]) => (
                        <div key={grade} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-xs font-semibold text-slate-500">{grade}</div>
                          <div className="mt-2 text-2xl font-bold text-slate-900">{count}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
                    <h2 className="mb-4 text-lg md:text-xl font-semibold text-slate-900">Kedudukan Kelas Dalam Tingkatan</h2>
                    {classRankingRows.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                        Data belum mencukupi untuk ranking kelas.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {classRankingRows.map((row) => (
                          <div
                            key={row.id}
                            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                              String(row.id) === String(selectedClassData.id)
                                ? 'border-blue-200 bg-blue-50'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {row.rank}. {row.class_name}
                              </div>
                              <div className="text-xs text-slate-500">{row.scoredCount} markah</div>
                            </div>
                            <div className="text-sm font-bold text-slate-900">
                              GPS {formatDecimal(row.gps)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
        {isPrintingAnalysis ? (
          <ExamAnalysisPrintView
            mode="class"
            schoolInfo={schoolInfo}
            academicYear={academicYear}
            filterLabels={printFilterLabels}
            classReport={classPrintReport}
          />
        ) : null}
      </>
    )
  }

  return (
    <>
      <div className="exam-analysis-screen min-h-screen overflow-x-hidden bg-slate-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto min-w-0 max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                EduTrack
              </p>
              <h1 className="text-3xl font-bold text-slate-900">{pageTitle}</h1>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate('/analysis/student')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Prestasi Murid
              </button>
              <button
                onClick={() => navigate(isSubjectPerformancePage ? '/analysis/class' : '/analysis/subject')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {isSubjectPerformancePage ? 'Prestasi Kelas' : 'Prestasi Subjek (GPMP)'}
              </button>
              <button
                type="button"
                onClick={handlePrintAnalysis}
                disabled={!canPrintAnalysis}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300 md:px-4 md:py-2"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                <span>{isPrintingAnalysis ? 'Menyediakan...' : 'Cetak Laporan Analisis'}</span>
              </button>
              <button
                onClick={() => navigate(dashboardPath)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1.5"
              >
                <ChevronLeftIcon />
                <span>Dashboard</span>
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
          <h2 className="mb-4 text-lg md:text-xl font-semibold text-slate-900">Penapis Prestasi</h2>

          <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-3">
            <select
              value={selectedTingkatan}
              onChange={(e) => setSelectedTingkatan(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 md:px-4 md:py-3 text-sm w-full"
            >
              {availableTingkatan.map((item) => (
                <option key={item} value={item}>
                  {getDisplayLevel(item, levelMappings)}
                </option>
              ))}
            </select>

            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 md:px-4 md:py-3 text-sm w-full"
            >
              <option value="all">Semua Kelas</option>
              {availableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.class_name}
                </option>
              ))}
            </select>

            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 md:px-4 md:py-3 text-sm w-full"
            >
              <option value="">Pilih Subjek</option>
              {availableSubjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subject_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-5">
          <Card title="Murid" value={summaryStats.totalStudents} />
          <Card title="Ada Markah" value={summaryStats.totalWithScore} />
          <Card title="GPMP" value={summaryStats.gpmp ?? '-'} />
          <Card title="Tertinggi" value={summaryStats.highest ?? '-'} />
          <Card title="Purata" value={summaryStats.average ?? '-'} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-4 text-lg md:text-xl font-semibold text-slate-900">Ringkasan</h2>

            {missingSummaryRows.length ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="font-semibold">Ada rekod belum isi untuk paparan ini.</div>
                <div className="mt-1">
                  {missingSummaryRows
                    .map((row) => `${row.examLabel}: ${row.belumIsi} murid`)
                    .join(' | ')}
                </div>
                {missingOtrKeys.length ? (
                  <button
                    type="button"
                    onClick={handleRegenerateMissingOtr}
                    disabled={!canRegenerateMissingOtr || repairingOtr}
                    className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {repairingOtr ? 'Menjana OTR...' : 'Jana Semula OTR'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {summaryTableRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500">
                Tiada data ringkasan untuk paparan ini.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="w-full min-w-[1040px] border-collapse text-xs md:text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border-b px-3 py-3 text-left font-semibold">Jenis Peperiksaan</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">Jumlah Murid</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">Hadir</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">Tak Hadir</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">Belum Isi</th>
                      {gradeColumns.map((grade) => (
                        <th key={grade} className="border-b px-3 py-3 text-left font-semibold">
                          {grade}
                        </th>
                      ))}
                      <th className="border-b bg-emerald-50 px-3 py-3 text-left font-semibold text-emerald-900">Minimum C</th>
                      <th className="border-b bg-emerald-50 px-3 py-3 text-left font-semibold text-emerald-900">% Minimum C</th>
                      <th className="border-b bg-red-50 px-3 py-3 text-left font-semibold text-red-900">Bawah C</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">Lulus</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">% Lulus</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">Gagal</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">% Gagal</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">GPMP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryTableRows.map((row) => (
                      <tr key={row.examKey} className="border-b border-slate-100">
                        <td className="px-3 py-3 font-medium">{row.examLabel}</td>
                        <td className="px-3 py-3">{row.jumlahMurid}</td>
                        <td className="px-3 py-3">{row.hadir}</td>
                        <td className="px-3 py-3">{row.tidakHadir}</td>
                        <td className={`px-3 py-3 font-semibold ${row.belumIsi ? 'text-amber-700' : 'text-slate-500'}`}>
                          {row.belumIsi || 0}
                        </td>
                        {gradeColumns.map((grade) => (
                          <td key={`${row.examKey}-${grade}`} className="px-3 py-3">
                            {row[grade] ?? 0}
                          </td>
                        ))}
                        <td className="bg-emerald-50/60 px-3 py-3 font-semibold text-emerald-800">{row.minimumC}</td>
                        <td className="bg-emerald-50/60 px-3 py-3 font-semibold text-emerald-800">
                          {row.peratusMinimumC === null ? 'Tiada Data' : `${row.peratusMinimumC}%`}
                        </td>
                        <td className="bg-red-50/60 px-3 py-3 font-semibold text-red-800">{row.bawahC}</td>
                        <td className="px-3 py-3">{row.lulus}</td>
                        <td className="px-3 py-3">{row.peratusLulus}%</td>
                        <td className="px-3 py-3">{row.gagal}</td>
                        <td className="px-3 py-3">{row.peratusGagal}%</td>
                        <td className="px-3 py-3">{row.gpmp ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg md:text-xl font-semibold text-slate-900">Jadual Murid</h2>
            <div className="text-xs md:text-sm text-slate-500">
              Rekod: <strong>{mergedRows.length}</strong>
            </div>
          </div>

          {!selectedSubjectId ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500 text-sm">
              Sila pilih subjek dahulu.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <table className="w-full min-w-[760px] border-collapse text-xs md:text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">Bil</th>
                    <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">IC</th>
                    <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">Nama</th>
                    <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">Kelas</th>
                    {analysisColumns.map((exam) => (
                      <React.Fragment key={exam.key}>
                        <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">{exam.name || exam.key}</th>
                        <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">Gred</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mergedRows.map((row, index) => (
                    <tr key={row.enrollment_id} className="border-b border-slate-100">
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{index + 1}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{row.ic_number}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium text-slate-800">{row.full_name}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{row.class_name}</td>
                      {analysisColumns.map((exam) => {
                        const key = String(exam.key || '').toUpperCase()
                        const metric = row.analysis?.[key]
                        return (
                          <React.Fragment key={key}>
                            <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                              {formatMetricMark(metric)}
                            </td>
                            <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                              {formatMetricGrade(metric)}
                            </td>
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
      {isPrintingAnalysis ? (
        <ExamAnalysisPrintView
          mode="subject"
          schoolInfo={schoolInfo}
          academicYear={academicYear}
          filterLabels={printFilterLabels}
          subjectReport={subjectPrintReport}
        />
      ) : null}
    </>
  )
}

function Card({ title, value, hint, note, noteTone }) {
  const colorMap = {
    'Murid': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', value: 'text-blue-900' },
    'Ada Markah': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', value: 'text-emerald-900' },
    'GPMP': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600', value: 'text-purple-900' },
    'Tertinggi': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', value: 'text-amber-900' },
    'Purata': { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-600', value: 'text-rose-900' },
  }

  const colors = colorMap[title] || { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', value: 'text-slate-900' }

  return (
    <div title={hint} className={`rounded-lg border ${colors.bg} ${colors.border} p-4 md:p-5 shadow-sm`}>
      <div className={`text-xs md:text-sm ${colors.text} font-medium`}>{title}</div>
      <div className={`mt-2 text-xl md:text-2xl font-bold ${colors.value}`}>{value}</div>
      {note && <div className={`mt-2 text-xs font-medium ${noteTone}`}>{note}</div>}
    </div>
  )
}

function HorizontalBarChart({
  title,
  rows,
  valueFormatter,
  maxValue,
  emptyText,
  tone = 'indigo',
  axisLabel,
}) {
  const [descending, setDescending] = useState(false)
  const colors = {
    indigo: 'bg-indigo-600',
    emerald: 'bg-emerald-600',
  }
  const barColor = colors[tone] || colors.indigo
  const calculatedMax =
    maxValue ||
    Math.max(
      ...rows
        .map((row) => Number(row.value))
        .filter((value) => !Number.isNaN(value)),
      1
    )

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg md:text-xl font-semibold text-slate-900">{title}</h2>{axisLabel && <p className="text-xs text-slate-500">{axisLabel}</p>}</div><button type="button" onClick={() => setDescending(!descending)} className="rounded-lg border px-3 py-2 text-xs font-semibold">{descending ? 'Tertinggi dahulu' : 'Terendah dahulu'} ↕</button></div>

      {!rows.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-4">
          {[...rows].sort((a,b) => descending ? b.value-a.value : a.value-b.value).map((row) => {
            const numericValue = Number(row.value)
            const width = Math.max(
              4,
              Math.min(100, calculatedMax ? (numericValue / calculatedMax) * 100 : 0)
            )

            return (
              <div key={row.label} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 font-semibold text-slate-800">
                    <span className="block truncate">{row.label}</span>
                    {row.meta ? (
                      <span className="text-xs font-medium text-slate-500">{row.meta}</span>
                    ) : null}
                  </div>
                  <div className="shrink-0 font-bold text-slate-900">
                    {valueFormatter(row.value)}
                  </div>
                </div>
                <div className="h-3 rounded-full bg-slate-100" title={`${row.label}: ${valueFormatter(row.value)} · ${row.meta}`}>
                  <div
                    className={`h-3 rounded-full ${barColor}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                {axisLabel && <div className="flex justify-between text-[10px] text-slate-500"><span>0</span><span>{formatDecimal(calculatedMax)}</span></div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
