import { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { forceCleanLogout, isRefreshTokenError } from '../lib/authSession'
import {
  getExamStructureForGrade,
  normalizeSetupConfigWithExamConfigs,
} from '../lib/examConfig'
import {
  buildStudentExamMap,
  getRelevantEnrollmentIds,
} from '../lib/completionMatrix'
import {
  fetchSchoolLevelLabels,
  getDisplayClassLabel,
  getDisplayLevel,
} from '../lib/levelLabels'
import { formatSubjectName } from '../lib/subjectLabels.js'
import {
  canInputExamMark,
  getSubjectRuleName,
} from '../lib/ssemjSubjectRules.js'

const TABS = ['pending', 'approved', 'rejected', 'all']
const COMPLETION_GRADE_GROUPS = [
  'Tingkatan 1',
  'Tingkatan 2',
  'Tingkatan 3',
  'Tingkatan 4',
  'Tingkatan 5',
]

const PBD_PERIODS = [
  { key: 'PENGGAL_1', name: 'Penggal 1' },
  { key: 'PENGGAL_2', name: 'Penggal 2' },
]

const DESIGNATION_OPTIONS = [
  'Pengetua',
  'Penolong kanan',
  'Guru Kanan Matapelajaran',
  'Ketua Panita',
  'Guru subjek',
]

const getDisplayName = (user) =>
  user?.full_name || user?.email?.split('@')[0] || user?.email || '-'

const normalizeText = (value) => String(value || '').trim().toLowerCase()

const extractGradeNumber = (value) => {
  const match = String(value || '').match(/(\d+)/)
  return match ? Number(match[1]) : 999
}

export default function SchoolAdminDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const settingsMenuRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const [adminProfile, setAdminProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [hasAcademicSetup, setHasAcademicSetup] = useState(true)
  const [users, setUsers] = useState([])
  const [setupConfig, setSetupConfig] = useState(null)
  const [classCount, setClassCount] = useState(0)
  const [studentCount, setStudentCount] = useState(0)

  const [activeTab, setActiveTab] = useState('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeDesktopMenu, setActiveDesktopMenu] = useState('')
  const [hoveredNav, setHoveredNav] = useState('')
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 768)
  const [actionDrafts, setActionDrafts] = useState({})
  const [completionLoading, setCompletionLoading] = useState(false)
  const [completionRows, setCompletionRows] = useState([])
  const [completionSubjects, setCompletionSubjects] = useState([])
  const [completionSubjectsByGrade, setCompletionSubjectsByGrade] = useState({})
  const [selectedExamKey, setSelectedExamKey] = useState('TOV')
  const [examOptions, setExamOptions] = useState([])
  const [examAccessRows, setExamAccessRows] = useState([])
  const [examAccessLoading, setExamAccessLoading] = useState(false)
  const [examAccessSavingId, setExamAccessSavingId] = useState('')
  const [pbdWindows, setPbdWindows] = useState([])
  const [pbdWindowLoading, setPbdWindowLoading] = useState(false)
  const [pbdWindowSavingKey, setPbdWindowSavingKey] = useState('')
  const [levelMappings, setLevelMappings] = useState([])
  const [expandedCompletionGrades, setExpandedCompletionGrades] = useState(() =>
    COMPLETION_GRADE_GROUPS.reduce((acc, grade) => {
      acc[grade] = grade === 'Tingkatan 1'
      return acc
    }, {})
  )

  useEffect(() => {
    let isMounted = true

    const loadPage = async () => {
      try {
        setLoading(true)
        setErrorMessage('')
        await checkAccessAndFetch()
      } catch (error) {
        console.error('Load page error:', error)

        if (isRefreshTokenError(error)) {
          await forceCleanLogout()
          return
        }

        if (isMounted) {
          setErrorMessage(error?.message || 'Ralat semasa memuatkan halaman.')
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadPage()

    return () => {
      isMounted = false
    }
  }, [navigate])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setActiveDesktopMenu('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const nextIsMobile = window.innerWidth <= 768
      setIsMobileView(nextIsMobile)
      if (!nextIsMobile) {
        setShowMobileMenu(false)
        setActiveDesktopMenu('')
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!adminProfile?.school_id || !setupConfig) return

    fetchScoreCompletionMatrix(adminProfile.school_id, setupConfig)
  }, [selectedExamKey])

  useEffect(() => {
    if (!adminProfile?.school_id) return

    loadExamAccessRows(adminProfile.school_id)
  }, [adminProfile?.school_id])

  const checkAccessAndFetch = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.log('Session invalid → redirect login')
      await forceCleanLogout()
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, school_id, role, designation, approval_status, is_active, is_school_admin, is_master_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }

    if (!profile) {
      navigate('/login', { replace: true })
      return
    }

    if (profile?.is_active !== true) {
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
      return
    }

    if (profile.is_master_admin) {
      navigate('/master-admin', { replace: true })
      return
    }

    const role = String(profile?.role || '').trim().toLowerCase()
    const isApprovedSchoolAdmin =
      role === 'school_admin' &&
      profile?.approval_status === 'approved' &&
      profile?.is_active === true

    if (!isApprovedSchoolAdmin) {
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
      return
    }

    const { data: setupData, error: setupError } = await supabase
      .from('school_setup_configs')
      .select('*')
      .eq('school_id', profile.school_id)
      .maybeSingle()

    if (setupError) console.error(setupError)

    if (!setupData) {
      setHasAcademicSetup(false)
    } else {
      setHasAcademicSetup(true)
    }

    setSetupConfig(setupData || null)

    const mappingAcademicYear =
      setupData?.current_academic_year || new Date().getFullYear()
    const loadedLevelMappings = await fetchSchoolLevelLabels({
      schoolId: profile.school_id,
      academicYear: mappingAcademicYear,
    })
    setLevelMappings(loadedLevelMappings)

    const { count: classTotal, error: classCountError } = await supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', profile.school_id)

    if (classCountError) console.error('Class count error:', classCountError)

    let studentCountQuery = supabase
      .from('student_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('school_id', profile.school_id)
      .eq('is_active', true)

    if (setupData?.current_academic_year) {
      studentCountQuery = studentCountQuery.eq('academic_year', setupData.current_academic_year)
    }

    const { count: studentTotal, error: studentCountError } = await studentCountQuery

    if (studentCountError) console.error('Student count error:', studentCountError)

    setClassCount(classTotal || 0)
    setStudentCount(studentTotal || 0)
    setAdminProfile(profile)

    await Promise.all([
      fetchSchoolData(profile.school_id),
      fetchScoreCompletionMatrix(profile.school_id, setupData),
      loadPbdWindows(profile.school_id, mappingAcademicYear),
    ])
  }

  const loadExamAccessRows = async (schoolId = adminProfile?.school_id) => {
    if (!schoolId) return

    setExamAccessLoading(true)

    try {
      const { data, error } = await supabase
        .from('exam_configs')
        .select('*')
        .eq('school_id', schoolId)
        .order('level', { ascending: true })
        .order('exam_order', { ascending: true })

      if (error) throw error

      setExamAccessRows(data || [])
    } catch (err) {
      console.error('loadExamAccessRows error:', err)
    } finally {
      setExamAccessLoading(false)
    }
  }

  const fetchSchoolData = async (schoolId) => {
    const [
      { data: school, error: schoolError },
      { data: profiles, error: profilesError },
    ] = await Promise.all([
      supabase
        .from('schools')
        .select('id, school_name, school_code, school_type, state, district, logo_url')
        .eq('id', schoolId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, full_name, email, role, designation, approval_status, is_school_admin, is_master_admin, school_id, created_at')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false }),
    ])

    if (schoolError) { console.error(schoolError); alert('Gagal ambil maklumat sekolah') }
    if (profilesError) { console.error(profilesError); alert('Gagal ambil senarai pengguna sekolah') }

    setSchoolInfo(school || null)
    setUsers(profiles || [])
  }

  const fetchScoreCompletionMatrix = async (schoolId, rawSetupConfig) => {
    if (!schoolId) {
      setCompletionRows([])
      setCompletionSubjects([])
      setCompletionSubjectsByGrade({})
      return
    }

    setCompletionLoading(true)

    const academicYear =
      rawSetupConfig?.current_academic_year || new Date().getFullYear()

    const [
      { data: classRows, error: classError },
      { data: subjectRows, error: subjectError },
      { data: matrixSchoolInfo, error: matrixSchoolError },
      { data: enrollmentRows, error: enrollmentError },
      { data: scoreRows, error: scoreError },
      { data: targetRows, error: targetError },
      { data: examConfigRows, error: examConfigError },
      { data: studentSubjectEnrollmentRows, error: studentSubjectEnrollmentError },
    ] = await Promise.all([
      supabase
        .from('classes')
        .select('id, class_name, tingkatan')
        .eq('school_id', schoolId)
        .order('tingkatan', { ascending: true })
        .order('class_name', { ascending: true }),

      supabase
        .from('subjects')
        .select('id, subject_name, tingkatan, subject_type, is_active')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('tingkatan', { ascending: true })
        .order('subject_name', { ascending: true }),

      supabase
        .from('schools')
        .select('id, school_name, school_code, school_type')
        .eq('id', schoolId)
        .maybeSingle(),

      supabase
        .from('student_enrollments')
        .select('id, class_id, academic_year, is_active')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear)
        .eq('is_active', true),

      supabase
        .from('student_scores')
        .select('class_id, subject_id, student_enrollment_id, exam_key')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear),

      supabase
        .from('student_targets')
        .select('class_id, subject_id, student_enrollment_id, target_key')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear)
        .eq('target_key', 'ETR'),

      supabase
        .from('exam_configs')
        .select('grade_label, exam_key, exam_name, exam_order, is_active')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear),

      supabase
        .from('student_subject_enrollments')
        .select('student_enrollment_id, subject_id, academic_year, is_active')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear)
        .eq('is_active', true),
    ])

    if (classError) console.error('Class matrix error:', classError)
    if (subjectError) console.error('Subject matrix error:', subjectError)
    if (matrixSchoolError) console.error('School matrix error:', matrixSchoolError)
    if (enrollmentError) console.error('Enrollment matrix error:', enrollmentError)
    if (scoreError) console.error('Score matrix error:', scoreError)
    if (targetError) console.error('Target matrix error:', targetError)
    if (studentSubjectEnrollmentError) console.error('Student subject enrollment matrix error:', studentSubjectEnrollmentError)
    if (examConfigError) console.error('Exam config matrix error:', examConfigError)

    const normalizedSetupConfig = normalizeSetupConfigWithExamConfigs(
      rawSetupConfig || {},
      examConfigRows || []
    )

    const fallbackGradeLabel =
      normalizedSetupConfig?.active_grade_labels?.[0] ||
      Object.keys(normalizedSetupConfig?.exam_structure || {})[0] ||
      'Tingkatan 1'

    const allExamKeys = getExamStructureForGrade(
      normalizedSetupConfig,
      fallbackGradeLabel
    )

    const options = allExamKeys
      .map((exam) => ({
        value: String(exam?.key || '').toUpperCase(),
        label: exam?.name || exam?.key,
      }))
      .filter((exam) => exam.value && !exam.value.startsWith('OTR'))

    setExamOptions(options)

    if (options.length > 0 && !options.some((exam) => exam.value === selectedExamKey)) {
      setSelectedExamKey(options[0].value)
    }

    const activeSubjects = (subjectRows || []).filter(
      (item) =>
        item &&
        item.is_active !== false &&
        canInputExamMark({
          schoolInfo: matrixSchoolInfo || schoolInfo,
          tingkatan: item?.tingkatan,
          subjectName: getSubjectRuleName(item),
          examKey: selectedExamKey,
        })
    )

    const subjectNames = Array.from(
      new Set(
        activeSubjects
          .map((item) => formatSubjectName(item.subject_name))
          .filter(Boolean)
      )
    ).sort((a, b) =>
      a.localeCompare(b, 'ms', { sensitivity: 'base' })
    )

    const subjectNamesByGrade = activeSubjects.reduce((acc, subject) => {
      const gradeKey = normalizeText(subject.tingkatan)
      const subjectName = formatSubjectName(subject.subject_name)

      if (!gradeKey || !subjectName) return acc

      if (!acc[gradeKey]) {
        acc[gradeKey] = []
      }

      if (!acc[gradeKey].some((item) => normalizeText(item) === normalizeText(subjectName))) {
        acc[gradeKey].push(subjectName)
      }

      return acc
    }, {})

    Object.keys(subjectNamesByGrade).forEach((gradeKey) => {
      subjectNamesByGrade[gradeKey].sort((a, b) =>
        a.localeCompare(b, 'ms', { sensitivity: 'base' })
      )
    })

    const studentExamMap = buildStudentExamMap(scoreRows || [])
    const studentTargetMap = buildStudentExamMap(
      (targetRows || []).map((row) => ({
        student_enrollment_id: row.student_enrollment_id,
        subject_id: row.subject_id,
        exam_key: row.target_key,
      }))
    )

    const enrollmentsByClass = new Map()
    ;(enrollmentRows || []).forEach((row) => {
      if (!enrollmentsByClass.has(row.class_id)) {
        enrollmentsByClass.set(row.class_id, [])
      }
      enrollmentsByClass.get(row.class_id).push(row.id)
    })

    const rows = (classRows || [])
      .slice()
      .sort((a, b) => {
        const gradeDiff =
          extractGradeNumber(a.tingkatan) - extractGradeNumber(b.tingkatan)

        if (gradeDiff !== 0) return gradeDiff

        return String(a.class_name || '').localeCompare(
          String(b.class_name || ''),
          'ms',
          { sensitivity: 'base' }
        )
      })
      .map((classItem) => {
        const offeredSubjectsForClass = activeSubjects
          .filter(
            (subject) =>
              normalizeText(subject.tingkatan) === normalizeText(classItem.tingkatan)
          )
          .filter(
            (subject, index, arr) =>
              index ===
              arr.findIndex(
                (item) =>
                  normalizeText(item.subject_name) ===
                  normalizeText(subject.subject_name)
              )
          )

        const subjectNamesForClass =
          subjectNamesByGrade[normalizeText(classItem.tingkatan)] || []

        const cells = {}

        subjectNamesForClass.forEach((subjectName) => {
          const subject = offeredSubjectsForClass.find(
            (item) => normalizeText(item.subject_name) === normalizeText(subjectName)
          )

          if (!subject) {
            cells[subjectName] = {
              status: 'na',
              label: '-',
              completedStudents: 0,
              totalStudents: 0,
              expectedExamCount: 0,
            }
            return
          }

          const relevantEnrollmentIds = getRelevantEnrollmentIds({
            classId: classItem.id,
            subject,
            enrollments: enrollmentRows || [],
            studentSubjectEnrollments: studentSubjectEnrollmentRows || [],
          })

          const totalStudents = relevantEnrollmentIds.length

          if (totalStudents === 0) {
            cells[subjectName] = {
              status: 'na',
              label: 'N/A',
              completedStudents: 0,
              totalStudents: 0,
              expectedExamCount: selectedExamKey ? 1 : 0,
            }
            return
          }

          let completedStudents = 0
          const normalizedSelectedExamKey = String(selectedExamKey || '')
            .trim()
            .toUpperCase()

          relevantEnrollmentIds.forEach((enrollmentId) => {
            const mapKey = `${enrollmentId}__${subject.id}`
            const examSet = studentExamMap.get(mapKey) || new Set()
            const targetSet = studentTargetMap.get(mapKey) || new Set()

            if (
              examSet.has(normalizedSelectedExamKey) ||
              (normalizedSelectedExamKey === 'ETR' && targetSet.has('ETR'))
            ) {
              completedStudents += 1
            }
          })

          const isComplete = completedStudents === totalStudents
          const isPartial = completedStudents > 0 && completedStudents < totalStudents

          cells[subjectName] = {
            status: isComplete ? 'complete' : isPartial ? 'partial' : 'incomplete',
            label: isComplete ? 'Lengkap' : `${completedStudents}/${totalStudents}`,
            completedStudents,
            totalStudents,
            expectedExamCount: selectedExamKey ? 1 : 0,
          }
        })

        return {
          id: classItem.id,
          tingkatan: classItem.tingkatan,
          class_name: classItem.class_name,
          label: `${classItem.tingkatan} ${classItem.class_name}`,
          cells,
        }
      })

    setCompletionSubjects(subjectNames)
    setCompletionSubjectsByGrade(subjectNamesByGrade)
    setCompletionRows(rows)
    setCompletionLoading(false)
  }

  const loadPbdWindows = async (
    schoolId = adminProfile?.school_id,
    academicYear = setupConfig?.current_academic_year || new Date().getFullYear()
  ) => {
    if (!schoolId || !academicYear) return

    setPbdWindowLoading(true)

    try {
      const fetchRows = async () =>
        supabase
          .from('pbd_windows')
          .select('*')
          .eq('school_id', schoolId)
          .eq('academic_year', academicYear)
          .order('period_key', { ascending: true })

      const { data, error } = await fetchRows()
      if (error) throw error

      const existingKeys = new Set((data || []).map((row) => row.period_key))
      const missingRows = PBD_PERIODS.filter((period) => !existingKeys.has(period.key)).map(
        (period) => ({
          school_id: schoolId,
          academic_year: Number(academicYear),
          period_key: period.key,
          period_name: period.name,
          is_open: false,
          is_locked: false,
        })
      )

      let rows = data || []
      if (missingRows.length > 0) {
        const { error: insertError } = await supabase.from('pbd_windows').insert(missingRows)
        if (insertError && !String(insertError.message || '').includes('duplicate')) {
          throw insertError
        }

        const { data: refreshedData, error: refreshedError } = await fetchRows()
        if (refreshedError) throw refreshedError
        rows = refreshedData || []
      }

      setPbdWindows(rows)
    } catch (err) {
      console.error('loadPbdWindows error:', err)
      setPbdWindows([])
    } finally {
      setPbdWindowLoading(false)
    }
  }

  const handleToggleExamAccess = async (examId, value) => {
    if (!examId) return

    setExamAccessSavingId(examId)

    try {
      const { error } = await supabase
        .from('exam_configs')
        .update({
          is_active: value,
          updated_at: new Date().toISOString(),
        })
        .eq('id', examId)

      if (error) throw error

      setExamAccessRows((prev) =>
        prev.map((row) =>
          row.id === examId ? { ...row, is_active: value } : row
        )
      )
    } catch (err) {
      console.error('handleToggleExamAccess error:', err)
      alert('Gagal mengemaskini status peperiksaan.')
    } finally {
      setExamAccessSavingId('')
    }
  }

  const getPbdAcademicYear = () =>
    Number(setupConfig?.current_academic_year || new Date().getFullYear())

  const handleOpenPbdWindow = async (periodKey) => {
    const period = PBD_PERIODS.find((item) => item.key === periodKey)
    if (!period || !adminProfile?.school_id) return

    const existingWindow = pbdWindows.find((row) => row.period_key === periodKey)
    if (existingWindow?.is_locked) {
      alert(`${period.name} sudah dikunci dan tidak boleh dibuka semula.`)
      return
    }

    if (periodKey === 'PENGGAL_2') {
      const penggal1Window = pbdWindows.find((row) => row.period_key === 'PENGGAL_1')
      if (!penggal1Window?.is_locked) {
        alert('Kunci Penggal 1 dahulu sebelum buka Penggal 2.')
        return
      }
    }

    const academicYear = getPbdAcademicYear()
    setPbdWindowSavingKey(`open-${periodKey}`)

    try {
      const { error: closeOtherError } = await supabase
        .from('pbd_windows')
        .update({ is_open: false })
        .eq('school_id', adminProfile.school_id)
        .eq('academic_year', academicYear)
        .eq('is_locked', false)
        .neq('period_key', periodKey)

      if (closeOtherError) throw closeOtherError

      const { error: upsertError } = await supabase.from('pbd_windows').upsert(
        {
          school_id: adminProfile.school_id,
          academic_year: academicYear,
          period_key: period.key,
          period_name: period.name,
          is_open: true,
          is_locked: false,
          opened_at: new Date().toISOString(),
          opened_by: adminProfile.id,
        },
        { onConflict: 'school_id,academic_year,period_key' }
      )

      if (upsertError) throw upsertError

      await loadPbdWindows(adminProfile.school_id, academicYear)
      alert(`${period.name} PBD telah dibuka.`)
    } catch (err) {
      console.error('handleOpenPbdWindow error:', err)
      alert(
        err.message?.includes('pbd_windows')
          ? 'Gagal buka PBD. Sila jalankan SQL migration PBD baharu dahulu.'
          : err.message || 'Gagal buka window PBD.'
      )
    } finally {
      setPbdWindowSavingKey('')
    }
  }

  const handleLockPbdWindow = async (periodKey) => {
    const period = PBD_PERIODS.find((item) => item.key === periodKey)
    if (!period || !adminProfile?.school_id) return

    const existingWindow = pbdWindows.find((row) => row.period_key === periodKey)
    if (existingWindow?.is_locked) {
      alert(`${period.name} sudah dikunci.`)
      return
    }

    if (!existingWindow?.is_open) {
      alert(`${period.name} perlu dibuka sebelum dikunci.`)
      return
    }

    if (periodKey === 'PENGGAL_2') {
      const penggal1Window = pbdWindows.find((row) => row.period_key === 'PENGGAL_1')
      if (!penggal1Window?.is_locked) {
        alert('Kunci Penggal 1 dahulu sebelum kunci Penggal 2.')
        return
      }
    }

    const academicYear = getPbdAcademicYear()

    const { count, error: countError } = await supabase
      .from('student_pbd_current')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', adminProfile.school_id)
      .eq('academic_year', academicYear)
      .not('tp', 'is', null)

    if (countError) {
      alert(
        countError.message?.includes('student_pbd_current')
          ? 'Jadual student_pbd_current belum tersedia. Sila jalankan SQL migration PBD baharu dahulu.'
          : countError.message || 'Gagal menyemak rekod TP semasa.'
      )
      return
    }

    const confirmed = window.confirm(
      `Kunci ${period.name} PBD ${academicYear}?\n\n` +
        `Sistem akan menyimpan snapshot ${count || 0} rekod TP semasa. ` +
        'Snapshot yang telah dikunci tidak boleh diubah.'
    )

    if (!confirmed) return

    setPbdWindowSavingKey(`lock-${periodKey}`)

    try {
      const { data, error } = await supabase.rpc('lock_pbd_window', {
        target_school_id: adminProfile.school_id,
        target_academic_year: academicYear,
        target_period_key: periodKey,
      })

      if (error) throw error

      await loadPbdWindows(adminProfile.school_id, academicYear)
      alert(`${period.name} berjaya dikunci. Snapshot baharu: ${data?.inserted_count ?? 0}.`)
    } catch (err) {
      console.error('handleLockPbdWindow error:', err)
      alert(
        err.message?.includes('lock_pbd_window')
          ? 'Fungsi lock_pbd_window belum tersedia. Sila jalankan SQL migration PBD baharu dahulu.'
          : err.message || 'Gagal kunci window PBD.'
      )
    } finally {
      setPbdWindowSavingKey('')
    }
  }

  const updateUser = async (userId, payload, successMessage) => {
    setSavingId(userId)
    const { error } = await supabase.from('profiles').update(payload).eq('id', userId)
    if (error) {
      console.error(error)
      alert(error.message || 'Gagal kemas kini pengguna')
      setSavingId(null)
      return
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...payload } : u)))
    setSavingId(null)
    if (successMessage) alert(successMessage)
  }

  const handleApprove = (userId) => updateUser(userId, { approval_status: 'approved' }, 'Pengguna berjaya diluluskan')
  const handleReject = (userId) => updateUser(userId, { approval_status: 'rejected' }, 'Pengguna berjaya ditolak')
  const handlePromoteAdmin = (userId) => updateUser(userId, { is_school_admin: true, role: 'school_admin', approval_status: 'approved' }, 'Pengguna berjaya dijadikan admin sekolah')

  const handleRemoveAdmin = async (userId) => {
    if (userId === adminProfile?.id) {
      alert('Admin sekolah semasa tidak boleh buang status sendiri di sini.')
      return
    }
    await updateUser(userId, { is_school_admin: false, role: 'teacher' }, 'Status admin sekolah berjaya dibuang')
  }

  const handleRemoveAccount = async (user) => {
    if (!user?.id) return

    if (user.is_master_admin) {
      alert('Akaun master admin tidak boleh dikeluarkan oleh admin sekolah.')
      return
    }

    if (user.id === adminProfile?.id) {
      alert('Admin sekolah semasa tidak boleh keluarkan akaun sendiri.')
      return
    }

    const confirmed = window.confirm(
      `Keluarkan ${getDisplayName(user)} daripada sekolah ini? Akaun ini akan hilang daripada senarai pengguna sekolah dan aksesnya akan dihentikan.`
    )

    if (!confirmed) return

    setSavingId(user.id)

    const { error } = await supabase
      .from('profiles')
      .update({
        school_id: null,
        approval_status: 'rejected',
        is_school_admin: false,
        role: 'teacher',
      })
      .eq('id', user.id)

    if (error) {
      console.error(error)
      alert(error.message || 'Gagal mengeluarkan akaun dari sekolah')
      setSavingId(null)
      return
    }

    setUsers((prev) => prev.filter((item) => item.id !== user.id))
    setSavingId(null)
    alert('Akaun berjaya dikeluarkan dari sekolah ini')
  }

  const handleDeleteUser = async (user) => {
    if (!user?.id) return

    if (user.is_master_admin || user.role === 'master_admin') {
      alert('Akaun master admin tidak boleh dipadam oleh admin sekolah.')
      return
    }

    if (user.is_school_admin || user.role === 'school_admin') {
      alert('Akaun admin sekolah tidak boleh dipadam terus. Buang status admin dahulu jika perlu.')
      return
    }

    if (user.id === adminProfile?.id) {
      alert('Admin sekolah semasa tidak boleh padam akaun sendiri.')
      return
    }

    const targetName = getDisplayName(user)
    const confirmed = window.confirm(
      `Padam pengguna ${targetName}?\n\n` +
        'Tindakan ini akan membuang profil pengguna dan cuba memadam akaun login Supabase Auth. ' +
        'Data akademik murid, markah, analisis dan tetapan sekolah tidak akan diubah.'
    )

    if (!confirmed) return

    const finalConfirm = window.confirm(
      `Sahkan sekali lagi: padam pengguna ${targetName}?`
    )

    if (!finalConfirm) return

    setSavingId(user.id)

    try {
      const { error } = await supabase.rpc('delete_school_user', {
        target_user_id: user.id,
      })

      if (error) throw error

      setUsers((prev) => prev.filter((item) => item.id !== user.id))
      alert('Pengguna berjaya dipadam.')
    } catch (error) {
      console.error(error)
      alert(
        error.message?.includes('delete_school_user')
          ? 'Fungsi delete_school_user belum tersedia. Sila jalankan SQL migration padam pengguna dahulu.'
          : error.message || 'Gagal memadam pengguna.'
      )
    } finally {
      setSavingId(null)
    }
  }

  const handleSaveDesignation = async (user, nextDesignationRaw) => {
    if (!user?.id) return

    if (user.is_master_admin) {
      alert('Designation master admin tidak boleh diubah oleh admin sekolah.')
      return
    }

    const nextDesignation = String(nextDesignationRaw || '').trim()
    const currentDesignation = String(user.designation || '').trim()

    if (nextDesignation === currentDesignation) {
      return
    }

    setSavingId(user.id)

    const { error } = await supabase
      .from('profiles')
      .update({ designation: nextDesignation || null })
      .eq('id', user.id)

    if (error) {
      console.error(error)
      alert(error.message || 'Gagal mengemaskini designation')
      setSavingId(null)
      return
    }

    setUsers((prev) =>
      prev.map((item) =>
        item.id === user.id ? { ...item, designation: nextDesignation || null } : item
      )
    )
    setSavingId(null)
    alert('Designation berjaya dikemaskini')
  }

  const handleActionChange = async (user, action) => {
    if (!action) return

    setActionDrafts((prev) => ({ ...prev, [user.id]: '' }))

    if (action === 'approve') {
      await handleApprove(user.id)
      return
    }

    if (action === 'reject') {
      await handleReject(user.id)
      return
    }

    if (action === 'promote-admin') {
      await handlePromoteAdmin(user.id)
      return
    }

    if (action === 'remove-admin') {
      await handleRemoveAdmin(user.id)
      return
    }

    if (action === 'remove-account') {
      await handleRemoveAccount(user)
      return
    }

    if (action === 'delete-user') {
      await handleDeleteUser(user)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const filteredUsers = useMemo(() => {
    let result = [...users]
    if (activeTab !== 'all') result = result.filter((u) => u.approval_status === activeTab)
    const q = searchTerm.trim().toLowerCase()
    if (q) {
      result = result.filter((u) =>
        getDisplayName(u).toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q) ||
        (u.designation || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [users, activeTab, searchTerm])

  const stats = useMemo(() => ({
    total: users.length,
    pending: users.filter((u) => u.approval_status === 'pending').length,
    approved: users.filter((u) => u.approval_status === 'approved').length,
    rejected: users.filter((u) => u.approval_status === 'rejected').length,
    admins: users.filter((u) => u.is_school_admin).length,
  }), [users])

  const setupStep = setupConfig?.setup_step || 0
  const setupComplete = setupConfig?.is_setup_complete || setupStep >= 5
  const classesComplete = classCount > 0
  const studentsComplete = studentCount > 0
  const academicDataComplete = classesComplete && studentsComplete

  const goToNextSetupStep = () => {
    if (setupStep === 0) navigate('/school-setup')
    else if (setupStep === 1) navigate('/school-setup/exams')
    else if (setupStep === 2) navigate('/school-setup/grades')
    else if (setupStep === 3) navigate('/school-setup/subjects')
    else if (setupStep === 4) navigate('/classes')
  }

  const isMobileNavActive = (path) => {
    if (!path) return false

    if (path === '/school-setup') {
      return location.pathname === '/school-setup'
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const isNavigationItemActive = (item) => {
    if (!item) return false
    const itemPaths = [item.path, ...(item.activePaths || [])].filter(Boolean)
    if (itemPaths.some((path) => isMobileNavActive(path))) return true
    return (item.items || []).some((child) => isNavigationItemActive(child))
  }

  const getMobileNavButtonStyle = (item) => {
    return {
      ...styles.mobileMenuItem,
      ...(isNavigationItemActive(item) ? styles.mobileMenuItemActive : {}),
      ...(item?.disabled ? styles.mobileMenuItemDisabled : {}),
    }
  }

  const getNavButtonStyle = (item) => {
    const isHovered = hoveredNav === item.key
    const isOpen = activeDesktopMenu === item.key
    const isActivePage = isNavigationItemActive(item)
    const shouldBlue = isHovered || isOpen || isActivePage

    return {
      ...styles.navButton,
      ...(shouldBlue ? styles.navButtonHover : {}),
      ...(item.disabled ? styles.disabledTopButton : {}),
    }
  }

  const getStatusText = (status) => {
    if (status === 'approved') return 'Approved'
    if (status === 'pending') return 'Pending'
    if (status === 'rejected') return 'Rejected'
    return status || '-'
  }

  const getStatusStyle = (status) => {
    if (status === 'approved') return { backgroundColor: '#dcfce7', color: '#166534' }
    if (status === 'pending') return { backgroundColor: '#fef3c7', color: '#92400e' }
    if (status === 'rejected') return { backgroundColor: '#fee2e2', color: '#991b1b' }
    return { backgroundColor: '#e5e7eb', color: '#374151' }
  }

  const getActionOptions = (user, isCurrentAdmin, isProtectedMasterAdmin) => {
    if (isProtectedMasterAdmin || isCurrentAdmin) return []

    const options = []

    if (user.approval_status === 'pending') {
      options.push({ value: 'approve', label: 'Luluskan akaun' })
      options.push({ value: 'reject', label: 'Tolak akaun' })
    }

    if (user.approval_status === 'approved' && !user.is_school_admin) {
      options.push({ value: 'promote-admin', label: 'Jadikan admin' })
    }

    if (user.approval_status === 'approved' && user.is_school_admin) {
      options.push({ value: 'remove-admin', label: 'Buang status admin' })
    }

    if (user.approval_status === 'rejected') {
      options.push({ value: 'approve', label: 'Luluskan semula' })
    }

    options.push({ value: 'remove-account', label: 'Keluarkan dari sekolah' })

    if (!user.is_school_admin && user.role !== 'school_admin') {
      options.push({ value: 'delete-user', label: 'Padam pengguna' })
    }

    return options
  }

  const role = String(adminProfile?.role || '').trim().toLowerCase()
  const isSchoolAdmin = role === 'school_admin'

  const closeNavigationMenus = () => {
    setActiveDesktopMenu('')
    setShowMobileMenu(false)
  }

  const handleNavNavigate = (path) => {
    closeNavigationMenus()
    navigate(path)
  }

  const scrollToUserManagement = () => {
    closeNavigationMenus()
    const target = document.getElementById('user-management-section')
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleNavItemClick = (item) => {
    if (!item || item.disabled) return
    if (item.action) {
      item.action()
      return
    }
    if (item.path) handleNavNavigate(item.path)
  }

  const renderMobileSubMenuItem = (child) => {
    if (child.items) {
      return (
        <div key={child.key} style={styles.mobileNestedMenuGroup}>
          <div
            style={{
              ...styles.mobileNestedMenuLabel,
              ...(isNavigationItemActive(child) ? styles.mobileNestedMenuLabelActive : {}),
            }}
          >
            {child.label}
          </div>
          <div style={styles.mobileNestedMenuItems}>
            {child.items.map(renderMobileSubMenuItem)}
          </div>
        </div>
      )
    }

    return (
      <button
        key={child.key}
        type="button"
        onClick={() => handleNavItemClick(child)}
        disabled={child.disabled}
        title={child.title || child.note}
        style={{
          ...styles.mobileSubMenuItem,
          ...(isNavigationItemActive(child) ? styles.mobileSubMenuItemActive : {}),
          ...(child.disabled ? styles.mobileSubMenuItemDisabled : {}),
        }}
      >
        <span>{child.label}</span>
        {child.note ? <span style={styles.mobileSoonTag}>{child.note}</span> : null}
      </button>
    )
  }

  const renderDesktopDropdownItem = (child) => {
    if (child.items) {
      return (
        <div key={child.key} style={styles.dropdownGroup}>
          <div
            style={{
              ...styles.dropdownGroupLabel,
              ...(isNavigationItemActive(child) ? styles.dropdownGroupLabelActive : {}),
            }}
          >
            {child.label}
          </div>
          <div style={styles.dropdownGroupItems}>
            {child.items.map(renderDesktopDropdownItem)}
          </div>
        </div>
      )
    }

    return (
      <button
        key={child.key}
        type="button"
        onClick={() => handleNavItemClick(child)}
        disabled={child.disabled}
        title={child.title || child.note}
        style={{
          ...styles.dropdownItem,
          ...(isNavigationItemActive(child) ? styles.dropdownItemActive : {}),
          ...(child.disabled ? styles.dropdownItemDisabled : {}),
        }}
      >
        <span>{child.label}</span>
        {child.note ? <span style={styles.dropdownNote}>{child.note}</span> : null}
      </button>
    )
  }

  const assessmentItems = [
    { key: 'exam', label: 'Peperiksaan', path: '/scores' },
    { key: 'pbd', label: 'PBD', path: '/input-pbd' },
    { key: 'pajsk', label: 'PAJSK', path: '/pbs/pajsk' },
    {
      key: 'psychometric',
      label: 'Psikometrik',
      path: '/psikometrik/input',
      activePaths: ['/pbs/ppsi', '/pbs/ppsi/input', '/psychometric/input'],
    },
  ]

  const studentItems = [
    {
      key: 'student-list',
      label: 'Senarai Murid',
      path: '/students',
      disabled: !isSchoolAdmin,
      title: !isSchoolAdmin ? 'Hanya admin sekolah boleh akses halaman ini' : undefined,
    },
    {
      key: 'student-subjects',
      label: 'Subjek Murid',
      path: '/manage-subject-students',
      disabled: !isSchoolAdmin,
      title: !isSchoolAdmin ? 'Hanya admin sekolah boleh akses halaman ini' : undefined,
    },
  ]

  const examAnalysisItems = [
    { key: 'student-performance', label: 'Prestasi Murid', path: '/analysis/student' },
    { key: 'class-performance', label: 'Prestasi Kelas', path: '/analysis/class' },
    { key: 'subject-performance', label: 'Prestasi Subjek (GPMP)', path: '/analysis/subject' },
    { key: 'school-performance', label: 'Prestasi Sekolah (GPS)', disabled: true, note: 'Akan datang' },
  ]

  const nonExamAnalysisItems = [
    {
      key: 'pbd-analysis',
      label: 'Analisis PBD',
      path: '/analysis/pbd',
      activePaths: ['/analisis-pbd', '/pbs/pbd/analysis'],
    },
    {
      key: 'pajsk-segak-analysis',
      label: 'Analisis PAJSK & SEGAK',
      path: '/analysis/pajsk-segak',
      activePaths: ['/pbs/pajsk/segak/analysis'],
    },
    {
      key: 'psychometric-analysis',
      label: 'Analisis Psikometrik',
      path: '/analysis/psychometric',
    },
    { key: 'pbs-integrated', label: 'PBS Bersepadu', path: '/analysis/pbs' },
  ]

  const analysisItems = [
    { key: 'exam-analysis', label: 'Peperiksaan', items: examAnalysisItems },
    { key: 'non-exam-analysis', label: 'Bukan Peperiksaan', items: nonExamAnalysisItems },
  ]

  const settingsItems = [
    {
      key: 'my-profile',
      label: 'Profil Saya',
      path: '/profile',
    },
    {
      key: 'targets',
      label: 'Sasaran Akademik',
      path: '/academic-targets',
    },
    {
      key: 'exam-settings',
      label: 'Konfigurasi Peperiksaan',
      path: '/exam-settings',
    },
    {
      key: 'grade-settings',
      label: 'Skala Gred',
      path: '/grade-settings',
    },
    {
      key: 'academic-structure',
      label: 'Struktur Sekolah',
      path: '/school-setup',
    },
    {
      key: 'users',
      label: 'Pengguna',
      action: scrollToUserManagement,
    },
    {
      key: 'school-profile',
      label: 'Profil Sekolah',
      path: '/settings/school-logo',
    },
  ]

  const adminNavigation = [
    { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    { key: 'assessment', label: 'Pentaksiran', items: assessmentItems },
    { key: 'students', label: 'Murid', items: studentItems },
    { key: 'analysis', label: 'Analisis', items: analysisItems },
    {
      key: 'settings',
      label: 'Tetapan',
      items: settingsItems,
      disabled: !isSchoolAdmin,
      title: !isSchoolAdmin ? 'Hanya admin sekolah boleh akses halaman ini' : undefined,
    },
  ]

  const groupedCompletionRows = useMemo(() => {
    const groupedMap = new Map(
      COMPLETION_GRADE_GROUPS.map((grade) => [grade, []])
    )

    completionRows.forEach((row) => {
      const matchedGrade = COMPLETION_GRADE_GROUPS.find(
        (grade) => normalizeText(grade) === normalizeText(row.tingkatan)
      )

      if (matchedGrade) {
        groupedMap.get(matchedGrade).push(row)
        return
      }

      if (!groupedMap.has(row.tingkatan)) {
        groupedMap.set(row.tingkatan, [])
      }

      groupedMap.get(row.tingkatan).push(row)
    })

    return Array.from(groupedMap.entries()).map(([grade, rows]) => ({
      grade,
      rows,
    }))
  }, [completionRows])

  const visibleExamKeys = useMemo(() => {
    const unique = new Map()

    ;(examAccessRows || []).forEach((row) => {
      const examKey = String(row.exam_key || '').trim().toUpperCase()

      if (!examKey || examKey.startsWith('OTR')) return
      if (!unique.has(examKey)) unique.set(examKey, row)
    })

    const sorted = Array.from(unique.values())
      .sort((a, b) => Number(a.exam_order || 999) - Number(b.exam_order || 999))
      .map((row) => String(row.exam_key || '').trim().toUpperCase())

    return sorted.length > 0 ? sorted : ['TOV', 'AR1', 'AR2', 'ETR']
  }, [examAccessRows])

  const getExamColumnLabel = (examKey) => {
    if (examKey === 'AR1') return 'AR1 / PPT'
    if (examKey === 'AR2') return 'AR2 / PPC'
    return examKey
  }

  const groupedExamAccessRows = useMemo(() => {
    const grouped = {}

    for (const row of examAccessRows || []) {
      const gradeLabel = String(row.level || row.grade_label || '').trim()
      const examKey = String(row.exam_key || '').trim().toUpperCase()

      if (!visibleExamKeys.includes(examKey)) continue

      if (!grouped[gradeLabel]) {
        grouped[gradeLabel] = {
          grade_label: gradeLabel,
          exams: {},
        }
      }

      grouped[gradeLabel].exams[examKey] = row
    }

    return Object.values(grouped).sort((a, b) =>
      a.grade_label.localeCompare(b.grade_label, 'ms', { numeric: true })
    )
  }, [examAccessRows, visibleExamKeys])

  const toggleCompletionGrade = (grade) => {
    setExpandedCompletionGrades((prev) => ({
      ...prev,
      [grade]: !prev[grade],
    }))
  }

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingCard}>Loading school admin dashboard...</div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <header style={{ ...styles.topBar, ...(isMobileView ? styles.mobileTopBar : {}) }}>
        {isMobileView ? (
          <>
            <button
              type="button"
              aria-label="Buka menu utama"
              aria-expanded={showMobileMenu}
              onClick={() => setShowMobileMenu(true)}
              style={styles.mobileMenuButton}
            >
              <Menu size={24} strokeWidth={2.4} />
            </button>

            <div style={styles.mobileBrandWrap}>
              <img
                src="/edutrack-logo.png"
                alt="EduTrack"
                style={styles.mobileBrandLogo}
              />
              <div style={styles.mobileBrandTextWrap}>
                <div style={styles.mobileBrandTitle}>EduTrack</div>
                <div style={styles.mobileBrandSub}>
                  {schoolInfo?.school_name || 'Sistem Pemantauan Akademik Sekolah'}
                </div>
              </div>
            </div>

            <div style={styles.mobileHeaderSpacer} aria-hidden="true" />

            {showMobileMenu && (
              <>
                <button
                  type="button"
                  aria-label="Tutup menu utama"
                  onClick={() => {
                    setShowMobileMenu(false)
                  }}
                  style={styles.mobileDrawerBackdrop}
                />

                <nav
                  ref={settingsMenuRef}
                  aria-label="Menu utama"
                  style={styles.mobileDrawer}
                >
                  <button
                    type="button"
                    aria-label="Tutup menu utama"
                    onClick={() => {
                      setShowMobileMenu(false)
                    }}
                    style={styles.mobileDrawerCloseButton}
                  >
                    <X size={25} strokeWidth={2.2} />
                  </button>

                  <div style={styles.mobileDrawerBrand}>
                    <img
                      src="/edutrack-logo.png"
                      alt="EduTrack"
                      style={styles.mobileDrawerLogo}
                    />
                    <div>
                      <div style={styles.mobileDrawerTitle}>EduTrack</div>
                      <div style={styles.mobileDrawerSub}>
                        {schoolInfo?.school_name || 'Sistem Pemantauan Akademik Sekolah'}
                      </div>
                    </div>
                  </div>

                  <div style={styles.mobileDrawerMenu}>
                    {adminNavigation.map((item) => {
                      if (!item.items) {
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => handleNavItemClick(item)}
                            disabled={item.disabled}
                            title={item.title}
                            style={getMobileNavButtonStyle(item)}
                          >
                            {item.label}
                          </button>
                        )
                      }

                      return (
                        <div key={item.key} style={styles.mobileMenuSection}>
                          <div style={styles.mobileMenuSectionLabel}>{item.label}</div>
                          <div style={styles.mobileSubMenuPanel}>
                            {item.items.map(renderMobileSubMenuItem)}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setShowMobileMenu(false)
                      await handleLogout()
                    }}
                    style={styles.mobileLogoutButton}
                  >
                    Logout
                  </button>
                </nav>
              </>
            )}
          </>
        ) : (
          <>
            <div style={styles.brandWrap}>
              <img
                src="/edutrack-logo.png"
                alt="EduTrack"
                style={styles.brandLogo}
              />
              <div style={styles.brandTextWrap}>
                <div style={styles.brandTitle}>EduTrack</div>
                <div style={styles.brandSub}>
                  {schoolInfo?.school_name || 'Sistem Pemantauan Akademik Sekolah'}
                </div>
              </div>
            </div>

            <div style={styles.topActions} ref={settingsMenuRef}>
              {adminNavigation.map((item) => {
                if (!item.items) {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleNavItemClick(item)}
                      onMouseEnter={() => setHoveredNav(item.key)}
                      onMouseLeave={() => setHoveredNav('')}
                      disabled={item.disabled}
                      title={item.title}
                      style={getNavButtonStyle(item)}
                    >
                      {item.label}
                    </button>
                  )
                }

                return (
                  <div key={item.key} style={styles.desktopMenuWrap}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!item.disabled) {
                          setActiveDesktopMenu((prev) => (prev === item.key ? '' : item.key))
                        }
                      }}
                      onMouseEnter={() => setHoveredNav(item.key)}
                      onMouseLeave={() => setHoveredNav('')}
                      disabled={item.disabled}
                      title={item.title}
                      style={getNavButtonStyle(item)}
                    >
                      <span>{item.label}</span>
                      <span aria-hidden="true" style={styles.desktopMenuChevron}>
                        {activeDesktopMenu === item.key ? '▴' : '▾'}
                      </span>
                    </button>

                    {activeDesktopMenu === item.key && (
                      <div style={styles.settingsDropdown}>
                        {item.items.map(renderDesktopDropdownItem)}
                      </div>
                    )}
                  </div>
                )
              })}

              <button
                type="button"
                onClick={handleLogout}
                style={styles.logoutButton}
              >
                Logout
              </button>
            </div>
          </>
        )}
      </header>

      <main style={{ ...styles.container, ...(isMobileView ? styles.containerMobile : {}) }}>
        {errorMessage ? (
          <div style={styles.setupAlertCard}>
            <div style={styles.setupAlertTitle}>Sesi Tidak Sah</div>
            <div style={styles.setupAlertText}>{errorMessage}</div>
          </div>
        ) : null}

        {!hasAcademicSetup && (
          <div style={styles.setupAlertCard}>
            <div style={styles.setupAlertTitle}>Tetapan akademik belum lengkap</div>
            <div style={styles.setupAlertText}>
              Sekolah ini belum mempunyai tetapan akademik asas. Lengkapkan dahulu
              struktur akademik, peperiksaan, gred, subjek, kelas dan input murid.
            </div>

            <div style={styles.setupAlertActions}>
              <button
                type="button"
                onClick={() => navigate('/school-setup')}
                style={styles.setupPrimaryButton}
              >
                Lengkapkan Tetapan Akademik
              </button>
            </div>
          </div>
        )}

        <section style={styles.heroCard}>
          <div style={styles.heroGlow} />
          <div style={styles.heroGlowSecondary} />
          <div style={styles.heroInner}>
            <div style={styles.heroHeaderRow}>
              {schoolInfo?.logo_url ? (
                <img
                  src={schoolInfo.logo_url}
                  alt="Logo Sekolah"
                  style={styles.schoolLogoInline}
                />
              ) : null}
              <div>
                <h1 style={styles.heroTitle}>{isSchoolAdmin ? 'Dashboard Admin Sekolah' : 'Dashboard Pemantauan Sekolah'}</h1>
                <p style={styles.heroDescription}>
                  Urus pengguna, tetapan akademik, data murid, dan semakan status sekolah dalam satu paparan yang lebih kemas.
                </p>
                {schoolInfo?.school_name ? (
                  <div style={styles.schoolNameBadge}>{schoolInfo.school_name}</div>
                ) : null}
              </div>
            </div>
            <div style={styles.heroMetaRow}>
              <span><strong>Admin:</strong> {getDisplayName(adminProfile)} ({adminProfile?.email || '-'})</span>
              <span><strong>Jenis:</strong> {schoolInfo?.school_type || '-'}</span>
              <span><strong>Negeri / PPD:</strong> {[schoolInfo?.state, schoolInfo?.district].filter(Boolean).join(' / ') || '-'}</span>
            </div>
          </div>
        </section>

        <section style={styles.statsGrid}>
          <StatCard title="Jumlah Pengguna" value={stats.total} isMobileView={isMobileView} />
          <StatCard title="Pending" value={stats.pending} isMobileView={isMobileView} />
          <StatCard title="Approved" value={stats.approved} isMobileView={isMobileView} />
          <StatCard title="Rejected" value={stats.rejected} isMobileView={isMobileView} />
          <StatCard title="Admin Sekolah" value={stats.admins} isMobileView={isMobileView} />
          <StatCard title="Jumlah Murid" value={studentCount} isMobileView={isMobileView} />
        </section>

        <section style={styles.sectionCard}>
          <h2 style={styles.cardTitle}>Akses Pantas</h2>
          <p style={styles.helperText}>
            Modul paling kerap digunakan untuk kerja harian sekolah.
          </p>

          <div style={styles.quickActionGrid}>
            <div
              onClick={() => navigate('/scores')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardBlue,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={styles.quickActionTitle}>Peperiksaan</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Masukkan markah peperiksaan murid dengan lebih cepat dan tersusun.
              </p>
            </div>

            <div
              onClick={() => navigate('/analysis/class')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardGreen,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={styles.quickActionTitle}>Prestasi Kelas / GPMP</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Lihat ringkasan kelas, subjek dan GPMP peperiksaan dengan lebih jelas.
              </p>
            </div>

            <div
              onClick={() => navigate('/pbs/pajsk')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardAmber,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={styles.quickActionTitle}>PAJSK</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Akses input SEGAK, BMI dan komponen PAJSK yang tersedia.
              </p>
            </div>

            <div
              onClick={() => navigate('/input-pbd')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardTeal,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={styles.quickActionTitle}>PBD</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Isi TP semasa murid menggunakan window PBD yang dibuka oleh admin sekolah.
              </p>
            </div>

            <div
              onClick={() => navigate('/academic-targets')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardRose,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={styles.quickActionTitle}>Sasaran Akademik</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Tetapkan profil sasaran OTR yang digunakan dalam analisis akademik.
              </p>
            </div>

            {isSchoolAdmin && (
              <div
                onClick={() => navigate('/manage-subject-students')}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.08)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                style={{
                  ...styles.quickActionCard,
                  ...styles.quickActionCardPurple,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={styles.quickActionTitle}>Subjek Murid</h3>
                  <span style={styles.quickActionArrow}>›</span>
                </div>
                <p style={styles.quickActionDesc}>
                  Tetapkan murid yang mengambil subjek selective seperti Pendidikan Islam,
                  Pendidikan Moral atau subjek elektif lain.
                </p>
              </div>
            )}
          </div>
        </section>

        {isSchoolAdmin && (
          <section style={styles.sectionCard}>
            <div style={styles.sectionHeader}>
              <div>
                <h2 style={styles.cardTitle}>Kawalan PBD</h2>
                <p style={styles.sectionDesc}>
                  Buka window PBD untuk guru mengemaskini TP semasa. Apabila dikunci,
                  sistem menyimpan snapshot Penggal 1 atau Penggal 2 untuk analisis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadPbdWindows(adminProfile.school_id, getPbdAcademicYear())}
                disabled={pbdWindowLoading}
                style={{
                  ...styles.secondaryButton,
                  ...(pbdWindowLoading ? styles.toggleDisabled : {}),
                }}
              >
                {pbdWindowLoading ? 'Memuat...' : 'Refresh'}
              </button>
            </div>

            {pbdWindowLoading ? (
              <div style={styles.infoText}>Sedang memuat status PBD...</div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Penggal</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Dibuka Pada</th>
                      <th style={styles.th}>Dikunci Pada</th>
                      <th style={styles.thCenter}>Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PBD_PERIODS.map((period) => {
                      const row = pbdWindows.find((item) => item.period_key === period.key)
                      const status = row?.is_locked
                        ? 'Dikunci'
                        : row?.is_open
                          ? 'Dibuka'
                          : 'Belum dibuka'
                      const savingOpen = pbdWindowSavingKey === `open-${period.key}`
                      const savingLock = pbdWindowSavingKey === `lock-${period.key}`
                      const isSaving = savingOpen || savingLock

                      return (
                        <tr key={period.key}>
                          <td style={styles.tdStrong}>{period.name}</td>
                          <td style={styles.td}>
                            <span
                              style={{
                                ...styles.pbdStatusPill,
                                ...(row?.is_locked
                                  ? styles.pbdStatusLocked
                                  : row?.is_open
                                    ? styles.pbdStatusOpen
                                    : styles.pbdStatusIdle),
                              }}
                            >
                              {status}
                            </span>
                          </td>
                          <td style={styles.td}>{row?.opened_at ? new Date(row.opened_at).toLocaleString('ms-MY') : '-'}</td>
                          <td style={styles.td}>{row?.locked_at ? new Date(row.locked_at).toLocaleString('ms-MY') : '-'}</td>
                          <td style={styles.tdCenter}>
                            <div style={styles.pbdActionGroup}>
                              <button
                                type="button"
                                onClick={() => handleOpenPbdWindow(period.key)}
                                disabled={isSaving || row?.is_locked || row?.is_open}
                                style={{
                                  ...styles.smallActionButton,
                                  ...(isSaving || row?.is_locked || row?.is_open
                                    ? styles.toggleDisabled
                                    : {}),
                                }}
                              >
                                {savingOpen ? 'Membuka...' : 'Buka'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleLockPbdWindow(period.key)}
                                disabled={isSaving || row?.is_locked || !row?.is_open}
                                style={{
                                  ...styles.smallDangerButton,
                                  ...(isSaving || row?.is_locked || !row?.is_open
                                    ? styles.toggleDisabled
                                    : {}),
                                }}
                              >
                                {savingLock ? 'Mengunci...' : 'Kunci'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section style={styles.dualGrid}>
          <div style={styles.sectionCard}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Status Setup Sistem</h2>
            </div>
            <div style={styles.statusList}>
              <StatusRow done={setupStep >= 1 || setupComplete} label="Tetapan akademik sekolah" />
              <StatusRow done={setupStep >= 2 || setupComplete} label="Tetapan peperiksaan" />
              <StatusRow done={setupStep >= 3 || setupComplete} label="Tetapan grade" />
              <StatusRow done={setupStep >= 4 || setupComplete} label="Tetapan subjek" />
            </div>
            <p style={styles.helperText}>
              {setupComplete ? 'Semua tetapan telah lengkap.' : 'Sila lengkapkan tetapan yang belum selesai.'}
            </p>
            {!setupComplete && (
              <button style={styles.primaryButton} onClick={goToNextSetupStep}>Sambung Setup</button>
            )}
          </div>

          <div style={styles.sectionCard}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Status Data Akademik</h2>
            </div>
            <div style={styles.statusList}>
              <StatusRow done={classesComplete} label="Setup kelas" />
              <StatusRow done={studentsComplete} label="Setup murid" />
            </div>
            <p style={styles.helperText}>
              {academicDataComplete
                ? 'Data akademik asas telah lengkap dan sistem sedia untuk langkah seterusnya.'
                : 'Lengkapkan kelas dahulu, kemudian masukkan murid.'}
            </p>
          </div>
        </section>

        <section style={styles.sectionCard}>
          <div style={styles.cardHeaderColumn}>
            <h2 style={styles.cardTitle}>Pemantauan Pengisian Markah ({selectedExamKey})</h2>
            <span style={styles.roleHintText}>
              {isSchoolAdmin ? 'Paparan keseluruhan sekolah' : 'Paparan pemantauan'}
            </span>
            <p style={styles.helperText}>
              Hijau = semua murid dalam kelas itu sudah lengkap markah untuk subjek tersebut.
              Merah = masih ada murid yang belum lengkap. Paparan ini hanya kira peperiksaan
              manual seperti TOV, AR1, AR2 dan ETR. OTR tidak dikira kerana dijana automatik.
            </p>
          </div>

          <div style={styles.examFilterRow}>
            <label style={styles.examFilterLabel}>Jenis Peperiksaan:</label>
            <select
              value={selectedExamKey}
              onChange={(e) => setSelectedExamKey(e.target.value)}
              style={styles.examFilterSelect}
            >
              {examOptions.map((exam) => (
                <option key={exam.value} value={exam.value}>
                  {exam.label}
                </option>
              ))}
            </select>
          </div>

          {completionLoading ? (
            <div style={styles.emptyState}>Loading status pengisian markah...</div>
          ) : completionRows.length === 0 || completionSubjects.length === 0 ? (
            <div style={styles.emptyState}>
              Belum ada data kelas, subjek atau murid aktif untuk dipaparkan.
            </div>
          ) : (
              <div style={styles.matrixGroupList}>
                {groupedCompletionRows.map(({ grade, rows }) => {
                  const isExpanded = expandedCompletionGrades[grade] === true
                  const gradeSubjectNames =
                    completionSubjectsByGrade[normalizeText(grade)] || []

                  return (
                    <div key={grade} style={styles.matrixGroupCard}>
                      <button
                        type="button"
                        onClick={() => toggleCompletionGrade(grade)}
                        style={styles.matrixGroupToggle}
                      >
                        <div>
                          <div style={styles.matrixGroupTitle}>{getDisplayLevel(grade, levelMappings)}</div>
                          <div style={styles.matrixGroupMeta}>{rows.length} kelas</div>
                        </div>
                        <span style={styles.matrixGroupChevron}>{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {isExpanded && (
                        rows.length === 0 ? (
                          <div style={styles.matrixGroupEmpty}>
                            {`Tiada kelas untuk ${getDisplayLevel(grade, levelMappings)}.`}
                          </div>
                        ) : gradeSubjectNames.length === 0 ? (
                          <div style={styles.matrixGroupEmpty}>
                            {`Tiada subjek aktif untuk ${getDisplayLevel(grade, levelMappings)}.`}
                          </div>
                        ) : (
                          <div style={{ width: '100%', overflow: 'hidden' }}>
                            <div style={styles.matrixWrap}>
                              <table style={styles.matrixTable}>
                                <thead>
                                  <tr>
                                    <th style={{ ...styles.matrixTh, ...styles.matrixStickyCol }}>
                                      Tingkatan / Kelas
                                    </th>
                                    {gradeSubjectNames.map((subjectName) => (
                                      <th key={`${grade}-${subjectName}`} style={styles.matrixTh}>
                                        {subjectName}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row) => (
                                    <tr key={row.id}>
                                      <td style={{ ...styles.matrixTd, ...styles.matrixStickyCol, ...styles.matrixClassCell }}>
                                        {getDisplayClassLabel(row.tingkatan, row.class_name, levelMappings)}
                                      </td>

                                      {gradeSubjectNames.map((subjectName) => {
                                        const cell = row.cells?.[subjectName]
                                        const isClickable = cell?.status !== 'na'

                                        let buttonStyle = {
                                          ...styles.matrixStatusButton,
                                          ...(isMobileView ? styles.matrixStatusButtonMobile : {}),
                                        }
                                        if (cell?.status === 'complete') {
                                          buttonStyle = {
                                            ...styles.matrixStatusButton,
                                            ...(isMobileView ? styles.matrixStatusButtonMobile : {}),
                                            ...styles.matrixStatusButtonComplete,
                                          }
                                        } else if (cell?.status === 'partial') {
                                          buttonStyle = {
                                            ...styles.matrixStatusButton,
                                            ...(isMobileView ? styles.matrixStatusButtonMobile : {}),
                                            ...styles.matrixStatusButtonPartial,
                                          }
                                        } else if (cell?.status === 'incomplete') {
                                          buttonStyle = {
                                            ...styles.matrixStatusButton,
                                            ...(isMobileView ? styles.matrixStatusButtonMobile : {}),
                                            ...styles.matrixStatusButtonIncomplete,
                                          }
                                        } else {
                                          buttonStyle = {
                                            ...styles.matrixStatusButton,
                                            ...(isMobileView ? styles.matrixStatusButtonMobile : {}),
                                            ...styles.matrixStatusButtonNA,
                                          }
                                        }

                                        return (
                                          <td key={`${row.id}-${subjectName}`} style={styles.matrixTd}>
                                            <button
                                              type="button"
                                              style={{
                                                ...buttonStyle,
                                                cursor: isClickable ? 'pointer' : 'default',
                                              }}
                                              onClick={() => {
                                                if (cell?.status === 'na') return

                                                const params = new URLSearchParams({
                                                  class_id: row.id,
                                                  subject_name: subjectName,
                                                  exam_key: selectedExamKey,
                                                  show: 'incomplete',
                                                })

                                                navigate(`/scores?${params.toString()}`)
                                              }}
                                            >
                                              {cell?.label || '-'}
                                            </button>
                                            {cell?.status !== 'na' && (
                                              <div style={styles.matrixMeta}>
                                                {cell?.completedStudents || 0}/{cell?.totalStudents || 0} murid
                                              </div>
                                            )}
                                          </td>
                                        )
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )
                })}
            </div>
          )}
        </section>

        {isSchoolAdmin && (
          <section style={styles.sectionCard}>
            <div style={styles.sectionHeader}>
              <div>
                <h3 style={styles.sectionTitle}>Status Input Peperiksaan</h3>
                <p style={styles.sectionDesc}>
                  School admin boleh buka atau tutup peperiksaan yang dibenarkan untuk input markah guru.
                </p>
              </div>
            </div>

            {examAccessLoading ? (
              <div style={styles.infoText}>Sedang memuat status peperiksaan...</div>
            ) : groupedExamAccessRows.length === 0 ? (
              <div style={styles.infoText}>Tiada konfigurasi peperiksaan ditemui.</div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Tingkatan</th>
                      {visibleExamKeys.map((examKey) => (
                        <th key={examKey} style={styles.thCenter}>{getExamColumnLabel(examKey)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedExamAccessRows.map((group) => (
                      <tr key={group.grade_label}>
                        <td style={styles.tdStrong}>{getDisplayLevel(group.grade_label, levelMappings)}</td>

                        {visibleExamKeys.map((examKey) => {
                          const row = group.exams[examKey]

                          if (!row) {
                            return (
                              <td key={examKey} style={styles.tdCenter}>
                                <span style={styles.mutedDash}>—</span>
                              </td>
                            )
                          }

                          return (
                            <td key={examKey} style={styles.tdCenter}>
                              <button
                                type="button"
                                onClick={() => handleToggleExamAccess(row.id, !row.is_active)}
                                disabled={examAccessSavingId === row.id}
                                style={{
                                  ...styles.matrixToggleButton,
                                  ...(row.is_active ? styles.matrixToggleOn : styles.matrixToggleOff),
                                  ...(examAccessSavingId === row.id ? styles.toggleDisabled : {}),
                                }}
                              >
                                {row.is_active ? 'Dibuka' : 'Ditutup'}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {isSchoolAdmin && (
          <section id="user-management-section" style={styles.sectionCard}>
            <div style={styles.sectionHeaderResponsive}>
              <h2 style={styles.cardTitle}>Pengurusan Pengguna</h2>
              <div style={styles.filterWrap}>
                {TABS.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{ ...styles.filterButton, ...(activeTab === tab ? styles.filterButtonActive : {}) }}
                  >
                    {tab === 'all' ? 'Semua' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.searchRow}>
              <input
                type="text"
                placeholder="Cari nama, email, role, designation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            {filteredUsers.length === 0 ? (
              <div style={styles.emptyState}>Tiada data untuk paparan ini.</div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Nama</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Role</th>
                      <th style={styles.th}>Designation</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Admin</th>
                      <th style={styles.th}>Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const isCurrentAdmin = user.id === adminProfile?.id
                      const isProtectedMasterAdmin = user.is_master_admin === true || user.role === 'master_admin'

                      return (
                        <tr key={user.id}>
                          <td style={styles.td}>{getDisplayName(user)}</td>
                          <td style={styles.td}>{user.email || '-'}</td>
                          <td style={styles.td}>{user.role || '-'}</td>
                          <td style={styles.td}>
                            {isProtectedMasterAdmin ? (
                              <span style={styles.readonlyTag}>Master Admin</span>
                            ) : (
                              <select
                                value={user.designation || ''}
                                onChange={(e) => handleSaveDesignation(user, e.target.value)}
                                style={styles.designationSelect}
                                disabled={savingId === user.id}
                              >
                                <option value="">Pilih designation</option>
                                {DESIGNATION_OPTIONS.map((designation) => (
                                  <option key={designation} value={designation}>
                                    {designation}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td style={styles.td}>
                            <span style={{ ...styles.badge, ...getStatusStyle(user.approval_status) }}>
                              {getStatusText(user.approval_status)}
                            </span>
                          </td>
                          <td style={styles.td}>{user.is_school_admin ? 'Ya' : 'Tidak'}</td>
                          <td style={styles.td}>
                            <div style={styles.actionRow}>
                              {isCurrentAdmin ? (
                                <span style={styles.selfTag}>Akaun anda</span>
                              ) : isProtectedMasterAdmin ? (
                                <span style={styles.protectedTag}>Master admin dilindungi</span>
                              ) : (
                                <select
                                  value={actionDrafts[user.id] ?? ''}
                                  onChange={async (e) => {
                                    const selectedAction = e.target.value
                                    setActionDrafts((prev) => ({
                                      ...prev,
                                      [user.id]: selectedAction,
                                    }))
                                    await handleActionChange(user, selectedAction)
                                  }}
                                  style={styles.actionSelect}
                                  disabled={savingId === user.id}
                                >
                                  <option value="">Pilih tindakan</option>
                                  {getActionOptions(user, isCurrentAdmin, isProtectedMasterAdmin).map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function StatusRow({ done, label }) {
  return (
    <div style={styles.statusRow}>
      <span style={done ? styles.checkDone : styles.checkTodo}>{done ? '✓' : '○'}</span>
      <span>{label}</span>
    </div>
  )
}

function StatCard({ title, value, isMobileView }) {
  return (
    <div style={{ ...styles.statCard, ...(isMobileView ? styles.summaryCardMobile : {}) }}>
      <div style={{ ...styles.statTitle, ...(isMobileView ? styles.summaryLabelMobile : {}) }}>{title}</div>
      <div style={{ ...styles.statValue, ...(isMobileView ? styles.summaryValueMobile : {}) }}>{value}</div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Inter, Arial, sans-serif' },
  loadingWrap: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc' },
  loadingCard: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 24px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    background: 'linear-gradient(90deg, #08142b 0%, #0b1730 55%, #0f1c3a 100%)',
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    position: 'sticky',
    top: 0,
    zIndex: 20,
    boxShadow: '0 10px 24px rgba(2, 8, 23, 0.22)',
    flexWrap: 'wrap',
  },
  mobileTopBar: {
    display: 'grid',
    gridTemplateColumns: '44px minmax(0, 1fr) 44px',
    minHeight: '72px',
    padding: '10px 14px',
    gap: '8px',
    flexWrap: 'nowrap',
  },
  brandWrap: { display: 'flex', alignItems: 'center', gap: '12px' },
  brandLogo: { width: '42px', height: '42px', objectFit: 'contain', borderRadius: '10px', background: 'transparent', flexShrink: 0 },
  brandTextWrap: { display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 },
  brandTitle: { fontSize: '18px', fontWeight: 800, color: '#ffffff', lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0 },
  brandSub: { fontSize: '12px', color: 'rgba(255,255,255,0.82)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px', maxWidth: '260px' },
  topActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  navButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '18px',
    background: 'rgba(255,255,255,0.04)',
    color: '#ffffff',
    padding: '13px 18px',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  navButtonHover: {
    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    color: '#ffffff',
    boxShadow: '0 10px 25px rgba(37, 99, 235, 0.35)',
    border: '1px solid rgba(255,255,255,0.18)',
  },
  logoutButton: {
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '18px',
    background: 'rgba(255,255,255,0.04)',
    color: '#ffffff',
    padding: '14px 26px',
    fontSize: '15px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  disabledTopButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  desktopMenuWrap: {
    position: 'relative',
  },
  desktopMenuChevron: {
    fontSize: '11px',
    lineHeight: 1,
    opacity: 0.8,
  },
  settingsDropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    minWidth: 300,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
    padding: 8,
    zIndex: 20,
  },
  dropdownGroup: {
    display: 'grid',
    gap: 4,
    padding: '4px 0 8px',
  },
  dropdownGroupLabel: {
    padding: '8px 10px 4px',
    color: '#475569',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  dropdownGroupLabelActive: {
    color: '#1d4ed8',
  },
  dropdownGroupItems: {
    display: 'grid',
    gap: 2,
  },
  dropdownItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    textAlign: 'left',
    padding: '10px 12px',
    border: 'none',
    background: '#fff',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 600,
    color: '#0f172a',
  },
  dropdownItemActive: {
    background: '#eff6ff',
    color: '#1d4ed8',
  },
  dropdownItemDisabled: {
    color: '#94a3b8',
    cursor: 'not-allowed',
  },
  dropdownNote: {
    flexShrink: 0,
    borderRadius: '999px',
    background: '#f1f5f9',
    color: '#64748b',
    padding: '3px 7px',
    fontSize: '10px',
    fontWeight: 800,
  },
  mobileMenuButton: {
    width: '44px',
    height: '44px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: '#ffffff',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  },
  mobileHeaderSpacer: {
    width: '44px',
    height: '44px',
  },
  mobileBrandWrap: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  mobileBrandLogo: {
    width: '34px',
    height: '34px',
    objectFit: 'contain',
    borderRadius: '8px',
    flexShrink: 0,
  },
  mobileBrandTextWrap: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  mobileBrandTitle: {
    fontSize: '15px',
    lineHeight: 1.05,
    fontWeight: 800,
    color: '#ffffff',
    margin: 0,
  },
  mobileBrandSub: {
    width: '100%',
    maxWidth: '180px',
    marginTop: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '10px',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.76)',
  },
  mobileDrawerBackdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 38,
    border: 'none',
    background: 'rgba(15, 23, 42, 0.42)',
    padding: 0,
    cursor: 'pointer',
  },
  mobileDrawer: {
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 45,
    width: 'min(86vw, 322px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '18px 24px 24px',
    background: '#0f3b63',
    color: '#ffffff',
    boxShadow: '18px 0 40px rgba(2, 8, 23, 0.32)',
    overflowY: 'auto',
  },
  mobileDrawerCloseButton: {
    width: '38px',
    height: '38px',
    marginLeft: '-10px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: '#ffffff',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
  },
  mobileDrawerBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
  },
  mobileDrawerLogo: {
    width: '38px',
    height: '38px',
    objectFit: 'contain',
    flexShrink: 0,
  },
  mobileDrawerTitle: {
    fontSize: '17px',
    lineHeight: 1.1,
    fontWeight: 800,
    color: '#ffffff',
  },
  mobileDrawerSub: {
    maxWidth: '210px',
    marginTop: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '10px',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.72)',
  },
  mobileDrawerMenu: {
    display: 'grid',
    gap: '16px',
    marginTop: '8px',
  },
  mobileMenuItem: {
    width: '100%',
    minHeight: '43px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    border: 'none',
    borderBottom: '1px solid rgba(163, 230, 53, 0.7)',
    borderRadius: 0,
    background: 'transparent',
    color: '#ffffff',
    padding: '12px 8px',
    textAlign: 'left',
    textTransform: 'uppercase',
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.01em',
    cursor: 'pointer',
  },
  mobileMenuItemActive: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#d9f99d',
  },
  mobileMenuItemDisabled: {
    opacity: 0.48,
    cursor: 'not-allowed',
  },
  mobileMenuSection: {
    display: 'grid',
    gap: '6px',
  },
  mobileMenuSectionLabel: {
    padding: '0 8px',
    color: '#bae6fd',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  mobileSubMenuPanel: {
    display: 'grid',
    gap: 0,
  },
  mobileNestedMenuGroup: {
    display: 'grid',
    gap: 0,
    padding: '3px 0 8px',
  },
  mobileNestedMenuLabel: {
    padding: '10px 8px 6px 18px',
    color: '#bae6fd',
    fontSize: '11px',
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  mobileNestedMenuLabelActive: {
    color: '#d9f99d',
  },
  mobileNestedMenuItems: {
    display: 'grid',
    gap: 0,
  },
  mobileSubMenuItem: {
    width: '100%',
    minHeight: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    border: 'none',
    borderBottom: '1px solid rgba(163, 230, 53, 0.42)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.9)',
    padding: '9px 8px 9px 18px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  mobileSubMenuItemActive: {
    background: 'rgba(255,255,255,0.08)',
    color: '#d9f99d',
  },
  mobileSubMenuItemDisabled: {
    color: 'rgba(226,232,240,0.5)',
    cursor: 'not-allowed',
  },
  mobileSoonTag: {
    flexShrink: 0,
    borderRadius: '999px',
    background: 'rgba(241,245,249,0.14)',
    color: 'rgba(255,255,255,0.72)',
    padding: '3px 7px',
    fontSize: '10px',
    fontWeight: 800,
  },
  mobileLogoutButton: {
    width: '100%',
    marginTop: 'auto',
    minHeight: '46px',
    borderRadius: '8px',
    border: '1px solid #fecaca',
    background: '#fff1f2',
    color: '#b91c1c',
    fontSize: '14px',
    fontWeight: 700,
    padding: '12px 14px',
    cursor: 'pointer',
  },
  mobileSettingsPanel: {
    display: 'grid',
    gap: 0,
    marginLeft: '14px',
    padding: '2px 0 8px',
  },
  mobileSettingsItem: {
    minHeight: '38px',
    border: 'none',
    borderBottom: '1px solid rgba(226, 232, 240, 0.22)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.88)',
    fontSize: '12px',
    fontWeight: 700,
    padding: '9px 8px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  setupAlertCard: {
    marginBottom: '24px',
    background: '#fff7ed',
    border: '1px solid #fdba74',
    borderRadius: '20px',
    padding: '20px',
  },
  setupAlertTitle: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#9a3412',
    marginBottom: '8px',
  },
  setupAlertText: {
    fontSize: '14px',
    lineHeight: 1.7,
    color: '#7c2d12',
  },
  setupAlertActions: {
    marginTop: '16px',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  setupPrimaryButton: {
    border: 'none',
    borderRadius: '14px',
    background: '#ea580c',
    color: '#ffffff',
    padding: '12px 18px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  container: { maxWidth: '1240px', margin: '0 auto', padding: '24px', display: 'grid', gap: '20px' },
  containerMobile: { padding: '18px 14px', gap: '16px' },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #f8fbff 0%, #eef4ff 45%, #f8fafc 100%)',
    border: '1px solid #dbe4ee',
    borderRadius: '30px',
    padding: '30px',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
  },
  heroGlow: {
    position: 'absolute',
    top: '-80px',
    right: '-80px',
    width: '220px',
    height: '220px',
    borderRadius: '999px',
    background: 'radial-gradient(circle, rgba(37,99,235,0.16) 0%, rgba(37,99,235,0.06) 35%, rgba(37,99,235,0) 70%)',
    pointerEvents: 'none',
  },
  heroGlowSecondary: {
    position: 'absolute',
    bottom: '-100px',
    left: '-80px',
    width: '240px',
    height: '240px',
    borderRadius: '999px',
    background: 'radial-gradient(circle, rgba(14,165,233,0.10) 0%, rgba(14,165,233,0.04) 35%, rgba(14,165,233,0) 70%)',
    pointerEvents: 'none',
  },
  heroInner: {
    position: 'relative',
    zIndex: 1,
  },
  heroHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap',
    animation: 'heroFadeUp 480ms ease-out',
  },
  schoolLogoInline: {
    width: '88px',
    height: '88px',
    objectFit: 'contain',
    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    borderRadius: '22px',
    padding: '8px',
    border: '1px solid rgba(255,255,255,0.8)',
    boxShadow: '0 14px 30px rgba(15, 23, 42, 0.12)',
    flexShrink: 0,
    animation: 'logoFloatIn 520ms ease-out',
  },
  heroTitle: { margin: 0, fontSize: '30px', fontWeight: 800 },
  heroDescription: { marginTop: '8px', color: '#64748b', lineHeight: 1.7 },
  schoolNameBadge: {
    display: 'inline-block',
    marginTop: '10px',
    padding: '7px 13px',
    borderRadius: '999px',
    background: 'linear-gradient(180deg, #dbeafe 0%, #e0f2fe 100%)',
    color: '#1d4ed8',
    fontSize: '12px',
    fontWeight: 800,
    border: '1px solid rgba(59,130,246,0.12)',
    boxShadow: '0 4px 12px rgba(59,130,246,0.08)',
  },
  heroMetaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '18px',
    marginTop: '20px',
    paddingTop: '18px',
    borderTop: '1px solid #e2e8f0',
    fontSize: '14px',
    color: '#334155',
  },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' },
  statCard: { background: '#ffffff', border: '1px solid #dbe4ee', borderRadius: '24px', padding: '22px', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.04)', animation: 'statFadeIn 560ms ease-out' },
  statTitle: { color: '#64748b', fontSize: '13px', marginBottom: '8px' },
  statValue: { fontSize: '28px', fontWeight: 800 },
  summaryCardMobile: { padding: '16px', borderRadius: '16px' },
  summaryValueMobile: { fontSize: '28px', fontWeight: 800 },
  summaryLabelMobile: { fontSize: '14px', fontWeight: 600 },
  dualGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' },
  sectionCard: { background: '#ffffff', border: '1px solid #dbe4ee', borderRadius: '24px', padding: '22px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)', overflow: 'hidden' },
  cardHeader: { marginBottom: '14px' },
  cardHeaderColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '14px',
  },
  examFilterRow: {
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  examFilterLabel: {
    fontWeight: 600,
    color: '#0f172a',
  },
  examFilterSelect: {
    padding: '6px 10px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#0f172a',
    outline: 'none',
  },
  cardTitle: { margin: 0, fontSize: '20px', fontWeight: 700 },
  statusList: { display: 'grid', gap: '10px', marginBottom: '14px' },
  statusRow: { display: 'flex', alignItems: 'center', gap: '10px', color: '#334155' },
  checkDone: { width: '26px', height: '26px', borderRadius: '999px', display: 'inline-grid', placeItems: 'center', background: '#dcfce7', color: '#166534', fontWeight: 700 },
  checkTodo: { width: '26px', height: '26px', borderRadius: '999px', display: 'inline-grid', placeItems: 'center', background: '#f1f5f9', color: '#64748b', fontWeight: 700 },
  helperText: { color: '#64748b', lineHeight: 1.6, marginBottom: '16px' },
  roleHintText: {
    fontSize: '12px',
    color: '#64748b',
    fontWeight: 600,
  },
  primaryButton: { background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '12px', padding: '12px 16px', fontWeight: 700, cursor: 'pointer' },
  secondaryButton: {
    background: '#ffffff',
    color: '#0f172a',
    border: '1px solid #cbd5e1',
    borderRadius: '12px',
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '14px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  },
  sectionHeaderResponsive: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' },
  sectionTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800,
    color: '#0f172a',
  },
  sectionDesc: {
    margin: '6px 0 0',
    fontSize: '13px',
    color: '#64748b',
  },
  infoText: {
    fontSize: '14px',
    color: '#64748b',
  },
  quickActionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },
  quickActionCard: {
    border: '1px solid transparent',
    borderRadius: '22px',
    padding: '18px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 180ms ease',
    background: '#ffffff',
    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minHeight: '120px',
  },
  quickActionCardBlue: {
    background: 'linear-gradient(180deg, #eff6ff 0%, #f8fbff 100%)',
    borderColor: '#bfdbfe',
  },
  quickActionCardGreen: {
    background: 'linear-gradient(180deg, #ecfdf5 0%, #f7fefb 100%)',
    borderColor: '#bbf7d0',
  },
  quickActionCardAmber: {
    background: 'linear-gradient(180deg, #fffbeb 0%, #fffdf5 100%)',
    borderColor: '#fde68a',
  },
  quickActionCardPurple: {
    background: 'linear-gradient(180deg, #faf5ff 0%, #fdf9ff 100%)',
    borderColor: '#e9d5ff',
  },
  quickActionCardTeal: {
    background: 'linear-gradient(180deg, #f0fdfa 0%, #f8fffd 100%)',
    borderColor: '#99f6e4',
  },
  quickActionCardRose: {
    background: 'linear-gradient(180deg, #fff1f2 0%, #fffafa 100%)',
    borderColor: '#fecdd3',
  },
  quickActionTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  },
  quickActionDesc: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#475569',
    margin: 0,
  },
  quickActionArrow: {
    marginLeft: 'auto',
    fontSize: '18px',
    fontWeight: 700,
    color: '#334155',
  },
  filterWrap: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  filterButton: { background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '9px 12px', cursor: 'pointer', fontWeight: 600 },
  filterButtonActive: { background: '#0f172a', color: '#ffffff', borderColor: '#0f172a' },
  searchRow: { marginBottom: '16px' },
  searchInput: { width: '100%', maxWidth: '360px', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px 14px', outline: 'none', fontSize: '14px' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: '900px' },
  th: { textAlign: 'left', padding: '12px 14px', fontSize: '13px', color: '#64748b', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' },
  td: { padding: '14px', borderBottom: '1px solid #eef2f7', verticalAlign: 'top', fontSize: '14px', color: '#0f172a' },
  tdStrong: {
    padding: '12px 10px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#0f172a',
    borderBottom: '1px solid #f1f5f9',
    whiteSpace: 'nowrap',
  },
  thCenter: {
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: 700,
    color: '#475569',
    background: '#f8fafc',
    padding: '12px 10px',
    borderBottom: '1px solid #e2e8f0',
    whiteSpace: 'nowrap',
  },
  tdCenter: {
    padding: '12px 10px',
    fontSize: '13px',
    color: '#0f172a',
    borderBottom: '1px solid #f1f5f9',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  toggleButton: {
    border: 'none',
    borderRadius: '999px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  toggleDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  toggleOn: {
    background: '#dcfce7',
    color: '#166534',
  },
  toggleOff: {
    background: '#fee2e2',
    color: '#991b1b',
  },
  matrixToggleButton: {
    border: 'none',
    borderRadius: '999px',
    minWidth: '92px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  matrixToggleOn: {
    background: '#dcfce7',
    color: '#166534',
  },
  matrixToggleOff: {
    background: '#fee2e2',
    color: '#991b1b',
  },
  pbdStatusPill: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    padding: '7px 11px',
    fontSize: '12px',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  pbdStatusOpen: {
    background: '#dcfce7',
    color: '#166534',
  },
  pbdStatusLocked: {
    background: '#e0e7ff',
    color: '#3730a3',
  },
  pbdStatusIdle: {
    background: '#f1f5f9',
    color: '#475569',
  },
  pbdActionGroup: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  smallActionButton: {
    border: 'none',
    borderRadius: '999px',
    background: '#0f172a',
    color: '#ffffff',
    minWidth: '76px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  smallDangerButton: {
    border: 'none',
    borderRadius: '999px',
    background: '#be123c',
    color: '#ffffff',
    minWidth: '76px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  mutedDash: {
    color: '#94a3b8',
    fontWeight: 700,
  },
  badge: { display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '6px 10px', fontSize: '12px', fontWeight: 700 },
  actionRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  successButton: { background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 600 },
  dangerButton: { background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 600 },
  infoButton: { background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 600 },
  warningButton: { background: '#d97706', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 600 },
  selfTag: { background: '#e2e8f0', color: '#334155', borderRadius: '999px', padding: '7px 10px', fontSize: '12px', fontWeight: 700 },
  protectedTag: { background: '#fee2e2', color: '#991b1b', borderRadius: '999px', padding: '7px 10px', fontSize: '12px', fontWeight: 700 },
  readonlyTag: { background: '#f1f5f9', color: '#475569', borderRadius: '999px', padding: '7px 10px', fontSize: '12px', fontWeight: 700, display: 'inline-flex' },
  designationSelect: { width: '100%', minWidth: '220px', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '8px 10px', outline: 'none', fontSize: '13px', background: '#ffffff' },
  actionSelect: { width: '100%', minWidth: '190px', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '8px 10px', outline: 'none', fontSize: '13px', background: '#ffffff' },
  emptyState: { background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '16px', padding: '24px', color: '#64748b' },
  matrixWrap: {
    overflowX: 'auto',
    overflowY: 'hidden',
    maxWidth: '100%',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    background: '#ffffff',
    boxShadow: 'inset 0 0 0 1px #e2e8f0',
  },
  matrixGroupList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  matrixGroupCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    background: '#ffffff',
    overflow: 'hidden',
  },
  matrixGroupToggle: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '16px 18px',
    border: 'none',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    textAlign: 'left',
    cursor: 'pointer',
  },
  matrixGroupTitle: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#0f172a',
  },
  matrixGroupMeta: {
    marginTop: '4px',
    fontSize: '13px',
    color: '#64748b',
  },
  matrixGroupChevron: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#334155',
  },
  matrixGroupEmpty: {
    padding: '16px 18px',
    color: '#64748b',
    fontSize: '14px',
  },
  matrixTable: {
    width: 'max-content',
    minWidth: '900px',
    borderCollapse: 'separate',
    borderSpacing: 0,
  },
  matrixTh: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    padding: '12px 14px',
    fontSize: '13px',
    fontWeight: 700,
    textAlign: 'center',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    color: '#0f172a',
    whiteSpace: 'nowrap',
  },
  matrixTd: {
    padding: '12px 10px',
    textAlign: 'center',
    borderBottom: '1px solid #e2e8f0',
    background: '#ffffff',
    verticalAlign: 'middle',
  },
  matrixStickyCol: {
    position: 'sticky',
    left: 0,
    zIndex: 1,
    background: '#ffffff',
    textAlign: 'left',
  },
  matrixClassCell: {
    minWidth: '220px',
    fontWeight: 600,
    color: '#0f172a',
  },
  matrixStatusButton: {
    minWidth: '96px',
    border: 'none',
    borderRadius: '999px',
    padding: '10px 14px',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'default',
  },
  matrixStatusButtonMobile: {
    minWidth: '88px',
    minHeight: '40px',
    fontSize: '13px',
    fontWeight: 700,
    borderRadius: '999px',
  },
  matrixStatusButtonComplete: {
    background: '#dcfce7',
    color: '#166534',
  },
  matrixStatusButtonPartial: {
    background: '#fef3c7',
    color: '#92400e',
  },
  matrixStatusButtonIncomplete: {
    background: '#fee2e2',
    color: '#991b1b',
  },
  matrixStatusButtonNA: {
    background: '#e2e8f0',
    color: '#475569',
  },
  matrixMeta: {
    marginTop: '6px',
    fontSize: '11px',
    color: '#64748b',
  },
}
