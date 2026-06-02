import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { getDashboardPath } from '../lib/dashboardPath'

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

const EXAM_ANALYSIS_LINKS = [
  { label: 'Prestasi Murid', path: '/analysis/student' },
  { label: 'Prestasi Kelas', path: '/analysis/class' },
  { label: 'Prestasi Subjek (GPMP)', path: '/analysis/class' },
  { label: 'Prestasi Sekolah (GPS)', disabled: true, note: 'Akan datang' },
]

const NON_EXAM_ANALYSIS_LINKS = [
  { label: 'Analisis PBD', path: '/analysis/pbd' },
  { label: 'Analisis PAJSK & SEGAK', path: '/analysis/pajsk-segak' },
  { label: 'Analisis Psikometrik', path: '/analysis/psychometric' },
  { label: 'PBS Bersepadu', path: '/analysis/pbs' },
]

export default function AnalysisHubPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        navigate('/login', { replace: true })
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, is_school_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || !profileData) {
        navigate('/login', { replace: true })
        return
      }

      setProfile(profileData)
    }

    loadProfile()
  }, [navigate])

  const dashboardPath = getDashboardPath(profile)
  const renderAnalysisButton = (item) => (
    <button
      key={item.label}
      type="button"
      onClick={() => {
        if (!item.disabled) navigate(item.path)
      }}
      disabled={item.disabled}
      className={`flex min-h-12 items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors md:px-4 ${
        item.disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
          : 'border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span>{item.label}</span>
      {item.note ? (
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
          {item.note}
        </span>
      ) : null}
    </button>
  )

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

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Peperiksaan
              </h2>
              <div className="mt-3 grid gap-3">
                {EXAM_ANALYSIS_LINKS.map(renderAnalysisButton)}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Bukan Peperiksaan
              </h2>
              <div className="mt-3 grid gap-3">
                {NON_EXAM_ANALYSIS_LINKS.map(renderAnalysisButton)}
              </div>
            </section>
          </div>

          <div className="mt-4">
            <button
              onClick={() => navigate(dashboardPath)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 md:px-4"
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
