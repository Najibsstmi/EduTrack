import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const PBS_DIMENSIONS = [
  'Peperiksaan',
  'PBD',
  'SEGAK',
  'PAJSK',
]

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

const EXAM_SUMMARY_ITEMS = [
  'Ringkasan peperiksaan terkini',
  'Prestasi akademik terkini',
  'Gred / markah / GPMP / GPS',
]

const NON_EXAM_SUMMARY_ITEMS = [
  'PBD terkini',
  'PAJSK terkini',
  'SEGAK terkini',
  'Psikometrik terkini',
]

export default function PbsAnalysisPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  if (checkingAuth) {
    return <div className="p-6 text-slate-600">Loading Analisis PBS...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="PBS Bersepadu"
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
              onClick={() => navigate('/pbs')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              PBS
            </button>
          }
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Analisis holistik PBS disediakan untuk membezakan dapatan
            peperiksaan dan bukan peperiksaan dalam satu paparan murid.
            Paparan ini tidak mengubah formula atau proses input sedia ada.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {[
            {
              title: 'Peperiksaan',
              description: 'Ringkasan akademik berasaskan peperiksaan apabila data tersedia.',
              items: EXAM_SUMMARY_ITEMS,
            },
            {
              title: 'Bukan Peperiksaan',
              description: 'Ringkasan PBS bukan peperiksaan tanpa mencampurkan skor psikometrik ke radar utama.',
              items: NON_EXAM_SUMMARY_ITEMS,
            },
          ].map((group) => (
            <div key={group.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
              <h2 className="text-lg font-semibold text-slate-900">{group.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">{group.description}</p>
              <div className="mt-4 grid gap-3">
                {group.items.map((item) => (
                  <div key={item} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="font-semibold text-slate-700">{item}</span>
                    <span className="text-xs font-semibold text-slate-400">Data belum tersedia</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Radar PBS Bersepadu</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Peperiksaan, PBD, SEGAK dan PAJSK untuk murid terkini.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                Struktur disediakan
              </span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
              <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <div className="relative h-full w-full max-w-56">
                  <div className="absolute inset-6 rounded-full border border-slate-300" />
                  <div className="absolute inset-12 rounded-full border border-slate-200" />
                  <div className="absolute left-1/2 top-2 h-[calc(50%-0.5rem)] w-px -translate-x-1/2 bg-slate-300" />
                  <div className="absolute bottom-2 left-1/2 h-[calc(50%-0.5rem)] w-px -translate-x-1/2 bg-slate-300" />
                  <div className="absolute left-2 top-1/2 h-px w-[calc(50%-0.5rem)] -translate-y-1/2 bg-slate-300" />
                  <div className="absolute right-2 top-1/2 h-px w-[calc(50%-0.5rem)] -translate-y-1/2 bg-slate-300" />
                  <div className="absolute inset-0 grid place-items-center text-center text-xs font-semibold text-slate-500">
                    Data radar akan dipaparkan selepas sumber PBS lengkap.
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                {PBS_DIMENSIONS.map((item) => (
                  <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{item}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Data belum tersedia.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Radar Psikometrik</h2>
            <p className="mt-1 text-sm text-slate-500">
              Psikometrik kekal berasingan daripada radar PBS.
            </p>

            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <div className="grid gap-2">
                {PSYCHOMETRIC_DIMENSIONS.map((item) => (
                  <div key={item} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-100">
                    <span className="font-medium text-slate-700">{item}</span>
                    <span className="text-xs font-semibold text-slate-400">Belum ada data</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
