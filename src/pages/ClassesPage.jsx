import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

const getTingkatanRank = (label) => {
  const match = String(label || '').match(/\d+/)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[0])
}

export default function ClassesPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [school, setSchool] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [classes, setClasses] = useState([])

  const [search, setSearch] = useState('')
  const [tingkatanFilter, setTingkatanFilter] = useState('Semua')

  const [form, setForm] = useState({
    tingkatan: '',
    class_name: '',
  })

  const orderedGrades = useMemo(() => {
    const labels = setupConfig?.active_grade_labels || []

    return [...labels].sort((a, b) => {
      const rankDiff = getTingkatanRank(a) - getTingkatanRank(b)
      if (rankDiff !== 0) return rankDiff
      return String(a).localeCompare(String(b), 'ms', { sensitivity: 'base' })
    })
  }, [setupConfig])

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

    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .select('id, school_name, school_code, level')
      .eq('id', profileData.school_id)
      .single()

    if (schoolError || !schoolData) {
      alert('Maklumat sekolah tidak ditemui.')
      navigate('/school-admin', { replace: true })
      return
    }

    setSchool(schoolData)

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

    const activeGrades = [...(configData.active_grade_labels || [])].sort((a, b) => {
      const rankDiff = getTingkatanRank(a) - getTingkatanRank(b)
      if (rankDiff !== 0) return rankDiff
      return String(a).localeCompare(String(b), 'ms', { sensitivity: 'base' })
    })

    if (activeGrades.length > 0) {
      setForm((prev) => ({
        ...prev,
        tingkatan: activeGrades[0],
      }))
    }

    await loadClasses(profileData.school_id)
    setLoading(false)
  }

  const loadClasses = async (schoolId) => {
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('school_id', schoolId)
      .order('tingkatan', { ascending: true })
      .order('class_name', { ascending: true })

    if (error) {
      console.error(error)
      alert(`Gagal load kelas: ${error.message}`)
      return
    }

    setClasses(data || [])
  }

  const handleAdd = async () => {
    if (!profile?.school_id || !school?.level || !setupConfig?.current_academic_year) {
      alert('Maklumat sekolah belum lengkap.')
      return
    }

    if (!form.tingkatan) {
      alert('Sila pilih tingkatan.')
      return
    }

    if (!form.class_name.trim()) {
      alert('Nama kelas diperlukan.')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('classes')
      .insert({
        school_id: profile.school_id,
        academic_year: setupConfig.current_academic_year,
        level: school.level,
        tingkatan: form.tingkatan,
        class_name: form.class_name.trim(),
        is_active: true,
      })

    if (error) {
      console.error(error)
      alert(`Gagal tambah kelas: ${error.message}`)
      setSaving(false)
      return
    }

    setForm((prev) => ({
      ...prev,
      class_name: '',
    }))

    await loadClasses(profile.school_id)
    setSaving(false)
  }

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm('Padam kelas ini?')
    if (!confirmDelete) return

    const { error } = await supabase
      .from('classes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error(error)
      alert(`Gagal padam kelas: ${error.message}`)
      return
    }

    await loadClasses(profile.school_id)
  }

  const filteredClasses = useMemo(() => {
    return classes.filter((item) => {
      const matchTingkatan =
        tingkatanFilter === 'Semua' ? true : item.tingkatan === tingkatanFilter

      const keyword = search.trim().toLowerCase()
      const matchSearch =
        !keyword ||
        (item.class_name || '').toLowerCase().includes(keyword) ||
        (item.tingkatan || '').toLowerCase().includes(keyword)

      return matchTingkatan && matchSearch
    })
  }, [classes, tingkatanFilter, search])

  const groupedClasses = orderedGrades.map((label) => ({
    tingkatan: label,
    items: filteredClasses.filter((c) => c.tingkatan === label),
  }))

  if (loading) {
    return <div className="p-6">Loading Class Module...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            Class Module
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Urus Kelas</h1>
          <p className="mt-2 text-slate-600">
            Tetapkan nama kelas bagi setiap tingkatan. Admin boleh tambah atau padam kelas pada bila-bila masa.
          </p>

          <div className="mt-4 space-y-1 text-sm text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">Sekolah:</span>{' '}
              {school?.school_name || '-'}
              {school?.school_code ? ` (${school.school_code})` : ''}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Level:</span>{' '}
              {school?.level || '-'}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Tahun Akademik:</span>{' '}
              {setupConfig?.current_academic_year || '-'}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Tambah Kelas</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <select
              value={form.tingkatan}
              onChange={(e) => setForm({ ...form, tingkatan: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              {orderedGrades.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Nama kelas (contoh: 1 Amanah / Inang)"
              value={form.class_name}
              onChange={(e) => setForm({ ...form, class_name: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />

            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="rounded-xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Tambah Kelas'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Senarai Kelas</h2>

            <div className="flex flex-col gap-3 md:flex-row">
              <select
                value={tingkatanFilter}
                onChange={(e) => setTingkatanFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="Semua">Semua Tingkatan</option>
                {orderedGrades.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Cari nama kelas"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="space-y-6">
            {groupedClasses.map(({ tingkatan, items }) => (
              <div key={tingkatan}>
                <h3 className="mb-3 text-lg font-semibold text-slate-800">{tingkatan}</h3>

                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500">
                    Tiada kelas untuk {tingkatan}.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b bg-slate-50 text-left">
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Nama Kelas</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Status</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id} className="border-b">
                            <td className="px-3 py-3">{item.class_name}</td>
                            <td className="px-3 py-3">{item.is_active ? 'Aktif' : 'Tidak aktif'}</td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
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
              onClick={() => navigate('/school-admin')}
              className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-100"
            >
              Kembali
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
