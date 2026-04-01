import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const TABS = ['pending', 'approved', 'rejected', 'all']

export default function SchoolAdminDashboard() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingId, setSavingId] = useState(null)

  const [adminProfile, setAdminProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [users, setUsers] = useState([])
  const [setupConfig, setSetupConfig] = useState(null)

  const [activeTab, setActiveTab] = useState('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const [showTopNav, setShowTopNav] = useState(true)
  const [showInputMenu, setShowInputMenu] = useState(true)
  const [showAcademicMenu, setShowAcademicMenu] = useState(true)
  const [showUserMenu, setShowUserMenu] = useState(true)

  useEffect(() => {
    checkAccessAndFetch()
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
      .select(`
        id,
        full_name,
        email,
        school_id,
        role,
        approval_status,
        is_school_admin,
        is_master_admin
      `)
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

    if (!profile.is_school_admin || profile.approval_status !== 'approved') {
      if (profile.approval_status === 'pending') {
        navigate('/pending', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
      return
    }

    const { data: setupConfig, error: setupError } = await supabase
      .from('school_setup_configs')
      .select('id, setup_step, is_setup_complete, current_academic_year')
      .eq('school_id', profile.school_id)
      .maybeSingle()

    if (setupError) {
      console.error(setupError)
    }

    if (!setupConfig) {
      navigate('/school-setup', { replace: true })
      return
    }

    setSetupConfig(setupConfig)

    setAdminProfile(profile)
    await fetchSchoolData(profile.school_id)
    setLoading(false)
  }

  const setupStep = setupConfig?.setup_step || 0
  const setupComplete = setupConfig?.is_setup_complete || setupStep >= 4

  const fetchSchoolData = async (schoolId) => {
    setRefreshing(true)

    const [{ data: school, error: schoolError }, { data: profiles, error: profilesError }] =
      await Promise.all([
        supabase
          .from('schools')
          .select('id, school_name, school_code, school_type, state, district')
          .eq('id', schoolId)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select(`
            id,
            full_name,
            email,
            role,
            approval_status,
            is_school_admin,
            is_master_admin,
            school_id,
            created_at
          `)
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false }),
      ])

    if (schoolError) {
      console.error(schoolError)
      alert('Gagal ambil maklumat sekolah')
    }

    if (profilesError) {
      console.error(profilesError)
      alert('Gagal ambil senarai pengguna sekolah')
    }

    setSchoolInfo(school || null)
    setUsers(profiles || [])
    setRefreshing(false)
  }

  const filteredUsers = useMemo(() => {
    let result = [...users]

    if (activeTab !== 'all') {
      result = result.filter((u) => u.approval_status === activeTab)
    }

    const q = searchTerm.trim().toLowerCase()
    if (q) {
      result = result.filter((u) => {
        const name = (u.full_name || '').toLowerCase()
        const email = (u.email || '').toLowerCase()
        const role = (u.role || '').toLowerCase()
        return name.includes(q) || email.includes(q) || role.includes(q)
      })
    }

    return result
  }, [users, activeTab, searchTerm])

  const stats = useMemo(() => {
    return {
      total: users.length,
      pending: users.filter((u) => u.approval_status === 'pending').length,
      approved: users.filter((u) => u.approval_status === 'approved').length,
      rejected: users.filter((u) => u.approval_status === 'rejected').length,
      admins: users.filter((u) => u.is_school_admin).length,
    }
  }, [users])

  const refreshData = async () => {
    if (!adminProfile?.school_id) return
    await fetchSchoolData(adminProfile.school_id)
  }

  const updateUser = async (userId, payload, successMessage) => {
    setSavingId(userId)

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)

    if (error) {
      console.error(error)
      alert(error.message || 'Gagal kemas kini pengguna')
      setSavingId(null)
      return
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, ...payload } : u))
    )

    setSavingId(null)

    if (successMessage) {
      alert(successMessage)
    }
  }

  const handleApprove = async (userId) => {
    await updateUser(userId, { approval_status: 'approved' }, 'Pengguna berjaya diluluskan')
  }

  const handleReject = async (userId) => {
    await updateUser(userId, { approval_status: 'rejected' }, 'Pengguna berjaya ditolak')
  }

  const handlePromoteAdmin = async (userId) => {
    await updateUser(
      userId,
      { is_school_admin: true, role: 'school_admin', approval_status: 'approved' },
      'Pengguna berjaya dijadikan admin sekolah'
    )
  }

  const handleRemoveAdmin = async (userId) => {
    if (userId === adminProfile?.id) {
      alert('Admin sekolah semasa tidak boleh buang status sendiri di sini.')
      return
    }

    await updateUser(
      userId,
      { is_school_admin: false, role: 'teacher' },
      'Status admin sekolah berjaya dibuang'
    )
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const goTo = (path) => {
    navigate(path)
    setShowTopNav(false)
  }

  const getStatusBadge = (status) => {
    if (status === 'approved') return 'bg-green-100 text-green-700'
    if (status === 'pending') return 'bg-yellow-100 text-yellow-700'
    if (status === 'rejected') return 'bg-red-100 text-red-700'
    return 'bg-gray-100 text-gray-700'
  }

  if (loading) {
    return <div className="p-6">Loading school admin dashboard...</div>
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <img src="/favicon.svg" alt="EduTrack" className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-900">Sistem Tambahan Bilik</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {schoolInfo?.school_name || 'Portal Sekolah'}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 md:ml-auto">
              <button
                type="button"
                onClick={() => setShowTopNav((prev) => !prev)}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 md:hidden"
              >
                {showTopNav ? 'Tutup Menu' : 'Menu'}
              </button>

              <div
                className={`${showTopNav ? 'flex' : 'hidden'} flex-wrap items-center justify-end gap-1 text-xs font-semibold text-slate-600 md:flex`}
              >
                <button onClick={() => goTo('/school-admin')} className="rounded-md px-2 py-1 whitespace-nowrap hover:bg-slate-100">Dashboard</button>
                <button onClick={() => goTo('/scores')} className="rounded-md px-2 py-1 whitespace-nowrap hover:bg-slate-100">Analisis</button>
                <button onClick={() => { setShowUserMenu(true); setShowTopNav(false) }} className="rounded-md px-2 py-1 whitespace-nowrap hover:bg-slate-100">Pengguna</button>
                <button onClick={() => goTo('/classes')} className="rounded-md px-2 py-1 whitespace-nowrap hover:bg-slate-100">Bilik</button>
                <button onClick={() => goTo('/school-setup')} className="rounded-md px-2 py-1 whitespace-nowrap hover:bg-slate-100">Tetapan Sekolah</button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                <img src="/favicon.svg" alt="Logo sekolah" className="h-11 w-11" />
              </div>

              <div>
                <h1 className="text-3xl font-bold leading-none text-slate-900 md:text-5xl">Dashboard</h1>
                <p className="mt-2 text-base font-semibold text-slate-900">{schoolInfo?.school_name || '-'}</p>
                <p className="mt-1 text-sm text-slate-700">Selamat datang, {adminProfile?.full_name || '-'}.</p>

                <div className="mt-5 space-y-2 text-sm text-slate-700">
                  <p>Email: {adminProfile?.email || '-'}</p>
                  <p>Peranan: {adminProfile?.role || '-'}</p>
                  <p>Status kelulusan: {adminProfile?.approval_status || '-'}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={handleLogout}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Log Keluar
                  </button>
                  <button
                    onClick={refreshData}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Jumlah User" value={stats.total} />
          <StatCard title="Pending" value={stats.pending} />
          <StatCard title="Approved" value={stats.approved} />
          <StatCard title="Rejected" value={stats.rejected} />
          <StatCard title="Admin Sekolah" value={stats.admins} />
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <button
            type="button"
            onClick={() => setShowInputMenu((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-left font-semibold text-slate-900 hover:bg-slate-50"
          >
            <span>Menu Input Data</span>
            <span className="text-slate-500">{showInputMenu ? 'Tutup' : 'Buka'}</span>
          </button>

          {showInputMenu && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <button
                onClick={() => navigate('/scores')}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left hover:bg-blue-100"
              >
                <div className="font-semibold text-slate-900">Input Markah</div>
                <div className="text-sm text-slate-600">Masukkan markah peperiksaan murid</div>
              </button>

              <button
                onClick={() => navigate('/students/import')}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left hover:bg-blue-100"
              >
                <div className="font-semibold text-slate-900">Import Murid CSV</div>
                <div className="text-sm text-slate-600">Import senarai murid secara pukal</div>
              </button>
            </div>
          )}
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-1">

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold text-slate-900">Menu Utama</h2>
            <p className="mb-4 text-sm text-slate-600">
              Paparan minimum untuk operasi harian. Guna menu burger di bawah.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowAcademicMenu((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-left font-semibold text-slate-900 hover:bg-slate-50"
              >
                <span>Menu Tetapan Akademik</span>
                <span className="text-slate-500">{showAcademicMenu ? 'Tutup' : 'Buka'}</span>
              </button>

              {showAcademicMenu && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {!setupComplete && (
                    <button
                      onClick={() => {
                        if (setupStep === 0) navigate('/school-setup')
                        else if (setupStep === 1) navigate('/school-setup/exams')
                        else if (setupStep === 2) navigate('/school-setup/grades')
                        else if (setupStep === 3) navigate('/school-setup/subjects')
                      }}
                      className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-indigo-100"
                    >
                      Sambung Setup
                    </button>
                  )}

                  <button
                    onClick={() => navigate('/school-setup')}
                    className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-amber-100"
                  >
                    Urus Struktur Akademik
                  </button>
                  <button
                    onClick={() => navigate('/school-setup/exams')}
                    className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-amber-100"
                  >
                    Urus Peperiksaan
                  </button>
                  <button
                    onClick={() => navigate('/school-setup/grades')}
                    className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-amber-100"
                  >
                    Urus Grade
                  </button>
                  <button
                    onClick={() => navigate('/school-setup/subjects')}
                    className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-amber-100"
                  >
                    Urus Subjek
                  </button>
                  <button
                    onClick={() => navigate('/classes')}
                    className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-amber-100"
                  >
                    Urus Kelas
                  </button>
                  <button
                    onClick={() => navigate('/students')}
                    className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-amber-100"
                  >
                    Urus Murid
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowUserMenu((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-left font-semibold text-slate-900 hover:bg-slate-50"
              >
                <span>Menu Pengurusan Pengguna</span>
                <span className="text-slate-500">{showUserMenu ? 'Tutup' : 'Buka'}</span>
              </button>

              {showUserMenu && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap gap-2">
                    {TABS.map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`rounded-lg px-3 py-2 text-sm font-medium ${
                          activeTab === tab
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {tab === 'all' ? 'Semua' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="Cari nama, email, role..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {showUserMenu && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 border-b border-slate-200 pb-3">
            <h2 className="text-lg font-semibold text-slate-900">Senarai Pengguna</h2>
            <p className="text-sm text-slate-500">
              Paparan ditapis berdasarkan tab "{activeTab === 'all' ? 'Semua' : activeTab}".
            </p>
          </div>

          {filteredUsers.length === 0 ? (
            <p className="py-8 text-center text-slate-500">Tiada data untuk paparan ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-slate-700">
                    <th className="px-3 py-3 font-semibold">Nama</th>
                    <th className="px-3 py-3 font-semibold">Email</th>
                    <th className="px-3 py-3 font-semibold">Role</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Admin</th>
                    <th className="px-3 py-3 font-semibold">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const isCurrentAdmin = user.id === adminProfile?.id

                    return (
                      <tr key={user.id} className="border-b align-top">
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-900">{user.full_name || '-'}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{user.email || '-'}</td>
                        <td className="px-3 py-3 text-slate-700">{user.role || '-'}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadge(
                              user.approval_status
                            )}`}
                          >
                            {user.approval_status || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {user.is_school_admin ? (
                            <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                              Ya
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                              Tidak
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            {user.approval_status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApprove(user.id)}
                                  disabled={savingId === user.id}
                                  className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                                >
                                  {savingId === user.id ? 'Saving...' : 'Approve'}
                                </button>

                                <button
                                  onClick={() => handleReject(user.id)}
                                  disabled={savingId === user.id}
                                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {user.approval_status === 'approved' && !user.is_school_admin && (
                              <button
                                onClick={() => handlePromoteAdmin(user.id)}
                                disabled={savingId === user.id}
                                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                              >
                                Jadikan Admin
                              </button>
                            )}

                            {user.is_school_admin && !isCurrentAdmin && (
                              <button
                                onClick={() => handleRemoveAdmin(user.id)}
                                disabled={savingId === user.id}
                                className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                              >
                                Buang Admin
                              </button>
                            )}

                            {user.approval_status === 'rejected' && (
                              <button
                                onClick={() => handleApprove(user.id)}
                                disabled={savingId === user.id}
                                className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                              >
                                Luluskan Semula
                              </button>
                            )}

                            {isCurrentAdmin && (
                              <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                                Akaun anda
                              </span>
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
        </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
    </div>
  )
}
