import { Activity, ArrowLeft, BarChart3, ClipboardList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { useRequireAuth } from '../lib/useRequireAuth.js'

export default function PajskInputPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  if (checkingAuth) {
    return <div className="p-6 text-slate-600">Loading PAJSK...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Input PAJSK"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate('/pbs')}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>PBS</span>
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/pbs/pajsk/segak/analysis')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              <span>Analisis SEGAK</span>
            </button>
          }
        />

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                <Activity className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">SEGAK / BMI</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Rekod BMI dan jumlah skor SEGAK untuk Penggal 1 dan Penggal 2.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/pbs/pajsk/segak/input')}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                <span>Input</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/pbs/pajsk/segak/analysis')}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                <span>Analisis</span>
              </button>
            </div>
          </div>

          {['Kokurikulum', 'Ekstrakurikulum'].map((title) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                Modul ini belum dibina dalam fasa SEGAK/BMI.
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
