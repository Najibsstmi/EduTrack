import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { getDashboardPath } from '../lib/dashboardPath.js'
import { supabase } from '../lib/supabaseClient.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

export default function PpsiPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (checkingAuth) return

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('id, role, is_school_admin')
        .eq('id', user.id)
        .maybeSingle()

      setProfile(data || null)
    }

    loadProfile()
  }, [checkingAuth])

  const dashboardPath = getDashboardPath(profile)

  if (checkingAuth) {
    return <div className="p-6 text-slate-600">Loading PPsi...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="PPsi"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              Kembali ke Dashboard
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/analysis/psychometric')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Analisis Psikometrik
            </button>
          }
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            Dapatan PPsi akan dipaparkan berasingan daripada radar chart PBS utama.
          </div>
        </section>
      </div>
    </div>
  )
}
