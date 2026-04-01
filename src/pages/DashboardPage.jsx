import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

function DashboardPage() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true)

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.user) {
        alert('Sila login dahulu')
        navigate('/login')
        return
      }

      const currentUser = session.user
      setUser(currentUser)

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, approval_status, is_master_admin, is_school_admin')
        .eq('id', currentUser.id)
        .maybeSingle()

      if (profileError) {
        console.error('Profile error:', profileError)
        alert('Ralat semasa ambil profil')
        navigate('/login')
        return
      }

      if (!profileData) {
        console.error('Tiada profile untuk user id:', currentUser.id)
        alert('Profil tidak ditemui')
        navigate('/login')
        return
      }

      if (profileData?.is_master_admin) {
        navigate('/master-admin')
        return
      } else if (profileData?.is_school_admin && profileData?.approval_status === 'approved') {
        navigate('/school-admin')
        return
      } else if (profileData?.approval_status === 'pending') {
        navigate('/pending')
        return
      } else if (profileData?.approval_status === 'approved') {
        setProfile(profileData)
        setLoading(false)
        return
      }

      navigate('/login')
    }

    loadDashboard()
  }, [navigate])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading dashboard...</div>
  }

  const isSchoolAdmin = profile?.is_school_admin
  const isMasterAdmin = profile?.is_master_admin

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard EduTrack</h1>
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-800">Nama:</span> {profile?.full_name}</p>
            <p><span className="font-semibold text-slate-800">Email:</span> {profile?.email}</p>
            <p><span className="font-semibold text-slate-800">Role:</span> {profile?.role}</p>
          </div>
        </div>

        <div className="grid gap-3">
          {/* Semua role yang approved boleh input markah */}
          <button
            onClick={() => navigate('/scores')}
            className="flex items-center gap-3 rounded-xl bg-blue-600 px-5 py-4 text-left font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <span className="text-xl">📝</span>
            <div>
              <div>Input Markah</div>
              <div className="text-xs font-normal opacity-80">Isi markah murid mengikut kelas & subjek</div>
            </div>
          </button>

          {/* School Admin sahaja */}
          {isSchoolAdmin && (
            <>
              <button
                onClick={() => navigate('/school-setup')}
                className="flex items-center gap-3 rounded-xl bg-slate-700 px-5 py-4 text-left font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                <span className="text-xl">⚙️</span>
                <div>
                  <div>School Setup</div>
                  <div className="text-xs font-normal opacity-80">Tetapan sekolah, peperiksaan & subjek</div>
                </div>
              </button>

              <button
                onClick={() => navigate('/school-admin')}
                className="flex items-center gap-3 rounded-xl bg-slate-700 px-5 py-4 text-left font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                <span className="text-xl">👥</span>
                <div>
                  <div>Urus Pengguna</div>
                  <div className="text-xs font-normal opacity-80">Semak & luluskan pengguna sekolah</div>
                </div>
              </button>
            </>
          )}

          {/* Master Admin sahaja */}
          {isMasterAdmin && (
            <button
              onClick={() => navigate('/master-admin')}
              className="flex items-center gap-3 rounded-xl bg-purple-700 px-5 py-4 text-left font-semibold text-white shadow-sm hover:bg-purple-800"
            >
              <span className="text-xl">🛡️</span>
              <div>
                <div>Master Admin</div>
                <div className="text-xs font-normal opacity-80">Pengurusan semua sekolah</div>
              </div>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-4 text-left font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <span className="text-xl">🚪</span>
            <div>
              <div>Log Keluar</div>
              <div className="text-xs font-normal text-slate-500">Tamat sesi semasa</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
