import { ArrowRight, CalendarDays, ClipboardPlus, History, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import { formatDate } from '../lib/normalization'
import { optionLabel } from '../lib/options'
import { useSession } from '../session/useSession'
import type { ActivitySummary } from '../types'

export function DashboardPage() {
  const { data } = useSession()
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiRequest<{ activities: ActivitySummary[] }>('activity_history', {
      academic_year: data?.current_academic_year,
    })
      .then((result) => active && setActivities(result.activities.slice(0, 5)))
      .catch(() => active && setActivities([]))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [data?.current_academic_year])

  const participantCount = activities.reduce((sum, activity) => sum + activity.participant_count, 0)

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-brand-900 p-6 text-white shadow-soft sm:p-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-emerald-200">Tahun akademik {data?.current_academic_year}</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Selamat datang, {data?.access.display_name}</h1>
          <p className="mt-3 text-sm leading-6 text-emerald-100 sm:text-base">
            Daftar satu aktiviti, pilih semua murid terlibat dan simpan pencapaian mereka dalam satu operasi.
          </p>
          {data?.access.role !== 'viewer' && (
            <Link to="/activity/new" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-bold text-brand-900 hover:bg-emerald-50">
              <ClipboardPlus className="h-5 w-5" /> Aktiviti baharu
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">Aktiviti terkini</span><CalendarDays className="h-5 w-5 text-brand-700" /></div>
          <div className="mt-3 text-3xl font-bold text-slate-950">{loading ? '—' : activities.length}</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-500">Rekod murid</span><UsersRound className="h-5 w-5 text-brand-700" /></div>
          <div className="mt-3 text-3xl font-bold text-slate-950">{loading ? '—' : participantCount}</div>
        </div>
        <Link to="/history" className="card group flex items-center justify-between p-5 hover:border-brand-300">
          <div><div className="text-sm font-semibold text-slate-500">Semak semua</div><div className="mt-2 font-bold text-slate-950">Sejarah aktiviti</div></div>
          <ArrowRight className="h-5 w-5 text-brand-700 transition group-hover:translate-x-1" />
        </Link>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div><h2 className="font-bold text-slate-950">Aktiviti terkini</h2><p className="mt-1 text-xs text-slate-500">Rekod yang terus tersedia kepada EduTrack</p></div>
          <History className="h-5 w-5 text-slate-400" />
        </div>
        <div className="divide-y divide-slate-100">
          {!loading && activities.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-500">Belum ada aktiviti direkodkan.</div>}
          {activities.map((activity) => (
            <Link key={activity.id} to={`/activity/${activity.id}/edit`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
              <div className="min-w-0"><div className="truncate font-semibold text-slate-900">{activity.activity_name}</div><div className="mt-1 text-xs text-slate-500">{formatDate(activity.activity_date)} · {optionLabel(data?.classifications || [], 'level', activity.level)}</div></div>
              <div className="shrink-0 text-right"><div className="text-sm font-bold text-brand-800">{activity.participant_count}</div><div className="text-xs text-slate-500">murid</div></div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
