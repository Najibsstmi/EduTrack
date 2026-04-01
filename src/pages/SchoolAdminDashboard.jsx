import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const TABS = ['pending', 'approved', 'rejected', 'all']

export default function SchoolAdminDashboard() {
  const navigate = useNavigate()
  const settingsMenuRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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

  useEffect(() => {
    checkAccessAndFetch()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setShowSettingsMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
      .select('id, full_name, email, school_id, role, approval_status, is_school_admin, is_master_admin')
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
      .select('id, setup_step, is_setup_complete, current_academic_year')
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

    await fetchSchoolData(profile.school_id)
    setLoading(false)
  }

  const fetchSchoolData = async (schoolId) => {
    setRefreshing(true)

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
        .select('id, full_name, email, role, approval_status, is_school_admin, is_master_admin, school_id, created_at')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false }),
    ])

    if (schoolError) { console.error(schoolError); alert('Gagal ambil maklumat sekolah') }
    if (profilesError) { console.error(profilesError); alert('Gagal ambil senarai pengguna sekolah') }

    setSchoolInfo(school || null)
    setUsers(profiles || [])
    setRefreshing(false)
  }

  const refreshData = async () => {
    if (!adminProfile?.school_id) return
    await fetchSchoolData(adminProfile.school_id)
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
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
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
  const setupComplete = setupConfig?.is_setup_complete || setupStep >= 4
  const classesComplete = classCount > 0
  const studentsComplete = studentCount > 0
  const academicDataComplete = classesComplete && studentsComplete

  const goToNextSetupStep = () => {
    if (setupStep === 0) navigate('/school-setup')
    else if (setupStep === 1) navigate('/school-setup/exams')
    else if (setupStep === 2) navigate('/school-setup/grades')
    else if (setupStep === 3) navigate('/school-setup/subjects')
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

        <nav style={styles.nav}>
          <button style={styles.navButtonPrimary} onClick={() => navigate('/scores')}>
            Input Markah
          </button>
          <button style={styles.navButton} onClick={() => navigate('/students')}>
            Input Murid
          </button>

          <div style={styles.menuWrap} ref={settingsMenuRef}>
            <button style={styles.navButton} onClick={() => setShowSettingsMenu((prev) => !prev)}>
              Tetapan ▾
            </button>
            {showSettingsMenu && (
              <div style={styles.menuDropdown}>
                <button style={styles.menuItem} onClick={() => navigate('/school-setup')}>Struktur Akademik</button>
                <button style={styles.menuItem} onClick={() => navigate('/school-setup/exams')}>Tetapan Peperiksaan</button>
                <button style={styles.menuItem} onClick={() => navigate('/school-setup/grades')}>Tetapan Grade</button>
                <button style={styles.menuItem} onClick={() => navigate('/school-setup/subjects')}>Tetapan Subjek</button>
                <button style={styles.menuItem} onClick={() => navigate('/classes')}>Tetapan Kelas</button>
                <button style={styles.menuItem} onClick={() => navigate('/students')}>Tetapan Murid</button>
              </div>
            )}
          </div>

          <button style={styles.navButton} onClick={() => navigate('/analysis')}>
            Analisis
          </button>
        </nav>

        <div style={styles.topbarRight}>
          <button style={styles.ghostButton} onClick={refreshData}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button style={styles.darkButton} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main style={styles.container}>
        <section style={styles.hero}>
          <h1 style={styles.heroTitle}>Dashboard Admin Sekolah</h1>
          <p style={styles.heroText}>
            Urus pengguna, tetapan akademik, data murid, dan semakan status sekolah dalam satu paparan yang lebih kemas.
          </p>
          <div style={styles.heroInfo}>
            <span><strong>Admin:</strong> {adminProfile?.full_name || '-'} ({adminProfile?.email || '-'})</span>
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
              <StatusRow done={setupStep >= 1 || setupComplete} label="Setup struktur akademik" />
              <StatusRow done={setupStep >= 2 || setupComplete} label="Setup peperiksaan" />
              <StatusRow done={setupStep >= 3 || setupComplete} label="Setup grade" />
              <StatusRow done={setupStep >= 4 || setupComplete} label="Setup subjek" />
            </div>
            <p style={styles.helperText}>
              {setupComplete ? 'Semua step telah lengkap.' : 'Sila lengkapkan step setup yang belum selesai.'}
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
          <div style={styles.sectionHeader}>
            <h2 style={styles.cardTitle}>Akses Pantas</h2>
          </div>
          <div style={styles.quickActions}>
            <button style={styles.quickButton} onClick={() => navigate('/scores')}>Input Markah</button>
            <button style={styles.quickButton} onClick={() => navigate('/students')}>Input Murid</button>
            <button style={styles.quickButton} onClick={() => navigate('/school-setup')}>Struktur Akademik</button>
            <button style={styles.quickButton} onClick={() => navigate('/school-setup/exams')}>Peperiksaan</button>
            <button style={styles.quickButton} onClick={() => navigate('/school-setup/grades')}>Grade</button>
            <button style={styles.quickButton} onClick={() => navigate('/school-setup/subjects')}>Subjek</button>
            <button style={styles.quickButton} onClick={() => navigate('/classes')}>Kelas</button>
            <button style={styles.quickButton} onClick={() => navigate('/analysis')}>Analisis</button>
          </div>
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
              placeholder="Cari nama, email, role..."
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
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Admin</th>
                    <th style={styles.th}>Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const isCurrentAdmin = user.id === adminProfile?.id
                    return (
                      <tr key={user.id}>
                        <td style={styles.td}>{user.full_name || '-'}</td>
                        <td style={styles.td}>{user.email || '-'}</td>
                        <td style={styles.td}>{user.role || '-'}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, ...getStatusStyle(user.approval_status) }}>
                            {getStatusText(user.approval_status)}
                          </span>
                        </td>
                        <td style={styles.td}>{user.is_school_admin ? 'Ya' : 'Tidak'}</td>
                        <td style={styles.td}>
                          <div style={styles.actionRow}>
                            {user.approval_status === 'pending' && (
                              <>
                                <button style={styles.successButton} onClick={() => handleApprove(user.id)} disabled={savingId === user.id}>
                                  {savingId === user.id ? 'Saving...' : 'Approve'}
                                </button>
                                <button style={styles.dangerButton} onClick={() => handleReject(user.id)} disabled={savingId === user.id}>
                                  Reject
                                </button>
                              </>
                            )}
                            {user.approval_status === 'approved' && !user.is_school_admin && (
                              <button style={styles.infoButton} onClick={() => handlePromoteAdmin(user.id)} disabled={savingId === user.id}>
                                Jadikan Admin
                              </button>
                            )}
                            {user.is_school_admin && !isCurrentAdmin && (
                              <button style={styles.warningButton} onClick={() => handleRemoveAdmin(user.id)} disabled={savingId === user.id}>
                                Buang Admin
                              </button>
                            )}
                            {user.approval_status === 'rejected' && (
                              <button style={styles.successButton} onClick={() => handleApprove(user.id)} disabled={savingId === user.id}>
                                Luluskan Semula
                              </button>
                            )}
                            {isCurrentAdmin && (
                              <span style={styles.selfTag}>Akaun anda</span>
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
  nav: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  navButtonPrimary: { background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
  navButton: { background: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
  menuWrap: { position: 'relative' },
  menuDropdown: { position: 'absolute', top: '48px', left: 0, width: '240px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', boxShadow: '0 20px 40px rgba(15, 23, 42, 0.18)', padding: '8px', display: 'grid', gap: '6px' },
  menuItem: { background: '#ffffff', color: '#0f172a', border: 'none', textAlign: 'left', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 500 },
  topbarRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  ghostButton: { background: '#ffffff', color: '#0f172a', border: 'none', borderRadius: '10px', padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
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
  emptyState: { background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '16px', padding: '24px', color: '#64748b' },
}
