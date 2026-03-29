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
      .select('id, setup_step, is_setup_complete')
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
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">School Admin Dashboard</h1>
              <p className="mt-2 text-slate-600">
                Urus pengguna, semakan pendaftaran, dan pentadbiran sekolah anda.
              </p>

              <div className="mt-4 space-y-1 text-sm text-slate-600">
                <div>
                  <span className="font-semibold text-slate-800">Sekolah:</span>{' '}
                  {schoolInfo?.school_name || '-'}
                  {schoolInfo?.school_code ? ` (${schoolInfo.school_code})` : ''}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Jenis:</span>{' '}
                  {schoolInfo?.school_type || '-'}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Negeri / PPD:</span>{' '}
                  {[schoolInfo?.state, schoolInfo?.district].filter(Boolean).join(' / ') || '-'}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Admin semasa:</span>{' '}
                  {adminProfile?.full_name || '-'} ({adminProfile?.email || '-'})
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={refreshData}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={handleLogout}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Logout
              </button>
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

        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">
            Status School Setup
          </h2>

          {setupComplete ? (
            <div className="space-y-2 text-slate-700">
              <p className="font-semibold text-green-700">Setup sekolah lengkap</p>
              <p>✅ Setup struktur akademik</p>
              <p>✅ Setup peperiksaan</p>
              <p>✅ Setup grade</p>
              <p>✅ Setup subjek</p>
              <p className="pt-2 font-medium">Semua step telah lengkap.</p>
            </div>
          ) : (
            <div className="space-y-2 text-slate-700">
              <p className="font-semibold text-amber-700">Setup sekolah belum lengkap</p>
              <p>{setupStep >= 1 ? '✅' : '❌'} Setup struktur akademik</p>
              <p>{setupStep >= 2 ? '✅' : '❌'} Setup peperiksaan</p>
              <p>{setupStep >= 3 ? '✅' : '❌'} Setup grade</p>
              <p>{setupStep >= 4 ? '✅' : '❌'} Setup subjek</p>
              <p className="pt-2 font-medium">Sila lengkapkan step yang belum selesai.</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {!setupComplete && (
              <button
                onClick={() => {
                  if (setupStep === 0) navigate('/school-setup')
                  else if (setupStep === 1) navigate('/school-setup/exams')
                  else if (setupStep === 2) navigate('/school-setup/grades')
                  else if (setupStep === 3) navigate('/school-setup/subjects')
                }}
                className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
              >
                Sambung Setup
              </button>
            )}

            <button
              onClick={() => navigate('/school-setup')}
              className="rounded-xl bg-slate-700 px-5 py-3 font-medium text-white hover:bg-slate-800"
            >
              Urus Struktur Akademik
            </button>

            <button
              onClick={() => navigate('/school-setup/exams')}
              className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700"
            >
              Urus Peperiksaan
            </button>

            <button
              onClick={() => navigate('/school-setup/grades')}
              className="rounded-xl bg-amber-600 px-5 py-3 font-medium text-white hover:bg-amber-700"
            >
              Urus Grade
            </button>

            <button
              onClick={() => navigate('/school-setup/subjects')}
              className="rounded-xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700"
            >
              Urus Subjek
            </button>

            <button
              onClick={() => navigate('/students')}
              className="rounded-xl bg-purple-600 px-5 py-3 font-medium text-white hover:bg-purple-700"
            >
              Urus Murid
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 lg:w-80"
            />
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
      </div>
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
    </div>
  )
}
