import { ArrowLeft, Check, Copy, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import { supabase } from '../lib/supabase'

export function AdminSetupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError || !data.session) throw signInError || new Error('Sesi EduTrack tidak tersedia.')

      const result = await apiRequest<{ accessCode: string }>(
        'bootstrap_admin',
        { display_name: displayName },
        { sessionToken: '', authToken: data.session.access_token }
      )
      setAccessCode(result.accessCode)
      setPassword('')
      await supabase.auth.signOut()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Kod admin tidak dapat dijana.')
      await supabase.auth.signOut().catch(() => undefined)
    } finally {
      setLoading(false)
    }
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(accessCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950" to="/access">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>

        <div className="card mt-5 p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-800">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-950">Sediakan admin PAJSK</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Log masuk sekali menggunakan akaun admin sekolah EduTrack. Kata laluan hanya dihantar kepada Supabase Auth dan tidak disimpan oleh PAJSK Entry.
          </p>

          {accessCode ? (
            <div className="mt-7">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <div className="text-sm font-semibold text-emerald-800">Kod admin berjaya dijana</div>
                <div className="mt-3 break-all font-mono text-xl font-bold tracking-wider text-emerald-950">{accessCode}</div>
                <p className="mt-3 text-xs leading-5 text-emerald-800">Salin sekarang. Kod penuh ini tidak boleh dilihat semula.</p>
              </div>
              <button type="button" className="btn-primary mt-4 w-full" onClick={copyCode}>
                {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                {copied ? 'Disalin' : 'Salin kod'}
              </button>
              <Link className="btn-secondary mt-3 w-full" to="/access">Masuk menggunakan kod</Link>
            </div>
          ) : (
            <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="field-label" htmlFor="admin-name">Nama paparan admin</label>
                <input id="admin-name" className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Contoh: Penyelaras PAJSK" />
              </div>
              <div>
                <label className="field-label" htmlFor="admin-email">E-mel EduTrack</label>
                <input id="admin-email" type="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
              </div>
              <div>
                <label className="field-label" htmlFor="admin-password">Kata laluan EduTrack</label>
                <input id="admin-password" type="password" className="field" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
              </div>
              {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              <button className="btn-primary w-full" type="submit" disabled={loading}>
                {loading && <LoaderCircle className="h-5 w-5 animate-spin" />}
                Jana kod admin
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
