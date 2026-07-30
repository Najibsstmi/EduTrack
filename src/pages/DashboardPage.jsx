import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'
import { forceCleanLogout, isRefreshTokenError } from '../lib/authSession'
import { formatSubjectName } from '../lib/subjectLabels.js'

function DashboardPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)

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
      <div style={{ ...styles.headerCard, ...(isMobileView ? styles.headerCardMobile : {}) }}>
        <div style={styles.brandRow}>
          <img
            src={schoolLogoUrl}
            alt={schoolName}
            style={{ ...styles.logo, ...(isMobileView ? styles.logoMobile : {}) }}
          />
          <div style={styles.brandTextWrap}>
            <h1 style={{ ...styles.brandTitle, ...(isMobileView ? styles.brandTitleMobile : {}) }}>
              EduTrack
            </h1>
            <p style={styles.brandSubtitle}>{schoolName}</p>
          </div>
        </div>

        <div style={{ ...styles.headerActions, ...(isMobileView ? styles.headerActionsMobile : {}) }}>
          <button
            onClick={() => navigate('/profile')}
            style={{
              ...styles.profileButton,
              ...(isMobileView ? styles.headerActionButtonMobile : {}),
            }}
          >
            Profil Saya
          </button>
          <button
            onClick={handleLogout}
            style={{
              ...styles.logoutButton,
              ...(isMobileView ? styles.headerActionButtonMobile : {}),
            }}
          >
            Logout
          </button>
        </div>
      </div>

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
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Lihat paparan holistik peperiksaan, PBD, SEGAK dan PAJSK.
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
    padding: '24px',
    overflowX: 'hidden',
  },
  pageMobile: {
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
}

export default DashboardPage
