import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PbdAnalysisPrintView from '../components/PbdAnalysisPrintView.jsx'
import PbdClassSlipPrint from '../components/PbdClassSlipPrint.jsx'
import { PbdTpBarChart } from '../components/PbdCharts.jsx'
import PbdTabs from '../components/PbdTabs.jsx'
import { supabase } from '../lib/supabaseClient'
import { getDashboardPath } from '../lib/dashboardPath.js'
import { getRelevantEnrollmentIds } from '../lib/completionMatrix.js'
import { buildPbdClassSlips } from '../lib/pbdClassSlips.js'
import {
  loadPbdTpDescriptorsFromWorkbook,
  mergePbdTpDescriptors,
} from '../lib/pbdTpDescriptors.js'
import {
  fetchSchoolLevelLabels,
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import {
  calculatePbdDistribution,
  createEmptyTpCounts,
  formatPercent,
  roundPercent,
  TP_LEVELS,
} from '../lib/pbdAnalysis.js'
import { formatSubjectName, normalizeSubjectRows } from '../lib/subjectLabels.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const DATASET_TABS = [
  { key: 'CURRENT', label: 'PBD Semasa' },
  { key: 'PENGGAL_1', label: 'Snapshot Penggal 1' },
  { key: 'PENGGAL_2', label: 'Snapshot Penggal 2' },
  { key: 'COMPARE', label: 'Perbandingan Penggal 1 vs Penggal 2' },
]

const DATASET_LABELS = {
  CURRENT: 'PBD Semasa',
  PENGGAL_1: 'Snapshot Penggal 1',
  PENGGAL_2: 'Snapshot Penggal 2',
}

const REPORT_TP_HIGHLIGHT_LEVELS = new Set([3, 4, 5, 6])

const GRADE_NUMBER_WORDS = {
  1: 'SATU',
  2: 'DUA',
  3: 'TIGA',
  4: 'EMPAT',
  5: 'LIMA',
  6: 'ENAM',
}

const buildYearOptions = (currentYear) => {
  const baseYear = Number(currentYear) || new Date().getFullYear()
  return [baseYear - 1, baseYear, baseYear + 1, baseYear + 2]
}

const normalizeText = (value) => String(value || '').trim().toLowerCase()

const getSubjectKey = (subject) => {
  const name = normalizeText(subject?.subject_name)
  const code = normalizeText(subject?.subject_code)
  return `${name}__${code}`
}

const getRowKey = (row) => `${row.student_enrollment_id}__${row.subject_id}`

const getMovementStatus = (delta) => {
  if (delta > 0) return 'Meningkat'
  if (delta < 0) return 'Menurun'
  return 'Kekal'
}

const formatReportPercent = (value) => {
  const number = roundPercent(value)
  return Number.isInteger(number) ? String(number) : number.toFixed(1)
}

const formatReportGradeLabel = (label) => {
  const number = String(label || '').match(/(\d+)/)?.[1]
  return number ? `TINGKATAN ${GRADE_NUMBER_WORDS[number] || number}` : String(label || '-').toUpperCase()
}

const formatReportClassLabel = (label) => String(label || '-').toUpperCase()

const createReportSummary = ({ id, label, tingkatan = '', className = '', counts, totalStudents }) => {
  const safeCounts = counts || createEmptyTpCounts()
  const total = Number(totalStudents) || 0
  const assessedCount = TP_LEVELS.reduce((sum, level) => sum + (safeCounts[level] || 0), 0)
  const tdCount = Math.max(0, total - assessedCount)
  const percentages = TP_LEVELS.reduce((acc, level) => {
    acc[level] = total > 0 ? roundPercent(((safeCounts[level] || 0) / total) * 100) : 0
    return acc
  }, {})
  const tdPercent = total > 0 ? roundPercent((tdCount / total) * 100) : 0
  const minimumCount = [3, 4, 5, 6].reduce((sum, level) => sum + (safeCounts[level] || 0), 0)
  const minimumPercent = total > 0 ? roundPercent((minimumCount / total) * 100) : 0

  return {
    id,
    label,
    tingkatan,
    className,
    counts: safeCounts,
    percentages,
    totalStudents: total,
    assessedCount,
    tdCount,
    tdPercent,
    minimumCount,
    minimumPercent,
  }
}

const sumSummaries = (summaries, label, id = label) => {
  const counts = createEmptyTpCounts()
  let totalStudents = 0

  ;(summaries || []).forEach((summary) => {
    totalStudents += Number(summary.totalStudents) || 0
    TP_LEVELS.forEach((level) => {
      counts[level] += Number(summary.counts?.[level]) || 0
    })
  })

  return createReportSummary({ id, label, counts, totalStudents })
}

export default function PbdAnalysisPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [profile, setProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [levelMappings, setLevelMappings] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [studentSubjectEnrollments, setStudentSubjectEnrollments] = useState([])
  const [pbdWindows, setPbdWindows] = useState([])
  const [currentRows, setCurrentRows] = useState([])
  const [snapshotRows, setSnapshotRows] = useState([])
  const [tpDescriptors, setTpDescriptors] = useState([])
  const [printSlips, setPrintSlips] = useState([])
  const [printDatasetLabel, setPrintDatasetLabel] = useState('')
  const [isPreparingPbdSlips, setIsPreparingPbdSlips] = useState(false)
  const [isPrintingAnalysis, setIsPrintingAnalysis] = useState(false)

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [tpFilter, setTpFilter] = useState('')
  const [activeDatasetKey, setActiveDatasetKey] = useState('CURRENT')

  const initPage = useCallback(async () => {
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
        .select('id, full_name, email, school_id, role, is_school_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || !profileData) {
        navigate('/login', { replace: true })
        return
      }

      const [
        { data: setupRows, error: setupError },
        { data: schoolData, error: schoolError },
      ] = await Promise.all([
        supabase
          .from('school_setup_configs')
          .select('current_academic_year, active_grade_labels')
          .eq('school_id', profileData.school_id)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('schools')
          .select('id, school_name, school_code, logo_url')
          .eq('id', profileData.school_id)
          .maybeSingle(),
      ])

      if (setupError) throw setupError
      if (schoolError) throw schoolError

      const setupData = setupRows?.[0] || null
      const currentYear = setupData?.current_academic_year || new Date().getFullYear()

      setProfile(profileData)
      setSchoolInfo(schoolData || null)
      setSetupConfig(setupData)
      setAcademicYear(currentYear)
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan analisis PBD.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const loadAnalysisData = useCallback(async (schoolId, year) => {
    if (!schoolId || !year) return

    setDataLoading(true)
    setErrorMessage('')

    try {
      const [
        loadedLevelMappings,
        { data: classData, error: classError },
        { data: subjectData, error: subjectError },
        { data: enrollmentData, error: enrollmentError },
        { data: studentSubjectData, error: studentSubjectError },
        { data: windowData, error: windowError },
        { data: currentData, error: currentError },
        { data: snapshotData, error: snapshotError },
        { data: descriptorData, error: descriptorError },
        workbookDescriptorResult,
      ] = await Promise.all([
        fetchSchoolLevelLabels({ schoolId, academicYear: year }),
        supabase
          .from('classes')
          .select('id, tingkatan, class_name, academic_year, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true)
          .order('tingkatan', { ascending: true })
          .order('class_name', { ascending: true }),
        supabase
          .from('subjects')
          .select('id, subject_name, subject_code, tingkatan, subject_type, is_core, is_active')
          .eq('school_id', schoolId)
          .eq('is_active', true)
          .order('subject_name', { ascending: true }),
        supabase
          .from('student_enrollments')
          .select(`
            id,
            class_id,
            student_profile_id,
            academic_year,
            is_active,
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
          .from('student_subject_enrollments')
          .select('id, student_enrollment_id, subject_id, academic_year, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true),
        supabase
          .from('pbd_windows')
          .select('*')
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .order('period_key', { ascending: true }),
        supabase
          .from('student_pbd_current')
          .select('*')
          .eq('school_id', schoolId)
          .eq('academic_year', year),
        supabase
          .from('student_pbd_snapshots')
          .select('*')
          .eq('school_id', schoolId)
          .eq('academic_year', year),
        supabase
          .from('pbd_tp_descriptors')
          .select('id, school_id, tingkatan, subject_name, tp_level, statement')
          .or(`school_id.is.null,school_id.eq.${schoolId}`)
          .order('subject_name', { ascending: true })
          .order('tp_level', { ascending: true }),
        loadPbdTpDescriptorsFromWorkbook()
          .then((data) => ({ data, error: null }))
          .catch((error) => ({ data: [], error })),
      ])

      if (classError) throw classError
      if (subjectError) throw subjectError
      if (enrollmentError) throw enrollmentError
      if (studentSubjectError) throw studentSubjectError
      if (windowError) throw windowError
      if (currentError) throw currentError
      if (snapshotError) throw snapshotError

      if (descriptorError) {
        console.warn('PBD TP descriptors are not available yet:', descriptorError.message)
      }
      if (workbookDescriptorResult.error) {
        console.warn(
          'PBD TP descriptor workbook could not be loaded:',
          workbookDescriptorResult.error.message
        )
      }

      setLevelMappings(loadedLevelMappings || [])
      setClasses(classData || [])
      setSubjects(normalizeSubjectRows(subjectData))
      setEnrollments(enrollmentData || [])
      setStudentSubjectEnrollments(studentSubjectData || [])
      setPbdWindows(windowData || [])
      setCurrentRows(currentData || [])
      setSnapshotRows(snapshotData || [])
      setTpDescriptors(
        mergePbdTpDescriptors({
          databaseDescriptors: descriptorError ? [] : descriptorData || [],
          workbookDescriptors: workbookDescriptorResult.data,
        })
      )
    } catch (error) {
      console.error(error)
      const missingPbdTable =
        error.message?.includes('pbd_windows') ||
        error.message?.includes('student_pbd_current') ||
        error.message?.includes('student_pbd_snapshots')

      setErrorMessage(
        missingPbdTable
          ? 'Jadual PBD baharu belum tersedia. Sila jalankan SQL migration PBD current/snapshot di Supabase.'
          : error.message || 'Gagal memuatkan data analisis PBD.'
      )
    } finally {
      setDataLoading(false)
    }
  }, [])

  useEffect(() => {
    if (checkingAuth) return
    initPage()
  }, [checkingAuth, initPage])

  useEffect(() => {
    if (!profile?.school_id || !academicYear) return
    loadAnalysisData(profile.school_id, academicYear)
  }, [profile?.school_id, academicYear, loadAnalysisData])

  const classById = useMemo(() => {
    const map = new Map()
    classes.forEach((item) => map.set(String(item.id), item))
    return map
  }, [classes])

  const subjectById = useMemo(() => {
    const map = new Map()
    subjects.forEach((item) => map.set(String(item.id), item))
    return map
  }, [subjects])

  const enrollmentById = useMemo(() => {
    const map = new Map()
    enrollments.forEach((item) => map.set(String(item.id), item))
    return map
  }, [enrollments])

  const availableTingkatan = useMemo(() => {
    const fromClasses = classes.map((item) => item.tingkatan).filter(Boolean)
    const fallback = setupConfig?.active_grade_labels || []
    return sortLevelsByDisplayOrder(fromClasses.length ? fromClasses : fallback, levelMappings)
  }, [classes, levelMappings, setupConfig])

  const availableClasses = useMemo(() => {
    const filtered = selectedTingkatan
      ? classes.filter((item) => item.tingkatan === selectedTingkatan)
      : classes

    return filtered.sort((a, b) =>
      getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
        getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
        'ms',
        { sensitivity: 'base', numeric: true }
      )
    )
  }, [classes, levelMappings, selectedTingkatan])

  const availableSubjects = useMemo(() => {
    const uniqueSubjects = new Map()

    subjects
      .filter((subject) => !selectedTingkatan || subject.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
      .forEach((subject) => {
        const key = getSubjectKey(subject)
        if (!uniqueSubjects.has(key)) uniqueSubjects.set(key, subject)
      })

    return Array.from(uniqueSubjects.values())
  }, [subjects, selectedTingkatan])

  const selectedSubject = useMemo(
    () => subjects.find((subject) => String(subject.id) === String(selectedSubjectId)) || null,
    [subjects, selectedSubjectId]
  )
  const selectedClass = useMemo(
    () => classes.find((classRow) => String(classRow.id) === String(selectedClassId)) || null,
    [classes, selectedClassId]
  )

  const selectedSubjectKey = selectedSubject ? getSubjectKey(selectedSubject) : ''
  const selectedSubjectName = selectedSubject?.subject_name || ''

  const reportClasses = useMemo(() => {
    return classes
      .filter((classRow) => {
        if (selectedTingkatan && classRow.tingkatan !== selectedTingkatan) return false
        if (selectedClassId && String(classRow.id) !== String(selectedClassId)) return false
        return true
      })
      .sort((a, b) =>
        getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
          getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
          'ms',
          { sensitivity: 'base', numeric: true }
        )
      )
  }, [classes, levelMappings, selectedClassId, selectedTingkatan])

  const resolveSubjectForClass = useCallback(
    (classRow) => {
      if (!selectedSubjectKey) return null

      return (
        subjects.find(
          (subject) =>
            getSubjectKey(subject) === selectedSubjectKey &&
            String(subject.tingkatan || '') === String(classRow.tingkatan || '')
        ) ||
        subjects.find(
          (subject) => getSubjectKey(subject) === selectedSubjectKey && !subject.tingkatan
        ) ||
        null
      )
    },
    [selectedSubjectKey, subjects]
  )

  const sourceRowsByDataset = useMemo(
    () => ({
      CURRENT: currentRows,
      PENGGAL_1: snapshotRows.filter((row) => row.period_key === 'PENGGAL_1'),
      PENGGAL_2: snapshotRows.filter((row) => row.period_key === 'PENGGAL_2'),
    }),
    [currentRows, snapshotRows]
  )

  const buildClassSummaries = useCallback(
    (datasetKey) => {
      if (!selectedSubjectKey) return []

      const sourceRows = sourceRowsByDataset[datasetKey] || []

      return reportClasses.map((classRow) => {
        const subject = resolveSubjectForClass(classRow)
        const counts = createEmptyTpCounts()

        if (!subject) {
          return createReportSummary({
            id: classRow.id,
            label: getDisplayClassLabel(classRow.tingkatan, classRow.class_name, levelMappings),
            tingkatan: classRow.tingkatan,
            className: classRow.class_name,
            counts,
            totalStudents: 0,
          })
        }

        const enrollmentIds = getRelevantEnrollmentIds({
          classId: classRow.id,
          subject,
          enrollments,
          studentSubjectEnrollments,
        })
        const enrollmentIdSet = new Set(enrollmentIds.map((id) => String(id)))

        sourceRows
          .filter(
            (row) =>
              String(row.class_id) === String(classRow.id) &&
              String(row.subject_id) === String(subject.id) &&
              enrollmentIdSet.has(String(row.student_enrollment_id))
          )
          .forEach((row) => {
            const tp = Number(row.tp)
            if (TP_LEVELS.includes(tp)) counts[tp] += 1
          })

        return createReportSummary({
          id: classRow.id,
          label: getDisplayClassLabel(classRow.tingkatan, classRow.class_name, levelMappings),
          tingkatan: classRow.tingkatan,
          className: classRow.class_name,
          counts,
          totalStudents: enrollmentIdSet.size,
        })
      })
    },
    [
      enrollments,
      levelMappings,
      reportClasses,
      resolveSubjectForClass,
      selectedSubjectKey,
      sourceRowsByDataset,
      studentSubjectEnrollments,
    ]
  )

  const activeReportDatasetKey = activeDatasetKey === 'COMPARE' ? 'CURRENT' : activeDatasetKey
  const activeClassSummaries = useMemo(
    () => buildClassSummaries(activeReportDatasetKey),
    [activeReportDatasetKey, buildClassSummaries]
  )

  const activeGradeGroups = useMemo(() => {
    const gradeLabels = selectedClassId && selectedClass
      ? [selectedClass.tingkatan]
      : selectedTingkatan
        ? [selectedTingkatan]
        : availableTingkatan
    const fallbackGradeLabels =
      gradeLabels.length > 0
        ? gradeLabels
        : sortLevelsByDisplayOrder(
            [...new Set(activeClassSummaries.map((summary) => summary.tingkatan).filter(Boolean))],
            levelMappings
          )

    return fallbackGradeLabels.map((tingkatan) => {
      const rows = activeClassSummaries.filter((summary) => summary.tingkatan === tingkatan)
      return {
        tingkatan,
        label: getDisplayLevel(tingkatan, levelMappings),
        rows,
        total: sumSummaries(rows, `Jumlah ${getDisplayLevel(tingkatan, levelMappings)}`, `grade-${tingkatan}`),
      }
    })
  }, [
    activeClassSummaries,
    availableTingkatan,
    levelMappings,
    selectedClass,
    selectedClassId,
    selectedTingkatan,
  ])

  const activeGradeSummaries = useMemo(
    () => activeGradeGroups.map((group) => group.total),
    [activeGradeGroups]
  )

  const activeOverallSummary = useMemo(
    () => sumSummaries(activeGradeSummaries, 'Jumlah', 'overall'),
    [activeGradeSummaries]
  )

  const activeDistribution = useMemo(() => {
    const rows = TP_LEVELS.flatMap((level) =>
      Array.from({ length: activeOverallSummary.counts[level] || 0 }, () => ({ tp: level }))
    )
    return calculatePbdDistribution(rows, activeOverallSummary.totalStudents)
  }, [activeOverallSummary])

  const comparisonClassSummaries = useMemo(
    () => ({
      PENGGAL_1: buildClassSummaries('PENGGAL_1'),
      PENGGAL_2: buildClassSummaries('PENGGAL_2'),
    }),
    [buildClassSummaries]
  )

  const comparisonGradeGroups = useMemo(
    () => ({
      PENGGAL_1: buildGroupsFromClassSummaries(
        comparisonClassSummaries.PENGGAL_1,
        levelMappings
      ),
      PENGGAL_2: buildGroupsFromClassSummaries(
        comparisonClassSummaries.PENGGAL_2,
        levelMappings
      ),
    }),
    [comparisonClassSummaries, levelMappings]
  )

  const comparisonOverallSummaries = useMemo(
    () => ({
      PENGGAL_1: sumSummaries(
        comparisonGradeGroups.PENGGAL_1.map((group) => group.total),
        'Jumlah',
        'print-compare-p1'
      ),
      PENGGAL_2: sumSummaries(
        comparisonGradeGroups.PENGGAL_2.map((group) => group.total),
        'Jumlah',
        'print-compare-p2'
      ),
    }),
    [comparisonGradeGroups]
  )

  const movementRows = useMemo(() => {
    if (!selectedSubjectKey) return []

    const allowedClassIds = new Set(reportClasses.map((classRow) => String(classRow.id)))
    const allowedSubjectIds = new Set(
      reportClasses
        .map((classRow) => resolveSubjectForClass(classRow))
        .filter(Boolean)
        .map((subject) => String(subject.id))
    )

    const filterMovementRows = (rows) =>
      rows.filter((row) => {
        if (!allowedClassIds.has(String(row.class_id))) return false
        if (!allowedSubjectIds.has(String(row.subject_id))) return false
        if (tpFilter && String(row.tp) !== String(tpFilter)) return false
        return true
      })

    const p1Rows = filterMovementRows(sourceRowsByDataset.PENGGAL_1 || [])
    const p2Rows = filterMovementRows(sourceRowsByDataset.PENGGAL_2 || [])
    const p1Map = new Map(p1Rows.map((row) => [getRowKey(row), row]))
    const p2Map = new Map(p2Rows.map((row) => [getRowKey(row), row]))

    return Array.from(p1Map.entries())
      .map(([key, p1]) => {
        const p2 = p2Map.get(key)
        if (!p2) return null

        const enrollment = enrollmentById.get(String(p1.student_enrollment_id))
        const classRow = classById.get(String(p1.class_id))
        const subject = subjectById.get(String(p1.subject_id))
        const delta = Number(p2.tp) - Number(p1.tp)

        return {
          key,
          studentName: enrollment?.student_profiles?.full_name || '-',
          className: classRow
            ? getDisplayClassLabel(classRow.tingkatan, classRow.class_name, levelMappings)
            : '-',
          subjectName: subject?.subject_name || '-',
          tp1: Number(p1.tp),
          tp2: Number(p2.tp),
          delta,
          status: getMovementStatus(delta),
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ms', { sensitivity: 'base' }))
  }, [
    classById,
    enrollmentById,
    levelMappings,
    reportClasses,
    resolveSubjectForClass,
    selectedSubjectKey,
    sourceRowsByDataset,
    subjectById,
    tpFilter,
  ])

  const windowStatus = useMemo(() => {
    if (!pbdWindows.length) return 'Window PBD belum diwujudkan.'
    const labels = pbdWindows.map((row) => {
      const label = row.period_name || DATASET_LABELS[row.period_key] || row.period_key
      const status = row.is_locked ? 'Dikunci' : row.is_open ? 'Dibuka' : 'Belum dibuka'
      return `${label}: ${status}`
    })
    return labels.join(' | ')
  }, [pbdWindows])
  const dashboardPath = getDashboardPath(profile)
  const canPrintPbdClass = Boolean(
    academicYear &&
      selectedTingkatan &&
      selectedClassId &&
      !dataLoading &&
      activeDatasetKey !== 'COMPARE'
  )
  const canPrintAnalysis = Boolean(
    selectedSubjectKey && !dataLoading && !isPreparingPbdSlips && !isPrintingAnalysis
  )

  const analysisFilterLabels = useMemo(
    () => ({
      tingkatan: selectedTingkatan
        ? getDisplayLevel(selectedTingkatan, levelMappings)
        : 'Semua Tingkatan',
      className: selectedClass
        ? getDisplayClassLabel(
            selectedClass.tingkatan,
            selectedClass.class_name,
            levelMappings
          )
        : 'Semua Kelas',
      tp: tpFilter ? `TP${tpFilter}` : 'Semua TP',
    }),
    [levelMappings, selectedClass, selectedTingkatan, tpFilter]
  )

  const handlePrintAnalysis = useCallback(() => {
    if (!canPrintAnalysis || !profile?.school_id) return

    setPrintSlips([])
    setPrintDatasetLabel('')
    setIsPrintingAnalysis(true)
  }, [canPrintAnalysis, profile?.school_id])

  const handlePrintPbdClass = useCallback(async () => {
    if (!canPrintPbdClass || !profile?.school_id || !selectedClass) return

    setIsPreparingPbdSlips(true)
    setPrintSlips([])
    setErrorMessage('')

    await Promise.resolve()

    try {
      const slips = buildPbdClassSlips({
        schoolId: profile.school_id,
        classRow: selectedClass,
        classLabel: getDisplayClassLabel(
          selectedClass.tingkatan,
          selectedClass.class_name,
          levelMappings
        ),
        levelLabel: getDisplayLevel(selectedClass.tingkatan, levelMappings),
        enrollments,
        subjects,
        studentSubjectEnrollments,
        sourceRows: sourceRowsByDataset[activeDatasetKey] || [],
        descriptors: tpDescriptors,
      })

      if (!slips.length) {
        setErrorMessage('Tiada murid aktif dalam kelas yang dipilih untuk dicetak.')
        return
      }

      setPrintDatasetLabel(DATASET_LABELS[activeDatasetKey] || DATASET_LABELS.CURRENT)
      setPrintSlips(slips)
    } catch (error) {
      console.error(error)
      setPrintSlips([])
      setErrorMessage(error.message || 'Gagal menyediakan slip PBD kelas.')
    } finally {
      setIsPreparingPbdSlips(false)
    }
  }, [
    activeDatasetKey,
    canPrintPbdClass,
    enrollments,
    levelMappings,
    profile?.school_id,
    selectedClass,
    sourceRowsByDataset,
    studentSubjectEnrollments,
    subjects,
    tpDescriptors,
  ])

  useEffect(() => {
    const resetPrintState = () => {
      setPrintSlips([])
      setPrintDatasetLabel('')
      setIsPreparingPbdSlips(false)
    }

    window.addEventListener('afterprint', resetPrintState)
    return () => window.removeEventListener('afterprint', resetPrintState)
  }, [])

  useEffect(() => {
    if (isPreparingPbdSlips || !printSlips.length) return undefined

    let cancelled = false
    let printTimer
    let printScheduled = false
    const schedulePrint = () => {
      if (cancelled || printScheduled) return
      printScheduled = true
      printTimer = window.setTimeout(() => window.print(), 100)
    }
    const imageWaitTimer = window.setTimeout(schedulePrint, 1500)
    const images = [...document.querySelectorAll('.pbd-slip-print-root img')]
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
      window.clearTimeout(imageWaitTimer)
      if (printTimer) window.clearTimeout(printTimer)
    }
  }, [isPreparingPbdSlips, printSlips.length])

  useEffect(() => {
    const stopPrintingAnalysis = () => setIsPrintingAnalysis(false)
    window.addEventListener('afterprint', stopPrintingAnalysis)
    return () => window.removeEventListener('afterprint', stopPrintingAnalysis)
  }, [])

  useEffect(() => {
    if (!isPrintingAnalysis) return undefined

    document.body.classList.add('pbd-analysis-print-mode')
    let cancelled = false
    let printTimer
    let printScheduled = false

    const schedulePrint = () => {
      if (cancelled || printScheduled) return
      printScheduled = true
      printTimer = window.setTimeout(() => window.print(), 100)
    }

    const imageWaitTimer = window.setTimeout(schedulePrint, 1500)
    const images = [...document.querySelectorAll('.pbd-analysis-print-root img')]
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
      document.body.classList.remove('pbd-analysis-print-mode')
      window.clearTimeout(imageWaitTimer)
      if (printTimer) window.clearTimeout(printTimer)
    }
  }, [isPrintingAnalysis])

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading analisis PBD...</div>
  }

  return (
    <>
    <div className="pbd-analysis-screen min-h-screen overflow-x-hidden bg-slate-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto min-w-0 max-w-7xl space-y-4">
        <AppHeader
          title="Analisis PBD"
          actionRight={
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Kembali ke Dashboard
            </button>
          }
        />

        <PbdTabs active="analysis" />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Penapis Analisis</h2>
              <p className="mt-1 text-sm text-slate-500">{windowStatus}</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={handlePrintAnalysis}
                disabled={!canPrintAnalysis}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isPrintingAnalysis ? 'Menyediakan cetakan...' : 'Cetak Analisis'}
              </button>
              <button
                type="button"
                onClick={handlePrintPbdClass}
                disabled={!canPrintPbdClass || isPreparingPbdSlips || isPrintingAnalysis}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isPreparingPbdSlips ? 'Menjana slip...' : 'Cetak Slip PBD Kelas'}
              </button>
              <button
                type="button"
                onClick={() => loadAnalysisData(profile.school_id, academicYear)}
                disabled={dataLoading}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dataLoading ? 'Memuat...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            <select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {buildYearOptions(academicYear).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={selectedTingkatan}
              onChange={(event) => {
                setSelectedTingkatan(event.target.value)
                setSelectedClassId('')
                setSelectedSubjectId('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua Tingkatan</option>
              {availableTingkatan.map((item) => (
                <option key={item} value={item}>
                  {getDisplayLevel(item, levelMappings)}
                </option>
              ))}
            </select>

            <select
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua Kelas</option>
              {availableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {getDisplayClassLabel(item.tingkatan, item.class_name, levelMappings)}
                </option>
              ))}
            </select>

            <select
              value={selectedSubjectId}
              onChange={(event) => setSelectedSubjectId(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Pilih Subjek</option>
              {availableSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {formatSubjectName(subject.subject_name)}
                </option>
              ))}
            </select>

            <select
              value={tpFilter}
              onChange={(event) => setTpFilter(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua TP</option>
              {TP_LEVELS.map((level) => (
                <option key={level} value={level}>
                  TP{level}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex sm:flex-wrap">
          {DATASET_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveDatasetKey(tab.key)}
              className={`min-h-11 rounded-xl px-3 py-2 text-xs font-semibold leading-snug sm:px-4 sm:text-sm ${
                tab.key === 'COMPARE' ? 'col-span-2' : ''
              } ${
                activeDatasetKey === tab.key
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </section>

        {!selectedSubjectKey ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
            Pilih subjek dahulu untuk memaparkan analisis taburan TP mengikut tingkatan dan kelas.
          </section>
        ) : null}

        {activeDatasetKey === 'COMPARE' ? (
          <ComparisonSection
            comparisonClassSummaries={comparisonClassSummaries}
            levelMappings={levelMappings}
            movementRows={movementRows}
            selectedSubjectName={selectedSubjectName}
          />
        ) : (
          <ReportSection
            activeDatasetKey={activeDatasetKey}
            activeDistribution={activeDistribution}
            academicYear={academicYear}
            gradeGroups={activeGradeGroups}
            overallSummary={activeOverallSummary}
            selectedSubjectName={selectedSubjectName}
          />
        )}
      </div>
    </div>
    <PbdClassSlipPrint
      slips={printSlips}
      schoolInfo={schoolInfo}
      academicYear={academicYear}
      datasetLabel={printDatasetLabel}
    />
    {isPrintingAnalysis ? (
      <PbdAnalysisPrintView
        schoolInfo={schoolInfo}
        academicYear={academicYear}
        selectedSubjectName={selectedSubjectName}
        activeDatasetKey={activeDatasetKey}
        activeGradeGroups={activeGradeGroups}
        activeOverallSummary={activeOverallSummary}
        activeDistribution={activeDistribution}
        movementRows={movementRows}
        comparisonGradeGroups={comparisonGradeGroups}
        comparisonOverallSummaries={comparisonOverallSummaries}
        filterLabels={analysisFilterLabels}
      />
    ) : null}
    </>
  )
}

function ReportSection({
  activeDatasetKey,
  activeDistribution,
  academicYear,
  gradeGroups,
  overallSummary,
  selectedSubjectName,
}) {
  const label = DATASET_LABELS[activeDatasetKey] || DATASET_LABELS.CURRENT
  const titleSubject = selectedSubjectName ? selectedSubjectName.toUpperCase() : '-'
  const reportTitle = `ANALISIS PENCAPAIAN PBD (${label.toUpperCase()}) MURID TAHUN ${academicYear || '-'}`

  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <SummaryCard title="Jumlah Murid" value={overallSummary.totalStudents} />
        <SummaryCard title="Telah Diisi" value={overallSummary.assessedCount} />
        <SummaryCard title="TD" value={overallSummary.tdCount} />
        <SummaryCard title="% Minimum TP3-TP6" value={formatPercent(overallSummary.minimumPercent)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.46fr)]">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-5">
          <ReportHeading title={reportTitle} subject={titleSubject} />
          <GradeDistributionTable
            gradeSummaries={gradeGroups.map((group) => group.total)}
            overallSummary={overallSummary}
          />
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h3 className="text-base font-semibold text-slate-900">Carta Taburan TP</h3>
          <PbdTpBarChart distribution={activeDistribution} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-5">
        <ReportHeading title={reportTitle} subject={titleSubject} compact />
        <ClassDistributionBlocks gradeGroups={gradeGroups} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-5">
        <div className="mb-3 text-sm font-semibold uppercase text-slate-900">
          Analisis Minimum TP3-TP6
        </div>
        <MinimumAchievementTable
          gradeSummaries={gradeGroups.map((group) => group.total)}
          overallSummary={overallSummary}
        />
      </section>
    </>
  )
}

function ComparisonSection({
  comparisonClassSummaries,
  levelMappings,
  movementRows,
  selectedSubjectName,
}) {
  const p1Groups = buildGroupsFromClassSummaries(comparisonClassSummaries.PENGGAL_1, levelMappings)
  const p2Groups = buildGroupsFromClassSummaries(comparisonClassSummaries.PENGGAL_2, levelMappings)
  const p1Overall = sumSummaries(p1Groups.map((group) => group.total), 'Jumlah', 'compare-p1')
  const p2Overall = sumSummaries(p2Groups.map((group) => group.total), 'Jumlah', 'compare-p2')
  const titleSubject = selectedSubjectName ? selectedSubjectName.toUpperCase() : '-'

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Perbandingan Penggal 1 vs Penggal 2
            </h2>
            <p className="mt-1 text-sm text-slate-500">Subjek: {titleSubject}</p>
          </div>
          <MovementSummary rows={movementRows} />
        </div>

        {movementRows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            Belum ada pasangan snapshot Penggal 1 dan Penggal 2 untuk dibandingkan.
          </div>
        ) : (
          <MovementTable rows={movementRows} />
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h3 className="text-base font-semibold text-slate-900">Taburan Snapshot Penggal 1</h3>
          <GradeDistributionTable
            gradeSummaries={p1Groups.map((group) => group.total)}
            overallSummary={p1Overall}
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h3 className="text-base font-semibold text-slate-900">Taburan Snapshot Penggal 2</h3>
          <GradeDistributionTable
            gradeSummaries={p2Groups.map((group) => group.total)}
            overallSummary={p2Overall}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h3 className="text-base font-semibold text-slate-900">Kelas Snapshot Penggal 1</h3>
          <ClassDistributionBlocks gradeGroups={p1Groups} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h3 className="text-base font-semibold text-slate-900">Kelas Snapshot Penggal 2</h3>
          <ClassDistributionBlocks gradeGroups={p2Groups} />
        </div>
      </section>
    </>
  )
}

function buildGroupsFromClassSummaries(classSummaries, levelMappings) {
  const gradeLabels = sortLevelsByDisplayOrder(
    [...new Set((classSummaries || []).map((summary) => summary.tingkatan).filter(Boolean))],
    levelMappings
  )

  return gradeLabels.map((tingkatan) => {
    const rows = classSummaries.filter((summary) => summary.tingkatan === tingkatan)
    return {
      tingkatan,
      label: getDisplayLevel(tingkatan, levelMappings),
      rows,
      total: sumSummaries(rows, `Jumlah ${getDisplayLevel(tingkatan, levelMappings)}`, `compare-${tingkatan}`),
    }
  })
}

function ReportHeading({ title, subject, compact = false }) {
  return (
    <div className={compact ? 'mb-4 text-center' : 'mb-5 text-center'}>
      <div className="text-sm font-bold uppercase italic tracking-wide text-slate-950 md:text-base">
        {title}
      </div>
      <div className="mt-2 text-sm font-bold uppercase italic text-slate-950 md:text-base">
        {subject}
      </div>
    </div>
  )
}

function GradeDistributionTable({ gradeSummaries, overallSummary }) {
  const rows = [...gradeSummaries, overallSummary]

  return (
    <>
    <div className="mt-4 space-y-3 lg:hidden">
      {rows.map((row, index) => (
        <MobileDistributionCard
          key={row.id}
          row={row}
          label={index === rows.length - 1 ? 'JUMLAH' : formatReportGradeLabel(row.label)}
          emphasized={index === rows.length - 1}
        />
      ))}
    </div>
    <div className="mt-4 hidden overflow-x-auto lg:block">
      <table className="min-w-[1120px] border-collapse text-sm text-slate-950">
        <thead>
          <tr>
            <th rowSpan={2} className="border border-slate-700 bg-[#cfcfcf] px-3 py-2 text-center font-bold">
              Bil.
            </th>
            <th rowSpan={2} className="border border-slate-700 bg-[#cfcfcf] px-4 py-2 text-center font-bold">
              Tingkatan
            </th>
            {TP_LEVELS.map((level) => (
              <th key={level} colSpan={2} className="border border-slate-700 bg-[#cfcfcf] px-3 py-1 text-center font-bold">
                TP{level}
              </th>
            ))}
            <th colSpan={2} className="border border-slate-700 bg-[#cfcfcf] px-3 py-1 text-center font-bold">
              TD
            </th>
            <th rowSpan={2} className="border border-slate-700 bg-[#cfcfcf] px-3 py-2 text-center font-bold">
              Jumlah
            </th>
          </tr>
          <tr>
            {TP_LEVELS.map((level) => (
              <HeaderPairCells key={level} />
            ))}
            <HeaderPairCells />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isTotal = index === rows.length - 1

            return (
            <tr key={row.id} className={isTotal ? 'bg-[#b7d7f0] font-bold' : 'bg-white'}>
              <td className="border border-slate-700 px-3 py-1 text-center">
                {isTotal ? '' : index + 1}
              </td>
              <td className="border border-slate-700 px-3 py-1 font-bold">
                {isTotal ? 'JUMLAH' : formatReportGradeLabel(row.label)}
              </td>
              {TP_LEVELS.map((level) => (
                <DistributionPairCells
                  key={level}
                  count={row.counts?.[level] || 0}
                  percent={row.percentages?.[level] || 0}
                  highlight={REPORT_TP_HIGHLIGHT_LEVELS.has(level)}
                  total={isTotal}
                />
              ))}
              <DistributionPairCells count={row.tdCount} percent={row.tdPercent} total={isTotal} />
              <td className="border border-slate-700 px-3 py-1 text-center font-bold">
                {row.totalStudents}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}

function ClassDistributionBlocks({ gradeGroups }) {
  if (!gradeGroups.length) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        Tiada kelas untuk dipaparkan.
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-5">
      {gradeGroups.map((group) => (
        <div key={group.tingkatan} className="min-w-0">
          <div className="mb-1 text-sm font-bold uppercase text-slate-950">
            {formatReportGradeLabel(group.label)}:
          </div>
          <div className="mt-3 space-y-3 lg:hidden">
            {[...group.rows, { ...group.total, label: 'JUMLAH' }].map((row) => (
              <MobileClassDistributionCard
                key={row.id || row.label}
                row={row}
                emphasized={row.label === 'JUMLAH'}
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-[780px] border-collapse text-xs text-slate-950 md:text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-900 px-2 py-1 text-left font-bold">
                    TAHAP PENGUASAAN
                  </th>
                  {TP_LEVELS.map((level) => (
                    <th key={level} className="border border-slate-900 px-2 py-1 text-center font-bold">
                      TP {level}
                    </th>
                  ))}
                  <th className="border border-slate-900 px-2 py-1 text-center font-bold">
                    TD
                  </th>
                  <th className="border border-slate-900 px-2 py-1 text-center font-bold">
                    Jum. Murid
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...group.rows, { ...group.total, label: 'JUMLAH' }].map((row) => (
                  <tr key={row.id || row.label} className={row.label === 'JUMLAH' ? 'font-bold' : ''}>
                    <td className="border border-slate-900 px-2 py-1 font-bold">
                      {formatReportClassLabel(row.label)}
                    </td>
                    {TP_LEVELS.map((level) => (
                      <CountCell
                        key={level}
                        count={row.counts?.[level] || 0}
                        highlight={REPORT_TP_HIGHLIGHT_LEVELS.has(level)}
                      />
                    ))}
                    <CountCell count={row.tdCount} />
                    <td className="border border-slate-900 px-2 py-1 text-center font-bold">
                      {row.totalStudents}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function MinimumAchievementTable({ gradeSummaries, overallSummary }) {
  const rows = [...gradeSummaries, overallSummary]

  return (
    <>
    <div className="mt-4 space-y-3 lg:hidden">
      {rows.map((row, index) => (
        <MobileDistributionCard
          key={row.id}
          row={row}
          label={index === rows.length - 1 ? 'JUMLAH' : formatReportGradeLabel(row.label)}
          emphasized={index === rows.length - 1}
          showMinimum
        />
      ))}
    </div>
    <div className="mt-4 hidden overflow-x-auto lg:block">
      <table className="min-w-[1120px] border-collapse text-xs text-slate-950 md:text-sm">
        <thead>
          <tr>
            <th rowSpan={2} className="border border-slate-900 bg-[#d9d9d9] px-3 py-2 text-center font-bold">
              Tingkatan
            </th>
            {TP_LEVELS.map((level) => (
              <th key={level} colSpan={2} className="border border-slate-900 bg-[#d9d9d9] px-3 py-1 text-center font-bold">
                TP {level}
              </th>
            ))}
            <th colSpan={2} className="border border-slate-900 bg-[#d9d9d9] px-3 py-1 text-center font-bold">
              TD
            </th>
            <th rowSpan={2} className="border border-slate-900 bg-[#d9d9d9] px-3 py-2 text-center font-bold italic">
              Tahap Minima TP3-TP6
            </th>
            <th rowSpan={2} className="border border-slate-900 bg-[#d9d9d9] px-3 py-2 text-center font-bold italic">
              Minima TP3-TP6 %
            </th>
          </tr>
          <tr>
            {TP_LEVELS.map((level) => (
              <HeaderPairCells key={level} />
            ))}
            <HeaderPairCells />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isTotal = index === rows.length - 1

            return (
            <tr key={row.id} className={isTotal ? 'bg-[#b7d7f0] font-bold' : 'bg-white'}>
              <td className="border border-slate-900 px-3 py-1 font-bold">
                {isTotal ? 'JUMLAH' : formatReportGradeLabel(row.label)}
              </td>
              {TP_LEVELS.map((level) => (
                <DistributionPairCells
                  key={level}
                  count={row.counts?.[level] || 0}
                  percent={row.percentages?.[level] || 0}
                  highlight={REPORT_TP_HIGHLIGHT_LEVELS.has(level)}
                  total={isTotal}
                />
              ))}
              <DistributionPairCells count={row.tdCount} percent={row.tdPercent} total={isTotal} />
              <td className="border border-slate-900 px-3 py-1 text-center font-bold text-rose-600">
                {row.minimumCount}
              </td>
              <td className="border border-slate-900 px-3 py-1 text-center font-bold">
                {formatReportPercent(row.minimumPercent)}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}

function MobileDistributionCard({ row, label, emphasized = false, showMinimum = false }) {
  return (
    <article
      className={`overflow-hidden rounded-xl border ${
        emphasized ? 'border-blue-200 bg-blue-50/70' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
        <div className="text-sm font-bold text-slate-900">{label}</div>
        <div className="shrink-0 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
          {row.totalStudents} murid
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {TP_LEVELS.map((level) => (
          <MobileTpMetric
            key={level}
            label={`TP${level}`}
            count={row.counts?.[level] || 0}
            percent={row.percentages?.[level] || 0}
            highlight={REPORT_TP_HIGHLIGHT_LEVELS.has(level)}
          />
        ))}
        <MobileTpMetric label="TD" count={row.tdCount} percent={row.tdPercent} />
      </div>
      {showMinimum ? (
        <div className="mx-3 mb-3 flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900 ring-1 ring-inset ring-emerald-200">
          <span className="text-xs font-semibold">Minimum TP3–TP6</span>
          <strong className="text-sm">{row.minimumCount} ({formatReportPercent(row.minimumPercent)}%)</strong>
        </div>
      ) : null}
    </article>
  )
}

function MobileTpMetric({ label, count, percent, highlight = false }) {
  return (
    <div className={`rounded-lg p-2 text-center ${highlight ? 'bg-amber-100' : 'bg-slate-100'}`}>
      <div className="text-[11px] font-bold text-slate-600">{label}</div>
      <div className="mt-0.5 text-base font-extrabold text-slate-950">{count}</div>
      <div className="text-[10px] font-medium text-slate-500">{formatReportPercent(percent)}%</div>
    </div>
  )
}

function MobileClassDistributionCard({ row, emphasized = false }) {
  return (
    <article
      className={`rounded-xl border p-3 ${
        emphasized ? 'border-blue-200 bg-blue-50/70' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-bold text-slate-900">{formatReportClassLabel(row.label)}</div>
        <div className="text-xs font-semibold text-slate-500">{row.totalStudents} murid</div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {TP_LEVELS.map((level) => (
          <div
            key={level}
            className={`rounded-lg px-2 py-2 text-center ${
              REPORT_TP_HIGHLIGHT_LEVELS.has(level) ? 'bg-amber-100' : 'bg-slate-100'
            }`}
          >
            <div className="text-[10px] font-bold text-slate-500">TP{level}</div>
            <div className="text-sm font-extrabold text-slate-900">{row.counts?.[level] || 0}</div>
          </div>
        ))}
        <div className="rounded-lg bg-slate-100 px-2 py-2 text-center">
          <div className="text-[10px] font-bold text-slate-500">TD</div>
          <div className="text-sm font-extrabold text-slate-900">{row.tdCount}</div>
        </div>
      </div>
    </article>
  )
}

function HeaderPairCells() {
  return (
    <>
      <th className="border border-slate-700 bg-[#d9d9d9] px-2 py-1 text-center font-bold">
        Bil
      </th>
      <th className="border border-slate-700 bg-[#d9d9d9] px-2 py-1 text-center font-bold">
        %
      </th>
    </>
  )
}

function DistributionPairCells({ count, percent, highlight = false, total = false }) {
  const countClass = total
    ? 'border border-slate-700 px-2 py-1 text-center font-bold'
    : `border border-slate-700 px-2 py-1 text-center ${highlight ? 'bg-[#ffe699]' : 'bg-white'}`

  return (
    <>
      <td className={countClass}>{count}</td>
      <td className="border border-slate-700 px-2 py-1 text-center">
        {formatReportPercent(percent)}
      </td>
    </>
  )
}

function CountCell({ count, highlight = false }) {
  return (
    <td className={`border border-slate-900 px-2 py-1 text-center ${highlight ? 'bg-[#fff2cc]' : ''}`}>
      {count}
    </td>
  )
}

function MovementTable({ rows }) {
  return (
    <>
    <div className="mt-4 space-y-3 lg:hidden">
      {rows.map((row) => (
        <article key={row.key} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{row.studentName}</div>
              <div className="mt-0.5 text-xs text-slate-500">{row.className} · {row.subjectName}</div>
            </div>
            <span className={getStatusBadgeClass(row.status)}>{row.status}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 rounded-lg bg-slate-50 py-2 text-center">
            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">Penggal 1</div>
              <div className="text-sm font-bold text-slate-900">TP{row.tp1}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">Penggal 2</div>
              <div className="text-sm font-bold text-slate-900">TP{row.tp2}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">Perubahan</div>
              <div className="text-sm font-bold text-slate-900">{row.delta > 0 ? `+${row.delta}` : row.delta}</div>
            </div>
          </div>
        </article>
      ))}
    </div>
    <div className="mt-4 hidden overflow-x-auto lg:block">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
              Murid
            </th>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
              Kelas
            </th>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
              Subjek
            </th>
            <th className="border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-700">
              Penggal 1
            </th>
            <th className="border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-700">
              Penggal 2
            </th>
            <th className="border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-700">
              Perubahan
            </th>
            <th className="border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-700">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-slate-100">
              <td className="px-4 py-3 font-medium text-slate-900">{row.studentName}</td>
              <td className="px-4 py-3 text-slate-600">{row.className}</td>
              <td className="px-4 py-3 text-slate-600">{row.subjectName}</td>
              <td className="px-4 py-3 text-center text-slate-700">TP{row.tp1}</td>
              <td className="px-4 py-3 text-center text-slate-700">TP{row.tp2}</td>
              <td className="px-4 py-3 text-center font-semibold text-slate-900">
                {row.delta > 0 ? `+${row.delta}` : row.delta}
              </td>
              <td className="px-4 py-3 text-center">
                <span className={getStatusBadgeClass(row.status)}>{row.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

function SummaryCard({ title, value }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="text-xs font-medium leading-snug text-slate-500 sm:text-sm">{title}</div>
      <div className="mt-1.5 break-words text-xl font-bold text-slate-900 sm:mt-2 sm:text-2xl">{value}</div>
    </div>
  )
}

function MovementSummary({ rows }) {
  const counts = rows.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1
      return acc
    },
    { Meningkat: 0, Kekal: 0, Menurun: 0 }
  )

  return (
    <div className="flex flex-wrap gap-2 text-xs font-semibold">
      {Object.entries(counts).map(([label, value]) => (
        <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
          {label}: {value}
        </span>
      ))}
    </div>
  )
}

function getStatusBadgeClass(status) {
  if (status === 'Meningkat') {
    return 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700'
  }

  if (status === 'Menurun') {
    return 'rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700'
  }

  return 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700'
}
