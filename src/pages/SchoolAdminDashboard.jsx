import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import {
  getExamStructureForGrade,
  normalizeSetupConfigWithExamConfigs,
} from '../lib/examConfig'

const TABS = ['pending', 'approved', 'rejected', 'all']

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
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showMobileSettingsMenu, setShowMobileSettingsMenu] = useState(false)
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 768)
  const [actionDrafts, setActionDrafts] = useState({})
  const [completionLoading, setCompletionLoading] = useState(false)
  const [completionRows, setCompletionRows] = useState([])
  const [completionSubjects, setCompletionSubjects] = useState([])
  const [selectedExamKey, setSelectedExamKey] = useState('TOV')
  const [examOptions, setExamOptions] = useState([])

  useEffect(() => {
    checkAccessAndFetch()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setShowSettingsMenu(false)
        setShowMobileMenu(false)
        setShowMobileSettingsMenu(false)
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
        setShowMobileSettingsMenu(false)
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

    if (!profile.is_school_admin) {
      navigate('/scores', { replace: true })
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
    ] = await Promise.all([
      supabase
        .from('classes')
        .select('id, class_name, tingkatan')
        .eq('school_id', schoolId)
        .order('tingkatan', { ascending: true })
        .order('class_name', { ascending: true }),

      supabase
        .from('subjects')
        .select('id, subject_name, tingkatan, is_active')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('tingkatan', { ascending: true })
        .order('subject_name', { ascending: true }),

      supabase
        .from('student_enrollments')
        .select('id, class_id')
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
    ])

    if (classError) console.error('Class matrix error:', classError)
    if (subjectError) console.error('Subject matrix error:', subjectError)
    if (enrollmentError) console.error('Enrollment matrix error:', enrollmentError)
    if (scoreError) console.error('Score matrix error:', scoreError)
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

    const enrollmentsByClass = new Map()
    ;(enrollmentRows || []).forEach((row) => {
      if (!enrollmentsByClass.has(row.class_id)) {
        enrollmentsByClass.set(row.class_id, [])
      }
      enrollmentsByClass.get(row.class_id).push(row.id)
    })

    const scoreMap = new Map()
    ;(scoreRows || []).forEach((row) => {
      const classId = row.class_id
      const subjectId = row.subject_id
      const enrollmentId = row.student_enrollment_id
      const examKey = String(row.exam_key || '').trim().toUpperCase()

      if (!classId || !subjectId || !enrollmentId || !examKey) return

      const key = `${classId}__${subjectId}`

      if (!scoreMap.has(key)) {
        scoreMap.set(key, new Map())
      }

      const studentMap = scoreMap.get(key)

      if (!studentMap.has(enrollmentId)) {
        studentMap.set(enrollmentId, new Set())
      }

      studentMap.get(enrollmentId).add(examKey)
    })

    const selectedExam = String(selectedExamKey || '').toUpperCase()

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

        const enrollmentIds = enrollmentsByClass.get(classItem.id) || []

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

          if (!enrollmentIds.length || !selectedExam) {
            cells[subjectName] = {
              status: 'incomplete',
              label: '0/0',
              completedStudents: 0,
              totalStudents: enrollmentIds.length,
              expectedExamCount: selectedExam ? 1 : 0,
            }
            return
          }

          const studentExamMap =
            scoreMap.get(`${classItem.id}__${subject.id}`) || new Map()

          let completedStudents = 0

          enrollmentIds.forEach((enrollmentId) => {
            const examSet = studentExamMap.get(enrollmentId) || new Set()

            if (examSet.has(selectedExam)) {
              completedStudents += 1
            }
          })

          const totalStudents = enrollmentIds.length
          const isComplete =
            totalStudents > 0 && completedStudents === totalStudents

          cells[subjectName] = {
            status: isComplete ? 'complete' : 'incomplete',
            label: isComplete ? 'Lengkap' : `${completedStudents}/${totalStudents}`,
            completedStudents,
            totalStudents,
            expectedExamCount: selectedExam ? 1 : 0,
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
    setShowMobileMenu(false)
    setShowMobileSettingsMenu(false)
    navigate(path)
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
          <div style={styles.mobileMenuWrapper} ref={settingsMenuRef}>
            <button
              onClick={() => {
                setShowMobileMenu((prev) => {
                  const nextValue = !prev
                  if (!nextValue) setShowMobileSettingsMenu(false)
                  return nextValue
                })
              }}
              style={styles.mobileMenuToggle}
            >
              {showMobileMenu ? '✕ Tutup' : '☰ Menu'}
            </button>

            {showMobileMenu && (
              <div style={styles.mobileMenuPanel}>
                <button onClick={() => handleMobileNavigate('/scores')} style={styles.mobileMenuItem}>
                  Input Markah
                </button>

                <button onClick={() => handleMobileNavigate('/students')} style={styles.mobileMenuItem}>
                  Input Murid
                </button>

                <button onClick={() => handleMobileNavigate('/analysis')} style={styles.mobileMenuItem}>
                  Analisis
                </button>

                <button onClick={() => handleMobileNavigate('/targets')} style={styles.mobileMenuItem}>
                  Sasaran Akademik
                </button>

                <button
                  onClick={() => setShowMobileSettingsMenu((prev) => !prev)}
                  style={styles.mobileMenuItem}
                >
                  {showMobileSettingsMenu ? 'Tutup Tetapan ▲' : 'Tetapan ▼'}
                </button>

                {showMobileSettingsMenu && (
                  <div style={styles.mobileSubmenu}>
                    <button onClick={() => handleMobileNavigate('/school-setup')} style={styles.mobileSubmenuItem}>
                      Struktur Akademik
                    </button>
                    <button onClick={() => handleMobileNavigate('/school-setup/exams')} style={styles.mobileSubmenuItem}>
                      Tetapan Peperiksaan
                    </button>
                    <button onClick={() => handleMobileNavigate('/school-setup/grades')} style={styles.mobileSubmenuItem}>
                      Tetapan Grade
                    </button>
                    <button onClick={() => handleMobileNavigate('/school-setup/subjects')} style={styles.mobileSubmenuItem}>
                      Tetapan Subjek
                    </button>
                    <button onClick={() => handleMobileNavigate('/classes')} style={styles.mobileSubmenuItem}>
                      Tetapan Kelas
                    </button>
                  </div>
                )}

                <button onClick={handleLogout} style={styles.mobileLogoutButton}>
                  Logout
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
              style={styles.secondaryTopButton}
            >
              Input Murid
            </button>

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

            <button
              onClick={() => navigate('/analysis')}
              style={styles.secondaryTopButton}
            >
              Analisis
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

      <main style={styles.container}>
        <section style={styles.hero}>
          <h1 style={styles.heroTitle}>Dashboard Admin Sekolah</h1>
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
          <StatCard title="Jumlah Pengguna" value={stats.total} />
          <StatCard title="Pending" value={stats.pending} />
          <StatCard title="Approved" value={stats.approved} />
          <StatCard title="Rejected" value={stats.rejected} />
          <StatCard title="Admin Sekolah" value={stats.admins} />
          <StatCard title="Jumlah Murid" value={studentCount} />
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
            <h2 style={styles.cardTitle}>Status Pengisian Markah ({selectedExamKey})</h2>
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
            <div style={styles.matrixWrap}>
              <table style={styles.matrixTable}>
                <thead>
                  <tr>
                    <th style={{ ...styles.matrixTh, ...styles.matrixStickyCol }}>
                      Tingkatan / Kelas
                    </th>
                    {completionSubjects.map((subjectName) => (
                      <th key={subjectName} style={styles.matrixTh}>
                        {subjectName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {completionRows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ ...styles.matrixTd, ...styles.matrixStickyCol, ...styles.matrixClassCell }}>
                        {row.label}
                      </td>

                      {completionSubjects.map((subjectName) => {
                        const cell = row.cells?.[subjectName]

                        let buttonStyle = styles.matrixStatusButton
                        if (cell?.status === 'complete') {
                          buttonStyle = {
                            ...styles.matrixStatusButton,
                            ...styles.matrixStatusButtonComplete,
                          }
                        } else if (cell?.status === 'incomplete') {
                          buttonStyle = {
                            ...styles.matrixStatusButton,
                            ...styles.matrixStatusButtonIncomplete,
                          }
                        } else {
                          buttonStyle = {
                            ...styles.matrixStatusButton,
                            ...styles.matrixStatusButtonNA,
                          }
                        }

                        return (
                          <td key={`${row.id}-${subjectName}`} style={styles.matrixTd}>
                            <button type="button" style={buttonStyle}>
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
          )}
        </section>

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

function StatCard({ title, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statTitle}>{title}</div>
      <div style={styles.statValue}>{value}</div>
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
  mobileMenuWrapper: {
    position: 'relative',
  },
  mobileMenuToggle: {
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.15)',
    background: '#111827',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 15,
  },
  mobileMenuPanel: {
    marginTop: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: '#fff',
    padding: 12,
    borderRadius: 16,
    border: '1px solid #e5e7eb',
  },
  mobileMenuItem: {
    width: '100%',
    textAlign: 'left',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    color: '#0f172a',
  },
  mobileSubmenu: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingLeft: 8,
  },
  mobileSubmenuItem: {
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#f8fafc',
    cursor: 'pointer',
    fontWeight: 600,
    color: '#334155',
  },
  mobileLogoutButton: {
    width: '100%',
    textAlign: 'left',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #fecaca',
    background: '#fff',
    color: '#b91c1c',
    cursor: 'pointer',
    fontWeight: 700,
  },
  container: { maxWidth: '1240px', margin: '0 auto', padding: '24px', display: 'grid', gap: '20px' },
  hero: { background: 'linear-gradient(135deg, #ffffff, #eef4ff)', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '28px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' },
  heroTitle: { margin: 0, fontSize: '30px', fontWeight: 800 },
  heroText: { margin: '10px 0 0 0', color: '#475569', lineHeight: 1.6 },
  heroInfo: { display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '16px', color: '#334155', fontSize: '14px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' },
  statCard: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)' },
  statTitle: { color: '#64748b', fontSize: '13px', marginBottom: '8px' },
  statValue: { fontSize: '28px', fontWeight: 800 },
  dualGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' },
  card: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '22px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)' },
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
  primaryButton: { background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '12px', padding: '12px 16px', fontWeight: 700, cursor: 'pointer' },
  sectionHeader: { marginBottom: '14px' },
  sectionHeaderResponsive: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' },
  quickActions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' },
  quickButton: { background: '#f8fafc', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px 16px', fontWeight: 600, textAlign: 'left', cursor: 'pointer' },
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
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    background: '#ffffff',
  },
  matrixTable: {
    width: '100%',
    minWidth: '980px',
    borderCollapse: 'separate',
    borderSpacing: 0,
  },
  matrixTh: {
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
  matrixStatusButtonComplete: {
    background: '#dcfce7',
    color: '#166534',
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
