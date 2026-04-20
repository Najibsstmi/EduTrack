import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        setErrorText(error.message)
        return
      }

      if (data?.session) {
        setReady(true)
      } else {
        setErrorText('Sesi reset tidak sah atau telah tamat tempoh.')
      }
    }

    checkSession()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorText('')
    setMessage('')

    if (password.length < 6) {
      setErrorText('Kata laluan mesti sekurang-kurangnya 6 aksara.')
      return
    }

    if (password !== confirmPassword) {
      setErrorText('Pengesahan kata laluan tidak sepadan.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      setMessage('Kata laluan berjaya dikemaskini. Anda akan dibawa ke halaman login.')
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 1500)
    } catch (err) {
      setErrorText(err.message || 'Gagal mengemaskini kata laluan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border border-slate-200">
        <h1 className="text-2xl font-extrabold text-slate-900">Tetapkan Kata Laluan Baharu</h1>
        <p className="mt-2 text-sm text-slate-600">
          Masukkan kata laluan baharu untuk akaun EduTrack anda.
        </p>

        {!ready && !errorText ? (
          <div className="mt-6 text-sm text-slate-600">Menyemak sesi reset...</div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Kata Laluan Baharu
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Sahkan Kata Laluan
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            {message && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            )}

            {errorText && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorText}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !ready}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? 'Menyimpan...' : 'Simpan Kata Laluan Baharu'}
            </button>
          </form>
        )}

        <div className="mt-4 text-sm text-slate-600">
          <Link to="/login" className="font-semibold hover:text-slate-900">
            Kembali ke Login
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ResetPasswordPage