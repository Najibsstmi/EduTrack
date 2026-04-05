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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      alert('Gagal dapatkan maklumat pengguna')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, approval_status, is_master_admin, is_school_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      alert('Profil pengguna tidak ditemui')
      setLoading(false)
      return
    }

    alert('Login berjaya')

    if (profile?.is_master_admin) {
      navigate('/master-admin')
    } else if ((profile?.is_school_admin === true || profile?.role === 'school_admin') && profile?.approval_status === 'approved') {
      navigate('/dashboard')
    } else if (profile?.approval_status === 'pending') {
      navigate('/pending')
    } else if (profile?.approval_status === 'approved') {
      navigate('/home')
    } else {
      navigate('/login')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:mt-14">
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