import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function StudentsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)


  import { useEffect, useMemo, useState } from 'react'
  import { supabase } from '../lib/supabaseClient'
  import { useNavigate } from 'react-router-dom'

  export default function StudentsPage() {
    const navigate = useNavigate()

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    import { useEffect, useMemo, useState } from 'react'
    import { supabase } from '../lib/supabaseClient'
    import { useNavigate } from 'react-router-dom'

    export default function StudentsPage() {
      const navigate = useNavigate()

      const [loading, setLoading] = useState(true)
      const [saving, setSaving] = useState(false)

      const [profile, setProfile] = useState(null)
      const [school, setSchool] = useState(null)
      const [setupConfig, setSetupConfig] = useState(null)

      const [classes, setClasses] = useState([])
      const [enrollments, setEnrollments] = useState([])

      const [search, setSearch] = useState('')
      const [gradeFilter, setGradeFilter] = useState('Semua')
      const [classFilter, setClassFilter] = useState('Semua')

      const [form, setForm] = useState({
        full_name: '',
        ic_number: '',
        gender: '',
        tingkatan: '',
        class_id: '',
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
          navigate('/school-admin', { replace: true })
          return
        }

        setClasses(classData || [])

        const activeGrades = configData.active_grade_labels || []
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
            is_active,
            student_profile_id,
            class_id,
            student_profiles (
              id,
              ic_number,
              full_name,
              gender
            ),
            classes (
              id,
              tingkatan,
              class_name
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

        setEnrollments(data || [])
      }

      const availableClassesForForm = useMemo(() => {
        return classes.filter((c) => c.tingkatan === form.tingkatan)
      }, [classes, form.tingkatan])

      const availableClassesForFilter = useMemo(() => {
        if (gradeFilter === 'Semua') return classes
        return classes.filter((c) => c.tingkatan === gradeFilter)
      }, [classes, gradeFilter])

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
        const confirmDelete = window.confirm('Padam pendaftaran murid ini untuk tahun semasa?')
        if (!confirmDelete) return

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

      const normalizedRows = useMemo(() => {
        return enrollments.map((item) => ({
          enrollment_id: item.id,
          academic_year: item.academic_year,
          status: item.is_active ? 'active' : 'inactive',
          student_profile_id: item.student_profiles?.id || '',
          full_name: item.student_profiles?.full_name || '-',
          ic_number: item.student_profiles?.ic_number || '-',
          gender: item.student_profiles?.gender || '-',
          tingkatan: item.classes?.tingkatan || '-',
          class_name: item.classes?.class_name || '-',
        }))
      }, [enrollments])

      const filteredStudents = useMemo(() => {
        const keyword = search.trim().toLowerCase()

        return normalizedRows.filter((row) => {
          const matchGrade =
            gradeFilter === 'Semua' ? true : row.tingkatan === gradeFilter

          const matchClass =
            classFilter === 'Semua' ? true : row.class_name === classFilter

          const matchSearch =
            !keyword ||
            row.full_name.toLowerCase().includes(keyword) ||
            row.ic_number.toLowerCase().includes(keyword) ||
            row.class_name.toLowerCase().includes(keyword)

          return matchGrade && matchClass && matchSearch
        })
      }, [normalizedRows, gradeFilter, classFilter, search])

      const groupedStudents = useMemo(() => {
        return (setupConfig?.active_grade_labels || []).map((grade) => ({
          grade,
          items: filteredStudents.filter((s) => s.tingkatan === grade),
        }))
      }, [setupConfig, filteredStudents])

      if (loading) {
        return <div className="p-6">Loading Student Module...</div>
      }

      return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-6">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-slate-500">
                Student Module
              </div>
              <h1 className="text-3xl font-bold text-slate-900">Urus Murid</h1>
              <p className="mt-2 text-slate-600">
                Data murid dibaca daripada student_profiles dan student_enrollments bagi tahun semasa.
              </p>

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
                  {(setupConfig?.active_grade_labels || []).map((label) => (
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
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-xl font-semibold text-slate-900">Senarai Murid</h2>

                <div className="flex flex-col gap-3 md:flex-row">
                  <select
                    value={gradeFilter}
                    onChange={(e) => {
                      setGradeFilter(e.target.value)
                      setClassFilter('Semua')
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="Semua">Semua Tingkatan</option>
                    {(setupConfig?.active_grade_labels || []).map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="Semua">Semua Kelas</option>
                    {availableClassesForFilter.map((item) => (
                      <option key={item.id} value={item.class_name}>
                        {item.class_name}
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
                {groupedStudents.map(({
                  grade, items
                }) => (
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
                              <th className="px-3 py-3 text-sm font-semibold text-slate-700">Jantina</th>
                              <th className="px-3 py-3 text-sm font-semibold text-slate-700">Kelas</th>
                              <th className="px-3 py-3 text-sm font-semibold text-slate-700">Status</th>
                              <th className="px-3 py-3 text-sm font-semibold text-slate-700">Tindakan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((row) => (
                              <tr key={row.enrollment_id} className="border-b">
                                <td className="px-3 py-3">{row.full_name}</td>
                                <td className="px-3 py-3">{row.ic_number}</td>
                                <td className="px-3 py-3">{row.gender}</td>
                                <td className="px-3 py-3">{row.class_name}</td>
                                <td className="px-3 py-3">{row.status}</td>
                                <td className="px-3 py-3">
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(row.enrollment_id)}
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
          </div>
        </div>
      </div>
    </div>
  )
}
