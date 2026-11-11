import { AlertTriangle, CheckCircle2, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'
import { parseArtFieldImport } from '../lib/artFieldImport'
import { useSession } from '../session/useSession'
import type { ArtFieldImportResult, ArtFieldImportRow } from '../types'

const STATUS_LABELS: Record<string, string> = {
  PADAN: 'Padan',
  IC_TIDAK_SAH: 'IC tidak sah',
  BIDANG_TIDAK_SAH: 'Bidang tidak sah',
  IC_BERGANDA_DALAM_FAIL: 'IC berganda dalam fail',
  IC_BERGANDA_DALAM_EDUTRACK: 'IC berganda dalam EduTrack',
  TIADA_PADANAN_MURID: 'Tiada padanan murid',
  TIADA_ENROLMEN_AKTIF_ATAU_MURID_PINDAH: 'Tiada enrolmen aktif / murid pindah',
  ENROLMEN_AKTIF_BERGANDA: 'Enrolmen aktif berganda',
  NAMA_TIDAK_SEPADAN: 'Nama tidak sepadan',
  KELAS_TIDAK_SEPADAN: 'Kelas tidak sepadan',
}

export function AdminArtFieldsPage() {
  const { data } = useSession()
  const [year, setYear] = useState(data?.current_academic_year || new Date().getFullYear())
  const [rows, setRows] = useState<ArtFieldImportRow[]>([])
  const [fileName, setFileName] = useState('')
  const [report, setReport] = useState<ArtFieldImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const exceptions = useMemo(
    () => report?.rows.filter((row) => row.status !== 'PADAN') || [],
    [report]
  )

  const handleFile = async (file?: File) => {
    setError('')
    setReport(null)
    setRows([])
    setFileName('')
    if (!file) return
    if (file.size > 1_500_000) {
      setError('Fail terlalu besar. Had maksimum ialah 1.5 MB.')
      return
    }
    try {
      const parsed = parseArtFieldImport(await file.text())
      if (parsed.length > 1000) throw new Error('Fail mengandungi lebih daripada 1000 murid.')
      setRows(parsed)
      setFileName(file.name)
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'Fail tidak dapat dibaca.')
    }
  }

  const runImport = async (apply: boolean) => {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<ArtFieldImportResult>('import_art_fields', {
        academic_year: year,
        rows,
        apply,
      })
      setReport(result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Import tidak dapat diproses.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-brand-700">Pentadbiran murid</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Bidang seni murid</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Semak padanan berdasarkan IC tanpa sengkang. Sistem tidak memaparkan IC penuh dan hanya mengemas kini murid SSeMJ yang mempunyai nama serta kelas aktif yang sepadan.
        </p>
      </div>

      <section className="card p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <div>
            <label className="field-label" htmlFor="art-year">Tahun akademik</label>
            <select id="art-year" className="field" value={year} onChange={(event) => { setYear(Number(event.target.value)); setReport(null) }}>
              {(data?.academic_years || [year]).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="art-file">Fail CSV bidang seni</label>
            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800 hover:bg-brand-100" htmlFor="art-file">
              <Upload className="h-5 w-5" />
              {fileName || 'Pilih fail CSV'}
            </label>
            <input id="art-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} />
          </div>
        </div>
        {rows.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><FileSpreadsheet className="h-5 w-5 text-brand-700" />{rows.length} rekod sedia untuk disemak</div>
            <button type="button" className="btn-primary" disabled={loading} onClick={() => void runImport(false)}>{loading && <LoaderCircle className="h-5 w-5 animate-spin" />}Semak padanan</button>
          </div>
        )}
      </section>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {report && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dalam fail</div><div className="mt-2 text-2xl font-bold text-slate-950">{report.source_count}</div></div>
            <div className="card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Padan</div><div className="mt-2 text-2xl font-bold text-emerald-700">{report.matched_count}</div></div>
            <div className="card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pengecualian</div><div className="mt-2 text-2xl font-bold text-amber-700">{report.exception_count}</div></div>
            <div className="card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dikemas kini</div><div className="mt-2 text-2xl font-bold text-brand-800">{report.updated_count}</div></div>
          </section>

          {report.applied ? (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" /><div><div className="font-bold">Kemas kini selesai</div><p className="mt-1 text-sm leading-6">{report.updated_count} rekod diubah. Baris pengecualian tidak disentuh.</p></div></div>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="font-bold text-brand-950">Pratonton selesai</div><p className="mt-1 text-sm leading-6 text-brand-800">Hanya {report.matched_count} baris berstatus Padan akan diproses. {report.exception_count} pengecualian akan dikekalkan tanpa perubahan.</p></div>
              <button type="button" className="btn-primary shrink-0" disabled={loading || report.matched_count === 0} onClick={() => void runImport(true)}>{loading && <LoaderCircle className="h-5 w-5 animate-spin" />}Kemas kini rekod padan</button>
            </div>
          )}

          <section className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4"><AlertTriangle className="h-5 w-5 text-amber-600" /><div><h2 className="font-bold text-slate-950">Pengecualian</h2><p className="mt-1 text-xs text-slate-500">IC tidak dipaparkan. Gunakan nama dan kelas untuk semakan.</p></div></div>
            {exceptions.length === 0 ? <div className="px-5 py-10 text-center text-sm text-emerald-700">Tiada pengecualian.</div> : <div className="divide-y divide-slate-100">{exceptions.map((row, index) => <div key={`${row.document_row}-${index}`} className="grid gap-2 px-5 py-4 text-sm md:grid-cols-[1.4fr_1fr_1fr]"><div><div className="font-semibold text-slate-900">{row.student_name}</div><div className="mt-1 text-xs text-slate-500">Dokumen: {row.document_class}</div></div><div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{STATUS_LABELS[row.status] || row.status}</span></div><div className="text-xs text-slate-500">{row.edutrack_name ? `EduTrack: ${row.edutrack_name} · ${row.edutrack_class || 'tiada kelas aktif'}` : 'Tiada rekod EduTrack sepadan'}</div></div>)}</div>}
          </section>
        </>
      )}
    </div>
  )
}
