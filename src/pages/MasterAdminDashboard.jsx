import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { forceCleanLogout, isRefreshTokenError } from '../lib/authSession'
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  School,
  Search,
  Shield,
  UserCheck,
  UserCog,
  Users,
  UserX,
} from 'lucide-react'

const ROLE_LABEL = {
  master_admin: 'Master Admin',
  school_admin: 'Admin Sekolah',
  teacher: 'Guru',
  viewer: 'Viewer',
  user: 'Pengguna',
}

const getDisplayName = (user) =>
  user?.full_name || user?.email?.split('@')[0] || user?.email || '-'

function StatCard({ title, value, icon }) {
  const CardIcon = icon

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h3 className="mt-2 text-3xl font-bold text-slate-900">{value}</h3>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3">
          <CardIcon className="h-5 w-5 text-slate-700" />
        </div>
      </div>
    </div>
  )
}

function Badge({ children, tone = 'slate' }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  }

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

function ActionButton({ children, onClick, variant = 'default', disabled = false }) {
  const variants = {
    default: 'border-slate-300 text-slate-700 hover:bg-slate-50',
    primary: 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800',
    danger: 'border-red-300 text-red-700 hover:bg-red-50',
    success: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]}`}
    >
      {children}
    </button>
  )
}

export default function MasterAdminDashboard() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [schools, setSchools] = useState([])
  const [pendingUsers, setPendingUsers] = useState([])
  const [expandedSchoolId, setExpandedSchoolId] = useState(null)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)

  const currentUserDisplayName = getDisplayName(currentUser)

  useEffect(() => {
    fetchMasterAdminData()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const fetchMasterAdminData = async () => {
    setLoading(true)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        console.log('Session invalid → redirect login')
        await forceCleanLogout()
        return
      }

      const { data: myProfile, error: myProfileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, school_id, is_active, approval_status, is_master_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (myProfileError || !myProfile) {
        navigate('/login', { replace: true })
        return
      }

      if (myProfile.is_active !== true) {
        await supabase.auth.signOut()
        navigate('/login', { replace: true })
        return
      }

      if (myProfile.approval_status !== 'approved') {
        await supabase.auth.signOut()
        navigate('/pending', { replace: true })
        return
      }

      setCurrentUser(myProfile)

      const isMasterAdmin = myProfile.is_master_admin === true || myProfile.role === 'master_admin'
      if (!isMasterAdmin) {
        const role = String(myProfile?.role || '').trim().toLowerCase()
        const isApprovedSchoolAdmin =
          role === 'school_admin' &&
          myProfile?.approval_status === 'approved' &&
          myProfile?.is_active === true

        if (isApprovedSchoolAdmin) {
          navigate('/dashboard', { replace: true })
          return
        }

        await supabase.auth.signOut()
        navigate('/login', { replace: true })
        return
      }

      const [
        { data: profilesData, error: profilesError },
        { data: schoolsData, error: schoolsError },
        { data: pendingData, error: pendingError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role, designation, school_id, approval_status, is_active, created_at, is_master_admin')
          .order('created_at', { ascending: false }),
        supabase
          .from('schools')
          .select('id, school_name, school_code, school_type, state, district, is_active')
          .order('school_name'),
        supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            email,
            role,
            approval_status,
            school_id,
            created_at,
            schools (
              id,
              school_name,
              school_code,
              state
            )
          `)
          .eq('approval_status', 'pending')
          .order('created_at', { ascending: false }),
      ])

      if (profilesError) throw profilesError
      if (schoolsError) throw schoolsError
      if (pendingError) throw pendingError

      setProfiles(profilesData || [])
      setSchools((schoolsData || []).filter((school) => school.is_active !== false))
      setPendingUsers(pendingData || [])
    } catch (error) {
      console.error('Load page error:', error)

      if (isRefreshTokenError(error)) {
        await forceCleanLogout()
        return
      }

      alert(error?.message || 'Gagal memuatkan dashboard master admin.')
    } finally {
      setLoading(false)
    }
  }

  const schoolMap = useMemo(() => {
    const map = new Map()
    schools.forEach((school) => map.set(school.id, school))
    return map
  }, [schools])

  const schoolsWithUsers = useMemo(() => {
    const grouped = new Map()

    profiles
      .filter((profile) => profile.school_id)
      .forEach((profile) => {
        const school = schoolMap.get(profile.school_id)
        if (!school) return

        if (!grouped.has(profile.school_id)) {
          grouped.set(profile.school_id, {
            school,
            users: [],
          })
        }

        grouped.get(profile.school_id).users.push(profile)
      })

    let result = Array.from(grouped.values()).map((item) => {
      const admin = item.users.find((user) => user.role === 'school_admin' && user.is_active !== false)

      return {
        ...item,
        admin,
        totalUsers: item.users.length,
        totalActiveUsers: item.users.filter((user) => user.is_active !== false).length,
        totalPending: item.users.filter((user) => user.approval_status === 'pending').length,
      }
    })

    const keyword = search.trim().toLowerCase()
    if (keyword) {
      result = result.filter((item) => {
        const haystack = [
          item.school.school_name,
          item.school.school_code,
          item.school.state,
          item.school.district,
          getDisplayName(item.admin),
          ...item.users.map((user) => `${getDisplayName(user)} ${user.email} ${user.designation || ''}`),
        ]
          .join(' ')
          .toLowerCase()

        return haystack.includes(keyword)
      })
    }

    const schoolsWithPendingCount = result.map((item) => {
      const pendingCount = pendingUsers.filter((user) => user.school_id === item.school.id).length

      return {
        ...item,
        pending_count: pendingCount,
      }
    })

    return schoolsWithPendingCount.sort((a, b) => {
      if (b.pending_count !== a.pending_count) {
        return b.pending_count - a.pending_count
      }

      return a.school.school_name.localeCompare(b.school.school_name, 'ms')
    })
  }, [profiles, schoolMap, search, pendingUsers])

  const stats = useMemo(() => {
    const schoolIds = new Set(profiles.filter((profile) => profile.school_id).map((profile) => profile.school_id))

    return {
      totalSchools: schoolIds.size,
      totalUsers: profiles.filter((profile) => profile.role !== 'master_admin' && profile.is_master_admin !== true).length,
      totalAdmins: profiles.filter((profile) => profile.role === 'school_admin').length,
      totalPending: profiles.filter((profile) => profile.approval_status === 'pending').length,
    }
  }, [profiles])

  const handlePromoteAdmin = async (user) => {
    if (!user?.school_id) return

    const oldAdmin = profiles.find(
      (profile) => profile.school_id === user.school_id && profile.role === 'school_admin' && profile.id !== user.id
    )

    const targetName = getDisplayName(user)
    const oldAdminName = oldAdmin ? getDisplayName(oldAdmin) : null

    const ok = window.confirm(
      `Jadikan ${targetName} sebagai admin sekolah?${oldAdminName ? `\n\nAdmin semasa (${oldAdminName}) akan ditukar kepada Guru.` : ''}`
    )
    if (!ok) return

    setBusyId(user.id)
    try {
      if (oldAdmin) {
        const { error: demoteError } = await supabase
          .from('profiles')
          .update({ role: 'teacher' })
          .eq('id', oldAdmin.id)

        if (demoteError) throw demoteError
      }

      const { error: promoteError } = await supabase
        .from('profiles')
        .update({ role: 'school_admin', approval_status: 'approved', is_active: true })
        .eq('id', user.id)

      if (promoteError) throw promoteError

      await fetchMasterAdminData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Gagal menukar admin sekolah.')
    } finally {
      setBusyId(null)
    }
  }

  const handleToggleActive = async (user) => {
    const nextValue = !(user.is_active !== false)
    const targetName = getDisplayName(user)
    const ok = window.confirm(
      nextValue ? `Aktifkan semula pengguna ${targetName}?` : `Nyahaktifkan pengguna ${targetName}?`
    )
    if (!ok) return

    setBusyId(user.id)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: nextValue })
        .eq('id', user.id)

      if (error) throw error
      await fetchMasterAdminData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Gagal mengemaskini status pengguna.')
    } finally {
      setBusyId(null)
    }
  }

  const handleApprove = async (user) => {
    setBusyId(user.id)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ approval_status: 'approved', is_active: true })
        .eq('id', user.id)

      if (error) throw error
      await fetchMasterAdminData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Gagal meluluskan pengguna.')
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async (user) => {
    const ok = window.confirm(`Tolak permohonan ${getDisplayName(user)}?`)
    if (!ok) return

    setBusyId(user.id)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ approval_status: 'rejected', is_active: false })
        .eq('id', user.id)

      if (error) throw error
      await fetchMasterAdminData()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Gagal menolak pengguna.')
    } finally {
      setBusyId(null)
    }
  }

  const handleApproveUser = async (userId) => {
    setBusyId(userId)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          approval_status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) {
        console.error(error)
        alert('Gagal approve pengguna.')
        return
      }

      await fetchMasterAdminData()
    } finally {
      setBusyId(null)
    }
  }

  const handleRejectUser = async (userId) => {
    const confirmReject = window.confirm('Reject pengguna ini?')
    if (!confirmReject) return

    setBusyId(userId)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          approval_status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) {
        console.error(error)
        alert('Gagal reject pengguna.')
        return
      }

      await fetchMasterAdminData()
    } finally {
      setBusyId(null)
    }
  }

  const renderRoleBadge = (role, isMasterAdmin) => {
    if (isMasterAdmin || role === 'master_admin') return <Badge tone="green">Master Admin</Badge>
    if (role === 'school_admin') return <Badge tone="blue">Admin Sekolah</Badge>
    return <Badge tone="slate">{ROLE_LABEL[role] || role || 'Pengguna'}</Badge>
  }

  const renderStatusBadge = (user) => {
    if (user.is_active === false) return <Badge tone="red">Tidak Aktif</Badge>
    if (user.approval_status === 'pending') return <Badge tone="amber">Pending</Badge>
    if (user.approval_status === 'rejected') return <Badge tone="red">Ditolak</Badge>
    return <Badge tone="green">Aktif</Badge>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-8 md:px-6">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-10 w-72 rounded-xl bg-slate-200" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-28 rounded-2xl bg-slate-200" />
            ))}
          </div>
          <div className="h-96 rounded-2xl bg-slate-200" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <img
              src="/edutrack-logo.png"
              alt="EduTrack"
              className="h-[42px] w-[42px] flex-shrink-0 rounded-[10px] object-contain"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">EDUTRACK</p>
              <p className="mt-1 truncate text-xs text-slate-500">Sistem Pemantauan Akademik Sekolah</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Master Admin Dashboard</h1>
              <p className="mt-2 text-sm text-slate-600">
                Pantau sekolah yang menggunakan sistem, urus admin sekolah, dan kawal status pengguna.
              </p>
              <p className="mt-2 text-sm text-slate-500">Log masuk sebagai {currentUserDisplayName}</p>
            </div>
          </div>

          <div className="flex w-full max-w-2xl flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <div className="relative w-full md:max-w-md">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari sekolah, kod sekolah, nama pengguna atau email"
                className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-500"
              />
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Jumlah Sekolah Guna Sistem" value={stats.totalSchools} icon={School} />
          <StatCard title="Jumlah Pengguna" value={stats.totalUsers} icon={Users} />
          <StatCard title="Admin Sekolah" value={stats.totalAdmins} icon={Shield} />
          <StatCard title="Pengguna Pending" value={stats.totalPending} icon={Clock3} />
        </div>

        {pendingUsers.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Pengguna Pending Perlu Tindakan</h2>
                <p className="text-sm text-slate-600">
                  Semak dan luluskan pengguna baharu sebelum mereka boleh menggunakan sistem.
                </p>
              </div>

              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
                {pendingUsers.length} pending
              </span>
            </div>

            <div className="space-y-3">
              {pendingUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{user.full_name || 'Nama belum lengkap'}</div>

                    <div className="text-sm text-slate-600">{user.email}</div>

                    <div className="mt-1 text-sm text-slate-700">
                      <span className="font-semibold">Sekolah:</span>{' '}
                      {user.schools?.school_name || 'Belum pilih sekolah'}
                      {user.schools?.school_code ? ` (${user.schools.school_code})` : ''}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApproveUser(user.id)}
                      disabled={busyId === user.id}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRejectUser(user.id)}
                      disabled={busyId === user.id}
                      className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">Senarai Sekolah & Pengguna</h2>
            <p className="mt-1 text-sm text-slate-600">
              Klik pada sekolah untuk lihat admin, pengguna, designation, dan tindakan pengurusan.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {schoolsWithUsers.length === 0 ? (
              <div className="px-6 py-10 text-sm text-slate-500">Tiada data sekolah ditemui.</div>
            ) : (
              schoolsWithUsers.map((item) => {
                const isOpen = expandedSchoolId === item.school.id
                return (
                  <div key={item.school.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedSchoolId(isOpen ? null : item.school.id)}
                      className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left transition hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-900">{item.school.school_name}</h3>
                          <Badge tone="slate">{item.school.school_code}</Badge>
                          {item.pending_count > 0 && (
                            <span className="ml-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                              Pending: {item.pending_count}
                            </span>
                          )}
                          {item.totalPending > 0 ? <Badge tone="amber">{item.totalPending} Pending</Badge> : null}
                        </div>

                        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                          <p>
                            <span className="font-medium text-slate-800">Jenis:</span> {item.school.school_type || '-'}
                          </p>
                          <p>
                            <span className="font-medium text-slate-800">Negeri:</span> {item.school.state || '-'}
                          </p>
                          <p>
                            <span className="font-medium text-slate-800">Admin:</span> {item.admin ? getDisplayName(item.admin) : 'Belum ditetapkan'}
                          </p>
                          <p>
                            <span className="font-medium text-slate-800">Jumlah pengguna:</span> {item.totalUsers}
                          </p>
                        </div>
                      </div>

                      <div className="pt-1 text-slate-500">
                        {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-slate-200 bg-slate-50/60 px-6 py-5">
                        <div className="overflow-x-auto">
                          <table className="min-w-full overflow-hidden rounded-2xl bg-white">
                            <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                              <tr>
                                <th className="px-4 py-3">Nama</th>
                                <th className="px-4 py-3">Email</th>
                                <th className="px-4 py-3">Peranan</th>
                                <th className="px-4 py-3">Designation</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Tindakan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-sm">
                              {item.users
                                .slice()
                                .sort((a, b) => {
                                  const aScore = a.role === 'school_admin' ? 0 : 1
                                  const bScore = b.role === 'school_admin' ? 0 : 1
                                  if (aScore !== bScore) return aScore - bScore
                                  return getDisplayName(a).localeCompare(getDisplayName(b), 'ms')
                                })
                                .map((user) => (
                                  <tr key={user.id} className="align-top">
                                    <td className="px-4 py-4">
                                      <div className="font-medium text-slate-900">{getDisplayName(user)}</div>
                                    </td>
                                    <td className="px-4 py-4 text-slate-600">{user.email || '-'}</td>
                                    <td className="px-4 py-4">{renderRoleBadge(user.role, user.is_master_admin)}</td>
                                    <td className="px-4 py-4 text-slate-600">{user.designation || '-'}</td>
                                    <td className="px-4 py-4">{renderStatusBadge(user)}</td>
                                    <td className="px-4 py-4">
                                      <div className="flex flex-wrap gap-2">
                                        {user.role !== 'school_admin' && user.is_master_admin !== true ? (
                                          <ActionButton
                                            onClick={() => handlePromoteAdmin(user)}
                                            disabled={busyId === user.id}
                                            variant="primary"
                                          >
                                            <span className="inline-flex items-center gap-1">
                                              <UserCog className="h-3.5 w-3.5" /> Jadikan Admin
                                            </span>
                                          </ActionButton>
                                        ) : null}

                                        {user.approval_status === 'pending' ? (
                                          <>
                                            <ActionButton
                                              onClick={() => handleApprove(user)}
                                              disabled={busyId === user.id}
                                              variant="success"
                                            >
                                              <span className="inline-flex items-center gap-1">
                                                <UserCheck className="h-3.5 w-3.5" /> Lulus
                                              </span>
                                            </ActionButton>
                                            <ActionButton
                                              onClick={() => handleReject(user)}
                                              disabled={busyId === user.id}
                                              variant="danger"
                                            >
                                              <span className="inline-flex items-center gap-1">
                                                <UserX className="h-3.5 w-3.5" /> Tolak
                                              </span>
                                            </ActionButton>
                                          </>
                                        ) : user.is_master_admin === true ? null : (
                                          <ActionButton
                                            onClick={() => handleToggleActive(user)}
                                            disabled={busyId === user.id}
                                            variant={user.is_active === false ? 'success' : 'danger'}
                                          >
                                            {user.is_active === false ? 'Aktifkan' : 'Nyahaktifkan'}
                                          </ActionButton>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
