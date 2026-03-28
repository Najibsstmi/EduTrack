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
      navigate('/school-admin', { replace: true })
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

    await ensureDefaultSubjects(profileData.school_id, activeGrades)
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

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm('Padam subjek ini?')
    if (!confirmDelete) return

    const { error } = await supabase
      .from('subjects')
      .delete()
      .eq('id', id)

    if (error) {
      console.error(error)
      alert(`Gagal padam subject: ${error.message}`)
      return
    }

    await loadSubjects(profile.school_id)
  }

  const handleCompleteSetup = async () => {
    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('school_setup_configs')
      .update({
        setup_step: 4,
        is_setup_complete: true,
        updated_by: profile.id,
      })
      .eq('school_id', profile.school_id)

    if (error) {
      console.error(error)
      alert(`Gagal lengkapkan setup: ${error.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    navigate('/school-admin')
  }

  const groupedSubjects = (setupConfig?.active_grade_labels || []).map((grade) => ({
    grade,
    items: subjects.filter((s) => s.tingkatan === grade),
  }))

  if (loading) {
    return <div className="p-6">Loading Subject Setup...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            School Setup Wizard — Step 4
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Setup Subjek</h1>
          <p className="mt-2 text-slate-600">
            Default subject akan dimasukkan secara automatik ikut tingkatan aktif.
            Admin masih boleh tambah subjek lain atau padam subject default.
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
                    <table className="min-w-full border-collapse">
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
                            <td className="px-3 py-3">{s.subject_name}</td>
                            <td className="px-3 py-3">{s.subject_code || '-'}</td>
                            <td className="px-3 py-3">{s.is_core ? 'Ya' : 'Tidak'}</td>
                            <td className="px-3 py-3">{s.is_active ? 'Aktif' : 'Tidak aktif'}</td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                onClick={() => handleDelete(s.id)}
                                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                              >
                                Padam
                              </button>
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
              onClick={handleCompleteSetup}
              disabled={saving}
              className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-100"
            >
              {saving ? 'Menyimpan...' : 'Selesai'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
