import { ArrowLeft, ArrowRight, ClipboardCheck, LoaderCircle, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { StudentSelector } from '../components/StudentSelector'
import { ApiError, apiRequest } from '../lib/api'
import { optionLabel, optionsByType } from '../lib/options'
import { useSession } from '../session/useSession'
import type { ActivityDraft, ParticipantDraft } from '../types'

const todayLocal = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

const steps = ['Maklumat aktiviti', 'Pilih murid', 'Penglibatan', 'Semak']

export function ActivityWizardPage() {
  const { activityId } = useParams()
  const navigate = useNavigate()
  const { data } = useSession()
  const classifications = data?.classifications || []
  const categoryOptions = optionsByType(classifications, 'activity_category')
  const componentOptions = optionsByType(classifications, 'component')
  const levelOptions = optionsByType(classifications, 'level')
  const participationOptions = optionsByType(classifications, 'participation_type')
  const contributionOptions = optionsByType(classifications, 'contribution_type')
  const achievementOptions = optionsByType(classifications, 'achievement_result')

  const [step, setStep] = useState(0)
  const [activity, setActivity] = useState<ActivityDraft>({
    activity_name: '',
    activity_date: todayLocal(),
    academic_year: data?.current_academic_year || new Date().getFullYear(),
    organiser: '',
    category: categoryOptions[0]?.value || 'KOKURIKULUM',
    component: componentOptions[0]?.value || 'KELAB_PERSATUAN',
    level: levelOptions[0]?.value || 'SEKOLAH',
    teacher_in_charge: data?.access.display_name || '',
    evidence_url: '',
    remarks: '',
  })
  const [selected, setSelected] = useState<Record<string, ParticipantDraft>>({})
  const [bulkParticipation, setBulkParticipation] = useState('PENGLIBATAN_I')
  const [bulkContribution, setBulkContribution] = useState('')
  const [bulkAchievement, setBulkAchievement] = useState('TIADA')
  const [loading, setLoading] = useState(Boolean(activityId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activityId) return
    let active = true
    setLoading(true)
    apiRequest<{
      activity: Record<string, unknown>
      participants: Array<Record<string, unknown>>
    }>('activity_detail', { activity_id: activityId })
      .then((result) => {
        if (!active) return
        const row = result.activity
        setActivity({
          id: String(row.id),
          activity_name: String(row.activity_name || ''),
          activity_date: String(row.activity_date || ''),
          academic_year: Number(row.academic_year),
          organiser: String(row.organiser || ''),
          category: String(row.category || ''),
          component: String(row.component || ''),
          level: String(row.level || ''),
          teacher_in_charge: String(row.teacher_in_charge || ''),
          evidence_url: String(row.evidence_url || ''),
          remarks: String(row.remarks || ''),
        })
        const mapped: Record<string, ParticipantDraft> = {}
        result.participants.forEach((participant) => {
          const profileId = String(participant.student_profile_id)
          mapped[profileId] = {
            student_profile_id: profileId,
            student_enrollment_id: String(participant.student_enrollment_id),
            full_name: String(participant.student_name_snapshot || ''),
            academic_year: Number(row.academic_year),
            class_id: '',
            form: String(participant.form_snapshot || ''),
            class_name: String(participant.class_name_snapshot || ''),
            art_field: participant.art_field_snapshot ? String(participant.art_field_snapshot) : null,
            participation_type: String(participant.participation_type || 'PENGLIBATAN_I'),
            contribution_type: String(participant.contribution_type || ''),
            achievement_result: String(participant.achievement_result || 'TIADA'),
            achievement_note: String(participant.achievement_note || ''),
            remarks: String(participant.remarks || ''),
          }
        })
        setSelected(mapped)
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Aktiviti tidak dapat dimuatkan.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [activityId])

  const participants = useMemo(
    () => Object.values(selected).sort((a, b) => a.full_name.localeCompare(b.full_name, 'ms')),
    [selected]
  )

  const setField = <K extends keyof ActivityDraft>(key: K, value: ActivityDraft[K]) => {
    setActivity((current) => ({ ...current, [key]: value }))
  }

  const canContinue = () => {
    if (step === 0) {
      if (!activity.activity_name.trim() || !activity.activity_date || !activity.category || !activity.component || !activity.level) {
        setError('Lengkapkan semua maklumat wajib aktiviti.')
        return false
      }
    }
    if (step === 1 && participants.length === 0) {
      setError('Pilih sekurang-kurangnya seorang murid.')
      return false
    }
    if (step === 2 && participants.some((participant) => !participant.participation_type || !participant.achievement_result)) {
      setError('Lengkapkan jenis penglibatan dan pencapaian semua murid.')
      return false
    }
    setError('')
    return true
  }

  const goNext = () => {
    if (canContinue()) setStep((current) => Math.min(current + 1, steps.length - 1))
  }

  const applyBulk = () => {
    setSelected((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, participant]) => [
          key,
          {
            ...participant,
            participation_type: bulkParticipation,
            contribution_type: bulkContribution,
            achievement_result: bulkAchievement,
          },
        ])
      )
    )
  }

  const updateParticipant = (profileId: string, patch: Partial<ParticipantDraft>) => {
    setSelected((current) => ({
      ...current,
      [profileId]: { ...current[profileId], ...patch },
    }))
  }

  const save = async () => {
    if (!canContinue()) return
    setSaving(true)
    setError('')
    try {
      await apiRequest<{ activity_id: string }>('save_activity', {
        activity,
        participants: participants.map((participant) => ({
          student_profile_id: participant.student_profile_id,
          student_enrollment_id: participant.student_enrollment_id,
          participation_type: participant.participation_type,
          contribution_type: participant.contribution_type || null,
          achievement_result: participant.achievement_result,
          achievement_note: participant.achievement_note,
          remarks: participant.remarks,
        })),
      })
      navigate('/history', { replace: true })
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        setError('Aktiviti yang sama sudah wujud. Buka rekod tersebut daripada halaman Sejarah untuk membuat pembetulan.')
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Aktiviti tidak dapat disimpan.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><LoaderCircle className="h-7 w-7 animate-spin text-brand-700" /></div>

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-brand-700">{activityId ? 'Edit rekod' : 'Aktiviti baharu'}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{steps[step]}</h1>
      </div>

      <ol className="grid grid-cols-4 gap-2" aria-label="Kemajuan borang">
        {steps.map((label, index) => (
          <li key={label} className="min-w-0">
            <div className={`h-1.5 rounded-full ${index <= step ? 'bg-brand-700' : 'bg-slate-200'}`} />
            <div className={`mt-2 truncate text-[11px] font-semibold sm:text-xs ${index === step ? 'text-brand-800' : 'text-slate-500'}`}>{index + 1}. {label}</div>
          </li>
        ))}
      </ol>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {step === 0 && (
        <section className="card p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="field-label" htmlFor="activity-name">Nama aktiviti / program *</label><input id="activity-name" className="field" value={activity.activity_name} onChange={(event) => setField('activity_name', event.target.value)} placeholder="Contoh: Pertandingan Tarian Kreatif Negeri Johor" autoFocus /></div>
            <div><label className="field-label" htmlFor="activity-date">Tarikh *</label><input id="activity-date" type="date" className="field" value={activity.activity_date} onChange={(event) => setField('activity_date', event.target.value)} /></div>
            <div><label className="field-label" htmlFor="academic-year">Tahun akademik *</label><select id="academic-year" className="field" value={activity.academic_year} onChange={(event) => { setField('academic_year', Number(event.target.value)); setSelected({}) }} disabled={Boolean(activityId)}>{(data?.academic_years || [activity.academic_year]).map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
            <div><label className="field-label" htmlFor="organiser">Penganjur</label><input id="organiser" className="field" value={activity.organiser} onChange={(event) => setField('organiser', event.target.value)} /></div>
            <div><label className="field-label" htmlFor="teacher">Guru bertanggungjawab</label><input id="teacher" className="field" value={activity.teacher_in_charge} onChange={(event) => setField('teacher_in_charge', event.target.value)} /></div>
            <div><label className="field-label" htmlFor="category">Kategori *</label><select id="category" className="field" value={activity.category} onChange={(event) => setField('category', event.target.value)}>{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div><label className="field-label" htmlFor="component">Komponen PAJSK *</label><select id="component" className="field" value={activity.component} onChange={(event) => setField('component', event.target.value)}>{componentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div><label className="field-label" htmlFor="level">Peringkat *</label><select id="level" className="field" value={activity.level} onChange={(event) => setField('level', event.target.value)}>{levelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div><label className="field-label" htmlFor="evidence">Pautan bukti / sijil</label><input id="evidence" type="url" className="field" value={activity.evidence_url} onChange={(event) => setField('evidence_url', event.target.value)} placeholder="https://..." /></div>
            <div className="sm:col-span-2"><label className="field-label" htmlFor="remarks">Catatan tambahan</label><textarea id="remarks" className="field min-h-24 resize-y" value={activity.remarks} onChange={(event) => setField('remarks', event.target.value)} /></div>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="card p-4 sm:p-6">
          <StudentSelector academicYear={activity.academic_year} selected={selected} onChange={setSelected} defaultParticipationType={participationOptions[0]?.value || 'PENGLIBATAN_I'} />
        </section>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="font-bold text-slate-950">Terapkan maklumat sama kepada semua</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select className="field" value={bulkParticipation} onChange={(event) => setBulkParticipation(event.target.value)} aria-label="Penglibatan pukal">{participationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              <select className="field" value={bulkContribution} onChange={(event) => setBulkContribution(event.target.value)} aria-label="Khidmat sumbangan pukal"><option value="">Tiada khidmat khusus</option>{contributionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              <select className="field" value={bulkAchievement} onChange={(event) => setBulkAchievement(event.target.value)} aria-label="Pencapaian pukal">{achievementOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            </div>
            <button type="button" className="btn-secondary mt-3" onClick={applyBulk}>Terap kepada {participants.length} murid</button>
          </section>

          <section className="space-y-3">
            {participants.map((participant, index) => (
              <article key={participant.student_profile_id} className="card p-5">
                <div className="flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-800">{index + 1}</div><div><h3 className="font-semibold text-slate-950">{participant.full_name}</h3><p className="mt-1 text-xs text-slate-500">{participant.form} · {participant.class_name}{participant.art_field ? ` · ${participant.art_field}` : ''}</p></div></div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div><label className="field-label">Jenis penglibatan *</label><select className="field" value={participant.participation_type} onChange={(event) => updateParticipant(participant.student_profile_id, { participation_type: event.target.value })}>{participationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                  <div><label className="field-label">Khidmat sumbangan</label><select className="field" value={participant.contribution_type} onChange={(event) => updateParticipant(participant.student_profile_id, { contribution_type: event.target.value })}><option value="">Tiada / tidak berkenaan</option>{contributionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                  <div><label className="field-label">Pencapaian *</label><select className="field" value={participant.achievement_result} onChange={(event) => updateParticipant(participant.student_profile_id, { achievement_result: event.target.value })}>{achievementOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                  <div className="md:col-span-2"><label className="field-label">Butiran pencapaian</label><input className="field" value={participant.achievement_note} onChange={(event) => updateParticipant(participant.student_profile_id, { achievement_note: event.target.value })} placeholder="Contoh: Kategori berkumpulan sekolah menengah" /></div>
                  <div><label className="field-label">Catatan</label><input className="field" value={participant.remarks} onChange={(event) => updateParticipant(participant.student_profile_id, { remarks: event.target.value })} /></div>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <section className="card p-5 sm:p-6"><h2 className="font-bold text-slate-950">Ringkasan aktiviti</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-slate-500">Aktiviti</dt><dd className="mt-1 font-semibold text-slate-900">{activity.activity_name}</dd></div><div><dt className="text-slate-500">Tarikh</dt><dd className="mt-1 font-semibold text-slate-900">{activity.activity_date}</dd></div><div><dt className="text-slate-500">Peringkat</dt><dd className="mt-1 font-semibold text-slate-900">{optionLabel(classifications, 'level', activity.level)}</dd></div><div><dt className="text-slate-500">Komponen</dt><dd className="mt-1 font-semibold text-slate-900">{optionLabel(classifications, 'component', activity.component)}</dd></div><div><dt className="text-slate-500">Guru</dt><dd className="mt-1 font-semibold text-slate-900">{activity.teacher_in_charge}</dd></div><div><dt className="text-slate-500">Jumlah murid</dt><dd className="mt-1 font-semibold text-slate-900">{participants.length}</dd></div></dl></section>
          <section className="card overflow-hidden"><div className="border-b border-slate-200 px-5 py-4 font-bold text-slate-950">Murid dan pencapaian</div><div className="divide-y divide-slate-100">{participants.map((participant) => <div key={participant.student_profile_id} className="px-5 py-4"><div className="font-semibold text-slate-900">{participant.full_name}</div><div className="mt-1 text-xs text-slate-500">{optionLabel(classifications, 'participation_type', participant.participation_type)} · {optionLabel(classifications, 'achievement_result', participant.achievement_result)}{participant.achievement_note ? ` · ${participant.achievement_note}` : ''}</div></div>)}</div></section>
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">Rekod ini menyimpan penglibatan mentah. Markah PAJSK rasmi belum dikira dalam MVP.</div>
        </div>
      )}

      <div className="sticky bottom-20 z-20 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-soft backdrop-blur md:bottom-4">
        <button type="button" className="btn-secondary" onClick={() => step === 0 ? navigate(-1) : setStep((current) => current - 1)}><ArrowLeft className="h-5 w-5" />{step === 0 ? 'Batal' : 'Kembali'}</button>
        {step < steps.length - 1 ? <button type="button" className="btn-primary" onClick={goNext}>Seterusnya <ArrowRight className="h-5 w-5" /></button> : <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : activityId ? <Save className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}{activityId ? 'Simpan perubahan' : 'Hantar rekod'}</button>}
      </div>
    </div>
  )
}
