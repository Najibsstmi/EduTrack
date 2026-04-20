import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [errorText, setErrorText] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setErrorText('')

    try {
      const redirectTo = `${window.location.origin}/reset-password`

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (error) throw error

      setMessage(
        'Pautan tetapan semula kata laluan telah dihantar ke email anda. Sila semak inbox.'
      )
    } catch (err) {
      setErrorText(err.message || 'Gagal menghantar pautan tetapan semula.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border border-slate-200">
        <h1 className="text-2xl font-extrabold text-slate-900">Lupa Kata Laluan</h1>
        <p className="mt-2 text-sm text-slate-600">
          Masukkan email akaun EduTrack anda untuk menerima pautan tetapan semula.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            disabled={loading}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? 'Menghantar...' : 'Hantar Pautan Reset'}
          </button>
        </form>

        <div className="mt-4 text-sm text-slate-600">
          <Link to="/login" className="font-semibold hover:text-slate-900">
            Kembali ke Login
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ForgotPasswordPage