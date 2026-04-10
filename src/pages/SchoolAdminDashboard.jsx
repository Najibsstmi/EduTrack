import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import {
  getExamStructureForGrade,
  normalizeSetupConfigWithExamConfigs,
} from '../lib/examConfig'
import {
  buildStudentExamMap,
  getRelevantEnrollmentIds,
} from '../lib/completionMatrix'

const TABS = ['pending', 'approved', 'rejected', 'all']
const COMPLETION_GRADE_GROUPS = [
  'Tingkatan 1',
  'Tingkatan 2',
  'Tingkatan 3',
  'Tingkatan 4',
  'Tingkatan 5',
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

  const [adminProfile, setAdminProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [users, setUsers] = useState([])
  const [setupConfig, setSetupConfig] = useState(null)
  const [classCount, setClassCount] = useState(0)
  const [studentCount, setStudentCount] = useState(0)

  const [activeTab, setActiveTab] = useState('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [showMobileSettings, setShowMobileSettings] = useState(false)
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 768)
  const [actionDrafts, setActionDrafts] = useState({})
  const [completionLoading, setCompletionLoading] = useState(false)
  const [completionRows, setCompletionRows] = useState([])
  const [completionSubjects, setCompletionSubjects] = useState([])
  const [selectedExamKey, setSelectedExamKey] = useState('TOV')
  const [examOptions, setExamOptions] = useState([])
  const [expandedCompletionGrades, setExpandedCompletionGrades] = useState(() =>
    COMPLETION_GRADE_GROUPS.reduce((acc, grade) => {
      acc[grade] = grade === 'Tingkatan 1'
      return acc
    }, {})
  )

  useEffect(() => {
    checkAccessAndFetch()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setShowSettingsMenu(false)
        setShowMobileSettings(false)
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
        setShowMobileSettings(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!adminProfile?.school_id || !setupConfig) return

    fetchScoreCompletionMatrix(adminProfile.school_id, setupConfig)
  }, [selectedExamKey])

  const checkAccessAndFetch = async () => {
    setLoading(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      navigate('/login', { replace: true })
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, school_id, role, designation, approval_status, is_school_admin, is_master_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      navigate('/login', { replace: true })
      return
    }

    if (profile.is_master_admin) {
      navigate('/master-admin', { replace: true })
      return
    }

    if (profile.approval_status === 'pending') {
      navigate('/pending', { replace: true })
      return
    }

    if (profile.approval_status !== 'approved') {
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
      navigate('/school-setup', { replace: true })
      return
    }

    setSetupConfig(setupData)

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
    ])

    setLoading(false)
  }

  const fetchSchoolData = async (schoolId) => {
    const [
      { data: school, error: schoolError },
      { data: profiles, error: profilesError },
    ] = await Promise.all([
      supabase
        .from('schools')
        .select('id, school_name, school_code, school_type, state, district')
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
      return
    }

    setCompletionLoading(true)

    const academicYear =
      rawSetupConfig?.current_academic_year || new Date().getFullYear()

    const [
      { data: classRows, error: classError },
      { data: subjectRows, error: subjectError },
      { data: enrollmentRows, error: enrollmentError },
      { data: scoreRows, error: scoreError },
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
    if (enrollmentError) console.error('Enrollment matrix error:', enrollmentError)
    if (scoreError) console.error('Score matrix error:', scoreError)
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
      (item) => item && item.is_active !== false
    )

    const subjectNames = Array.from(
      new Set(
        activeSubjects
          .map((item) => String(item.subject_name || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) =>
      a.localeCompare(b, 'ms', { sensitivity: 'base' })
    )

    const studentExamMap = buildStudentExamMap(scoreRows || [])

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

        const cells = {}

        subjectNames.forEach((subjectName) => {
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

            if (examSet.has(normalizedSelectedExamKey)) {
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
    setCompletionRows(rows)
    setCompletionLoading(false)
  }

  const refreshData = async () => {
    if (!adminProfile?.school_id) return

    await Promise.all([
      fetchSchoolData(adminProfile.school_id),
      fetchScoreCompletionMatrix(adminProfile.school_id, setupConfig),
    ])
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
      alert('Akaun master admin tidak boleh disingkirkan oleh admin sekolah.')
      return
    }

    if (user.id === adminProfile?.id) {
      alert('Admin sekolah semasa tidak boleh singkir akaun sendiri.')
      return
    }

    const confirmed = window.confirm(
      `Singkir ${getDisplayName(user)} daripada sekolah ini? Akaun ini akan hilang daripada senarai pengguna sekolah dan aksesnya akan dihentikan.`
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
      alert(error.message || 'Gagal menyingkirkan akaun')
      setSavingId(null)
      return
    }

    setUsers((prev) => prev.filter((item) => item.id !== user.id))
    setSavingId(null)
    alert('Akaun berjaya disingkirkan dari sekolah ini')
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

  const handleMobileNavigate = (path) => {
    setShowMobileSettings(false)
    navigate(path)
  }

  const isMobileNavActive = (path) => {
    if (!path) return false

    if (path === '/school-setup') {
      return location.pathname === '/school-setup'
    }

    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const getMobileNavButtonStyle = (path) => {
    return isMobileNavActive(path)
      ? { ...styles.mobilePrimaryButton, ...styles.mobilePrimaryButtonActive }
      : styles.mobilePrimaryButton
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
      options.push({ value: 'remove-admin', label: 'Singkir admin' })
    }

    if (user.approval_status === 'rejected') {
      options.push({ value: 'approve', label: 'Luluskan semula' })
    }

    options.push({ value: 'remove-account', label: 'Singkir akaun' })

    return options
  }

  const isAdmin =
    adminProfile?.role === 'school_admin' || adminProfile?.is_school_admin === true

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
      <header style={styles.topbar}>
        <div>
          <div style={styles.brand}>EduTrack</div>
          <div style={styles.schoolMeta}>
            {schoolInfo?.school_name || '-'}
            {schoolInfo?.school_code ? ` (${schoolInfo.school_code})` : ''}
          </div>
        </div>

        {isMobileView ? (
          <div style={styles.mobileTopNavWrap} ref={settingsMenuRef}>
            <div style={styles.mobileTopNavRow}>
              <button
                type="button"
                onClick={() => handleMobileNavigate('/scores')}
                style={getMobileNavButtonStyle('/scores')}
              >
                Input Markah
              </button>

              <button
                type="button"
                onClick={() => handleMobileNavigate('/students')}
                style={getMobileNavButtonStyle('/students')}
                disabled={!isAdmin}
                title={!isAdmin ? 'Hanya admin sekolah boleh akses halaman ini' : undefined}
              >
                Input Murid
              </button>

              <button
                type="button"
                onClick={() => handleMobileNavigate('/analysis')}
                style={getMobileNavButtonStyle('/analysis')}
              >
                Analisis
              </button>

              <button
                type="button"
                onClick={() => handleMobileNavigate('/manage-subject-students')}
                style={getMobileNavButtonStyle('/manage-subject-students')}
              >
                Murid Subjek
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowMobileSettings((prev) => !prev)}
                  style={{
                    ...styles.mobilePrimaryButton,
                    ...(showMobileSettings ? styles.mobilePrimaryButtonActive : {}),
                  }}
                >
                  Tetapan {showMobileSettings ? '▴' : '▾'}
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                style={styles.mobileLogoutButton}
              >
                Logout
              </button>
            </div>

            {showMobileSettings && isAdmin && (
              <div style={styles.mobileSettingsDropdown}>
                <button
                  type="button"
                  onClick={() => handleMobileNavigate('/school-setup')}
                  style={styles.mobileSettingsItem}
                >
                  Struktur Akademik
                </button>

                <button
                  type="button"
                  onClick={() => handleMobileNavigate('/school-setup/exams')}
                  style={styles.mobileSettingsItem}
                >
                  Peperiksaan
                </button>

                <button
                  type="button"
                  onClick={() => handleMobileNavigate('/school-setup/grades')}
                  style={styles.mobileSettingsItem}
                >
                  Grade
                </button>

                <button
                  type="button"
                  onClick={() => handleMobileNavigate('/school-setup/subjects')}
                  style={styles.mobileSettingsItem}
                >
                  Subjek
                </button>

                <button
                  type="button"
                  onClick={() => handleMobileNavigate('/classes')}
                  style={styles.mobileSettingsItem}
                >
                  Kelas
                </button>

                <button
                  type="button"
                  onClick={() => handleMobileNavigate('/targets')}
                  style={styles.mobileSettingsItem}
                >
                  Sasaran Akademik
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={styles.topActions}>
            <button
              onClick={() => navigate('/scores')}
              style={styles.primaryTopButton}
            >
              Input Markah
            </button>

            <button
              onClick={() => navigate('/students')}
              style={{
                ...styles.secondaryTopButton,
                ...(!isAdmin ? styles.disabledTopButton : {}),
              }}
              disabled={!isAdmin}
              title={!isAdmin ? 'Hanya admin sekolah boleh akses halaman ini' : undefined}
            >
              Input Murid
            </button>

            {isAdmin && (
              <div style={{ position: 'relative' }} ref={settingsMenuRef}>
                <button
                  onClick={() => setShowSettingsMenu((prev) => !prev)}
                  style={styles.secondaryTopButton}
                >
                  Tetapan ▾
                </button>

                {showSettingsMenu && (
                  <div style={styles.settingsDropdown}>
                    <button onClick={() => navigate('/school-setup')} style={styles.dropdownItem}>
                      Struktur Akademik
                    </button>
                    <button onClick={() => navigate('/school-setup/exams')} style={styles.dropdownItem}>
                      Tetapan Peperiksaan
                    </button>
                    <button onClick={() => navigate('/school-setup/grades')} style={styles.dropdownItem}>
                      Tetapan Grade
                    </button>
                    <button onClick={() => navigate('/school-setup/subjects')} style={styles.dropdownItem}>
                      Tetapan Subjek
                    </button>
                    <button onClick={() => navigate('/classes')} style={styles.dropdownItem}>
                      Tetapan Kelas
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => navigate('/analysis')}
              style={styles.secondaryTopButton}
            >
              Analisis
            </button>

            <button
              onClick={() => navigate('/manage-subject-students')}
              style={styles.secondaryTopButton}
            >
              Urus Murid Subjek
            </button>

            <button
              onClick={() => navigate('/targets')}
              style={styles.secondaryTopButton}
            >
              Sasaran Akademik
            </button>

            <button
              onClick={handleLogout}
              style={styles.darkTopButton}
            >
              Logout
            </button>
          </div>
        )}
      </header>

      <main style={{ ...styles.container, ...(isMobileView ? styles.containerMobile : {}) }}>
        <section style={styles.hero}>
          <h1 style={styles.heroTitle}>{isAdmin ? 'Dashboard Admin Sekolah' : 'Dashboard Pemantauan Sekolah'}</h1>
          <p style={styles.heroText}>
            Urus pengguna, tetapan akademik, data murid, dan semakan status sekolah dalam satu paparan yang lebih kemas.
          </p>
          <div style={styles.heroInfo}>
            <span><strong>Admin:</strong> {getDisplayName(adminProfile)} ({adminProfile?.email || '-'})</span>
            <span><strong>Jenis:</strong> {schoolInfo?.school_type || '-'}</span>
            <span><strong>Negeri / PPD:</strong> {[schoolInfo?.state, schoolInfo?.district].filter(Boolean).join(' / ') || '-'}</span>
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

        <section style={styles.card}>
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
                <h3 style={styles.quickActionTitle}>Input Markah</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Masukkan markah peperiksaan murid dengan lebih cepat dan tersusun.
              </p>
            </div>

            <div
              onClick={() => navigate('/analysis')}
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
                <h3 style={styles.quickActionTitle}>Analisis Prestasi</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Lihat analisis kelas, individu dan prestasi subjek dengan lebih jelas.
              </p>
            </div>

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
                <h3 style={styles.quickActionTitle}>Urus Murid Subjek</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Tetapkan murid yang mengambil subjek selective seperti Pendidikan Islam,
                Pendidikan Moral atau subjek elektif lain.
              </p>
            </div>
          </div>
        </section>

        <section style={styles.dualGrid}>
          <div style={styles.card}>
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

          <div style={styles.card}>
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

        <section style={styles.card}>
          <div style={styles.cardHeaderColumn}>
            <h2 style={styles.cardTitle}>Pemantauan Pengisian Markah ({selectedExamKey})</h2>
            <span style={styles.roleHintText}>
              {isAdmin ? 'Paparan keseluruhan sekolah' : 'Paparan pemantauan'}
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

                  return (
                    <div key={grade} style={styles.matrixGroupCard}>
                      <button
                        type="button"
                        onClick={() => toggleCompletionGrade(grade)}
                        style={styles.matrixGroupToggle}
                      >
                        <div>
                          <div style={styles.matrixGroupTitle}>{grade}</div>
                          <div style={styles.matrixGroupMeta}>{rows.length} kelas</div>
                        </div>
                        <span style={styles.matrixGroupChevron}>{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      {isExpanded && (
                        rows.length === 0 ? (
                          <div style={styles.matrixGroupEmpty}>Tiada kelas untuk tingkatan ini.</div>
                        ) : (
                          <div style={{ width: '100%', overflow: 'hidden' }}>
                            <div style={styles.matrixWrap}>
                              <table style={styles.matrixTable}>
                                <thead>
                                  <tr>
                                    <th style={{ ...styles.matrixTh, ...styles.matrixStickyCol }}>
                                      Tingkatan / Kelas
                                    </th>
                                    {completionSubjects.map((subjectName) => (
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
                                        {row.label}
                                      </td>

                                      {completionSubjects.map((subjectName) => {
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

        {isAdmin && (
          <section style={styles.card}>
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
  topbar: { position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '16px 24px', background: '#0f172a', color: '#ffffff', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' },
  brand: { fontSize: '22px', fontWeight: 800, lineHeight: 1.1 },
  schoolMeta: { fontSize: '13px', color: '#cbd5e1', marginTop: '4px' },
  topActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryTopButton: {
    padding: '12px 18px',
    borderRadius: 12,
    border: '1px solid #2563eb',
    background: '#2563eb',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 15,
  },
  secondaryTopButton: {
    padding: '12px 18px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.15)',
    background: '#111827',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 15,
    minWidth: 120,
  },
  darkTopButton: {
    padding: '12px 18px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.15)',
    background: '#0f172a',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 15,
  },
  disabledTopButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  settingsDropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    minWidth: 220,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
    padding: 8,
    zIndex: 20,
  },
  dropdownItem: {
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    border: 'none',
    background: '#fff',
    borderRadius: 10,
    cursor: 'pointer',
    fontWeight: 600,
    color: '#0f172a',
  },
  mobileTopNavWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '12px',
  },
  mobileTopNavRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
  },
  mobilePrimaryButton: {
    minHeight: '46px',
    borderRadius: 12,
    border: '1px solid #cbd5e1',
    background: '#fff',
    color: '#0f172a',
    fontSize: '14px',
    fontWeight: 700,
    padding: '12px 14px',
    cursor: 'pointer',
  },
  mobilePrimaryButtonActive: {
    background: '#0f172a',
    color: '#ffffff',
    border: '1px solid #0f172a',
  },
  mobileLogoutButton: {
    minHeight: '46px',
    borderRadius: '12px',
    border: '1px solid #fecaca',
    background: '#fff1f2',
    color: '#b91c1c',
    fontSize: '14px',
    fontWeight: 700,
    padding: '12px 14px',
    cursor: 'pointer',
  },
  mobileSettingsDropdown: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '8px',
    padding: '10px',
    borderRadius: '14px',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
  },
  mobileSettingsItem: {
    minHeight: '44px',
    borderRadius: '10px',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#0f172a',
    fontSize: '14px',
    fontWeight: 600,
    padding: '10px 12px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  container: { maxWidth: '1240px', margin: '0 auto', padding: '24px', display: 'grid', gap: '20px' },
  containerMobile: { padding: '18px 14px', gap: '16px' },
  hero: { background: 'linear-gradient(135deg, #ffffff, #eef4ff)', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '28px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' },
  heroTitle: { margin: 0, fontSize: '30px', fontWeight: 800 },
  heroText: { margin: '10px 0 0 0', color: '#475569', lineHeight: 1.6 },
  heroInfo: { display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '16px', color: '#334155', fontSize: '14px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' },
  statCard: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)' },
  statTitle: { color: '#64748b', fontSize: '13px', marginBottom: '8px' },
  statValue: { fontSize: '28px', fontWeight: 800 },
  summaryCardMobile: { padding: '16px', borderRadius: '16px' },
  summaryValueMobile: { fontSize: '28px', fontWeight: 800 },
  summaryLabelMobile: { fontSize: '14px', fontWeight: 600 },
  dualGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' },
  card: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '22px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)', overflow: 'hidden' },
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
  sectionHeader: { marginBottom: '14px' },
  sectionHeaderResponsive: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' },
  quickActionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },
  quickActionCard: {
    borderRadius: '18px',
    padding: '18px',
    cursor: 'pointer',
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minHeight: '120px',
  },
  quickActionCardBlue: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
  },
  quickActionCardGreen: {
    background: '#ecfdf5',
    border: '1px solid #bbf7d0',
  },
  quickActionCardPurple: {
    background: '#faf5ff',
    border: '1px solid #e9d5ff',
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
