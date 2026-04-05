import { useNavigate } from 'react-router-dom'

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

export default function AnalysisHubPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                EduTrack
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Analisis</h1>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              onClick={() => navigate('/analysis/class')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Analisis Kelas
            </button>

            <button
              onClick={() => navigate('/analysis/student')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Analisis Individu
            </button>

            <button
              onClick={() => navigate('/analysis/student-subject')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Analisis Trend
            </button>

            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeftIcon />
              Kembali
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
