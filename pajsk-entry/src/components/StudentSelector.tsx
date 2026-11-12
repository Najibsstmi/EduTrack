import { Check, Search, UserRoundCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'
import { useSession } from '../session/useSession'
import type { ParticipantDraft, StudentOption } from '../types'

const ART_FIELDS = ['Seni Tari', 'Seni Muzik', 'Seni Teater', 'Seni Visual']

interface StudentSelectorProps {
  academicYear: number
  selected: Record<string, ParticipantDraft>
  onChange: (next: Record<string, ParticipantDraft>) => void
}

export function StudentSelector({
  academicYear,
  selected,
  onChange,
}: StudentSelectorProps) {
  const { data } = useSession()
  const [query, setQuery] = useState('')
  const [form, setForm] = useState('')
  const [classId, setClassId] = useState('')
  const [artField, setArtField] = useState('')
  const [students, setStudents] = useState<StudentOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const yearClasses = useMemo(
    () => (data?.classes || []).filter((row) => row.academic_year === academicYear),
    [academicYear, data?.classes]
  )
  const forms = useMemo(
    () => [...new Set(yearClasses.map((row) => row.form))].sort((a, b) => a.localeCompare(b, 'ms', { numeric: true })),
    [yearClasses]
  )
  const filteredClasses = useMemo(
    () => yearClasses.filter((row) => !form || row.form === form),
    [form, yearClasses]
  )

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const result = await apiRequest<{ students: StudentOption[] }>('search_students', {
          academic_year: academicYear,
          query,
          form,
          class_id: classId,
          art_field: artField,
        })
        if (active) setStudents(result.students)
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : 'Carian murid gagal.')
          setStudents([])
        }
      } finally {
        if (active) setLoading(false)
      }
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [academicYear, artField, classId, form, query])

  const buildParticipant = (student: StudentOption): ParticipantDraft => ({
    ...student,
    participation_type: '',
    contribution_type: '',
    achievement_result: 'TIADA',
    remarks: '',
  })

  const toggleStudent = (student: StudentOption) => {
    const next = { ...selected }
    if (next[student.student_profile_id]) delete next[student.student_profile_id]
    else next[student.student_profile_id] = buildParticipant(student)
    onChange(next)
  }

  const allVisibleSelected = students.length > 0 && students.every((student) => selected[student.student_profile_id])
  const toggleAllVisible = () => {
    const next = { ...selected }
    students.forEach((student) => {
      if (allVisibleSelected) delete next[student.student_profile_id]
      else if (!next[student.student_profile_id]) next[student.student_profile_id] = buildParticipant(student)
    })
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative sm:col-span-2 xl:col-span-1">
          <label className="field-label" htmlFor="student-search">Cari nama</label>
          <Search className="pointer-events-none absolute bottom-3.5 left-3.5 h-5 w-5 text-slate-400" />
          <input
            id="student-search"
            className="field pl-11"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Contoh: Alya"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="form-filter">Tingkatan</label>
          <select
            id="form-filter"
            className="field"
            value={form}
            onChange={(event) => {
              setForm(event.target.value)
              setClassId('')
            }}
          >
            <option value="">Semua tingkatan</option>
            {forms.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="class-filter">Kelas</label>
          <select id="class-filter" className="field" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Semua kelas</option>
            {filteredClasses.map((row) => <option key={row.id} value={row.id}>{row.class_name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="art-filter">Bidang seni</label>
          <select id="art-filter" className="field" value={artField} onChange={(event) => setArtField(event.target.value)}>
            <option value="">Semua bidang</option>
            {ART_FIELDS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-900">
          <UserRoundCheck className="h-5 w-5" />
          {Object.keys(selected).length} murid dipilih
        </div>
        <button type="button" className="text-sm font-bold text-brand-800 hover:underline" onClick={toggleAllVisible} disabled={students.length === 0}>
          {allVisibleSelected ? 'Nyahpilih paparan' : `Pilih semua paparan (${students.length})`}
        </button>
      </div>

      {Object.keys(selected).length > 0 && (
        <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
          {Object.values(selected).map((student) => (
            <button
              key={student.student_profile_id}
              type="button"
              className="chip max-w-full text-left hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                const next = { ...selected }
                delete next[student.student_profile_id]
                onChange(next)
              }}
              title={`Keluarkan ${student.full_name}`}
            >
              <span className="truncate">{student.full_name}</span><X className="h-3.5 w-3.5 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="font-semibold text-slate-900">Cadangan murid</div>
          <div className="text-xs text-slate-500">{loading ? 'Mencari...' : `${students.length} ditemui`}</div>
        </div>
        <div className="max-h-[430px] divide-y divide-slate-100 overflow-y-auto">
          {!loading && students.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-500">Tiada murid sepadan dengan penapis.</div>}
          {students.map((student) => {
            const checked = Boolean(selected[student.student_profile_id])
            return (
              <button
                key={student.student_profile_id}
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${checked ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                onClick={() => toggleStudent(student)}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`}>
                  {checked && <Check className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{student.full_name}</span>
                  <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{student.form} · {student.class_name}</span>
                    {student.art_field && <span>· {student.art_field}</span>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
