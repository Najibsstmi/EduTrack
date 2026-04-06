import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

const ChevronRightIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

function DashboardPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)

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
    loadProfile()
  }, [navigate])

  const loadProfile = async () => {
    setLoading(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      navigate('/login', { replace: true })
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, approval_status, is_master_admin, is_school_admin, school_id')
      .eq('id', user.id)
      .maybeSingle()

    if (error || !data) {
      alert('Profil pengguna tidak ditemui')
      navigate('/login', { replace: true })
      return
    }

    if (data.is_master_admin) {
      navigate('/master-admin', { replace: true })
      return
    }

    if (data.is_school_admin || data.role === 'school_admin' || data.role === 'admin') {
      navigate('/dashboard', { replace: true })
      return
    }

    if (data.approval_status === 'pending') {
      navigate('/pending', { replace: true })
      return
    }

    setProfile(data)
    await loadSetupStatus(data.school_id)
    setLoading(false)
  }

  const loadSetupStatus = async (schoolId) => {
    if (!schoolId) return

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
        .eq('school_id', schoolId),
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
        .map((item) => item.subject_name)
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

  const quickActions = [
    {
      title: 'Input Markah',
      description: 'Masukkan markah peperiksaan murid dengan lebih cepat.',
      onClick: () => navigate('/scores'),
      enabled: isAcademicSetupComplete,
      tone: 'blue',
    },
    {
      title: 'Analisis Prestasi',
      description: 'Lihat analisis kelas, individu dan prestasi subjek.',
      onClick: () => navigate('/analysis'),
      enabled: isAcademicSetupComplete,
      tone: 'emerald',
    },
  ]

  if (loading) {
    return <div className="p-6">Loading dashboard...</div>
  }

  const displayName =
    profile?.full_name ||
    profile?.email?.split('@')[0] ||
    profile?.email ||
    '-'

  return (
    <div style={styles.page}>
      <header style={styles.topbar}>
        <div>
          <div style={styles.brand}>EduTrack</div>
          <div style={styles.schoolMeta}>{displayName} {profile?.email ? `(${profile.email})` : ''}</div>
        </div>

        <nav style={styles.nav}>
          <button style={styles.navButtonPrimary} onClick={() => navigate('/scores')}>
            Input Markah
          </button>
          <button style={styles.navButton} onClick={() => navigate('/analysis')}>
            Analisis
          </button>
        </nav>

        <div style={styles.topbarRight}>
          <button style={styles.darkButton} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main style={styles.container}>
        <section style={styles.hero}>
          <h1 style={styles.heroTitle}>Dashboard Guru</h1>
          <p style={styles.heroText}>
            Selamat datang, {displayName}. Gunakan dashboard ini untuk masukkan markah murid dan
            melihat analisis prestasi sekolah anda.
          </p>
          <div style={styles.heroInfo}>
            <span><strong>Peranan:</strong> {profile?.role || '-'}</span>
            <span><strong>Status Sistem:</strong> {isAcademicSetupComplete ? 'Sedia Digunakan' : 'Perlu Lengkapkan Setup'}</span>
            <span><strong>Jumlah Murid:</strong> {setupStatus.studentCount}</span>
          </div>
        </section>

        <section style={styles.statsGrid}>
          <StatCard title="Subjek" value={setupStatus.subjectNames.length} />
          <StatCard title="Kelas" value={setupStatus.classItems.length} />
          <StatCard title="Peperiksaan" value={setupStatus.examNames.length} />
          <StatCard title="Murid" value={setupStatus.studentCount} />
        </section>

        <section style={styles.dualGrid}>
          <div style={styles.card}>
            <div style={styles.sectionHeaderResponsive}>
              <div>
                <h2 style={styles.cardTitle}>Akses Pantas</h2>
                <p style={styles.helperText}>
                  Modul paling kerap digunakan untuk kerja harian guru.
                </p>
              </div>
              <div style={styles.helperMetaText}>
                {isAcademicSetupComplete
                  ? 'Semua modul utama sedia digunakan.'
                  : 'Sesetengah modul akan dihadkan sehingga setup lengkap.'}
              </div>
            </div>

            <div style={styles.quickActionGrid}>
              {quickActions.map((item) => (
                <ActionCard key={item.title} {...item} />
              ))}
            </div>
          </div>

          <SetupSummaryCard
            title="Status Setup Sistem"
            description={isAcademicSetupComplete
              ? 'Komponen asas sekolah telah lengkap dan anda boleh teruskan kerja harian.'
              : 'Masih ada komponen yang belum lengkap. Selesaikan setup untuk buka semua modul utama.'}
            examNames={setupStatus.examNames}
            subjectNames={setupStatus.subjectNames}
            classItems={setupStatus.classItems}
            studentCount={setupStatus.studentCount}
          />
        </section>
      </main>
    </div>
  )
}

function ActionCard({ title, description, onClick, enabled, tone }) {
  const toneStyles = {
    blue: enabled ? styles.actionToneBlue : styles.actionToneDisabled,
    emerald: enabled ? styles.actionToneEmerald : styles.actionToneDisabled,
    amber: enabled ? styles.actionToneAmber : styles.actionToneDisabled,
    rose: enabled ? styles.actionToneRose : styles.actionToneDisabled,
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      style={{
        ...styles.actionCard,
        ...(toneStyles[tone] || styles.actionToneBlue),
        ...(enabled ? null : styles.actionCardDisabled),
      }}
    >
      <div style={styles.actionCardInner}>
        <div>
          <div style={styles.actionCardTitle}>{title}</div>
          <div style={styles.actionCardDescription}>{description}</div>
        </div>
        <ChevronRightIcon />
      </div>
      {!enabled ? <div style={styles.actionCardHint}>Menunggu setup lengkap</div> : null}
    </button>
  )
}

function SetupSummaryCard({ title, description, examNames, subjectNames, classItems, studentCount }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h2 style={styles.cardTitle}>{title}</h2>
      </div>
      <p style={styles.helperText}>{description}</p>

      <div style={styles.summaryStack}>
        <SummaryListBlock
          title={`Peperiksaan (${examNames.length})`}
          items={examNames}
          emptyText="Tiada peperiksaan didaftarkan lagi."
        />
        <SummaryButtonGrid
          title={`Subjek (${subjectNames.length})`}
          items={subjectNames}
          emptyText="Tiada subjek didaftarkan lagi."
        />
        <ClassButtonGrid
          title={`Kelas (${classItems.length})`}
          items={classItems}
          emptyText="Tiada kelas aktif didaftarkan lagi."
        />
        <div style={styles.summaryBlock}>
          <div style={styles.summaryBlockTitle}>Murid Berdaftar</div>
          <div style={styles.summaryText}>Jumlah murid berdaftar: {studentCount}</div>
        </div>
      </div>
    </div>
  )
}

function SummaryListBlock({ title, items, emptyText }) {
  return (
    <div style={styles.summaryBlock}>
      <div style={styles.summaryBlockTitle}>{title}</div>
      <div style={styles.summaryText}>
        {items.length > 0 ? items.join(', ') : emptyText}
      </div>
    </div>
  )
}

function SummaryButtonGrid({ title, items, emptyText }) {
  return (
    <div style={styles.summaryBlock}>
      <div style={styles.summaryBlockTitle}>{title}</div>
      {items.length > 0 ? (
        <div style={styles.buttonGrid}>
          {items.map((item) => (
            <button
              key={item}
              type="button"
              style={styles.summaryButton}
            >
              {item}
            </button>
          ))}
        </div>
      ) : (
        <div style={styles.summaryText}>{emptyText}</div>
      )}
    </div>
  )
}

function ClassButtonGrid({ title, items, emptyText }) {
  return (
    <div style={styles.summaryBlock}>
      <div style={styles.summaryBlockTitle}>{title}</div>
      {items.length > 0 ? (
        <div style={styles.buttonGrid}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              style={styles.classButton}
            >
              <div style={styles.classButtonTitle}>{item.name}</div>
              <div style={styles.classButtonMeta}>{item.studentCount} murid</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={styles.summaryText}>{emptyText}</div>
      )}
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
  topbar: { position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '16px 24px', background: '#0f172a', color: '#ffffff', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' },
  brand: { fontSize: '22px', fontWeight: 800, lineHeight: 1.1 },
  schoolMeta: { fontSize: '13px', color: '#cbd5e1', marginTop: '4px' },
  nav: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  navButtonPrimary: { background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
  navButton: { background: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
  topbarRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  darkButton: { background: '#111827', color: '#ffffff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
  container: { maxWidth: '1240px', margin: '0 auto', padding: '24px', display: 'grid', gap: '20px' },
  hero: { background: 'linear-gradient(135deg, #ffffff, #eef4ff)', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '28px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' },
  heroTitle: { margin: 0, fontSize: '30px', fontWeight: 800 },
  heroText: { margin: '10px 0 0 0', color: '#475569', lineHeight: 1.6 },
  heroInfo: { display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '16px', color: '#334155', fontSize: '14px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' },
  statCard: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)' },
  statTitle: { color: '#64748b', fontSize: '13px', marginBottom: '8px' },
  statValue: { fontSize: '28px', fontWeight: 800 },
  dualGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' },
  card: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '22px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)' },
  cardHeader: { marginBottom: '14px' },
  cardTitle: { margin: 0, fontSize: '20px', fontWeight: 700 },
  helperText: { color: '#64748b', lineHeight: 1.6, margin: 0 },
  helperMetaText: { color: '#64748b', fontSize: '14px' },
  sectionHeaderResponsive: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' },
  quickActionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  actionCard: { border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', textAlign: 'left', cursor: 'pointer', transition: '0.2s ease', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)' },
  actionToneBlue: { background: '#eff6ff', borderColor: '#bfdbfe', color: '#0f172a' },
  actionToneEmerald: { background: '#ecfdf5', borderColor: '#a7f3d0', color: '#0f172a' },
  actionToneAmber: { background: '#fffbeb', borderColor: '#fcd34d', color: '#0f172a' },
  actionToneRose: { background: '#fff1f2', borderColor: '#fecdd3', color: '#0f172a' },
  actionToneDisabled: { background: '#f1f5f9', borderColor: '#e2e8f0', color: '#94a3b8' },
  actionCardDisabled: { cursor: 'not-allowed' },
  actionCardInner: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  actionCardTitle: { fontWeight: 700, marginBottom: '6px' },
  actionCardDescription: { color: '#475569', fontSize: '14px', lineHeight: 1.6 },
  actionCardHint: { marginTop: '12px', fontSize: '12px', fontWeight: 600, color: '#64748b' },
  summaryStack: { display: 'grid', gap: '12px' },
  summaryBlock: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px' },
  summaryBlockTitle: { fontWeight: 700, color: '#0f172a', marginBottom: '8px' },
  summaryText: { color: '#475569', fontSize: '14px', lineHeight: 1.7 },
  buttonGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' },
  summaryButton: { minHeight: '48px', borderRadius: '12px', border: '1px solid #dbe4ee', background: '#ffffff', padding: '10px 12px', textAlign: 'left', fontSize: '14px', fontWeight: 600, color: '#334155', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)', cursor: 'default' },
  classButton: { minHeight: '64px', borderRadius: '12px', border: '1px solid #dbe4ee', background: '#ffffff', padding: '10px 12px', textAlign: 'left', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)', cursor: 'default' },
  classButtonTitle: { fontSize: '14px', fontWeight: 600, color: '#334155' },
  classButtonMeta: { marginTop: '6px', fontSize: '12px', color: '#64748b' },
}

export default DashboardPage
