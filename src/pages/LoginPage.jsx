import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await supabase.auth.signOut().catch(() => {})

      const { data: authData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (loginError) {
        alert(loginError.message)
        return
      }

      const user = authData?.user
      if (!user) return

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError || !profile) {
        await supabase.auth.signOut()
        alert('Profil pengguna tidak ditemui.')
        return
      }

      if (profile.is_active !== true) {
        await supabase.auth.signOut()
        alert('Akaun anda telah dinyahaktifkan. Sila hubungi pentadbir.')
        return
      }

      if (profile.approval_status !== 'approved') {
        await supabase.auth.signOut()
        navigate('/pending')
        return
      }

      const role = String(profile?.role || '').trim().toLowerCase()
      const isApprovedSchoolAdmin =
        role === 'school_admin' &&
        profile?.approval_status === 'approved' &&
        profile?.is_active === true

      if (profile?.is_master_admin === true || role === 'master_admin') {
        navigate('/master-admin')
        return
      }

      if (isApprovedSchoolAdmin) {
        navigate('/dashboard')
        return
      }

      navigate('/home')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <img
            src="/edutrack-logo.png"
            alt="EduTrack"
            className="h-auto w-[120px] object-contain"
          />
          <div className="mt-3 text-[13px] text-slate-500">
            Sistem Pemantauan Akademik Sekolah
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          EduTrack
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Login EduTrack</h1>
        <p className="mt-2 text-sm text-slate-600">
          Log masuk untuk akses dashboard sekolah anda.
        </p>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              placeholder="nama@sekolah.edu.my"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Kata Laluan</label>
            <input
              type="password"
              placeholder="Masukkan kata laluan"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              required
            />
          </div>

          <div className="mt-3 text-right">
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              Lupa Kata Laluan?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? 'Loading...' : 'Login'}
          </button>
        </form>

        <div className="mt-6 border-t pt-4 text-center">
          <p className="text-sm text-slate-600">Belum ada akaun sekolah?</p>
          <Link
            to="/register"
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Daftar Akaun
          </Link>
        </div>
      </div>
    </div>
  )
}

export default LoginPage