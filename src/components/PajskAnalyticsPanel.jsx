import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { getDisplayClassLabel, getDisplayLevel, sortLevelsByDisplayOrder } from '../lib/levelLabels.js'
import {
  calculatePajskAnalytics,
  filterPajskRows,
  PAJSK_ART_FIELDS,
  toChartRows,
} from '../lib/pajskAnalytics.js'
import { buildSegakYearOptions } from '../lib/usePajskSegakData.js'
import PajskBarChart from './PajskCharts.jsx'
import { supabase } from '../lib/supabaseClient'

const PAGE_SIZE = 20
const levelLabels = {
  SEKOLAH: 'Sekolah', DAERAH: 'Daerah/Zon', NEGERI: 'Negeri', KEBANGSAAN: 'Kebangsaan', ANTARABANGSA: 'Antarabangsa',
}
const componentLabels = {
  KELAB_PERSATUAN: 'Kelab/Persatuan', PASUKAN_BADAN_BERUNIFORM: 'Pasukan Badan Beruniform',
  SUKAN_PERMAINAN: 'Sukan/Permainan', EKSTRA_KURIKULUM: 'Ekstra Kurikulum',
}
const achievementLabels = {
  JOHAN: 'Johan', NAIB_JOHAN: 'Naib Johan', KETIGA: 'Ketiga', KEEMPAT: 'Keempat', KELIMA: 'Kelima', TIADA: 'Tiada',
}
const prettyLabel = (value) => levelLabels[value] || componentLabels[value] || achievementLabels[value] || value
const formatRefresh = (value) => value ? new Intl.DateTimeFormat('ms-MY', { dateStyle: 'medium', timeStyle: 'medium' }).format(value) : 'Belum pernah'

export default function PajskAnalyticsPanel({
  schoolId, academicYear, setAcademicYear, classes, enrollments, levelMappings, pajskRows,
  pajskErrorMessage, lastPajskRefresh, reload,
}) {
  const [form, setForm] = useState('')
  const [classId, setClassId] = useState('')
  const [artField, setArtField] = useState('')
  const [component, setComponent] = useState('')
  const [level, setLevel] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentRows, setStudentRows] = useState([])
  const [studentTotal, setStudentTotal] = useState(0)
  const [studentLoading, setStudentLoading] = useState(false)
  const [studentError, setStudentError] = useState('')

  const availableForms = useMemo(() => sortLevelsByDisplayOrder(
    [...new Set(classes.map((row) => row.tingkatan).filter(Boolean))], levelMappings
  ), [classes, levelMappings])
  const availableClasses = useMemo(() => classes.filter((row) => !form || row.tingkatan === form), [classes, form])
  const classById = useMemo(() => new Map(classes.map((row) => [String(row.id), row])), [classes])
  const selectedClass = classById.get(String(classId))

  const population = useMemo(() => enrollments.filter((row) => {
    const classRow = classById.get(String(row.class_id)) || {}
    if (form && classRow.tingkatan !== form) return false
    if (classId && String(row.class_id) !== String(classId)) return false
    if (artField && row.student_profiles?.art_field !== artField) return false
    return true
  }), [artField, classById, classId, enrollments, form])
  const allowedStudentIds = useMemo(() => new Set(population.map((row) => String(row.student_profile_id))), [population])
  const filteredRows = useMemo(() => filterPajskRows(pajskRows, {
    form, className: selectedClass?.class_name || '', artField, component, level, allowedStudentIds,
  }), [allowedStudentIds, artField, component, form, level, pajskRows, selectedClass?.class_name])
  const summary = useMemo(() => calculatePajskAnalytics(filteredRows, population.length), [filteredRows, population.length])
  useEffect(() => {
    let active = true
    const loadStudentPage = async () => {
      if (!schoolId || !academicYear) return
      setStudentLoading(true)
      setStudentError('')
      const { data, error } = await supabase.rpc('pajsk_analysis_student_rows', {
        p_school_id: schoolId,
        p_academic_year: Number(academicYear),
        p_form: form || null,
        p_class_name: selectedClass?.class_name || null,
        p_art_field: artField || null,
        p_component: component || null,
        p_level: level || null,
        p_search: search.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      })
      if (!active) return
      if (error) {
        setStudentRows([])
        setStudentTotal(0)
        setStudentError(`Jadual murid gagal dimuatkan: ${error.message}`)
      } else {
        setStudentRows(data || [])
        setStudentTotal(Number(data?.[0]?.total_count || 0))
      }
      setStudentLoading(false)
    }
    loadStudentPage()
    return () => { active = false }
  }, [academicYear, artField, component, form, level, page, schoolId, search, selectedClass?.class_name])

  const pageCount = Math.max(1, Math.ceil(studentTotal / PAGE_SIZE))
  const pageRows = studentRows
  const selectedHistory = selectedStudentId ? filteredRows.filter((row) => String(row.student_profile_id) === selectedStudentId) : []

  const updateFilter = (setter) => (event) => { setter(event.target.value); setPage(1); setSelectedStudentId('') }

  return (
    <div className="space-y-4">
      {pajskErrorMessage ? <StateMessage tone="error" title="Rekod PAJSK gagal dibaca" body={pajskErrorMessage} /> : null}
      {!pajskErrorMessage && pajskRows.length === 0 ? (
        <StateMessage title="Belum ada rekod PAJSK" body={`Tiada aktiviti PAJSK yang dihantar bagi tahun ${academicYear}. Ini bukan ralat pangkalan data.`} />
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-900">Penapis Analisis PAJSK</h2><p className="mt-1 text-xs text-slate-500">Kemaskini terakhir berjaya: {formatRefresh(lastPajskRefresh)}</p></div>
          <button type="button" onClick={reload} className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"><RefreshCw className="h-4 w-4" /> Muat Semula Data</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Filter value={academicYear} onChange={updateFilter(setAcademicYear)}>{buildSegakYearOptions(academicYear).map((year) => <option key={year} value={year}>{year}</option>)}</Filter>
          <Filter value={form} onChange={(event) => { updateFilter(setForm)(event); setClassId('') }}><option value="">Semua Tingkatan</option>{availableForms.map((value) => <option key={value} value={value}>{getDisplayLevel(value, levelMappings)}</option>)}</Filter>
          <Filter value={classId} onChange={updateFilter(setClassId)}><option value="">Semua Kelas</option>{availableClasses.map((row) => <option key={row.id} value={row.id}>{getDisplayClassLabel(row.tingkatan, row.class_name, levelMappings)}</option>)}</Filter>
          <Filter value={artField} onChange={updateFilter(setArtField)}><option value="">Semua Bidang Seni</option>{PAJSK_ART_FIELDS.map((value) => <option key={value} value={value}>{value}</option>)}</Filter>
          <Filter value={component} onChange={updateFilter(setComponent)}><option value="">Semua Komponen</option>{Object.entries(componentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Filter>
          <Filter value={level} onChange={updateFilter(setLevel)}><option value="">Semua Peringkat</option>{Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Filter>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric title="Jumlah Murid" value={summary.totalStudents} />
        <Metric title="Murid Dengan Rekod" value={summary.studentsWithRecords} />
        <Metric title="Jumlah Aktiviti" value={summary.activityCount} note={`${summary.participationRecordCount} rekod murid`} />
        <Metric title="Murid Tanpa Aktiviti" value={summary.studentsWithoutRecords} />
        <Metric title="Pencapaian Direkod" value={summary.achievementCount} />
        <Metric title="Jumlah Markah Aktiviti" value={summary.totalRecordedScore.toFixed(2)} note="Bukan skor keseluruhan PAJSK" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Penglibatan Mengikut Peringkat"><PajskBarChart data={toChartRows(summary.byLevel).map((row) => ({ ...row, label: prettyLabel(row.label) }))} /></ChartCard>
        <ChartCard title="Penglibatan I, II dan III"><PajskBarChart data={toChartRows(summary.byParticipation)} color="#0f766e" /></ChartCard>
        <ChartCard title="Penglibatan Mengikut Bidang Seni"><PajskBarChart data={toChartRows(summary.byArtField)} color="#7c3aed" horizontal /></ChartCard>
        <ChartCard title="Penglibatan Mengikut Kelas"><PajskBarChart data={toChartRows(summary.byClass)} color="#ea580c" horizontal /></ChartCard>
        <ChartCard title="Penglibatan Mengikut Komponen"><PajskBarChart data={toChartRows(summary.byComponent).map((row) => ({ ...row, label: prettyLabel(row.label) }))} color="#0284c7" horizontal /></ChartCard>
        <ChartCard title="Penglibatan Mengikut Bulan"><PajskBarChart data={toChartRows(summary.byMonth).sort((a, b) => a.label.localeCompare(b.label))} color="#16a34a" /></ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Breakdown title="Pencapaian Mengikut Peringkat" record={summary.achievementByLevel} />
        <Breakdown title="Kategori Pencapaian" record={summary.achievementByResult} />
        <Breakdown title="Pencapaian Mengikut Bidang Seni" record={summary.achievementByArtField} />
        <Breakdown title="Pencapaian Mengikut Kelas" record={summary.achievementByClass} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">Rekod Mengikut Murid</h2><p className="mt-1 text-xs text-slate-500">Kedudukan ini bersifat deskriptif dan bukan ranking skor rasmi PAJSK.</p></div><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Cari nama murid" className="rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm" /></label></div>
        {studentError ? <p className="mt-3 text-sm text-rose-700">{studentError}</p> : null}
        <div className="mt-4 overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Murid</th><th className="px-3 py-3">Kelas</th><th className="px-3 py-3">Bidang</th><th className="px-3 py-3 text-center">Aktiviti</th><th className="px-3 py-3 text-center">Pencapaian</th><th className="px-3 py-3 text-center">Negeri ke atas</th><th className="px-3 py-3">Terkini</th><th className="px-3 py-3">Sejarah</th></tr></thead><tbody>{studentLoading ? <tr><td colSpan="8" className="px-3 py-8 text-center text-slate-500">Memuatkan rekod murid...</td></tr> : pageRows.length ? pageRows.map((row) => <tr key={row.student_profile_id} className="border-b border-slate-100"><td className="px-3 py-3 font-medium text-slate-900">{row.student_name}</td><td className="px-3 py-3">{row.form} · {row.class_name}</td><td className="px-3 py-3">{row.art_field || '-'}</td><td className="px-3 py-3 text-center">{row.activity_count}</td><td className="px-3 py-3 text-center">{row.achievement_count}</td><td className="px-3 py-3 text-center">{row.state_or_higher_count}</td><td className="px-3 py-3">{row.latest_activity_date || '-'}</td><td className="px-3 py-3"><button type="button" onClick={() => setSelectedStudentId(String(row.student_profile_id))} className="text-blue-700 underline">Lihat</button></td></tr>) : <tr><td colSpan="8" className="px-3 py-8 text-center text-slate-500">Tiada rekod murid untuk penapis ini.</td></tr>}</tbody></table></div>
        <div className="mt-4 flex items-center justify-between text-sm"><span>{studentTotal} murid</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="border border-slate-300 bg-white text-slate-700 disabled:opacity-40">Sebelum</button><span className="px-3 py-2">{Math.min(page, pageCount)} / {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="border border-slate-300 bg-white text-slate-700 disabled:opacity-40">Seterusnya</button></div></div>
      </section>

      {selectedStudentId ? <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Sejarah Aktiviti Murid</h2><button type="button" onClick={() => setSelectedStudentId('')} className="text-sm text-slate-600 underline">Tutup</button></div><div className="mt-3 space-y-2">{selectedHistory.map((row) => <div key={`${row.activity_id}-${row.student_profile_id}`} className="rounded-xl bg-white p-3 text-sm"><div className="font-semibold text-slate-900">{row.activity_name}</div><div className="mt-1 text-slate-600">{row.activity_date} · {prettyLabel(row.level)} · {prettyLabel(row.achievement_result)}</div></div>)}</div></section> : null}
    </div>
  )
}

function Filter({ children, ...props }) { return <select {...props} className="rounded-xl border border-slate-300 px-3 py-3 text-sm">{children}</select> }
function Metric({ title, value, note }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-sm font-medium text-slate-500">{title}</div><div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>{note ? <div className="mt-1 text-xs text-slate-500">{note}</div> : null}</div> }
function ChartCard({ title, children }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6"><h2 className="text-lg font-semibold text-slate-900">{title}</h2><div className="mt-4">{children}</div></div> }
function Breakdown({ title, record }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-semibold text-slate-900">{title}</h2><div className="mt-3 space-y-2">{toChartRows(record).length ? toChartRows(record).map((row) => <div key={row.label} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span>{prettyLabel(row.label)}</span><strong>{row.value}</strong></div>) : <p className="text-sm text-slate-500">Tiada pencapaian direkodkan.</p>}</div></div> }
function StateMessage({ title, body, tone = 'empty' }) { const styles = tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-700'; return <div className={`rounded-2xl border p-4 ${styles}`}><div className="font-semibold">{title}</div><p className="mt-1 text-sm">{body}</p></div> }
