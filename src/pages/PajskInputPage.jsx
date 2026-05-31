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
              PBS
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/analysis/pbs')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Analisis PBS
            </button>
          }
        />

        <section className="grid gap-4 md:grid-cols-3">
          {['SEGAK / BMI', 'Kokurikulum', 'Ekstrakurikulum'].map((title) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                Borang input akan disambungkan kepada jadual PAJSK baharu.
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
