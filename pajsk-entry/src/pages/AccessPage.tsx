import { BookOpenCheck, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../session/useSession'

export function AccessPage() {
  const { data, loading, error, login } = useSession()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const location = useLocation()

  if (data) {
    const target = (location.state as { from?: string } | null)?.from || '/'
    return <Navigate to={target} replace />
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await login(code)
    } catch {
      // The provider exposes a safe error message.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden bg-brand-900 p-10 text-white lg:block">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <BookOpenCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-10 text-4xl font-bold tracking-tight">Rekod aktiviti dalam beberapa minit.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-emerald-100">
            Pilih aktiviti, cari murid mengikut kelas atau bidang seni, kemudian simpan pencapaian secara pukal.
          </p>
          <div className="mt-10 space-y-4 text-sm text-emerald-50">
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" />Sesi selamat dan tamat secara automatik</div>
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" />Data terus tersedia kepada EduTrack</div>
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" />Tiada nombor kad pengenalan dipaparkan</div>
          </div>
        </section>

        <section className="p-6 sm:p-10">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-800 text-white">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-slate-950">PAJSK Entry</div>
              <div className="text-xs text-slate-500">SSeMJ</div>
            </div>
          </div>

          <div className="mt-8 lg:mt-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800">
              <KeyRound className="h-3.5 w-3.5" /> Akses guru
            </div>
            <h2 className="mt-4 text-2xl font-bold text-slate-950">Masukkan kod akses</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Semua guru SSeMJ boleh menggunakan kod sekolah yang sama.
            </p>
          </div>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="field-label" htmlFor="teacher-code">Kod guru</label>
              <input
                id="teacher-code"
                className="field text-center font-mono text-lg uppercase tracking-[0.18em]"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="JEA1091"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </div>

            {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <button className="btn-primary w-full" type="submit" disabled={submitting || loading}>
              {(submitting || loading) && <LoaderCircle className="h-5 w-5 animate-spin" />}
              Teruskan
            </button>
          </form>

          <p className="mt-7 text-center text-xs leading-5 text-slate-500">
            Pentadbir kali pertama?{' '}
            <Link className="font-semibold text-brand-800 hover:underline" to="/admin/setup">
              Jana kod admin melalui EduTrack
            </Link>
          </p>
        </section>
      </div>
    </div>
  )
}
