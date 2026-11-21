import { ArrowLeft, ArrowRight, ClipboardCheck, LoaderCircle, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { StudentSelector } from '../components/StudentSelector'
import { ApiError, apiRequest } from '../lib/api'
import { optionLabel, optionsByType } from '../lib/options'
import {
  applyBulkValue,
  calculateAchievementScore,
  contributionScore,
  CONTRIBUTIONS,
  suggestParticipation,
  calculateParticipationScore,
  PARTICIPATION_DESCRIPTIONS,
  setParticipantAchievement,
  setParticipantParticipation,
} from '../lib/pajskScoring'
import { useSession } from '../session/useSession'
import type { ActivityDraft, ParticipantDraft } from '../types'

const todayLocal = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

const steps = ['Maklumat aktiviti', 'Pilih murid', 'Penglibatan', 'Semak']

const ROLE_OPTIONS = [
  { value: 'PESERTA', label: 'Peserta' },
  { value: 'PELAKSANA', label: 'AJK pelaksana / petugas teknikal / persembahan selingan' },
  { value: 'LAWATAN', label: 'Peserta lawatan luar negara' },
  { value: 'PENONTON', label: 'Penyokong / penonton' },
]

export function ActivityWizardPage() {
  const { activityId } = useParams()
  const navigate = useNavigate()
  const { data } = useSession()
  const classifications = data?.classifications || []
  const componentOptions = optionsByType(classifications, 'component')
  const levelOptions = optionsByType(classifications, 'level')
  const participationOptions = optionsByType(classifications, 'participation_type')
  const contributionOptions = Object.entries(CONTRIBUTIONS)
  const achievementOptions = optionsByType(classifications, 'achievement_result')

  const [step, setStep] = useState(0)
  const [activity, setActivity] = useState<ActivityDraft>({
    activity_name: '',
    activity_date: todayLocal(),
    academic_year: data?.current_academic_year || new Date().getFullYear(),
    organiser: '',
    competition_category: '',
    activity_kind: '',
    program_type: '',
    program_mode: '',
    program_ranked: '',
    program_live: '',
    evidence_note: '',
    category: 'KOKURIKULUM',
    component: componentOptions[0]?.value || 'KELAB_PERSATUAN',
    level: levelOptions[0]?.value || 'SEKOLAH',
    teacher_in_charge: data?.access.display_name || '',
    evidence_url: '',
    remarks: '',
  })
  const [selected, setSelected] = useState<Record<string, ParticipantDraft>>({})
  const [legacy, setLegacy] = useState<{ category: string; level: string; contributions: Record<string, string> } | null>(null)
  const [showContribution, setShowContribution] = useState(false)
  const [pendingBulk, setPendingBulk] = useState<'role' | 'participation' | 'achievement' | 'contribution' | 'all' | null>(null)
  const [bulkRole, setBulkRole] = useState('')
  const [bulkParticipation, setBulkParticipation] = useState('')
  const [bulkContribution, setBulkContribution] = useState('')
  const [bulkAchievement, setBulkAchievement] = useState('TIADA')
  const [loading, setLoading] = useState(Boolean(activityId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const applicableComponentOptions = componentOptions.filter((option) =>
    activity.category === 'EKSTRA_KURIKULUM'
      ? option.value === 'EKSTRA_KURIKULUM'
      : option.value !== 'EKSTRA_KURIKULUM'
  )

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
          competition_category: String(row.competition_category || ''),
          activity_kind: String(row.activity_kind || ''),
          program_type: String(row.program_type || ''),
          program_mode: String(row.program_mode || ''),
          program_ranked: String(row.program_ranked || ''),
          program_live: String(row.program_live || ''),
          evidence_note: String(row.evidence_note || ''),
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
            participation_type: String(participant.participation_type || ''),
            participation_role: String(participant.participation_role || ''),
            contribution_type: String(participant.contribution_type || ''),
            achievement_result: String(participant.achievement_result || 'TIADA'),
            remarks: String(participant.remarks || ''),
          }
        })
        if (!row.activity_kind) setLegacy({ category: String(row.category || ''), level: String(row.level || ''), contributions: Object.fromEntries(result.participants.map((p) => [String(p.student_profile_id), String(p.contribution_type || '')])) })
        setShowContribution(result.participants.some((participant) => Boolean(participant.contribution_type)))
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

  const hasContributions = participants.some((participant) => Boolean(participant.contribution_type))

  const setField = <K extends keyof ActivityDraft>(key: K, value: ActivityDraft[K]) => {
    setActivity((current) => ({ ...current, [key]: value }))
  }

  const contributionReady = activity.category === 'KOKURIKULUM' && activity.level === 'SEKOLAH' && activity.activity_kind === 'UTAMA' && Boolean(`${activity.evidence_url} ${activity.evidence_note}`.trim())
  const isLegacyContribution = (participant: ParticipantDraft) => Boolean(legacy && !activity.activity_kind && activity.category === legacy.category && activity.level === legacy.level && participant.contribution_type && legacy.contributions[participant.student_profile_id] === participant.contribution_type)
  const isContributionValid = (participant: ParticipantDraft) => !participant.contribution_type || isLegacyContribution(participant) || contributionScore(activity.level, activity.category, activity.activity_kind, `${activity.evidence_url} ${activity.evidence_note}`, participant.contribution_type) !== null

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
    if ((step === 2 || step === 3) && participants.some((participant) => !isContributionValid(participant))) {
      setError('Khidmat sumbangan memerlukan aktiviti utama peringkat sekolah dan bukti. Semak kategori setiap murid.')
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

  type BulkField = 'role' | 'participation' | 'achievement' | 'contribution' | 'all'
  const applyBulk = (field: BulkField) => {
    setSelected((current) => applyBulkValue(current, (participant) => {
      if (field === 'role') return { ...participant, participation_role: bulkRole }
      if (field === 'participation') return setParticipantParticipation(participant, bulkParticipation)
      if (field === 'achievement') return setParticipantAchievement(participant, bulkAchievement)
      if (field === 'contribution') return { ...participant, contribution_type: bulkContribution }
      return { ...participant, participation_role: bulkRole || participant.participation_role, participation_type: bulkParticipation || participant.participation_type, achievement_result: bulkAchievement }
    }))
    setPendingBulk(null)
  }

  const requestBulk = (field: BulkField) => {
    const changed = (old: string, value: string) => Boolean(old && old !== value)
    const wouldOverwrite = participants.some((participant) => {
      if (field === 'role') return changed(participant.participation_role, bulkRole)
      if (field === 'participation') return changed(participant.participation_type, bulkParticipation)
      if (field === 'achievement') return participant.achievement_result !== 'TIADA' && changed(participant.achievement_result, bulkAchievement)
      if (field === 'contribution') return changed(participant.contribution_type, bulkContribution)
      return Boolean((bulkRole && changed(participant.participation_role, bulkRole)) ||
        (bulkParticipation && changed(participant.participation_type, bulkParticipation)) ||
        (participant.achievement_result !== 'TIADA' && changed(participant.achievement_result, bulkAchievement)))
    })
    if (wouldOverwrite) setPendingBulk(field)
    else applyBulk(field)
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
          participation_role: participant.participation_role || null,
          contribution_type: participant.contribution_type || null,
          achievement_result: participant.achievement_result,
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

      {error && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {step === 0 && (
        <section className="card p-5 sm:p-6">
          {activity.category === 'EKSTRA_KURIKULUM' && <p className="mb-4 text-sm text-amber-700">Rekod ekstra kurikulum sedia ada dikekalkan.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="field-label" htmlFor="activity-name">Nama Aktiviti *</label><input id="activity-name" className="field" value={activity.activity_name} onChange={(event) => setField('activity_name', event.target.value)} placeholder="Contoh: Pertandingan Inovasi STEM 2026" autoFocus /></div>
            <div><label className="field-label" htmlFor="component">Komponen PAJSK *</label><select id="component" className="field" value={activity.component} onChange={(event) => setField('component', event.target.value)}>{applicableComponentOptions.map((option) => <option key={option.value} value={option.value}>{option.value === 'PASUKAN_BADAN_BERUNIFORM' ? 'Unit Beruniform' : option.label}</option>)}</select></div>
            <div><label className="field-label" htmlFor="level">Peringkat *</label><select id="level" className="field" value={activity.level} onChange={(event) => setField('level', event.target.value)}>{levelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
            <div className="sm:col-span-2"><label className="field-label" htmlFor="competition-category">Kategori pertandingan (pilihan)</label><input id="competition-category" className="field" value={activity.competition_category} onChange={(event) => setField('competition_category', event.target.value)} placeholder="Contoh: Tarian Berkumpulan Sekolah Menengah" /></div>
          </div>
          <details className="mt-5 rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer font-semibold text-slate-800">Maklumat tambahan (pilihan)</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><label className="field-label" htmlFor="activity-kind">Aktiviti utama atau tambahan</label><select id="activity-kind" className="field" value={activity.activity_kind} onChange={(event) => setField('activity_kind', event.target.value)}><option value="">Belum ditentukan</option><option value="UTAMA">Aktiviti utama</option><option value="TAMBAHAN">Aktiviti tambahan</option></select></div>
              <div><label className="field-label" htmlFor="evidence">Pautan bukti / sijil</label><input id="evidence" type="url" className="field" value={activity.evidence_url} onChange={(event) => setField('evidence_url', event.target.value)} placeholder="https://..." /></div>
              <div><label className="field-label" htmlFor="evidence-note">Butiran bukti</label><input id="evidence-note" className="field" value={activity.evidence_note} onChange={(event) => setField('evidence_note', event.target.value)} placeholder="Contoh: sijil atau surat lantikan" /></div>
              <div><label className="field-label" htmlFor="activity-date">Tarikh</label><input id="activity-date" type="date" className="field" value={activity.activity_date} onChange={(event) => setField('activity_date', event.target.value)} /></div>
              <div><label className="field-label" htmlFor="academic-year">Tahun akademik</label><select id="academic-year" className="field" value={activity.academic_year} onChange={(event) => { setField('academic_year', Number(event.target.value)); setSelected({}) }} disabled={Boolean(activityId)}>{(data?.academic_years || [activity.academic_year]).map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
              <div><label className="field-label" htmlFor="organiser">Penganjur</label><input id="organiser" className="field" value={activity.organiser} onChange={(event) => setField('organiser', event.target.value)} /></div>
              <div><label className="field-label" htmlFor="teacher">Guru bertanggungjawab</label><input id="teacher" className="field" value={activity.teacher_in_charge} onChange={(event) => setField('teacher_in_charge', event.target.value)} /></div>
              <div className="sm:col-span-2"><label className="field-label" htmlFor="remarks">Catatan tambahan</label><textarea id="remarks" className="field min-h-24 resize-y" value={activity.remarks} onChange={(event) => setField('remarks', event.target.value)} /></div>
            </div>
          </details>
        </section>
      )}

      {step === 1 && (
        <section className="card p-4 sm:p-6">
          <StudentSelector academicYear={activity.academic_year} selected={selected} onChange={setSelected} />
        </section>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="font-bold text-slate-950">Tetapkan pilihan untuk semua murid secara berasingan</h2>
            <p className="mt-1 text-sm text-slate-600">Jenis penglibatan menerangkan peranan murid. Pencapaian ialah keputusan pertandingan dan tidak akan mengubah jenis penglibatan.</p>
            {activity.level === 'SEKOLAH' && activity.category === 'KOKURIKULUM' && <div className="mt-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showContribution} onChange={(event) => { if (!event.target.checked && hasContributions) { setError('Kosongkan pilihan Khidmat Sumbangan murid dahulu jika tidak mahu merekodkannya.'); return } setShowContribution(event.target.checked) }} /> Rekodkan Khidmat Sumbangan</label>{showContribution && !contributionReady && <div className="mt-3 grid gap-3 rounded-xl bg-amber-50 p-4 sm:grid-cols-2"><p className="sm:col-span-2 text-sm text-amber-900">Sahkan aktiviti utama dan berikan bukti sebelum memilih Khidmat Sumbangan.</p><div><label className="field-label" htmlFor="confirm-kind">Jenis aktiviti</label><select id="confirm-kind" className="field" value={activity.activity_kind} onChange={(event) => setField('activity_kind', event.target.value)}><option value="">Belum ditentukan</option><option value="UTAMA">Aktiviti utama</option><option value="TAMBAHAN">Aktiviti tambahan</option></select></div><div><label className="field-label" htmlFor="confirm-evidence">Butiran bukti</label><input id="confirm-evidence" className="field" value={activity.evidence_note} onChange={(event) => setField('evidence_note', event.target.value)} placeholder="Contoh: sijil atau surat lantikan" /></div></div>}</div>}
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div><label className="field-label" htmlFor="bulk-role">Peranan Murid</label><select id="bulk-role" className="field" value={bulkRole} onChange={(event) => { setPendingBulk(null); setBulkRole(event.target.value) }}><option value="">Pilih peranan</option>{ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" className="btn-secondary mt-2 w-full" onClick={() => requestBulk('role')} disabled={!bulkRole}>Gunakan peranan kepada semua</button></div>
              <div><label className="field-label" htmlFor="bulk-participation">Jenis Pelibatan</label><select id="bulk-participation" className="field" value={bulkParticipation} onChange={(event) => { setPendingBulk(null); setBulkParticipation(event.target.value) }} aria-label="Penglibatan pukal"><option value="">Pilih jenis penglibatan</option>{participationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}{activity.level === 'SEKOLAH' ? '' : ` (${calculateParticipationScore(activity.level, option.value) ?? '—'} markah)`}</option>)}</select><button type="button" className="btn-secondary mt-2 w-full" onClick={() => requestBulk('participation')} disabled={!bulkParticipation}>Gunakan kepada semua</button></div>
              <div><label className="field-label" htmlFor="bulk-achievement">Pencapaian</label><select id="bulk-achievement" className="field" value={bulkAchievement} onChange={(event) => { setPendingBulk(null); setBulkAchievement(event.target.value) }} aria-label="Pencapaian pukal">{achievementOptions.map((option) => <option key={option.value} value={option.value}>{option.value === 'TIADA' ? 'Tiada pencapaian' : option.label} ({calculateAchievementScore(activity.level, option.value) ?? '—'} markah)</option>)}</select><button type="button" className="btn-secondary mt-2 w-full" onClick={() => requestBulk('achievement')}>Gunakan kepada semua</button></div>
              {showContribution && contributionReady && <div><label className="field-label" htmlFor="bulk-contribution">Khidmat Sumbangan</label><select id="bulk-contribution" className="field" value={bulkContribution} onChange={(event) => { setPendingBulk(null); setBulkContribution(event.target.value) }} aria-label="Khidmat sumbangan pukal"><option value="">Tiada Khidmat Sumbangan</option>{contributionOptions.map(([value, option]) => <option key={value} value={value}>{option.label} ({option.score} markah)</option>)}</select><button type="button" className="btn-secondary mt-2 w-full" onClick={() => requestBulk('contribution')}>Gunakan kepada semua</button></div>}
            </div>
            {activity.level === 'SEKOLAH' && <p className="mt-3 text-sm text-slate-600">Markah Pelibatan I–III tidak diberikan melalui Jadual 6 bagi peringkat Sekolah. Khidmat Sumbangan boleh dinilai mengikut Jadual 8 jika memenuhi syarat.</p>}
            <button type="button" className="btn-secondary mt-3" onClick={() => requestBulk('all')} disabled={!bulkRole && !bulkParticipation}>Gunakan semua pilihan kepada semua murid</button>
            {pendingBulk && <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p>Pilihan ini akan menggantikan nilai individu yang telah ditetapkan. Teruskan?</p><div className="mt-2 flex gap-2"><button type="button" className="btn-secondary" onClick={() => applyBulk(pendingBulk)}>Ya, gantikan</button><button type="button" className="btn-secondary" onClick={() => setPendingBulk(null)}>Batal</button></div></div>}
            <p className="mt-3 text-xs text-slate-500">Setiap tindakan di atas hanya mengubah medan yang dinamakan untuk {participants.length} murid.</p>
            <p className="mt-1 text-xs text-slate-500">Khidmat sumbangan hanya untuk aktiviti utama peringkat sekolah dan memerlukan bukti. Rekod lama yang belum disahkan dikekalkan untuk semakan.</p>
          </section>

          <details className="card p-5"><summary className="cursor-pointer font-semibold text-slate-800">Panduan Jenis Pelibatan</summary><ul className="mt-3 space-y-2 text-sm text-slate-700">{participationOptions.map((option) => <li key={option.value}><strong>{option.label}:</strong> {PARTICIPATION_DESCRIPTIONS[option.value]}</li>)}</ul><p className="mt-2 text-sm text-slate-600">Isi hanya jika anda ingin menyemak syarat program. Guru tetap memilih Pelibatan secara manual.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><label className="field-label" htmlFor="program-type">Jenis program</label><select id="program-type" className="field" value={activity.program_type} onChange={(event) => setField('program_type', event.target.value)}><option value="">Belum ditentukan</option><option value="PERTANDINGAN">Pertandingan</option><option value="KEJOHANAN">Kejohanan</option><option value="PERKHEMAHAN">Perkhemahan</option><option value="KURSUS">Kursus</option><option value="KARNIVAL">Karnival</option><option value="LAIN">Lain-lain</option></select></div><div><label className="field-label" htmlFor="program-mode">Kaedah program</label><select id="program-mode" className="field" value={activity.program_mode} onChange={(event) => setField('program_mode', event.target.value)}><option value="">Belum ditentukan</option><option value="BERSEMUKA">Bersemuka</option><option value="DALAM_TALIAN">Dalam talian</option></select></div><div><label className="field-label" htmlFor="program-ranked">Ada pemeringkatan?</label><select id="program-ranked" className="field" value={activity.program_ranked} onChange={(event) => setField('program_ranked', event.target.value)}><option value="">Belum ditentukan</option><option value="YA">Ya</option><option value="TIDAK">Tidak</option></select></div>{activity.program_mode === 'DALAM_TALIAN' && <div><label className="field-label" htmlFor="program-live">Interaksi langsung?</label><select id="program-live" className="field" value={activity.program_live} onChange={(event) => setField('program_live', event.target.value)}><option value="">Belum ditentukan</option><option value="YA">Ya</option><option value="TIDAK">Tidak</option></select></div>}</div></details>

          <section className="space-y-3">
            {participants.map((participant, index) => (
              <article key={participant.student_profile_id} className="card p-5">
                <div className="flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-800">{index + 1}</div><div><h3 className="font-semibold text-slate-950">{participant.full_name}</h3><p className="mt-1 text-xs text-slate-500">{participant.form} · {participant.class_name}{participant.art_field ? ` · ${participant.art_field}` : ''}</p></div></div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div><label className="field-label" htmlFor={`role-${participant.student_profile_id}`}>Peranan</label><select id={`role-${participant.student_profile_id}`} className="field" value={participant.participation_role} onChange={(event) => updateParticipant(participant.student_profile_id, { participation_role: event.target.value })}><option value="">Belum ditentukan</option>{ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                  <div><label className="field-label" htmlFor={`participation-${participant.student_profile_id}`}>Jenis pelibatan *</label><select id={`participation-${participant.student_profile_id}`} className="field" value={participant.participation_type} onChange={(event) => setSelected((current) => ({ ...current, [participant.student_profile_id]: setParticipantParticipation(current[participant.student_profile_id], event.target.value) }))}><option value="">Pilih jenis penglibatan</option>{participationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}{activity.level === 'SEKOLAH' ? '' : ` (${calculateParticipationScore(activity.level, option.value) ?? '—'} markah)`}</option>)}</select>{participant.participation_type && activity.level !== 'SEKOLAH' && <p className="mt-1 text-xs leading-5 text-slate-500">Skor pelibatan: {calculateParticipationScore(activity.level, participant.participation_type) ?? '—'} / 20</p>}</div>
                  {participant.participation_type && suggestParticipation(activity.program_mode, activity.program_ranked, activity.program_live, participant.participation_role, activity.program_type) && suggestParticipation(activity.program_mode, activity.program_ranked, activity.program_live, participant.participation_role, activity.program_type) !== participant.participation_type && <p className="text-sm text-amber-700">Semak pilihan pelibatan berdasarkan kaedah, pemeringkatan, interaksi dan peranan. Guru boleh memilih secara manual.</p>}
                  {(showContribution || participant.contribution_type) && <div><label className="field-label" htmlFor={`contribution-${participant.student_profile_id}`}>Khidmat sumbangan</label><select id={`contribution-${participant.student_profile_id}`} className="field" value={participant.contribution_type} onChange={(event) => updateParticipant(participant.student_profile_id, { contribution_type: event.target.value })}><option value="">Tiada Khidmat Sumbangan</option>{participant.contribution_type && !CONTRIBUTIONS[participant.contribution_type] && <option value={participant.contribution_type}>Rekod lama: {participant.contribution_type} — perlu semakan</option>}{contributionReady && contributionOptions.map(([value, option]) => <option key={value} value={value}>{option.label} ({option.score} markah)</option>)}{!contributionReady && participant.contribution_type && CONTRIBUTIONS[participant.contribution_type] && <option value={participant.contribution_type}>Rekod lama: {CONTRIBUTIONS[participant.contribution_type].label}</option>}</select>{participant.contribution_type && CONTRIBUTIONS[participant.contribution_type] && <p className="mt-1 text-xs text-slate-500">{CONTRIBUTIONS[participant.contribution_type].description}</p>}{isLegacyContribution(participant) && <p className="mt-1 text-xs text-amber-700">Rekod lama dikekalkan; kelayakan dan bukti belum disahkan.</p>}</div>}
                  <div><label className="field-label" htmlFor={`achievement-${participant.student_profile_id}`}>Pencapaian *</label><select id={`achievement-${participant.student_profile_id}`} className="field" value={participant.achievement_result} onChange={(event) => setSelected((current) => ({ ...current, [participant.student_profile_id]: setParticipantAchievement(current[participant.student_profile_id], event.target.value) }))}>{achievementOptions.map((option) => <option key={option.value} value={option.value}>{option.value === 'TIADA' ? 'Tiada pencapaian' : option.label} ({calculateAchievementScore(activity.level, option.value) ?? '—'} markah)</option>)}</select><p className="mt-1 text-xs leading-5 text-slate-500">Skor pencapaian: {calculateAchievementScore(activity.level, participant.achievement_result) ?? '—'} / 20</p></div>
                  <div><label className="field-label" htmlFor={`remarks-${participant.student_profile_id}`}>Catatan</label><input id={`remarks-${participant.student_profile_id}`} className="field" value={participant.remarks} onChange={(event) => updateParticipant(participant.student_profile_id, { remarks: event.target.value })} /></div>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <section className="card p-5 sm:p-6"><h2 className="font-bold text-slate-950">Ringkasan aktiviti</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-slate-500">Aktiviti</dt><dd className="mt-1 font-semibold text-slate-900">{activity.activity_name}</dd></div><div><dt className="text-slate-500">Tarikh</dt><dd className="mt-1 font-semibold text-slate-900">{activity.activity_date}</dd></div><div><dt className="text-slate-500">Peringkat</dt><dd className="mt-1 font-semibold text-slate-900">{optionLabel(classifications, 'level', activity.level)}</dd></div><div><dt className="text-slate-500">Komponen</dt><dd className="mt-1 font-semibold text-slate-900">{optionLabel(classifications, 'component', activity.component)}</dd></div>{activity.competition_category && <div><dt className="text-slate-500">Kategori pertandingan</dt><dd className="mt-1 font-semibold text-slate-900">{activity.competition_category}</dd></div>}<div><dt className="text-slate-500">Guru</dt><dd className="mt-1 font-semibold text-slate-900">{activity.teacher_in_charge}</dd></div><div><dt className="text-slate-500">Jumlah murid</dt><dd className="mt-1 font-semibold text-slate-900">{participants.length}</dd></div></dl></section>
          <section className="card overflow-hidden"><div className="border-b border-slate-200 px-5 py-4 font-bold text-slate-950">Pratonton markah murid</div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-200"><th className="p-3">Nama murid</th><th className="p-3">Pelibatan</th><th className="p-3">Markah</th><th className="p-3">Pencapaian</th><th className="p-3">Markah</th>{hasContributions && <th className="p-3">Khidmat Sumbangan</th>}</tr></thead><tbody>{participants.map((participant) => <tr key={participant.student_profile_id} className="border-b border-slate-100"><td className="p-3 font-semibold">{participant.full_name}</td><td className="p-3">{optionLabel(classifications, 'participation_type', participant.participation_type)}</td><td className="p-3">{activity.level === 'SEKOLAH' ? '—' : calculateParticipationScore(activity.level, participant.participation_type) ?? '—'}</td><td className="p-3">{optionLabel(classifications, 'achievement_result', participant.achievement_result)}</td><td className="p-3">{calculateAchievementScore(activity.level, participant.achievement_result) ?? '—'}</td>{hasContributions && <td className="p-3">{participant.contribution_type ? (isLegacyContribution(participant) ? 'Rekod lama — belum disahkan' : `${CONTRIBUTIONS[participant.contribution_type]?.label || participant.contribution_type} (${contributionScore(activity.level, activity.category, activity.activity_kind, `${activity.evidence_url} ${activity.evidence_note}`, participant.contribution_type) ?? '—'} markah)`) : 'Tiada'}</td>}</tr>)}</tbody></table></div></section>
          <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm leading-6 text-brand-950">Skor penglibatan dan skor pencapaian dikira secara berasingan mengikut peringkat. Menukar salah satu tidak mengubah yang lain.</div>
        </div>
      )}

      <div className="sticky bottom-20 z-20 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-soft backdrop-blur md:bottom-4">
        <button type="button" className="btn-secondary" onClick={() => step === 0 ? navigate(-1) : setStep((current) => current - 1)}><ArrowLeft className="h-5 w-5" />{step === 0 ? 'Batal' : 'Kembali'}</button>
        {step < steps.length - 1 ? <button type="button" className="btn-primary" onClick={goNext}>Seterusnya <ArrowRight className="h-5 w-5" /></button> : <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : activityId ? <Save className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}{activityId ? 'Simpan perubahan' : 'Hantar rekod'}</button>}
      </div>
    </div>
  )
}
