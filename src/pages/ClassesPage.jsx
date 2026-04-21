import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

const getTingkatanRank = (label) => {
  const match = String(label || '').match(/\d+/)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[0])
}

const normalizeText = (value = '') => String(value || '').trim()

const getDisplayLevel = (originalName, levelLabels = []) => {
  const found = levelLabels.find(
    (item) => normalizeText(item.original_name) === normalizeText(originalName)
  )
  return found?.display_name || originalName
}

export default function ClassesPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [school, setSchool] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [classes, setClasses] = useState([])
  const [levelLabels, setLevelLabels] = useState([])
  const [renameSaving, setRenameSaving] = useState(false)
  const [newLevelName, setNewLevelName] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')

  const [search, setSearch] = useState('')
  const [tingkatanFilter, setTingkatanFilter] = useState('Semua')

  const [form, setForm] = useState({
    tingkatan: '',
    class_name: '',
  })

  const orderedGrades = useMemo(() => {
    const mapped = levelLabels.map((item) => item.original_name)
    const fallback = setupConfig?.active_grade_labels || []
    const source = mapped.length > 0 ? mapped : fallback

    return [...source].sort((a, b) => {
      const rankDiff = getTingkatanRank(a) - getTingkatanRank(b)
      if (rankDiff !== 0) return rankDiff
      return String(a).localeCompare(String(b), 'ms', { numeric: true, sensitivity: 'base' })
    })
  }, [levelLabels, setupConfig])

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
      navigate('/dashboard', { replace: true })
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
      navigate('/dashboard', { replace: true })
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
    await loadLevelLabels(profileData.school_id, configData.current_academic_year)
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

  const loadLevelLabels = async (schoolId, academicYear) => {
    const { data, error } = await supabase
      .from('school_level_labels')
      .select('*')
      .eq('school_id', schoolId)
      .eq('academic_year', academicYear)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true })

    if (error) {
      console.error(error)
      alert(`Gagal load label tahap: ${error.message}`)
      return
    }

    setLevelLabels(data || [])
  }

  const handleDisplayNameChange = (originalName, nextDisplayName) => {
    setLevelLabels((prev) => {
      const matchIndex = prev.findIndex(
        (item) => normalizeText(item.original_name) === normalizeText(originalName)
      )

      if (matchIndex === -1) {
        return [
          ...prev,
          {
            id: null,
            original_name: originalName,
            display_name: nextDisplayName,
            sort_order: orderedGrades.indexOf(originalName) + 1,
            is_active: true,
            level: school?.level ?? null,
          },
        ]
      }

      return prev.map((item) =>
        normalizeText(item.original_name) === normalizeText(originalName)
          ? { ...item, display_name: nextDisplayName }
          : item
      )
    })
  }

  const handleSortOrderChange = (originalName, nextSortOrder) => {
    setLevelLabels((prev) => {
      const matchIndex = prev.findIndex(
        (item) => normalizeText(item.original_name) === normalizeText(originalName)
      )

      if (matchIndex === -1) {
        return [
          ...prev,
          {
            id: null,
            original_name: originalName,
            display_name: getDisplayLevel(originalName, prev),
            sort_order: nextSortOrder,
            is_active: true,
            level: school?.level ?? null,
          },
        ]
      }

      return prev.map((item) =>
        normalizeText(item.original_name) === normalizeText(originalName)
          ? { ...item, sort_order: nextSortOrder }
          : item
      )
    })
  }

  const handleSaveLevelLabels = async () => {
    if (!profile?.school_id || !setupConfig?.current_academic_year) return

    setRenameSaving(true)

    try {
      const payload = orderedGrades.map((originalName, index) => {
        const existing =
          levelLabels.find(
            (item) => normalizeText(item.original_name) === normalizeText(originalName)
          ) || null

        return {
          id: existing?.id || undefined,
          school_id: profile.school_id,
          academic_year: setupConfig.current_academic_year,
          level: existing?.level ?? school?.level ?? null,
          original_name: originalName,
          display_name: normalizeText(existing?.display_name) || originalName,
          sort_order: existing?.sort_order ?? index + 1,
          is_active: existing?.is_active ?? true,
        }
      })

      const { error } = await supabase
        .from('school_level_labels')
        .upsert(payload, { onConflict: 'id' })

      if (error) throw error

      await loadLevelLabels(profile.school_id, setupConfig.current_academic_year)
      alert('Nama paparan tahap berjaya dikemaskini.')
    } catch (err) {
      console.error(err)
      alert(`Gagal simpan rename tahap: ${err.message}`)
    } finally {
      setRenameSaving(false)
    }
  }

  const handleAddLevel = async () => {
    if (!newLevelName.trim()) {
      alert('Sila masukkan nama tahap')
      return
    }

    if (!profile?.school_id || !setupConfig?.current_academic_year) {
      alert('Maklumat sekolah belum lengkap.')
      return
    }

    const originalName = newLevelName.trim()
    const displayName = newDisplayName.trim() || originalName

    try {
      const exist = levelLabels.find(
        (item) => normalizeText(item.original_name) === normalizeText(originalName)
      )

      if (exist) {
        alert('Tahap ini sudah wujud')
        return
      }

      const nextOrder =
        levelLabels.length > 0
          ? Math.max(...levelLabels.map((x) => x.sort_order || 0)) + 1
          : 1

      const { error } = await supabase
        .from('school_level_labels')
        .insert({
          school_id: profile.school_id,
          academic_year: setupConfig.current_academic_year,
          level: school?.level ?? 'Menengah',
          original_name: originalName,
          display_name: displayName,
          sort_order: nextOrder,
          is_active: true,
        })

      if (error) throw error

      await loadLevelLabels(profile.school_id, setupConfig.current_academic_year)

      setNewLevelName('')
      setNewDisplayName('')

      alert('Tahap berjaya ditambah. Sila tambah kelas, subjek dan peperiksaan.')
    } catch (err) {
      console.error(err)
      alert(`Gagal tambah tahap: ${err.message}`)
    }
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

  const handleCompleteSetup = async () => {
    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('school_setup_configs')
      .update({
        setup_step: 5,
        is_setup_complete: true,
        updated_by: profile.id,
      })
      .eq('school_id', profile.school_id)

    if (error) {
      console.error(error)
      alert(`Gagal lengkapkan tetapan kelas: ${error.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    navigate('/dashboard')
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
    return <div className="p-6">Loading Tetapan Kelas...</div>
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
                onClick={() => navigate('/school-setup/subjects')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                ← Tetapan Subjek
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            Tetapan Sekolah — Langkah 5
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Tetapan Kelas</h1>
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

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Rename Tahap</h2>
          <p className="mt-2 text-sm text-slate-600">
            Tukar nama paparan tahap untuk sekolah anda sahaja. Data asal dalam database tidak diubah.
          </p>

          <div className="mt-5 space-y-3">
            {orderedGrades.map((originalName, index) => {
              const mapping =
                levelLabels.find(
                  (item) => normalizeText(item.original_name) === normalizeText(originalName)
                ) || null

              return (
                <div
                  key={originalName}
                  className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[180px_1fr_120px]"
                >
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nama Asal
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">{originalName}</div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Nama Paparan
                    </label>
                    <input
                      type="text"
                      value={mapping?.display_name || originalName}
                      onChange={(e) => handleDisplayNameChange(originalName, e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="Contoh: Form 1"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Susunan
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={mapping?.sort_order ?? index + 1}
                      onChange={(e) => {
                        const nextValue = Number(e.target.value || index + 1)
                        handleSortOrderChange(originalName, nextValue)
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={handleSaveLevelLabels}
              disabled={renameSaving}
              className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {renameSaving ? 'Menyimpan...' : 'Simpan Rename Tahap'}
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Tambah Tahap Baru</h2>

          <p className="mt-2 text-sm text-slate-600">
            Contoh: Tingkatan 6. Selepas tambah, sila tambah kelas, subjek dan peperiksaan untuk tahap ini.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input
              type="text"
              placeholder="Contoh: Tingkatan 6"
              value={newLevelName}
              onChange={(e) => setNewLevelName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />

            <input
              type="text"
              placeholder="Nama Paparan (optional)"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />

            <button
              type="button"
              onClick={handleAddLevel}
              className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              Tambah Tahap
            </button>
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
                  {getDisplayLevel(label, levelLabels)}
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
                    {getDisplayLevel(label, levelLabels)}
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
                <h3 className="mb-3 text-lg font-semibold text-slate-800">
                  {getDisplayLevel(tingkatan, levelLabels)}
                </h3>

                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500">
                    Tiada kelas untuk {getDisplayLevel(tingkatan, levelLabels)}.
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
