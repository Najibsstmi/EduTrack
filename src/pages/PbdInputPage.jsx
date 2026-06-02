import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PbdTabs from '../components/PbdTabs.jsx'
import { supabase } from '../lib/supabaseClient'
import { getDashboardPath } from '../lib/dashboardPath.js'
import { getRelevantEnrollmentIds } from '../lib/completionMatrix.js'
import {
  fetchSchoolLevelLabels,
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import {
  calculatePbdDistribution,
  calculatePbdMinimumAchievement,
  TP_LEVELS,
} from '../lib/pbdAnalysis.js'
import {
  buildEnrollmentLookup,
  buildSubjectHeader,
  buildSubjectLookup,
  downloadCsv,
  findEnrollmentFromLookup,
  generatePbdTemplateRows,
  normalizeCsvHeader,
  normalizeSubjectMatchKey,
  normalizeTpValue,
  parseCsvText,
} from '../lib/pbdBulkImport.js'
import { formatSubjectName, normalizeSubjectRows } from '../lib/subjectLabels.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const PBD_PERIODS = [
  { key: 'PENGGAL_1', name: 'Penggal 1' },
  { key: 'PENGGAL_2', name: 'Penggal 2' },
]

const buildYearOptions = (currentYear) => {
  const baseYear = Number(currentYear) || new Date().getFullYear()
  return [baseYear - 1, baseYear, baseYear + 1, baseYear + 2]
}

const getWindowLabel = (windowRow) =>
  windowRow?.period_name ||
  PBD_PERIODS.find((period) => period.key === windowRow?.period_key)?.name ||
  'PBD'

export default function PbdInputPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  const [loading, setLoading] = useState(true)
  const [loadingCurrent, setLoadingCurrent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [levelMappings, setLevelMappings] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [studentSubjectEnrollments, setStudentSubjectEnrollments] = useState([])
  const [pbdWindows, setPbdWindows] = useState([])
  const [currentDrafts, setCurrentDrafts] = useState({})
  const [bulkTp, setBulkTp] = useState('')
  const [bulkImportFile, setBulkImportFile] = useState(null)
  const [bulkImporting, setBulkImporting] = useState(false)
  const [bulkImportSummary, setBulkImportSummary] = useState(null)
  const [templateDownloading, setTemplateDownloading] = useState('')

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [tpFilter, setTpFilter] = useState('')

  const activeWindow = useMemo(
    () => pbdWindows.find((row) => row.is_open && !row.is_locked) || null,
    [pbdWindows]
  )
  const canEditPbd = !!activeWindow
  const dashboardPath = getDashboardPath(profile)

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

      const { data: setupRows, error: setupError } = await supabase
        .from('school_setup_configs')
        .select('current_academic_year, active_grade_labels')
        .eq('school_id', profileData.school_id)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (setupError) throw setupError

      const setupData = setupRows?.[0] || null
      const currentYear = setupData?.current_academic_year || new Date().getFullYear()

      setProfile(profileData)
      setSetupConfig(setupData)
      setAcademicYear(currentYear)
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan halaman PBD.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const loadPbdWindows = useCallback(async (schoolId, year) => {
    if (!schoolId || !year) return

    try {
      const { data, error } = await supabase
        .from('pbd_windows')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', year)
        .order('period_key', { ascending: true })

      if (error) throw error
      setPbdWindows(data || [])
    } catch (error) {
      console.error(error)
      setPbdWindows([])
      setErrorMessage(
        error.message?.includes('pbd_windows')
          ? 'Jadual pbd_windows belum tersedia. Sila jalankan SQL migration PBD baharu di Supabase.'
          : error.message || 'Gagal memuatkan status window PBD.'
      )
    }
  }, [])

  const loadAcademicData = useCallback(async (schoolId, year) => {
    setLoading(true)
    setErrorMessage('')

    try {
      const [
        loadedLevelMappings,
        { data: classData, error: classError },
        { data: subjectData, error: subjectError },
        { data: enrollmentData, error: enrollmentError },
        { data: studentSubjectData, error: studentSubjectError },
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
      ])

      if (classError) throw classError
      if (subjectError) throw subjectError
      if (enrollmentError) throw enrollmentError
      if (studentSubjectError) throw studentSubjectError

      setLevelMappings(loadedLevelMappings || [])
      setClasses(classData || [])
      setSubjects(normalizeSubjectRows(subjectData))
      setEnrollments(enrollmentData || [])
      setStudentSubjectEnrollments(studentSubjectData || [])
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan data akademik PBD.')
    } finally {
      setLoading(false)
    }
  }, [])

  const availableTingkatan = useMemo(() => {
    const fromClasses = classes.map((item) => item.tingkatan).filter(Boolean)
    const fallback = setupConfig?.active_grade_labels || []
    return sortLevelsByDisplayOrder(fromClasses.length ? fromClasses : fallback, levelMappings)
  }, [classes, levelMappings, setupConfig])

  const availableClasses = useMemo(() => {
    if (!selectedTingkatan) return []

    return classes
      .filter((item) => item.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
          getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
          'ms',
          { sensitivity: 'base', numeric: true }
        )
      )
  }, [classes, levelMappings, selectedTingkatan])

  const availableSubjects = useMemo(() => {
    if (!selectedTingkatan) return []

    const uniqueSubjects = new Map()

    subjects
      .filter((subject) => subject.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
      .forEach((subject) => {
        const key = `${String(subject.subject_name || '').trim().toLowerCase()}__${String(subject.subject_code || '').trim().toLowerCase()}`
        if (!uniqueSubjects.has(key)) uniqueSubjects.set(key, subject)
      })

    return Array.from(uniqueSubjects.values())
  }, [subjects, selectedTingkatan])

  const tingkatanClasses = useMemo(
    () => classes.filter((item) => item.tingkatan === selectedTingkatan),
    [classes, selectedTingkatan]
  )

  const tingkatanSubjects = useMemo(() => availableSubjects, [availableSubjects])

  const tingkatanEnrollments = useMemo(() => {
    const classIdSet = new Set(tingkatanClasses.map((item) => String(item.id)))
    return enrollments.filter((enrollment) => classIdSet.has(String(enrollment.class_id)))
  }, [enrollments, tingkatanClasses])

  const selectedSubject = useMemo(
    () => subjects.find((subject) => String(subject.id) === String(selectedSubjectId)) || null,
    [subjects, selectedSubjectId]
  )

  const selectedClass = useMemo(
    () => classes.find((item) => String(item.id) === String(selectedClassId)) || null,
    [classes, selectedClassId]
  )

  const studentRows = useMemo(() => {
    if (!selectedClassId || !selectedSubject) return []

    const relevantEnrollmentIds = getRelevantEnrollmentIds({
      classId: selectedClassId,
      subject: selectedSubject,
      enrollments,
      studentSubjectEnrollments,
    })
    const relevantEnrollmentIdSet = new Set(relevantEnrollmentIds.map((id) => String(id)))

    return enrollments
      .filter((enrollment) => relevantEnrollmentIdSet.has(String(enrollment.id)))
      .map((enrollment) => ({
        enrollment_id: enrollment.id,
        student_profile_id: enrollment.student_profile_id,
        full_name: enrollment.student_profiles?.full_name || '-',
        ic_number: enrollment.student_profiles?.ic_number || '-',
        gender: enrollment.student_profiles?.gender || '',
      }))
      .sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [selectedClassId, selectedSubject, enrollments, studentSubjectEnrollments])

  const loadCurrentPbd = useCallback(async () => {
    if (!profile?.school_id || !academicYear || !selectedClassId || !selectedSubjectId) return

    const enrollmentIds = studentRows.map((student) => student.enrollment_id)
    if (enrollmentIds.length === 0) {
      setCurrentDrafts({})
      return
    }

    setLoadingCurrent(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase
        .from('student_pbd_current')
        .select('id, student_enrollment_id, student_profile_id, class_id, subject_id, tp, evidence_note, teacher_note, updated_by')
        .eq('school_id', profile.school_id)
        .eq('academic_year', academicYear)
        .eq('class_id', selectedClassId)
        .eq('subject_id', selectedSubjectId)
        .in('student_enrollment_id', enrollmentIds)

      if (error) throw error

      const nextDrafts = {}
      ;(data || []).forEach((row) => {
        nextDrafts[row.student_enrollment_id] = {
          id: row.id,
          tp: row.tp ? String(row.tp) : '',
          evidence_note: row.evidence_note || '',
          teacher_note: row.teacher_note || '',
          updated_by: row.updated_by || '',
        }
      })

      setCurrentDrafts(nextDrafts)
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error.message?.includes('student_pbd_current')
          ? 'Jadual student_pbd_current belum tersedia. Sila jalankan SQL migration PBD baharu di Supabase.'
          : error.message || 'Gagal memuatkan TP semasa PBD.'
      )
    } finally {
      setLoadingCurrent(false)
    }
  }, [academicYear, profile?.school_id, selectedClassId, selectedSubjectId, studentRows])

  useEffect(() => {
    if (checkingAuth) return
    initPage()
  }, [checkingAuth, initPage])

  useEffect(() => {
    if (!profile?.school_id || !academicYear) return
    loadAcademicData(profile.school_id, academicYear)
    loadPbdWindows(profile.school_id, academicYear)
  }, [profile?.school_id, academicYear, loadAcademicData, loadPbdWindows])

  useEffect(() => {
    setCurrentDrafts({})
    loadCurrentPbd()
  }, [loadCurrentPbd])

  const updateDraft = (enrollmentId, field, value) => {
    setCurrentDrafts((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || {}),
        [field]: value,
      },
    }))
  }

  const applyBulkTp = () => {
    if (!canEditPbd) {
      alert('PBD belum dibuka oleh admin sekolah.')
      return
    }

    if (!bulkTp) {
      alert('Pilih TP pukal dahulu.')
      return
    }

    setCurrentDrafts((prev) => {
      const next = { ...prev }
      visibleStudents.forEach((student) => {
        next[student.enrollment_id] = {
          ...(next[student.enrollment_id] || {}),
          tp: bulkTp,
        }
      })
      return next
    })
  }

  const visibleStudents = useMemo(() => {
    return studentRows.filter((student) => {
      const draft = currentDrafts[student.enrollment_id] || {}
      const tp = draft.tp ? String(draft.tp) : ''

      if (tpFilter === 'empty' && tp) return false
      if (tpFilter && tpFilter !== 'empty' && tp !== tpFilter) return false

      return true
    })
  }, [currentDrafts, studentRows, tpFilter])

  const currentDistribution = useMemo(() => {
    const pbdRows = studentRows
      .map((student) => ({
        student_enrollment_id: student.enrollment_id,
        tp: Number(currentDrafts[student.enrollment_id]?.tp),
      }))
      .filter((row) => TP_LEVELS.includes(row.tp))

    return calculatePbdDistribution(pbdRows, studentRows.length)
  }, [currentDrafts, studentRows])

  const minimumAchievement = useMemo(
    () => calculatePbdMinimumAchievement(currentDistribution),
    [currentDistribution]
  )

  const windowStatusText = useMemo(() => {
    if (activeWindow) {
      return `${getWindowLabel(activeWindow)} sedang dibuka. Guru boleh mengemaskini TP semasa.`
    }

    if (pbdWindows.some((row) => row.is_locked)) {
      return 'PBD belum dibuka oleh admin sekolah. TP semasa boleh dilihat tetapi tidak boleh diedit.'
    }

    return 'PBD belum dibuka oleh admin sekolah.'
  }, [activeWindow, pbdWindows])

  const saveCurrentPbd = async () => {
    if (!profile?.school_id || !academicYear || !selectedClassId || !selectedSubjectId) {
      alert('Sila pilih tahun, kelas dan subjek dahulu.')
      return
    }

    if (!canEditPbd) {
      alert('PBD belum dibuka oleh admin sekolah.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      const rowsToUpsert = []

      studentRows.forEach((student) => {
        const draft = currentDrafts[student.enrollment_id]
        if (!draft) return

        const tpLevel = Number(draft.tp)
        const hasTp = TP_LEVELS.includes(tpLevel)
        const evidenceNote = String(draft.evidence_note || '').trim()
        const teacherNote = String(draft.teacher_note || '').trim()

        if (!hasTp && !draft.id && !evidenceNote && !teacherNote) return

        rowsToUpsert.push({
          school_id: profile.school_id,
          academic_year: Number(academicYear),
          student_enrollment_id: student.enrollment_id,
          student_profile_id: student.student_profile_id,
          class_id: selectedClassId,
          subject_id: selectedSubjectId,
          tp: hasTp ? tpLevel : null,
          evidence_note: evidenceNote || null,
          teacher_note: teacherNote || null,
          updated_by: profile.id,
        })
      })

      if (rowsToUpsert.length === 0) {
        alert('Tiada perubahan PBD untuk disimpan.')
        setSaving(false)
        return
      }

      const { error: upsertError } = await supabase
        .from('student_pbd_current')
        .upsert(rowsToUpsert, {
          onConflict: 'student_enrollment_id,subject_id,academic_year',
        })

      if (upsertError) throw upsertError

      await loadCurrentPbd()
      alert('TP semasa PBD berjaya disimpan.')
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error.message?.includes('student_pbd_current')
          ? 'Simpan gagal kerana jadual student_pbd_current belum wujud atau RLS belum dikemaskini. Jalankan SQL migration PBD baharu dahulu.'
          : error.message || 'Gagal menyimpan TP semasa PBD.'
      )
    } finally {
      setSaving(false)
    }
  }

  const ensureBulkTemplateReady = () => {
    if (!profile?.school_id || !academicYear) {
      alert('Tahun akademik belum tersedia.')
      return false
    }

    if (!selectedTingkatan) {
      alert('Sila pilih tingkatan dahulu.')
      return false
    }

    if (tingkatanSubjects.length === 0) {
      alert('Tiada subjek aktif untuk tingkatan ini.')
      return false
    }

    return true
  }

  const handleDownloadTemplate = async ({ withCurrentData = false }) => {
    if (!ensureBulkTemplateReady()) return

    const mode = withCurrentData ? 'data-semasa' : 'kosong'
    setTemplateDownloading(mode)
    setErrorMessage('')

    try {
      let currentPbdRows = []

      if (withCurrentData && tingkatanEnrollments.length > 0 && tingkatanSubjects.length > 0) {
        const { data, error } = await supabase
          .from('student_pbd_current')
          .select('student_enrollment_id, subject_id, tp')
          .eq('school_id', profile.school_id)
          .eq('academic_year', academicYear)
          .in('student_enrollment_id', tingkatanEnrollments.map((enrollment) => enrollment.id))
          .in('subject_id', tingkatanSubjects.map((subject) => subject.id))

        if (error) throw error
        currentPbdRows = data || []
      }

      const rows = generatePbdTemplateRows({
        enrollments: tingkatanEnrollments,
        classes: tingkatanClasses,
        subjects: tingkatanSubjects,
        currentPbdRows,
        selectedTingkatan,
      })
      const safeTingkatan = String(selectedTingkatan).replace(/\s+/g, '-').toLocaleLowerCase('ms-MY')
      downloadCsv(`template-pbd-${safeTingkatan}-${academicYear}-${mode}.csv`, rows)
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal menjana template PBD.')
    } finally {
      setTemplateDownloading('')
    }
  }

  const handleImportPbdCsv = async () => {
    if (!canEditPbd) {
      alert('PBD belum dibuka oleh admin sekolah.')
      return
    }

    if (!ensureBulkTemplateReady()) return

    if (!bulkImportFile) {
      alert('Sila pilih fail CSV PBD dahulu.')
      return
    }

    setBulkImporting(true)
    setBulkImportSummary(null)
    setErrorMessage('')

    try {
      const csvText = await bulkImportFile.text()
      const csvRows = parseCsvText(csvText)

      if (csvRows.length < 2) {
        throw new Error('CSV tidak mempunyai data murid untuk diimport.')
      }

      const headerRow = csvRows[0]
      const normalizedHeaders = headerRow.map((header) => normalizeCsvHeader(header))
      const requiredHeaders = ['no_ic', 'nama_murid', 'kelas', 'tingkatan']
      const requiredIndexes = requiredHeaders.reduce((acc, key) => {
        acc[key] = normalizedHeaders.findIndex((header) => header === key)
        return acc
      }, {})
      const missingHeaders = requiredHeaders.filter((key) => requiredIndexes[key] < 0)

      if (missingHeaders.length > 0) {
        throw new Error(
          `Header wajib tiada: ${missingHeaders
            .map((key) => key.replace('_', ' ').toLocaleUpperCase('ms-MY'))
            .join(', ')}`
        )
      }

      const subjectLookup = buildSubjectLookup(tingkatanSubjects)
      const enrollmentLookup = buildEnrollmentLookup(tingkatanEnrollments, tingkatanClasses)
      const selectiveEnrollmentBySubjectId = new Map()

      tingkatanSubjects.forEach((subject) => {
        if (String(subject.subject_type || '').trim().toLowerCase() !== 'selective') return

        const enrollmentIds = new Set(
          studentSubjectEnrollments
            .filter(
              (row) =>
                String(row.subject_id) === String(subject.id) &&
                row.is_active !== false
            )
            .map((row) => String(row.student_enrollment_id))
        )
        selectiveEnrollmentBySubjectId.set(String(subject.id), enrollmentIds)
      })

      const subjectColumns = headerRow
        .map((header, index) => ({
          index,
          originalHeader: String(header || '').replace(/^\uFEFF/, '').trim(),
          normalizedHeader: normalizedHeaders[index],
        }))
        .filter((column) => !requiredHeaders.includes(column.normalizedHeader))
        .filter((column) => column.originalHeader)

      const errors = []
      const upsertMap = new Map()
      let skippedEmptyCount = 0

      csvRows.slice(1).forEach((row, rowIndex) => {
        const rowNumber = rowIndex + 2
        const icNumber = row[requiredIndexes.no_ic] || ''
        const studentName = row[requiredIndexes.nama_murid] || ''
        const className = row[requiredIndexes.kelas] || ''
        const tingkatan = row[requiredIndexes.tingkatan] || ''
        const matched = findEnrollmentFromLookup({
          lookup: enrollmentLookup,
          icNumber,
          className,
          tingkatan,
        })

        if (!matched) {
          errors.push(
            `Baris ${rowNumber}: Murid ${studentName || '-'} tidak ditemui untuk ${className || '-'} / ${tingkatan || '-'}.`
          )
          return
        }

        subjectColumns.forEach((column) => {
          const rawValue = row[column.index] || ''
          const trimmedValue = String(rawValue).trim()

          if (!trimmedValue) {
            skippedEmptyCount += 1
            return
          }

          const subject = subjectLookup.get(normalizeSubjectMatchKey(column.originalHeader))

          if (!subject) {
            errors.push(
              `Baris ${rowNumber}: Subjek ${column.originalHeader} tidak ditemui untuk ${selectedTingkatan}.`
            )
            return
          }

          const tp = normalizeTpValue(trimmedValue)

          if (!tp) {
            errors.push(
              `Baris ${rowNumber}: TP untuk ${studentName || matched.enrollment.student_profiles?.full_name || '-'} - ${buildSubjectHeader(subject)} mesti antara TP1 hingga TP6.`
            )
            return
          }

          const selectiveEnrollmentIds = selectiveEnrollmentBySubjectId.get(String(subject.id))
          if (selectiveEnrollmentIds && !selectiveEnrollmentIds.has(String(matched.enrollment.id))) {
            errors.push(
              `Baris ${rowNumber}: Murid ${studentName || matched.enrollment.student_profiles?.full_name || '-'} tidak didaftarkan untuk subjek ${buildSubjectHeader(subject)}.`
            )
            return
          }

          const key = `${matched.enrollment.id}__${subject.id}`
          upsertMap.set(key, {
            school_id: profile.school_id,
            academic_year: Number(academicYear),
            student_enrollment_id: matched.enrollment.id,
            student_profile_id: matched.enrollment.student_profile_id,
            class_id: matched.classRow.id,
            subject_id: subject.id,
            tp,
            updated_by: profile.id,
          })
        })
      })

      const rowsToUpsert = Array.from(upsertMap.values())

      for (let index = 0; index < rowsToUpsert.length; index += 500) {
        const chunk = rowsToUpsert.slice(index, index + 500)
        const { error } = await supabase
          .from('student_pbd_current')
          .upsert(chunk, {
            onConflict: 'student_enrollment_id,subject_id,academic_year',
          })

        if (error) throw error
      }

      await loadCurrentPbd()

      setBulkImportSummary({
        successCount: rowsToUpsert.length,
        skippedEmptyCount,
        errorCount: errors.length,
        messages: errors.slice(0, 50),
      })
    } catch (error) {
      console.error(error)
      setBulkImportSummary({
        successCount: 0,
        skippedEmptyCount: 0,
        errorCount: 1,
        messages: [error.message || 'Gagal import CSV PBD.'],
      })
    } finally {
      setBulkImporting(false)
    }
  }

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading PBD...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Input PBD"
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

        <PbdTabs active="input" />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section
          className={`rounded-2xl border p-4 shadow-sm md:p-5 ${
            canEditPbd
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Status Window PBD</h2>
              <p className="mt-1 text-sm text-slate-700">{windowStatusText}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {PBD_PERIODS.map((period) => {
                const row = pbdWindows.find((item) => item.period_key === period.key)
                const label = row?.is_locked ? 'Dikunci' : row?.is_open ? 'Dibuka' : 'Belum dibuka'

                return (
                  <span
                    key={period.key}
                    className="rounded-full border border-white/70 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm"
                  >
                    {period.name}: {label}
                  </span>
                )
              })}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Penapis Input PBD</h2>
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
                setCurrentDrafts({})
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Pilih Tingkatan</option>
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
              disabled={!selectedTingkatan}
            >
              <option value="">{selectedTingkatan ? 'Pilih Kelas' : 'Pilih Tingkatan dahulu'}</option>
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
              disabled={!selectedTingkatan}
            >
              <option value="">{selectedTingkatan ? 'Pilih Subjek' : 'Pilih Tingkatan dahulu'}</option>
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
              <option value="empty">Belum diisi</option>
              {TP_LEVELS.map((level) => (
                <option key={level} value={level}>
                  TP{level}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Import PBD Pukal</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                Template PBD dijana mengikut tingkatan, murid aktif dan subjek aktif yang
                didaftarkan oleh admin sekolah. Import pukal tidak memadam TP lama untuk sel
                kosong, row yang tiada, atau column subjek yang tidak dihantar.
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {selectedTingkatan ? getDisplayLevel(selectedTingkatan, levelMappings) : 'Pilih tingkatan dahulu'}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleDownloadTemplate({ withCurrentData: false })}
                disabled={!selectedTingkatan || templateDownloading || tingkatanSubjects.length === 0}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {templateDownloading === 'kosong' ? 'Menjana...' : 'Muat Turun Template Kosong'}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTemplate({ withCurrentData: true })}
                disabled={!selectedTingkatan || templateDownloading || tingkatanSubjects.length === 0}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {templateDownloading === 'data-semasa'
                  ? 'Menjana...'
                  : 'Muat Turun Template Dengan Data Semasa'}
              </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setBulkImportFile(event.target.files?.[0] || null)}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm"
              />
              <button
                type="button"
                onClick={handleImportPbdCsv}
                disabled={bulkImporting || !canEditPbd || !selectedTingkatan || !bulkImportFile}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkImporting ? 'Mengimport...' : 'Import CSV PBD'}
              </button>
            </div>
          </div>

          {!canEditPbd ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              PBD belum dibuka oleh admin sekolah.
            </div>
          ) : null}

          {bulkImportSummary ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Import selesai.</div>
              <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                <div>Berjaya: {bulkImportSummary.successCount} TP</div>
                <div>Diabaikan kosong: {bulkImportSummary.skippedEmptyCount}</div>
                <div>Ralat: {bulkImportSummary.errorCount}</div>
              </div>
              {bulkImportSummary.messages.length > 0 ? (
                <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-rose-100 bg-white p-3">
                  <div className="text-xs font-semibold uppercase text-rose-700">
                    Senarai ralat / amaran
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-rose-700">
                    {bulkImportSummary.messages.map((message, index) => (
                      <li key={`${message}-${index}`}>{message}</li>
                    ))}
                  </ul>
                  {bulkImportSummary.errorCount > bulkImportSummary.messages.length ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Hanya 50 item pertama dipaparkan.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard title="Jumlah Murid" value={studentRows.length} />
          <SummaryCard title="Telah Diisi" value={currentDistribution.assessedCount} />
          <SummaryCard title="Capai TP3-TP6" value={minimumAchievement.minimumCount} />
          <SummaryCard title="% Minimum" value={`${minimumAchievement.minimumPercent.toFixed(1)}%`} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Senarai Murid {selectedClass ? getDisplayClassLabel(selectedClass.tingkatan, selectedClass.class_name, levelMappings) : ''}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedSubject ? formatSubjectName(selectedSubject.subject_name) : 'Pilih kelas dan subjek untuk mula input PBD.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={bulkTp}
                onChange={(event) => setBulkTp(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                disabled={!canEditPbd}
              >
                <option value="">TP Pukal</option>
                {TP_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    TP{level}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyBulkTp}
                disabled={!canEditPbd || !visibleStudents.length}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Tetapkan
              </button>
              <button
                type="button"
                onClick={saveCurrentPbd}
                disabled={saving || !canEditPbd || !studentRows.length}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan TP Semasa'}
              </button>
            </div>
          </div>

          {!canEditPbd ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              PBD belum dibuka oleh admin sekolah.
            </div>
          ) : null}

          {loadingCurrent ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              Memuatkan TP semasa PBD...
            </div>
          ) : !selectedClassId || !selectedSubjectId ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Sila pilih kelas dan subjek.
            </div>
          ) : visibleStudents.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Tiada murid sepadan dengan penapis.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Murid
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      No IC
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      TP Semasa
                    </th>
                    <th className="min-w-72 border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Eviden
                    </th>
                    <th className="min-w-72 border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Catatan Guru
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStudents.map((student) => {
                    const draft = currentDrafts[student.enrollment_id] || {}

                    return (
                      <tr key={student.enrollment_id} className="border-b border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {student.full_name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{student.ic_number}</td>
                        <td className="px-4 py-3">
                          <select
                            value={draft.tp || ''}
                            onChange={(event) =>
                              updateDraft(student.enrollment_id, 'tp', event.target.value)
                            }
                            className="w-28 rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                            disabled={!canEditPbd}
                          >
                            <option value="">-</option>
                            {TP_LEVELS.map((level) => (
                              <option key={level} value={level}>
                                TP{level}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <textarea
                            value={draft.evidence_note || ''}
                            onChange={(event) =>
                              updateDraft(student.enrollment_id, 'evidence_note', event.target.value)
                            }
                            rows={2}
                            className="w-full min-w-64 resize-y rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                            placeholder="Eviden PBD"
                            disabled={!canEditPbd}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <textarea
                            value={draft.teacher_note || ''}
                            onChange={(event) =>
                              updateDraft(student.enrollment_id, 'teacher_note', event.target.value)
                            }
                            rows={2}
                            className="w-full min-w-64 resize-y rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                            placeholder="Catatan ringkas"
                            disabled={!canEditPbd}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  )
}
