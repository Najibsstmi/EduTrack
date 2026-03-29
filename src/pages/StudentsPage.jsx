import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function StudentsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [students, setStudents] = useState([])

  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('Semua')

  const [form, setForm] = useState({
    full_name: '',
    ic_number: '',
    student_code: '',
    grade_label: '',
    class_name: '',
    gender: '',
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
        grade_label: activeGrades[0],
      }))
    }

    await loadStudents(profileData.school_id)
    setLoading(false)
  }

  const loadStudents = async (schoolId) => {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('school_id', schoolId)
      .order('grade_label', { ascending: true })
      .order('class_name', { ascending: true })
      .order('full_name', { ascending: true })

    if (error) {
      console.error(error)
      alert(`Gagal load murid: ${error.message}`)
      return
    }

    setStudents(data || [])
  }

  const handleAdd = async () => {
    if (!profile?.school_id) return

    if (!form.full_name.trim()) {
      alert('Nama murid diperlukan.')
      return
    }

    if (!form.grade_label) {
      alert('Sila pilih tingkatan / tahun.')
      return
    }

    if (!form.class_name.trim()) {
      alert('Nama kelas diperlukan.')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('students')
      .insert({
        school_id: profile.school_id,
        full_name: form.full_name.trim(),
        ic_number: form.ic_number.trim() || null,
        student_code: form.student_code.trim() || null,
        grade_label: form.grade_label,
        class_name: form.class_name.trim(),
        gender: form.gender || null,
        status: 'active',
        created_by: profile.id,
      })

    if (error) {
      console.error(error)
      alert(`Gagal tambah murid: ${error.message}`)
      setSaving(false)
      return
    }

    setForm((prev) => ({
      ...prev,
      full_name: '',
      ic_number: '',
      student_code: '',
      class_name: '',
      gender: '',
    }))

    await loadStudents(profile.school_id)
    setSaving(false)
  }

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm('Padam murid ini?')
    if (!confirmDelete) return

    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id)

    if (error) {
      console.error(error)
      alert(`Gagal padam murid: ${error.message}`)
      return
    }

    await loadStudents(profile.school_id)
  }

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchGrade =
        gradeFilter === 'Semua' ? true : s.grade_label === gradeFilter

      const keyword = search.trim().toLowerCase()
      const matchSearch =
        !keyword ||
        (s.full_name || '').toLowerCase().includes(keyword) ||
        (s.ic_number || '').toLowerCase().includes(keyword) ||
        (s.class_name || '').toLowerCase().includes(keyword)

      return matchGrade && matchSearch
    })
  }, [students, gradeFilter, search])

  const groupedStudents = (setupConfig?.active_grade_labels || []).map((grade) => ({
    grade,
    items: filteredStudents.filter((s) => s.grade_label === grade),
  }))

  if (loading) {
    return <div className="p-6">Loading Student Module...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            Student Module
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Urus Murid</h1>
          <p className="mt-2 text-slate-600">
            Tambah murid secara manual dahulu. Selepas ini kita boleh upgrade ke import Excel.
          </p>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Tambah Murid</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Nama penuh murid"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />

            <input
              type="text"
              placeholder="No IC / MyKid / Dokumen"
              value={form.ic_number}
              onChange={(e) => setForm({ ...form, ic_number: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />

            <input
              type="text"
              placeholder="No Daftar / Kod Murid (optional)"
              value={form.student_code}
              onChange={(e) => setForm({ ...form, student_code: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />

            <select
              value={form.grade_label}
              onChange={(e) => setForm({ ...form, grade_label: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              {(setupConfig?.active_grade_labels || []).map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Nama kelas"
              value={form.class_name}
              onChange={(e) => setForm({ ...form, class_name: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />

            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Jantina (optional)</option>
              <option value="Lelaki">Lelaki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="rounded-xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Tambah Murid'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Senarai Murid</h2>

            <div className="flex flex-col gap-3 md:flex-row">
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="Semua">Semua Tingkatan</option>
                {(setupConfig?.active_grade_labels || []).map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Cari nama / IC / kelas"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="space-y-6">
            {groupedStudents.map(({ grade, items }) => (
              <div key={grade}>
                <h3 className="mb-3 text-lg font-semibold text-slate-800">{grade}</h3>

                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500">
                    Tiada murid untuk {grade}.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b bg-slate-50 text-left">
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Nama</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">IC / Dokumen</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Kod</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Kelas</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Jantina</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Status</th>
                          <th className="px-3 py-3 text-sm font-semibold text-slate-700">Tindakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((s) => (
                          <tr key={s.id} className="border-b">
                            <td className="px-3 py-3">{s.full_name}</td>
                            <td className="px-3 py-3">{s.ic_number || '-'}</td>
                            <td className="px-3 py-3">{s.student_code || '-'}</td>
                            <td className="px-3 py-3">{s.class_name}</td>
                            <td className="px-3 py-3">{s.gender || '-'}</td>
                            <td className="px-3 py-3">{s.status}</td>
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
