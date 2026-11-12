import { Edit3, LoaderCircle, Search, Trash2, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import { formatDate } from '../lib/normalization'
import { optionLabel } from '../lib/options'
import { useSession } from '../session/useSession'
import type { ActivitySummary } from '../types'

export function HistoryPage() {
  const { data } = useSession()
  const [year, setYear] = useState(data?.current_academic_year || new Date().getFullYear())
  const [query, setQuery] = useState('')
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<{ activities: ActivitySummary[] }>('activity_history', { academic_year: year })
      setActivities(result.activities)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Sejarah tidak dapat dimuatkan.')
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ms-MY')
    if (!needle) return activities
    return activities.filter((activity) => `${activity.activity_name} ${activity.organiser || ''} ${activity.competition_category || ''} ${activity.teacher_in_charge}`.toLocaleLowerCase('ms-MY').includes(needle))
  }, [activities, query])

  const cancelActivity = async (activity: ActivitySummary) => {
    if (!window.confirm(`Batalkan rekod “${activity.activity_name}”? Rekod sejarah akan dikekalkan.`)) return
    try {
      await apiRequest('cancel_activity', { activity_id: activity.id })
      await load()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Aktiviti tidak dapat dibatalkan.')
    }
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-slate-950">Sejarah aktiviti</h1><p className="mt-1 text-sm text-slate-600">Semak dan betulkan rekod tanpa memadam sejarah asal.</p></div>

      <div className="card grid gap-3 p-4 sm:grid-cols-[180px_1fr]">
        <select className="field" value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Tahun akademik">
          {(data?.academic_years || [year]).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" /><input className="field pl-11" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama aktiviti, penganjur atau guru" /></div>
      </div>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-3">
        {loading && <div className="flex justify-center py-10 text-slate-500"><LoaderCircle className="h-6 w-6 animate-spin" /></div>}
        {!loading && filtered.length === 0 && <div className="card px-5 py-12 text-center text-sm text-slate-500">Tiada aktiviti ditemui.</div>}
        {filtered.map((activity) => (
          <article key={activity.id} className="card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2"><span className="chip">{optionLabel(data?.classifications || [], 'component', activity.component)}</span><span className="chip">{optionLabel(data?.classifications || [], 'level', activity.level)}</span></div>
                <h2 className="mt-3 text-lg font-bold text-slate-950">{activity.activity_name}</h2>
                <p className="mt-1 text-sm text-slate-600">{formatDate(activity.activity_date)}{activity.organiser ? ` · ${activity.organiser}` : ''}</p>
                {activity.competition_category && <p className="mt-1 text-sm text-slate-600">Kategori: {activity.competition_category}</p>}
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-brand-800"><UsersRound className="h-4 w-4" />{activity.participant_count} murid</div>
              </div>
              <div className="flex gap-2">
                {data?.access.role !== 'viewer' && <Link className="btn-secondary min-h-10 px-3" to={`/activity/${activity.id}/edit`}><Edit3 className="h-4 w-4" /> Edit</Link>}
                {data?.access.role === 'admin' && <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => void cancelActivity(activity)}><Trash2 className="h-4 w-4" /> Batal</button>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
