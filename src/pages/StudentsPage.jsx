import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

const ChevronLeftIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
)

const TINGKATAN_ORDER = [
  'Tingkatan 1',
  'Tingkatan 2',
  'Tingkatan 3',
  'Tingkatan 4',
  'Tingkatan 5',
]

const getTingkatanRank = (tingkatan = '') => {
  const index = TINGKATAN_ORDER.indexOf(String(tingkatan).trim())
  return index === -1 ? 999 : index
}

const getGenderRank = (gender = '') => {
  const value = String(gender).trim().toUpperCase()
  if (value === 'LELAKI') return 1
  if (value === 'PEREMPUAN') return 2
  return 3
}

const normalizeCompareText = (value = '') => String(value || '').trim().toUpperCase()

export default function StudentsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [school, setSchool] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)

  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTingkatan, setSelectedTingkatan] = useState('Tingkatan 1')
  const [selectedClassFilter, setSelectedClassFilter] = useState('Semua Kelas')

  const [form, setForm] = useState({
    full_name: '',
    ic_number: '',
    gender: '',
    tingkatan: '',
    class_id: '',
  })

  const dashboardPath = profile?.role === 'master_admin' ? '/master-admin' : '/dashboard'

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

    const { data: classData, error: classError } = await supabase
      .from('classes')
      .select('id, tingkatan, class_name, is_active')
      .eq('school_id', profileData.school_id)
      .eq('academic_year', configData.current_academic_year)
      .eq('is_active', true)
      .order('tingkatan', { ascending: true })
      .order('class_name', { ascending: true })

    if (classError) {
      alert(`Gagal load kelas: ${classError.message}`)
      navigate('/dashboard', { replace: true })
      return
    }

    setClasses(classData || [])

    const activeGrades = [...(configData.active_grade_labels || [])].sort(
      (a, b) => getTingkatanRank(a) - getTingkatanRank(b)
    )

    if (activeGrades.length > 0) {
      const firstGrade = activeGrades[0]
      const firstClass = (classData || []).find((c) => c.tingkatan === firstGrade)

      setForm((prev) => ({
        ...prev,
        tingkatan: firstGrade,
        class_id: firstClass?.id || '',
      }))
    }

    await loadEnrollments(profileData.school_id, configData.current_academic_year)

    setLoading(false)
  }

  const loadEnrollments = async (schoolId, academicYear) => {
    const { data, error } = await supabase
      .from('student_enrollments')
      .select(`
        id,
        academic_year,
        class_id,
        student_profile_id,
        is_active,
        classes (
          id,
          tingkatan,
          class_name
        ),
        student_profiles (
          id,
          ic_number,
          full_name,
          gender
        )
      `)
      .eq('school_id', schoolId)
      .eq('academic_year', academicYear)
      .eq('is_active', true)
      .order('id', { ascending: true })

    if (error) {
      console.error(error)
      alert(`Gagal load murid: ${error.message}`)
      return
    }

    const mappedStudents = (data || []).map((row) => ({
      enrollment_id: row.id,
      id: row.student_profiles?.id,
      student_profile_id: row.student_profile_id,
      full_name: row.student_profiles?.full_name || '',
      ic_number: row.student_profiles?.ic_number || '',
      gender: row.student_profiles?.gender || '',
      tingkatan: row.classes?.tingkatan || '',
      class_name: row.classes?.class_name || '',
      status: 'active',
    }))

    setStudents(mappedStudents)
  }

  const availableClassesForForm = useMemo(() => {
    return classes.filter((c) => c.tingkatan === form.tingkatan)
  }, [classes, form.tingkatan])

  const availableTingkatan = useMemo(() => {
    const raw = [...new Set(classes.map((c) => c.tingkatan).filter(Boolean))]
    return raw.sort((a, b) => getTingkatanRank(a) - getTingkatanRank(b))
  }, [classes])

  const availableClassesForSelectedTingkatan = useMemo(() => {
    return classes
      .filter((c) => c.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        String(a.class_name || '').localeCompare(String(b.class_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [classes, selectedTingkatan])

  useEffect(() => {
    if (!selectedTingkatan && availableTingkatan.length > 0) {
      setSelectedTingkatan(availableTingkatan[0])
    }
  }, [availableTingkatan, selectedTingkatan])

  const handleGradeChange = (tingkatan) => {
    const matchedClass = classes.find((c) => c.tingkatan === tingkatan)

    setForm((prev) => ({
      ...prev,
      tingkatan,
      class_id: matchedClass?.id || '',
    }))
  }

  const handleAdd = async () => {
    if (!profile?.school_id || !setupConfig?.current_academic_year) {
      alert('Maklumat sekolah belum lengkap.')
      return
    }

    if (!form.full_name.trim()) {
      alert('Nama murid diperlukan.')
      return
    }

    if (!form.ic_number.trim()) {
      alert('No IC / MyKid / Dokumen diperlukan.')
      return
    }

    if (!form.tingkatan) {
      alert('Sila pilih tingkatan.')
      return
    }

    if (!form.class_id) {
      alert('Sila pilih kelas.')
      return
    }

    setSaving(true)

    try {
      let studentProfileId = null

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('student_profiles')
        .select('id, ic_number')
        .eq('school_id', profile.school_id)
        .eq('ic_number', form.ic_number.trim())
        .maybeSingle()

      if (existingProfileError) {
        throw existingProfileError
      }

      if (existingProfile?.id) {
        studentProfileId = existingProfile.id

        const { error: updateProfileError } = await supabase
          .from('student_profiles')
          .update({
            full_name: form.full_name.trim(),
            gender: form.gender || null,
          })
          .eq('id', studentProfileId)

        if (updateProfileError) {
          throw updateProfileError
        }
      } else {
        const { data: insertedProfile, error: insertProfileError } = await supabase
          .from('student_profiles')
          .insert({
            school_id: profile.school_id,
            ic_number: form.ic_number.trim(),
            full_name: form.full_name.trim(),
            gender: form.gender || null,
          })
          .select('id')
          .single()

        if (insertProfileError) {
          throw insertProfileError
        }

        studentProfileId = insertedProfile.id
      }

      const { data: existingEnrollment, error: existingEnrollmentError } = await supabase
        .from('student_enrollments')
        .select('id')
        .eq('school_id', profile.school_id)
        .eq('student_profile_id', studentProfileId)
        .eq('academic_year', setupConfig.current_academic_year)
        .maybeSingle()

      if (existingEnrollmentError) {
        throw existingEnrollmentError
      }

      if (existingEnrollment?.id) {
        const { error: updateEnrollmentError } = await supabase
          .from('student_enrollments')
          .update({
            class_id: form.class_id,
            is_active: true,
          })
          .eq('id', existingEnrollment.id)

        if (updateEnrollmentError) {
          throw updateEnrollmentError
        }
      } else {
        const { error: insertEnrollmentError } = await supabase
          .from('student_enrollments')
          .insert({
            school_id: profile.school_id,
            student_profile_id: studentProfileId,
            class_id: form.class_id,
            academic_year: setupConfig.current_academic_year,
            is_active: true,
          })

        if (insertEnrollmentError) {
          throw insertEnrollmentError
        }
      }

      setForm((prev) => ({
        ...prev,
        full_name: '',
        ic_number: '',
        gender: '',
      }))

      await loadEnrollments(profile.school_id, setupConfig.current_academic_year)
    } catch (err) {
      console.error(err)
      alert(`Gagal tambah murid: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (enrollmentId) => {
    const confirmed = window.confirm(
      'Adakah anda pasti mahu singkirkan murid ini daripada kelas semasa? Murid ini tidak akan muncul lagi dalam input markah, analisis, dan sasaran akademik semasa.'
    )
    if (!confirmed) return

    const { error } = await supabase
      .from('student_enrollments')
      .delete()
      .eq('id', enrollmentId)

    if (error) {
      console.error(error)
      alert(`Gagal padam murid: ${error.message}`)
      return
    }

    await loadEnrollments(profile.school_id, setupConfig.current_academic_year)
  }

  const filteredStudents = useMemo(() => {
    let result = [...students]

    const normalizedSelectedTingkatan = normalizeCompareText(selectedTingkatan)
    const normalizedSelectedClass = normalizeCompareText(selectedClassFilter)

    if (normalizedSelectedTingkatan) {
      result = result.filter(
        (student) => normalizeCompareText(student.tingkatan) === normalizedSelectedTingkatan
      )
    }

    if (
      normalizedSelectedClass &&
      normalizedSelectedClass !== normalizeCompareText('Semua Kelas')
    ) {
      result = result.filter(
        (student) => normalizeCompareText(student.class_name) === normalizedSelectedClass
      )
    }

    const keyword = String(searchTerm || '').trim().toLowerCase()
    if (keyword) {
      result = result.filter((student) => {
        const name = String(student.full_name || '').toLowerCase()
        const ic = String(student.ic_number || '').toLowerCase()
        const kelas = String(student.class_name || '').toLowerCase()

        return (
          name.includes(keyword) ||
          ic.includes(keyword) ||
          kelas.includes(keyword)
        )
      })
    }

    result.sort((a, b) => {
      const classCompare = String(a.class_name || '').localeCompare(
        String(b.class_name || ''),
        'ms',
        { sensitivity: 'base' }
      )
      if (classCompare !== 0) return classCompare

      const genderCompare = getGenderRank(a.gender) - getGenderRank(b.gender)
      if (genderCompare !== 0) return genderCompare

      return String(a.full_name || '').localeCompare(
        String(b.full_name || ''),
        'ms',
        { sensitivity: 'base' }
      )
    })

    return result
  }, [students, selectedTingkatan, selectedClassFilter, searchTerm])

  const handleDeleteStudent = (student) => {
    handleDelete(student.enrollment_id || student.id)
  }

  if (loading) {
    return <div className="p-6">Loading Student Module...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-500">
                Student Module
              </div>
              <h1 className="text-3xl font-bold text-slate-900">Urus Murid</h1>
              <p className="mt-2 text-slate-600">
                Data murid dibaca daripada student_profiles dan student_enrollments bagi tahun semasa.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              <ChevronLeftIcon />
              <span>Kembali Dashboard</span>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/students/import')}
              className="rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white hover:bg-emerald-700"
            >
              Import Murid CSV
            </button>
          </div>
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

            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Jantina (optional)</option>
              <option value="Lelaki">Lelaki</option>
              <option value="Perempuan">Perempuan</option>
            </select>

            <select
              value={form.tingkatan}
              onChange={(e) => handleGradeChange(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              {availableTingkatan.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={form.class_id}
              onChange={(e) => setForm({ ...form, class_id: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Pilih kelas</option>
              {availableClassesForForm.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.class_name}
                </option>
              ))}
            </select>

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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Senarai Murid</h2>
            <div className="text-sm text-slate-500">
              Jumlah murid: <strong>{filteredStudents.length}</strong>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <select
                value={selectedTingkatan}
                onChange={(e) => {
                  setSelectedTingkatan(e.target.value)
                  setSelectedClassFilter('Semua Kelas')
                }}
                className="rounded-xl border border-slate-300 px-4 py-2"
              >
                {availableTingkatan.map((tingkatan) => (
                  <option key={tingkatan} value={tingkatan}>
                    {tingkatan}
                  </option>
                ))}
              </select>

              <select
                value={selectedClassFilter}
                onChange={(e) => setSelectedClassFilter(e.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-2"
              >
                <option value="Semua Kelas">Semua Kelas</option>
                {availableClassesForSelectedTingkatan.map((item) => (
                  <option key={item.id} value={item.class_name}>
                    {item.class_name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Cari nama / IC / kelas"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <p className="mb-4 mt-2 text-[13px] text-slate-500">
            Murid yang disingkirkan tidak akan dipaparkan dalam input markah, analisis, dan sasaran akademik semasa.
          </p>

          <div className="mt-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">
              {selectedTingkatan}
            </h3>

            {filteredStudents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500">
                Tiada murid untuk {selectedTingkatan}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Bil
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Nama
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        IC / Dokumen
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Jantina
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Kelas
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Tindakan
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredStudents.map((student, index) => (
                      <tr key={student.enrollment_id} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-sm">{index + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">
                          {student.full_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {student.ic_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {student.gender}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {student.class_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {student.status || 'active'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => handleDeleteStudent(student)}
                            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                          >
                            Singkir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
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