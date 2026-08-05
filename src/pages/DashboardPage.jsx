import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useLocation, useNavigate } from 'react-router-dom'
import { forceCleanLogout, isRefreshTokenError } from '../lib/authSession'
import { formatSubjectName } from '../lib/subjectLabels.js'

const TEACHER_NAVIGATION = [
  { key: 'dashboard', label: 'Dashboard', path: '/home' },
  {
    key: 'assessment',
    label: 'Pentaksiran',
    items: [
      { key: 'exam', label: 'Peperiksaan', path: '/scores' },
      { key: 'pbd', label: 'PBD', path: '/input-pbd', activePaths: ['/pbs/pbd', '/pbs/pbd/input'] },
      { key: 'pajsk', label: 'PAJSK', path: '/pbs/pajsk' },
      {
        key: 'psychometric',
        label: 'Psikometrik',
        path: '/psikometrik/input',
        activePaths: ['/pbs/ppsi', '/pbs/ppsi/input', '/psychometric/input'],
      },
    ],
  },
  {
    key: 'students',
    label: 'Murid',
    items: [
      { key: 'student-subjects', label: 'Subjek Murid', path: '/manage-subject-students' },
    ],
  },
  {
    key: 'analysis',
    label: 'Analisis',
    items: [
      {
        key: 'exam-analysis',
        label: 'Peperiksaan',
        items: [
          { key: 'student-performance', label: 'Prestasi Murid', path: '/analysis/student' },
          { key: 'class-performance', label: 'Prestasi Kelas', path: '/analysis/class' },
          { key: 'subject-performance', label: 'Prestasi Subjek (GPMP)', path: '/analysis/subject' },
          { key: 'school-performance', label: 'Prestasi Sekolah (GPS)', disabled: true, note: 'Akan datang' },
        ],
      },
      {
        key: 'non-exam-analysis',
        label: 'Bukan Peperiksaan',
        items: [
          { key: 'pbd-analysis', label: 'Analisis PBD', path: '/analysis/pbd', activePaths: ['/analisis-pbd', '/pbs/pbd/analysis'] },
          { key: 'pajsk-segak-analysis', label: 'Analisis PAJSK & SEGAK', path: '/analysis/pajsk-segak', activePaths: ['/pbs/pajsk/segak/analysis'] },
          { key: 'psychometric-analysis', label: 'Analisis Psikometrik', path: '/analysis/psychometric' },
          { key: 'pbs-integrated', label: 'PBS Bersepadu', path: '/analysis/pbs' },
        ],
      },
    ],
  },
  { key: 'performance-dialog', label: 'Dialog Prestasi', path: '/dialog-prestasi' },
  {
    key: 'settings',
    label: 'Tetapan',
    items: [
      { key: 'my-profile', label: 'Profil Saya', path: '/profile' },
    ],
  },
]

const ANALYSIS_GROUPS = [
  {
    title: 'Peperiksaan',
    items: [
      {
        label: 'Prestasi Murid',
        description: 'Analisis markah individu mengikut peperiksaan dan subjek.',
        path: '/analysis/student',
      },
      {
        label: 'Prestasi Kelas',
        description: 'Ringkasan pencapaian kelas, GPS dan taburan gred.',
        path: '/analysis/class',
      },
      {
        label: 'Prestasi Subjek (GPMP)',
        description: 'Bandingkan prestasi subjek dan GPMP mengikut kelas.',
        path: '/analysis/subject',
      },
      {
        label: 'Prestasi Sekolah (GPS)',
        description: 'Paparan keseluruhan GPS sekolah.',
        disabled: true,
        note: 'Akan datang',
      },
    ],
  },
  {
    title: 'Bukan Peperiksaan',
    items: [
      {
        label: 'Analisis PBD',
        description: 'Lihat TP semasa, snapshot penggal dan perubahan murid.',
        path: '/analysis/pbd',
      },
      {
        label: 'Analisis PAJSK & SEGAK',
        description: 'Pantau pencapaian SEGAK dan komponen PAJSK.',
        path: '/analysis/pajsk-segak',
      },
      {
        label: 'Analisis Psikometrik',
        description: 'Semak dapatan psikometrik mengikut kelas dan instrumen.',
        path: '/analysis/psychometric',
      },
      {
        label: 'PBS Bersepadu',
        description: 'Paparan holistik peperiksaan, PBD, SEGAK dan psikometrik.',
        path: '/analysis/pbs',
      },
    ],
  },
]

function DashboardPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [activeNavMenu, setActiveNavMenu] = useState('')

  const [setupStatus, setSetupStatus] = useState({
    exams: false,
    grades: false,
    subjects: false,
    classes: false,
    students: false,
    examNames: [],
    subjectNames: [],
    classItems: [],
    studentCount: 0,
  })

  useEffect(() => {
    let isMounted = true

    const loadPage = async () => {
      try {
        setLoading(true)
        setErrorMessage('')
        await loadProfile()
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
    const handleResize = () => {
      setIsMobileView(window.innerWidth <= 640)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    setActiveNavMenu('')
  }, [location.pathname])

  const loadProfile = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      console.log('Session invalid → redirect login')
      await forceCleanLogout()
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, approval_status, is_active, is_master_admin, is_school_admin, school_id')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      alert('Profil pengguna tidak ditemui')
      navigate('/login', { replace: true })
      return
    }

    if (data.is_master_admin) {
      navigate('/master-admin', { replace: true })
      return
    }

    const role = String(data?.role || '').trim().toLowerCase()
    const isApprovedSchoolAdmin =
      role === 'school_admin' &&
      data?.approval_status === 'approved' &&
      data?.is_active === true

    if (isApprovedSchoolAdmin) {
      navigate('/dashboard', { replace: true })
      return
    }

    if (data.is_active !== true) {
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
      return
    }

    if (data.approval_status === 'pending') {
      navigate('/pending', { replace: true })
      return
    }

    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .select('id, school_name, school_code, logo_url')
      .eq('id', data.school_id)
      .maybeSingle()

    if (schoolError) {
      console.error('School info error:', schoolError)
    }

    setProfile(data)
    setSchoolInfo(schoolData || null)
    await loadSetupStatus(data.school_id)
  }

  const loadSetupStatus = async (schoolId) => {
    if (!schoolId) return null

    const { data: setupData } = await supabase
      .from('school_setup_configs')
      .select('setup_step, is_setup_complete, current_academic_year, exam_structure')
      .eq('school_id', schoolId)
      .maybeSingle()

    let classQuery = supabase
      .from('classes')
      .select('id, tingkatan, class_name', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('is_active', true)

    let enrollmentQuery = supabase
      .from('student_enrollments')
      .select('id, class_id', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('is_active', true)

    if (setupData?.current_academic_year) {
      classQuery = classQuery.eq('academic_year', setupData.current_academic_year)
      enrollmentQuery = enrollmentQuery.eq('academic_year', setupData.current_academic_year)
    }

    const [
      { data: classesData, count: classTotal },
      { data: enrollmentsData, count: studentTotal },
      { data: subjectsData },
    ] = await Promise.all([
      classQuery,
      enrollmentQuery,
      supabase
        .from('subjects')
        .select('id, subject_name')
        .eq('school_id', schoolId)
        .eq('is_active', true),
    ])

    const setupStep = setupData?.setup_step || 0
    const setupComplete = !!setupData?.is_setup_complete || setupStep >= 5
    const examNames = [...new Set(
      Object.values(setupData?.exam_structure || {})
        .flat()
        .map((item) => item?.name)
        .filter(Boolean)
    )]
    const subjectNames = [...new Set(
      (subjectsData || [])
        .map((item) => formatSubjectName(item.subject_name))
        .filter(Boolean)
    )]
      .sort((a, b) => String(a).localeCompare(String(b), 'ms', { sensitivity: 'base' }))

    const studentCountByClassId = (enrollmentsData || []).reduce((acc, enrollment) => {
      const classId = enrollment.class_id
      if (!classId) return acc
      acc[classId] = (acc[classId] || 0) + 1
      return acc
    }, {})

    const classItems = (classesData || [])
      .map((item) => ({
        id: item.id,
        name: `${item.tingkatan || ''} ${item.class_name || ''}`.trim(),
        studentCount: studentCountByClassId[item.id] || 0,
      }))
      .filter((item) => item.name)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ms', { sensitivity: 'base' }))

    setSetupStatus({
      exams: examNames.length > 0 || setupStep >= 2 || setupComplete,
      grades: setupStep >= 3 || setupComplete,
      subjects: subjectNames.length > 0 || setupStep >= 4 || setupComplete,
      classes: (classTotal || 0) > 0,
      students: (studentTotal || 0) > 0,
      examNames,
      subjectNames,
      classItems,
      studentCount: studentTotal || 0,
    })

    return setupData || null
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const isPathActive = (item) => {
    const paths = [item.path, ...(item.activePaths || [])].filter(Boolean)
    const matchesOwnPath = paths.some(
      (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
    )

    return matchesOwnPath || (item.items || []).some(isPathActive)
  }

  const handleNavItemClick = (item) => {
    if (item.disabled) return

    if (item.items?.length) {
      setActiveNavMenu((current) => (current === item.key ? '' : item.key))
      return
    }

    if (item.path) {
      setActiveNavMenu('')
      navigate(item.path)
    }
  }

  const renderDropdownItem = (item) => {
    if (item.items?.length) {
      return (
        <div key={item.key} style={styles.navDropdownSection}>
          <div style={styles.navDropdownSectionLabel}>{item.label}</div>
          <div style={styles.navDropdownSectionItems}>
            {item.items.map(renderDropdownItem)}
          </div>
        </div>
      )
    }

    return (
      <button
        key={item.key}
        type="button"
        onClick={() => handleNavItemClick(item)}
        disabled={item.disabled}
        title={item.note}
        style={{
          ...styles.navDropdownItem,
          ...(item.disabled ? styles.navDropdownItemDisabled : {}),
          ...(isPathActive(item) ? styles.navDropdownItemActive : {}),
        }}
      >
        <span>{item.label}</span>
        {item.note ? <span style={styles.navDropdownTag}>{item.note}</span> : null}
      </button>
    )
  }

  const isAcademicSetupComplete =
    setupStatus.exams &&
    setupStatus.grades &&
    setupStatus.subjects &&
    setupStatus.classes &&
    setupStatus.students

  if (loading) {
    return <div className="p-6">Loading dashboard...</div>
  }

  const displayName =
    profile?.full_name ||
    profile?.email?.split('@')[0] ||
    profile?.email ||
    '-'
  const schoolName = schoolInfo?.school_name || 'Sistem Pemantauan Akademik Sekolah'
  const schoolLogoUrl = schoolInfo?.logo_url || '/edutrack-logo.png'

  return (
    <div style={{ ...styles.page, ...(isMobileView ? styles.pageMobile : {}) }}>
      <header style={{ ...styles.topBar, ...(isMobileView ? styles.topBarMobile : {}) }}>
        <div style={styles.navBrandRow}>
          <img
            src={schoolLogoUrl}
            alt={schoolName}
            style={{ ...styles.navLogo, ...(isMobileView ? styles.navLogoMobile : {}) }}
          />
          <div style={styles.navBrandTextWrap}>
            <h1 style={{ ...styles.navBrandTitle, ...(isMobileView ? styles.navBrandTitleMobile : {}) }}>
              EduTrack
            </h1>
            <p style={styles.navBrandSubtitle}>{schoolName}</p>
          </div>
        </div>

        <nav
          aria-label="Menu utama guru"
          style={{ ...styles.navActions, ...(isMobileView ? styles.navActionsMobile : {}) }}
        >
          {TEACHER_NAVIGATION.map((item) => {
            const isActive = isPathActive(item)
            const isOpen = activeNavMenu === item.key
            const buttonStyle = {
              ...styles.navButton,
              ...(isActive ? styles.navButtonActive : {}),
              ...(isMobileView ? styles.navButtonMobile : {}),
            }

            if (!item.items?.length) {
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavItemClick(item)}
                  style={buttonStyle}
                >
                  {item.label}
                </button>
              )
            }

            return (
              <div
                key={item.key}
                style={{
                  ...styles.navMenuWrap,
                  ...(isMobileView && isOpen ? styles.navMenuWrapMobileOpen : {}),
                }}
              >
                <button
                  type="button"
                  onClick={() => handleNavItemClick(item)}
                  style={buttonStyle}
                  aria-haspopup="menu"
                  aria-expanded={isOpen}
                >
                  <span>{item.label}</span>
                  <span aria-hidden="true" style={styles.navChevron}>
                    {isOpen ? '^' : 'v'}
                  </span>
                </button>

                {isOpen ? (
                  <div style={{ ...styles.navDropdown, ...(isMobileView ? styles.navDropdownMobile : {}) }}>
                    {item.items.map(renderDropdownItem)}
                  </div>
                ) : null}
              </div>
            )
          })}

          <button
            type="button"
            onClick={handleLogout}
            style={{ ...styles.navButton, ...styles.navLogoutButton, ...(isMobileView ? styles.navButtonMobile : {}) }}
          >
            Logout
          </button>
        </nav>
      </header>

      <div style={{ ...styles.contentWrap, ...(isMobileView ? styles.contentWrapMobile : {}) }}>
        <div style={styles.container}>
        {errorMessage ? (
          <section style={{ ...styles.sectionCard, ...(isMobileView ? styles.sectionCardMobile : {}) }}>
            <h3 style={styles.sectionTitle}>Sesi Tidak Sah</h3>
            <p style={styles.sectionDesc}>{errorMessage}</p>
          </section>
        ) : null}

        <div style={{ ...styles.heroCard, ...(isMobileView ? styles.heroCardMobile : {}) }}>
          <div style={styles.heroTextWrap}>
            <div style={styles.heroKicker}>Dashboard Guru</div>
            <h2 style={{ ...styles.heroTitle, ...(isMobileView ? styles.heroTitleMobile : {}) }}>
              Selamat datang, {displayName}
            </h2>
            <p style={styles.heroDesc}>
              Gunakan dashboard ini untuk masukkan markah murid dan melihat analisis prestasi sekolah anda.
            </p>
          </div>

          <div style={styles.heroStatsWrap}>
            <div style={styles.heroStat}>
              <div style={styles.heroStatLabel}>Peranan</div>
              <div style={styles.heroStatValue}>{profile?.role || '-'}</div>
            </div>
            <div style={styles.heroStat}>
              <div style={styles.heroStatLabel}>Status Sistem</div>
              <div style={styles.heroStatValue}>
                {isAcademicSetupComplete ? 'Sedia Digunakan' : 'Perlu Lengkapkan Setup'}
              </div>
            </div>
            <div style={styles.heroStat}>
              <div style={styles.heroStatLabel}>Jumlah Murid</div>
              <div style={styles.heroStatValue}>{setupStatus.studentCount}</div>
            </div>
          </div>
        </div>

        <section style={{ ...styles.sectionCard, ...(isMobileView ? styles.sectionCardMobile : {}) }}>
          <h3 style={styles.sectionTitle}>Akses Pantas</h3>
          <p style={styles.sectionDesc}>
            Modul paling kerap digunakan untuk kerja harian guru.
          </p>

          <div style={{ ...styles.quickActionGrid, ...(isMobileView ? styles.quickActionGridMobile : {}) }}>
            <button
              type="button"
              onClick={() => navigate('/scores')}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardBlue,
              }}
            >
              <div style={styles.quickActionHeader}>
                <h4 style={styles.quickActionTitle}>Input Markah</h4>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Masukkan markah peperiksaan murid dengan lebih cepat dan tersusun.
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/analysis/class')}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardGreen,
              }}
            >
              <div style={styles.quickActionHeader}>
                <h4 style={styles.quickActionTitle}>Analisis Prestasi</h4>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Lihat analisis kelas, individu dan prestasi subjek dengan lebih jelas.
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/analysis/pbs')}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardAmber,
              }}
            >
              <div style={styles.quickActionHeader}>
                <h4 style={styles.quickActionTitle}>PBS Bersepadu</h4>
                <span style={styles.quickActionArrow}>{'>'}</span>
              </div>
              <p style={styles.quickActionDesc}>
                Lihat paparan holistik peperiksaan, PBD, SEGAK dan PAJSK.
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/dialog-prestasi')}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardIndigo,
              }}
            >
              <div style={styles.quickActionHeader}>
                <h4 style={styles.quickActionTitle}>Dialog Prestasi</h4>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Bina DPP subjek, rekod punca isu dan susun intervensi guru serta murid.
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/input-pbd')}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardTeal,
              }}
            >
              <div style={styles.quickActionHeader}>
                <h4 style={styles.quickActionTitle}>Input PBD</h4>
                <span style={styles.quickActionArrow}>â€º</span>
              </div>
              <p style={styles.quickActionDesc}>
                Kemas kini TP semasa murid apabila window PBD dibuka oleh admin sekolah.
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/analisis-pbd')}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardRose,
              }}
            >
              <div style={styles.quickActionHeader}>
                <h4 style={styles.quickActionTitle}>Analisis PBD</h4>
                <span style={styles.quickActionArrow}>â€º</span>
              </div>
              <p style={styles.quickActionDesc}>
                Lihat TP semasa, snapshot Penggal 1, snapshot Penggal 2 dan perubahan murid.
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate('/manage-subject-students')}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardPurple,
              }}
            >
              <div style={styles.quickActionHeader}>
                <h4 style={styles.quickActionTitle}>Urus Murid Subjek</h4>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Tetapkan murid yang mengambil subjek selective seperti Pendidikan Islam, Pendidikan Moral atau subjek elektif lain.
              </p>
            </button>
          </div>
        </section>

        <section style={{ ...styles.sectionCard, ...(isMobileView ? styles.sectionCardMobile : {}) }}>
          <h3 style={styles.sectionTitle}>Analisis</h3>
          <p style={styles.sectionDesc}>
            Pilih paparan analisis yang diperlukan untuk peperiksaan dan pentaksiran bukan peperiksaan.
          </p>

          <div style={{ ...styles.analysisGrid, ...(isMobileView ? styles.analysisGridMobile : {}) }}>
            {ANALYSIS_GROUPS.map((group) => (
              <div key={group.title} style={styles.analysisGroup}>
                <div style={styles.analysisGroupTitle}>{group.title}</div>
                <div style={styles.analysisList}>
                  {group.items.map((item) => {
                    const buttonStyle = {
                      ...styles.analysisButton,
                      ...(item.disabled ? styles.analysisButtonDisabled : {}),
                    }

                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          if (!item.disabled && item.path) navigate(item.path)
                        }}
                        disabled={item.disabled}
                        style={buttonStyle}
                      >
                        <span style={styles.analysisButtonContent}>
                          <span style={styles.analysisButtonTitle}>{item.label}</span>
                          <span style={styles.analysisButtonDesc}>{item.description}</span>
                        </span>
                        {item.note ? <span style={styles.analysisTag}>{item.note}</span> : null}
                        {!item.note ? <span style={styles.analysisArrow}>›</span> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    color: '#0f172a',
    fontFamily: 'Inter, Arial, sans-serif',
    overflowX: 'hidden',
  },
  pageMobile: {
    padding: 0,
  },
  topBar: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '18px',
    background: '#08142d',
    borderBottom: '1px solid rgba(148, 163, 184, 0.28)',
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.2)',
    padding: '14px 24px',
  },
  topBarMobile: {
    position: 'relative',
    alignItems: 'stretch',
    flexDirection: 'column',
    padding: '12px',
  },
  navBrandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
  },
  navLogo: {
    width: '42px',
    height: '42px',
    objectFit: 'contain',
    borderRadius: '12px',
    flexShrink: 0,
  },
  navLogoMobile: {
    width: '38px',
    height: '38px',
  },
  navBrandTextWrap: {
    minWidth: 0,
  },
  navBrandTitle: {
    margin: 0,
    color: '#ffffff',
    fontSize: '18px',
    fontWeight: 900,
    lineHeight: 1.1,
  },
  navBrandTitleMobile: {
    fontSize: '17px',
  },
  navBrandSubtitle: {
    margin: '4px 0 0 0',
    maxWidth: '360px',
    color: '#cbd5e1',
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  navActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    flexWrap: 'wrap',
    minWidth: 0,
  },
  navActionsMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    alignItems: 'stretch',
  },
  navMenuWrap: {
    position: 'relative',
    minWidth: 0,
  },
  navMenuWrapMobileOpen: {
    gridColumn: '1 / -1',
  },
  navButton: {
    minHeight: '42px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    border: '1px solid rgba(148, 163, 184, 0.36)',
    background: 'rgba(15, 23, 42, 0.22)',
    color: '#ffffff',
    padding: '10px 16px',
    borderRadius: '14px',
    fontSize: '14px',
    fontWeight: 800,
    cursor: 'pointer',
    appearance: 'none',
    whiteSpace: 'nowrap',
  },
  navButtonMobile: {
    width: '100%',
    minHeight: '44px',
  },
  navButtonActive: {
    background: '#2563eb',
    borderColor: '#60a5fa',
    boxShadow: '0 10px 24px rgba(37, 99, 235, 0.34)',
  },
  navLogoutButton: {
    background: 'rgba(15, 23, 42, 0.22)',
  },
  navChevron: {
    fontSize: '11px',
    lineHeight: 1,
  },
  navDropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    zIndex: 40,
    width: '300px',
    display: 'grid',
    gap: '6px',
    border: '1px solid #dbe4ee',
    borderRadius: '14px',
    background: '#ffffff',
    padding: '10px',
    boxShadow: '0 22px 48px rgba(15, 23, 42, 0.2)',
  },
  navDropdownMobile: {
    position: 'static',
    width: '100%',
    marginTop: '8px',
    boxShadow: 'none',
  },
  navDropdownSection: {
    display: 'grid',
    gap: '6px',
  },
  navDropdownSectionLabel: {
    padding: '8px 10px 3px',
    color: '#475569',
    fontSize: '11px',
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  navDropdownSectionItems: {
    display: 'grid',
    gap: '5px',
  },
  navDropdownItem: {
    width: '100%',
    minHeight: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    border: '0',
    borderRadius: '10px',
    background: '#ffffff',
    color: '#0f172a',
    padding: '9px 10px',
    textAlign: 'left',
    fontSize: '13px',
    fontWeight: 800,
    cursor: 'pointer',
    appearance: 'none',
  },
  navDropdownItemActive: {
    background: '#eff6ff',
    color: '#1d4ed8',
  },
  navDropdownItemDisabled: {
    color: '#94a3b8',
    background: '#f8fafc',
    cursor: 'not-allowed',
  },
  navDropdownTag: {
    flexShrink: 0,
    borderRadius: '999px',
    background: '#e2e8f0',
    color: '#475569',
    padding: '4px 7px',
    fontSize: '10px',
    fontWeight: 900,
  },
  contentWrap: {
    padding: '24px',
  },
  contentWrapMobile: {
    padding: '12px',
  },
  headerCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    background: '#ffffff',
    padding: '18px 22px',
    border: '1px solid #e2e8f0',
    borderRadius: '24px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
    flexWrap: 'wrap',
    maxWidth: '1240px',
    margin: '0 auto 20px auto',
    minWidth: 0,
  },
  headerCardMobile: {
    padding: '14px',
    borderRadius: '18px',
    alignItems: 'stretch',
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 },
  brandTextWrap: { minWidth: 0 },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  headerActionsMobile: {
    width: '100%',
  },
  headerActionButtonMobile: {
    flex: 1,
    minHeight: '42px',
  },
  profileButton: {
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#0f172a',
    padding: '10px 16px',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  logo: {
    width: '52px',
    height: '52px',
    objectFit: 'contain',
    borderRadius: '14px',
    flexShrink: 0,
  },
  logoMobile: {
    width: '44px',
    height: '44px',
  },
  brandTitle: { fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0 },
  brandTitleMobile: { fontSize: '21px' },
  brandSubtitle: {
    margin: '4px 0 0 0',
    color: '#64748b',
    fontSize: '14px',
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  logoutButton: {
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#0f172a',
    padding: '10px 16px',
    borderRadius: '14px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  container: { maxWidth: '1240px', margin: '0 auto', display: 'grid', gap: '20px', minWidth: 0 },
  heroCard: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)',
    gap: '20px',
    background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
    border: '1px solid #dbeafe',
    borderRadius: '28px',
    padding: '30px',
    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
    minWidth: 0,
  },
  heroCardMobile: {
    gridTemplateColumns: '1fr',
    padding: '18px',
    borderRadius: '20px',
    gap: '16px',
  },
  heroTextWrap: {
    display: 'grid',
    alignContent: 'start',
    gap: '10px',
  },
  heroKicker: {
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#2563eb',
  },
  heroTitle: { margin: 0, fontSize: '32px', fontWeight: 800, lineHeight: 1.1 },
  heroTitleMobile: { fontSize: '24px' },
  heroDesc: { margin: 0, color: '#475569', lineHeight: 1.7, maxWidth: '720px' },
  heroStatsWrap: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '12px',
  },
  heroStat: {
    background: 'rgba(255,255,255,0.72)',
    border: '1px solid rgba(148,163,184,0.22)',
    borderRadius: '18px',
    padding: '16px 18px',
    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.05)',
  },
  heroStatLabel: {
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#64748b',
    marginBottom: '6px',
  },
  heroStatValue: { fontSize: '18px', fontWeight: 800, color: '#0f172a' },
  sectionCard: { background: '#ffffff', border: '1px solid #dbe4ee', borderRadius: '24px', padding: '22px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)', minWidth: 0 },
  sectionCardMobile: { padding: '16px', borderRadius: '18px' },
  sectionTitle: { margin: 0, fontSize: '20px', fontWeight: 700 },
  sectionDesc: { color: '#64748b', lineHeight: 1.6, margin: '8px 0 0 0' },
  quickActionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },
  quickActionGridMobile: {
    gridTemplateColumns: '1fr',
  },
  quickActionCard: {
    border: '1px solid transparent',
    borderRadius: '22px',
    padding: '18px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'transform 180ms ease, box-shadow 180ms ease',
    background: '#ffffff',
    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minHeight: '120px',
    appearance: 'none',
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
    background: 'linear-gradient(180deg, #f5f3ff 0%, #faf8ff 100%)',
    borderColor: '#d8b4fe',
  },
  quickActionCardIndigo: {
    background: 'linear-gradient(180deg, #eef2ff 0%, #f8faff 100%)',
    borderColor: '#c7d2fe',
  },
  quickActionCardTeal: {
    background: 'linear-gradient(180deg, #f0fdfa 0%, #f8fffd 100%)',
    borderColor: '#99f6e4',
  },
  quickActionCardRose: {
    background: 'linear-gradient(180deg, #fff1f2 0%, #fffafa 100%)',
    borderColor: '#fecdd3',
  },
  quickActionHeader: { display: 'flex', alignItems: 'center', gap: '10px' },
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
  analysisGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '16px',
    marginTop: '16px',
  },
  analysisGridMobile: {
    gridTemplateColumns: '1fr',
  },
  analysisGroup: {
    minWidth: 0,
    display: 'grid',
    gap: '10px',
  },
  analysisGroupTitle: {
    color: '#1e293b',
    fontSize: '12px',
    fontWeight: 900,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  analysisList: {
    display: 'grid',
    gap: '10px',
  },
  analysisButton: {
    width: '100%',
    minHeight: '68px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    border: '1px solid #dbe4ee',
    borderRadius: '14px',
    background: '#ffffff',
    color: '#0f172a',
    padding: '12px 14px',
    textAlign: 'left',
    cursor: 'pointer',
    appearance: 'none',
  },
  analysisButtonDisabled: {
    background: '#f8fafc',
    color: '#94a3b8',
    cursor: 'not-allowed',
  },
  analysisButtonContent: {
    minWidth: 0,
    display: 'grid',
    gap: '4px',
  },
  analysisButtonTitle: {
    fontSize: '15px',
    fontWeight: 800,
    lineHeight: 1.25,
    overflowWrap: 'anywhere',
  },
  analysisButtonDesc: {
    color: '#64748b',
    fontSize: '12px',
    lineHeight: 1.45,
  },
  analysisTag: {
    flexShrink: 0,
    borderRadius: '999px',
    background: '#e2e8f0',
    color: '#475569',
    padding: '5px 8px',
    fontSize: '11px',
    fontWeight: 800,
  },
  analysisArrow: {
    flexShrink: 0,
    color: '#334155',
    fontSize: '20px',
    fontWeight: 800,
  },
}

export default DashboardPage
