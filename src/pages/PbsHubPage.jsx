import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const modules = [
  {
    title: 'PBD',
    description: 'Input TP1 hingga TP6 mengikut kelas, subjek dan murid.',
    path: '/pbs/pbd/input',
    tone: 'border-blue-200 bg-blue-50 text-blue-900',
  },
  {
    title: 'PAJSK',
    description: 'Input SEGAK dan BMI untuk fasa PAJSK semasa.',
    path: '/pbs/pajsk',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
  {
    title: 'PPsi',
    description: 'Rekod dapatan psikometrik untuk paparan chart berasingan.',
    path: '/pbs/ppsi',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  {
    title: 'Analisis PBS Bersepadu',
    description:
      'Graf poligon peperiksaan, PBD, SEGAK, BMI, PAJSK dan ekstrakurikulum.',
    path: '/analysis/pbs',
    tone: 'border-violet-200 bg-violet-50 text-violet-900',
  },
]

export default function PbsHubPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  if (checkingAuth) {
    return <div className="p-6 text-slate-600">Loading PBS...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <AppHeader
          title="PBS Bersepadu"
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Dashboard
            </button>
          }
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {modules.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`min-h-36 rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${item.tone}`}
              >
                <div className="text-lg font-bold">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {item.description}
                </p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
