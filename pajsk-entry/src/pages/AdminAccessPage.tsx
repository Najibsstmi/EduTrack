import { Check, Copy, KeyRound, LoaderCircle, RefreshCw, UserPlus, UserX } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'
import type { AccessRole, TeacherAccessRow } from '../types'

export function AdminAccessPage() {
  const [rows, setRows] = useState<TeacherAccessRow[]>([])
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<AccessRole>('teacher')
  const [expiryDate, setExpiryDate] = useState('')
  const [generatedCode, setGeneratedCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<{ access_rows: TeacherAccessRow[] }>('list_access')
      setRows(result.access_rows)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Senarai akses tidak dapat dimuatkan.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createAccess = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await apiRequest<{ accessCode: string }>('create_access', {
        display_name: displayName,
        role,
        expires_at: expiryDate ? `${expiryDate}T23:59:59+08:00` : null,
      })
      setGeneratedCode(result.accessCode)
      setDisplayName('')
      setRole('teacher')
      setExpiryDate('')
      await load()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Kod akses tidak dapat dijana.')
    } finally {
      setSaving(false)
    }
  }

  const resetAccess = async (row: TeacherAccessRow) => {
    if (!window.confirm(`Tetapkan semula kod untuk ${row.display_name}? Semua sesi semasa akan ditamatkan.`)) return
    try {
      const result = await apiRequest<{ access_code: string }>('reset_access', { access_id: row.id })
      setGeneratedCode(result.access_code)
      await load()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Kod tidak dapat ditetapkan semula.')
    }
  }

  const revokeAccess = async (row: TeacherAccessRow) => {
    if (!window.confirm(`Batalkan akses ${row.display_name}?`)) return
    try {
      await apiRequest('revoke_access', { access_id: row.id })
      await load()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Akses tidak dapat dibatalkan.')
    }
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(generatedCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-slate-950">Kod akses guru</h1><p className="mt-1 text-sm text-slate-600">Jana, tetapkan semula atau batalkan kod tanpa menyimpan kod asal.</p></div>

      {generatedCode && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-sm font-semibold text-emerald-900">Kod baharu — salin sekarang</div>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="break-all font-mono text-xl font-bold tracking-wider text-emerald-950">{generatedCode}</div>
            <button type="button" className="btn-secondary shrink-0" onClick={copyCode}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Disalin' : 'Salin'}</button>
          </div>
          <button type="button" className="mt-3 text-xs font-semibold text-emerald-800 underline" onClick={() => setGeneratedCode('')}>Saya sudah menyimpan kod ini</button>
        </div>
      )}

      <form className="card p-5" onSubmit={createAccess}>
        <div className="flex items-center gap-2 font-bold text-slate-950"><UserPlus className="h-5 w-5 text-brand-700" /> Jana kod baharu</div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div><label className="field-label" htmlFor="teacher-name">Nama guru / paparan</label><input id="teacher-name" className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></div>
          <div><label className="field-label" htmlFor="teacher-role">Peranan</label><select id="teacher-role" className="field" value={role} onChange={(event) => setRole(event.target.value as AccessRole)}><option value="teacher">Guru</option><option value="viewer">Pembaca</option><option value="admin">Admin</option></select></div>
          <div><label className="field-label" htmlFor="teacher-expiry">Tarikh tamat (pilihan)</label><input id="teacher-expiry" type="date" className="field" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></div>
        </div>
        <button type="submit" className="btn-primary mt-4" disabled={saving}>{saving && <LoaderCircle className="h-5 w-5 animate-spin" />}Jana kod</button>
      </form>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-slate-950">Senarai akses</h2><p className="mt-1 text-xs text-slate-500">Kod penuh tidak pernah dipaparkan semula.</p></div><KeyRound className="h-5 w-5 text-slate-400" /></div>
        <div className="divide-y divide-slate-100">
          {loading && <div className="flex justify-center py-10"><LoaderCircle className="h-6 w-6 animate-spin text-brand-700" /></div>}
          {!loading && rows.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-500">Belum ada kod akses.</div>}
          {rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{row.display_name}</span><span className="chip capitalize">{row.role}</span>{!row.is_active && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">Dibatalkan</span>}</div><div className="mt-1 text-xs text-slate-500">{row.expires_at ? `Tamat: ${new Date(row.expires_at).toLocaleDateString('ms-MY')}` : 'Tiada tarikh tamat'} · {row.last_used_at ? `Digunakan ${new Date(row.last_used_at).toLocaleDateString('ms-MY')}` : 'Belum digunakan'}</div></div>
              <div className="flex gap-2"><button type="button" className="btn-secondary min-h-10 px-3 text-sm" onClick={() => void resetAccess(row)}><RefreshCw className="h-4 w-4" /> Tetap semula</button>{row.is_active && <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => void revokeAccess(row)}><UserX className="h-4 w-4" /> Batal</button>}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
