import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, BookOpenCheck, ChevronDown, GraduationCap, LayoutDashboard, LogOut, Menu, MessageSquareText, Settings, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { getDashboardPath } from '../lib/dashboardPath'
import './AppShell.css'

const assessment = [
  { label: 'Peperiksaan', path: '/scores' },
  { label: 'PBD', path: '/input-pbd', aliases: ['/pbs/pbd', '/pbs/pbd/input'] },
  { label: 'PAJSK', path: '/pbs/pajsk', aliases: ['/pbs/pajsk/segak', '/pbs/pajsk/segak/input'] },
  { label: 'Psikometrik', path: '/psikometrik/input', aliases: ['/pbs/ppsi', '/pbs/ppsi/input', '/psychometric/input'] },
]
const analysis = [
  { label: 'Prestasi Murid', path: '/analysis/student', aliases: ['/analysis/student-subject'] },
  { label: 'Prestasi Kelas', path: '/analysis/class' },
  { label: 'Prestasi Subjek (GPMP)', path: '/analysis/subject' },
  { label: 'Analisis Minimum C', path: '/analysis/minimum-c' },
  { label: 'Pivot Table', path: '/analysis/pivot-table' },
  { label: 'Analisis PBD', path: '/analysis/pbd', aliases: ['/analisis-pbd', '/pbs/pbd/analysis', '/pbs/pbd/subject', '/pbs/pbd/student'] },
  { label: 'Analisis PAJSK & SEGAK', path: '/analysis/pajsk-segak', aliases: ['/pbs/pajsk/segak/analysis'] },
  { label: 'Analisis Psikometrik', path: '/analysis/psychometric' },
  { label: 'PBS Bersepadu', path: '/analysis/pbs' },
]

function matches(item, pathname) {
  return item.path === pathname || item.aliases?.includes(pathname)
}

export default function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    let mounted = true
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles')
        .select('full_name, email, role, is_school_admin, is_master_admin')
        .eq('id', user.id).maybeSingle()
      if (mounted) setProfile(data)
    }
    loadProfile()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const isAdmin = getDashboardPath(profile) === '/dashboard'
  const groups = [
    { label: 'Pentaksiran', icon: BookOpenCheck, items: assessment },
    { label: 'Murid', icon: GraduationCap, items: [
      ...(isAdmin ? [{ label: 'Senarai Murid', path: '/students', aliases: ['/students/import'] }] : []),
      { label: 'Subjek Murid', path: '/manage-subject-students' },
    ] },
    { label: 'Analisis', icon: BarChart3, items: analysis },
    { label: 'Tetapan', icon: Settings, items: [
      { label: 'Profil Saya', path: '/profile', aliases: ['/profil-saya'] },
      ...(isAdmin ? [
        { label: 'Sasaran Akademik', path: '/academic-targets', aliases: ['/targets'] },
        { label: 'Konfigurasi Peperiksaan', path: '/exam-settings', aliases: ['/school-setup/exams'] },
        { label: 'Skala Gred', path: '/grade-settings', aliases: ['/school-setup/grades'] },
        { label: 'Struktur Sekolah', path: '/school-setup', aliases: ['/school-setup/subjects', '/subject-settings', '/classes', '/class-settings'] },
        { label: 'Profil Sekolah', path: '/settings/school-logo' },
        { label: 'Pengguna', path: '/dashboard#user-management-section' },
      ] : []),
    ] },
  ]
  const closeMenu = () => setMenuOpen(false)
  const closeAndScroll = (item) => {
    closeMenu()
    if (item.path === '/dashboard#user-management-section' && location.pathname === '/dashboard') {
      document.getElementById('user-management-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
  const logout = async () => { await supabase.auth.signOut(); navigate('/login', { replace: true }) }
  const dashboard = getDashboardPath(profile)

  if (profile?.is_master_admin || profile?.role === 'master_admin') return <Outlet />

  return (
    <div className="app-shell">
      <div className="app-shell-mobile-bar">
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Buka menu navigasi" aria-expanded={menuOpen} aria-controls="app-sidebar"><Menu size={22} /></button>
        <span>EduTrack</span>
      </div>
      {menuOpen && <button className="app-shell-backdrop" type="button" aria-label="Tutup menu navigasi" onClick={closeMenu} />}
      <aside id="app-sidebar" className={`app-sidebar${menuOpen ? ' is-open' : ''}`}>
        <div className="app-sidebar-brand">
          <img src="/edutrack-logo.png" alt="" />
          <div><strong>EduTrack</strong><span>Pemantauan akademik</span></div>
          <button className="app-sidebar-close" type="button" aria-label="Tutup menu navigasi" onClick={closeMenu}><X size={20} /></button>
        </div>
        <nav className="app-sidebar-nav" aria-label="Navigasi utama">
          <NavLink to={dashboard} onClick={closeMenu} className={({ isActive }) => `app-sidebar-link${isActive ? ' is-active' : ''}`}><LayoutDashboard size={19} /><span>Dashboard</span></NavLink>
          {groups.slice(0, 3).map((group) => {
            const active = group.items.some((item) => matches(item, location.pathname))
            const open = expanded[group.label] ?? active
            const Icon = group.icon
            return <div key={group.label} className="app-sidebar-group">
              <button type="button" className={`app-sidebar-link${active ? ' has-active' : ''}`} onClick={() => setExpanded((prev) => ({ ...prev, [group.label]: !open }))} aria-expanded={open}>
                <Icon size={19} /><span>{group.label}</span><ChevronDown size={16} className={open ? 'is-rotated' : ''} />
              </button>
              {open && <div className="app-sidebar-submenu">{group.items.map((item) => <NavLink key={item.path} to={item.path} onClick={() => closeAndScroll(item)} aria-current={matches(item, location.pathname) ? 'page' : undefined} className={`app-sidebar-sublink${matches(item, location.pathname) ? ' is-active' : ''}`}>{item.label}</NavLink>)}</div>}
            </div>
          })}
          <NavLink to="/dialog-prestasi" onClick={closeMenu} className={({ isActive }) => `app-sidebar-link${isActive ? ' is-active' : ''}`}><MessageSquareText size={19} /><span>Dialog Prestasi</span></NavLink>
          {groups.slice(3).map((group) => {
            const active = group.items.some((item) => matches(item, location.pathname))
            const open = expanded[group.label] ?? active
            const Icon = group.icon
            return <div key={group.label} className="app-sidebar-group">
              <button type="button" className={`app-sidebar-link${active ? ' has-active' : ''}`} onClick={() => setExpanded((prev) => ({ ...prev, [group.label]: !open }))} aria-expanded={open}><Icon size={19} /><span>{group.label}</span><ChevronDown size={16} className={open ? 'is-rotated' : ''} /></button>
              {open && <div className="app-sidebar-submenu">{group.items.map((item) => <NavLink key={item.path} to={item.path} onClick={() => closeAndScroll(item)} aria-current={matches(item, location.pathname) ? 'page' : undefined} className={`app-sidebar-sublink${matches(item, location.pathname) ? ' is-active' : ''}`}>{item.label}</NavLink>)}</div>}
            </div>
          })}
        </nav>
        <div className="app-sidebar-footer">
          {profile && <div className="app-sidebar-user">{profile.full_name || profile.email}</div>}
          <button type="button" onClick={logout}><LogOut size={18} /> Log Keluar</button>
        </div>
      </aside>
      <div className={`app-shell-content${['/home', '/dashboard'].includes(location.pathname) ? ' app-shell-dashboard' : ''}`}><Outlet /></div>
    </div>
  )
}
