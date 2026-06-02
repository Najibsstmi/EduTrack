import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const PSYCHOMETRIC_DIMENSIONS = [
  'Verbal Linguistik',
  'Logik Matematik',
  'Visual Ruang',
  'Kinestetik',
  'Muzik',
  'Interpersonal',
  'Intrapersonal',
  'Naturalis',
]

const SUMMARY_ITEMS = [
  'Kecenderungan dominan',
  'Profil kelas',
  'Cadangan intervensi',
]

export default function PsychometricAnalysisPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  if (checkingAuth) {
    return <div className="p-6 text-slate-600">Loading Analisis Psikometrik...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Analisis Psikometrik"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate('/analysis')}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              Analisis
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/pbs/ppsi')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              PPsi
            </button>
          }
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Analisis psikometrik disediakan sebagai laporan berasingan daripada
            radar PBS utama. Data sebenar akan dipaparkan apabila modul dan
            pemetaan skor psikometrik lengkap.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Radar Psikometrik</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ruang chart untuk lapan dimensi psikometrik.
            </p>

            <div className="mt-5 flex aspect-[4/3] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <div className="text-center text-sm font-semibold text-slate-500">
                Data belum tersedia
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Dimensi</h2>
            <div className="mt-4 grid gap-2">
              {PSYCHOMETRIC_DIMENSIONS.map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                >
                  <span className="font-semibold text-slate-700">{item}</span>
                  <span className="text-xs font-semibold text-slate-400">Akan datang</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {SUMMARY_ITEMS.map((item) => (
            <div key={item} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-semibold text-slate-900">{item}</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Data belum tersedia.
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
