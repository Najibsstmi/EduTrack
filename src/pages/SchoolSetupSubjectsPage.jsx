import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

const DEFAULT_SUBJECTS_BY_GRADE = {
  'Tingkatan 1': [
    { name: 'Bahasa Melayu', is_core: true },
    { name: 'Bahasa Inggeris', is_core: true },
    { name: 'Matematik', is_core: true },
    { name: 'Sains', is_core: true },
    { name: 'Sejarah', is_core: true },
    { name: 'Geografi', is_core: true },
    { name: 'Pendidikan Islam', is_core: true },
    { name: 'Pendidikan Moral', is_core: true },
    { name: 'Reka Bentuk dan Teknologi', is_core: false },
    { name: 'Pendidikan Seni Visual', is_core: false },
  ],
  'Tingkatan 2': [
    { name: 'Bahasa Melayu', is_core: true },
    { name: 'Bahasa Inggeris', is_core: true },
    { name: 'Matematik', is_core: true },
    { name: 'Sains', is_core: true },
    { name: 'Sejarah', is_core: true },
    { name: 'Geografi', is_core: true },
    { name: 'Pendidikan Islam', is_core: true },
    { name: 'Pendidikan Moral', is_core: true },
    { name: 'Reka Bentuk dan Teknologi', is_core: false },
    { name: 'Pendidikan Seni Visual', is_core: false },
  ],
  'Tingkatan 3': [
    { name: 'Bahasa Melayu', is_core: true },
    { name: 'Bahasa Inggeris', is_core: true },
    { name: 'Matematik', is_core: true },
    { name: 'Sains', is_core: true },
    { name: 'Sejarah', is_core: true },
    { name: 'Geografi', is_core: true },
    { name: 'Pendidikan Islam', is_core: true },
    { name: 'Pendidikan Moral', is_core: true },
    { name: 'Reka Bentuk dan Teknologi', is_core: false },
    { name: 'Pendidikan Seni Visual', is_core: false },
  ],
  'Tingkatan 4': [
    { name: 'Bahasa Melayu', is_core: true },
    { name: 'Bahasa Inggeris', is_core: true },
    { name: 'Matematik', is_core: true },
    { name: 'Sejarah', is_core: true },
    { name: 'Pendidikan Islam', is_core: true },
    { name: 'Pendidikan Moral', is_core: true },
    { name: 'Sains', is_core: false },
  ],
  'Tingkatan 5': [
    { name: 'Bahasa Melayu', is_core: true },
    { name: 'Bahasa Inggeris', is_core: true },
    { name: 'Matematik', is_core: true },
    { name: 'Sejarah', is_core: true },
    { name: 'Pendidikan Islam', is_core: true },
    { name: 'Pendidikan Moral', is_core: true },
    { name: 'Sains', is_core: false },
  ],
}

export default function SchoolSetupSubjectsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [subjects, setSubjects] = useState([])

  const [form, setForm] = useState({
    subject_name: '',
    subject_code: '',
    tingkatan: 'Tingkatan 1',
    is_core: false,
  })

  useEffect(() => {
    initPage()
  }, [])

  const initPage = async () => {
    setLoading(true)

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
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      alert('Profil pengguna tidak ditemui.')
      navigate('/login', { replace: true })
      return
    }

    setProfile(profileData)

    const { data: configData, error: configError } = await supabase
      .from('school_setup_configs')
      .select('*')
      .eq('school_id', profileData.school_id)
      .single()

    if (configError || !configData) {
      alert('School setup config tidak ditemui.')
      navigate('/dashboard', { replace: true })
      return
    }

    setSetupConfig(configData)

    const activeGrades = configData.active_grade_labels || []
    if (activeGrades.length > 0) {
      setForm((prev) => ({
        ...prev,
        tingkatan: activeGrades[0],
      }))
    }

    if (!configData.is_setup_complete) {
      await ensureDefaultSubjects(profileData.school_id, activeGrades)
    }

    await loadSubjects(profileData.school_id)

    setLoading(false)
  }

  const ensureDefaultSubjects = async (schoolId, activeGrades) => {
    const { data: existingSubjects, error } = await supabase
      .from('subjects')
      .select('id, tingkatan, subject_name')
      .eq('school_id', schoolId)

    if (error) {
      console.error(error)
      alert('Gagal semak subjek sedia ada.')
      return
    }

    const existingMap = new Set(
      (existingSubjects || []).map(
        (s) => `${s.tingkatan}-${s.subject_name}`
      )
    )

    const inserts = []

    for (const grade of activeGrades) {
      const defaults = DEFAULT_SUBJECTS_BY_GRADE[grade] || []

      for (const subject of defaults) {
        const key = `${grade}-${subject.name}`

        if (existingMap.has(key)) continue

        inserts.push({
          school_id: schoolId,
          subject_name: subject.name,
          subject_code: null,
          tingkatan: grade,
          is_core: !!subject.is_core,
          subject_type: subject.is_core ? 'core' : 'selective',
          is_default: true,
          is_active: true,
        })
      }
    }

    if (inserts.length === 0) return

    const { error: insertError } = await supabase
      .from('subjects')
      .insert(inserts)

    if (insertError) {
      console.error(insertError)
      alert(`Gagal auto tambah default subject: ${insertError.message}`)
    }
  }

  const loadSubjects = async (schoolId) => {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('school_id', schoolId)
      .order('tingkatan', { ascending: true })
      .order('subject_name', { ascending: true })

    if (error) {
      console.error(error)
      alert(`Gagal load subject: ${error.message}`)
      return
    }

    setSubjects(data || [])
  }

  const handleAdd = async () => {
    if (!profile?.school_id) return
    if (!form.subject_name.trim()) {
      alert('Nama subjek diperlukan.')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('subjects')
      .insert({
        school_id: profile.school_id,
        subject_name: form.subject_name.trim(),
        subject_code: form.subject_code.trim() || null,
        tingkatan: form.tingkatan,
        is_core: !!form.is_core,
        subject_type: form.is_core ? 'core' : 'selective',
        is_active: true,
      })

    if (error) {
      console.error(error)
      alert(`Gagal tambah subject: ${error.message}`)
      setSaving(false)
      return
    }

    setForm((prev) => ({
      ...prev,
      subject_name: '',
      subject_code: '',
      is_core: false,
    }))

    await loadSubjects(profile.school_id)
    setSaving(false)
  }

  const handleSetSubjectActive = async (subject, isActive) => {
    const actionLabel = isActive ? 'aktifkan semula' : 'nyahaktifkan'
    const confirmToggle = window.confirm(
      `Anda pasti mahu ${actionLabel} subjek "${subject.subject_name}"?`
    )
    if (!confirmToggle) return

    setSaving(true)

    const { error } = await supabase
      .from('subjects')
      .update({ is_active: isActive })
      .eq('id', subject.id)

    if (error) {
      console.error(error)
      alert(`Gagal ${actionLabel} subject: ${error.message}`)
      setSaving(false)
      return
    }

    await loadSubjects(profile.school_id)
    setSaving(false)
  }

  const handleDeleteSubject = async (subject) => {
    if (subject.is_default) {
      alert('Subjek default tidak boleh dipadam. Sila nyahaktifkan jika tidak digunakan.')
      return
    }

    const confirmDelete = window.confirm(
      `Padam subjek "${subject.subject_name}"? Tindakan ini tidak boleh dibuat asal.`
    )
    if (!confirmDelete) return

    setSaving(true)

    const { error } = await supabase
      .from('subjects')
      .delete()
      .eq('id', subject.id)

    if (error) {
      console.error(error)
      alert(`Gagal padam subject: ${error.message}`)
      setSaving(false)
      return
    }

    await loadSubjects(profile.school_id)
    setSaving(false)
  }

  const handleSetSubjectCore = async (subject, isCore) => {
    const actionLabel = isCore ? 'jadikan subjek teras' : 'jadikan subjek elektif'
    const confirmToggle = window.confirm(
      `Anda pasti mahu ${actionLabel} untuk "${subject.subject_name}"?`
    )
    if (!confirmToggle) return

    setSaving(true)

    const { error } = await supabase
      .from('subjects')
      .update({
        is_core: isCore,
        subject_type: isCore ? 'core' : 'selective',
      })
      .eq('id', subject.id)

    if (error) {
      console.error(error)
      alert(`Gagal ${actionLabel}: ${error.message}`)
      setSaving(false)
      return
    }

    await loadSubjects(profile.school_id)
    setSaving(false)
  }

  const handleNextStep = async () => {
    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('school_setup_configs')
      .update({
        setup_step: 4,
        updated_by: profile.id,
      })
      .eq('school_id', profile.school_id)

    if (error) {
      console.error(error)
      alert(`Gagal simpan tetapan subjek: ${error.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    navigate('/classes')
  }

  const getGradeOrder = (gradeLabel) => {
    const match = String(gradeLabel || '').match(/(\d+)/)
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
  }

  const groupedSubjects = [...(setupConfig?.active_grade_labels || [])]
    .sort((a, b) => getGradeOrder(a) - getGradeOrder(b))
    .map((grade) => ({
    grade,
    items: subjects.filter((s) => s.tingkatan === grade),
  }))

  if (loading) {
    return <div className="p-6">Loading Tetapan Subjek...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">EduTrack</p>
              <p className="text-lg font-bold text-slate-900">Tetapan Akademik Sekolah</p>
            </div>
            <div className="flex w-full gap-2 overflow-x-auto md:w-auto md:flex-wrap">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => navigate('/school-setup/grades')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                ← Tetapan Grade
              </button>
              <button
                type="button"
                onClick={() => navigate('/classes')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Tetapan Kelas →
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            Tetapan Sekolah — Langkah 4
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Tetapan Subjek</h1>
          <p className="mt-2 text-slate-600">
            Default subject akan dimasukkan secara automatik ikut tingkatan aktif.
            Admin masih boleh tambah subjek lain dan nyahaktifkan subjek default jika tidak digunakan.
          </p>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Tambah Subjek</h2>

          <div className="grid gap-4 md:grid-cols-4">
            <input
              type="text"
              placeholder="Nama Subjek"
              value={form.subject_name}
              onChange={(e) => setForm({ ...form, subject_name: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />

            <input
              type="text"
              placeholder="Kod (optional)"
              value={form.subject_code}
              onChange={(e) => setForm({ ...form, subject_code: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />

            <select
              value={form.tingkatan}
              onChange={(e) => setForm({ ...form, tingkatan: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              {(setupConfig?.active_grade_labels || []).map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
              <input
                type="checkbox"
                checked={form.is_core}
                onChange={(e) => setForm({ ...form, is_core: e.target.checked })}
              />
              <span>Subjek Teras</span>
            </label>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="rounded-xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Tambah'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Senarai Subjek</h2>

          <div className="space-y-6">
            {groupedSubjects.map(({ grade, items }) => (
              <div key={grade}>
                <h3 className="mb-3 text-lg font-semibold text-slate-800">{grade}</h3>

                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500">
                    Tiada subjek untuk {grade}.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed border-collapse">
                      <colgroup>
                        <col style={{ width: '40%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '20%' }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b bg-slate-50 text-left">
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Nama</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Kod</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Teras</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Status</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((s) => (
                          <tr key={s.id} className="border-b">
                            <td className="px-3 py-3 align-middle">{s.subject_name}</td>
                            <td className="px-3 py-3 align-middle">{s.subject_code || '-'}</td>
                            <td className="px-3 py-3 align-middle">
                              <button
                                type="button"
                                onClick={() => handleSetSubjectCore(s, !s.is_core)}
                                disabled={saving}
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${
                                  s.is_core
                                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                                    : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                                }`}
                                title={s.is_core ? 'Klik untuk jadikan elektif' : 'Klik untuk jadikan teras'}
                              >
                                {s.is_core ? 'Ya' : 'Tidak'}
                              </button>
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  s.is_active
                                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                    : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                                }`}
                              >
                                {s.is_active ? 'Aktif' : 'Tidak aktif'}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSetSubjectActive(s, !s.is_active)}
                                  disabled={saving}
                                  className={`rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                                    s.is_active
                                      ? 'bg-amber-600 hover:bg-amber-700'
                                      : 'bg-emerald-600 hover:bg-emerald-700'
                                  }`}
                                >
                                  {s.is_active ? 'Nyahaktif' : 'Aktifkan'}
                                </button>

                                {!s.is_default && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSubject(s)}
                                    disabled={saving}
                                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                                  >
                                    Padam
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleNextStep}
              disabled={saving}
              className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-100"
            >
              {saving ? 'Menyimpan...' : 'Tetapan Kelas →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
