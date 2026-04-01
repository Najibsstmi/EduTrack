import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function TargetsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [students, setStudents] = useState([])
  const [setupConfig, setSetupConfig] = useState(null)

  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')

  const [targetMap, setTargetMap] = useState({})

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      loadStudentsByClass(selectedClassId)
      loadExistingTargets(selectedClassId, selectedSubjectId)
    } else {
      setStudents([])
      setTargetMap({})
    }
  }, [selectedClassId, selectedSubjectId])

  useEffect(() => {
    setSelectedSubjectId('')
  }, [selectedClassId])

  const loadInitialData = async () => {
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

    const schoolId = profileData.school_id

    const [
      { data: classData, error: classError },
      { data: subjectData, error: subjectError },
      { data: setupData, error: setupError },
    ] = await Promise.all([
      supabase
        .from('classes')
        .select('*')
        .eq('school_id', schoolId)
        .order('class_name', { ascending: true }),

      supabase
        .from('subjects')
        .select('*')
        .eq('school_id', schoolId)
        .order('subject_name', { ascending: true }),

      supabase
        .from('school_setup_configs')
        .select('*')
        .eq('school_id', schoolId)
        .maybeSingle(),
    ])

    if (classError) {
      console.error(classError)
      alert('Gagal ambil senarai kelas')
    }

    if (subjectError) {
      console.error(subjectError)
      alert('Gagal ambil senarai subjek')
    }

    if (setupError) {
      console.error(setupError)
      alert('Gagal ambil konfigurasi setup sekolah')
    }

    setClasses(classData || [])
    setSubjects(subjectData || [])
    setSetupConfig(setupData || null)
    setLoading(false)
  }

  const loadStudentsByClass = async (classId) => {
    const { data, error } = await supabase
      .from('student_enrollments')
      .select(`
        id,
        class_id,
        student_profile_id,
        student_profiles (
          id,
          full_name,
          ic_number,
          gender
        )
      `)
      .eq('class_id', classId)

    if (error) {
      console.error(error)
      alert('Gagal ambil murid untuk kelas ini.')
      return
    }

    const mapped = (data || []).map((row) => ({
      enrollment_id: row.id,
      class_id: row.class_id,
      student_profile_id: row.student_profile_id,
      full_name: row.student_profiles?.full_name || '',
      ic_number: row.student_profiles?.ic_number || '',
      gender: row.student_profiles?.gender || '',
    }))

    setStudents(mapped)
  }

  const loadExistingTargets = async (classId, subjectId) => {
    if (!profile?.school_id || !classId || !subjectId) {
      setTargetMap({})
      return
    }

    const currentYear = new Date().getFullYear()

    const { data, error } = await supabase
      .from('student_targets')
      .select('*')
      .eq('school_id', profile.school_id)
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .eq('academic_year', currentYear)

    if (error) {
      console.error(error)
      alert('Gagal ambil data sasaran sedia ada.')
      return
    }

    const map = {}

    ;(data || []).forEach((row) => {
      const key = row.student_enrollment_id
      if (!map[key]) {
        map[key] = {
          TOV: '',
          ETR: '',
        }
      }

      if (row.target_key === 'TOV') {
        map[key].TOV = row.target_mark ?? ''
      }

      if (row.target_key === 'ETR') {
        map[key].ETR = row.target_mark ?? ''
      }
    })

    setTargetMap(map)
  }

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedClassId) || null,
    [classes, selectedClassId]
  )

  const selectedGradeLabel = selectedClass?.tingkatan || ''

  const examStructureForGrade =
    setupConfig?.exam_structure?.[selectedGradeLabel] || []

  const otrKeys = useMemo(() => {
    return examStructureForGrade
      .filter((item) => String(item.key).startsWith('OTR'))
      .map((item) => item.key)
  }, [examStructureForGrade])

  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const normalizeGender = (value) => String(value || '').trim().toUpperCase()

      const rank = (gender) => {
        if (gender === 'LELAKI') return 1
        if (gender === 'PEREMPUAN') return 2
        return 3
      }

      const genderCompare =
        rank(normalizeGender(a.gender)) - rank(normalizeGender(b.gender))

      if (genderCompare !== 0) return genderCompare

      return String(a.full_name || '').localeCompare(
        String(b.full_name || ''),
        'ms',
        { sensitivity: 'base' }
      )
    })
  }, [students])

  const filteredSubjectsByGrade = useMemo(() => {
    if (!selectedGradeLabel) return []

    return subjects.filter(
      (subject) => String(subject.tingkatan || '') === String(selectedGradeLabel)
    )
  }, [subjects, selectedGradeLabel])

  const uniqueSubjects = useMemo(() => {
    return filteredSubjectsByGrade.filter(
      (subject, index, arr) =>
        index ===
        arr.findIndex(
          (item) =>
            String(item.subject_name || '').trim().toLowerCase() ===
            String(subject.subject_name || '').trim().toLowerCase()
        )
    )
  }, [filteredSubjectsByGrade])

  const clampMark = (value) => {
    const num = Number(value)
    if (Number.isNaN(num)) return ''
    if (num < 0) return 0
    if (num > 100) return 100
    return num
  }

  const calculatePercent = (tov, etr) => {
    const start = Number(tov)
    const end = Number(etr)

    if (Number.isNaN(start) || Number.isNaN(end)) return ''
    if (start <= 0) return ''

    return Number((((end - start) / start) * 100).toFixed(1))
  }

  const calculateOTRs = (tov, etr, keys) => {
    const start = Number(tov)
    const end = Number(etr)

    if (Number.isNaN(start) || Number.isNaN(end)) return {}

    const count = keys.length
    if (!count) return {}

    const gap = end - start
    const result = {}

    keys.forEach((key, index) => {
      const i = index + 1
      const value = start + (gap * i) / (count + 1)
      result[key] = Number(clampMark(Number(value.toFixed(1))))
    })

    return result
  }

  const updateTargetValue = (studentEnrollmentId, field, value) => {
    setTargetMap((prev) => ({
      ...prev,
      [studentEnrollmentId]: {
        ...(prev[studentEnrollmentId] || {}),
        [field]: value,
      },
    }))
  }

  const saveTargets = async () => {
    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return
    }

    if (!selectedClassId || !selectedSubjectId) {
      alert('Sila pilih kelas dan subjek dahulu.')
      return
    }

    const currentYear = new Date().getFullYear()
    const rowsToUpsert = []

    sortedStudents.forEach((student) => {
      const values = targetMap[student.enrollment_id] || {}
      const tov = values.TOV
      const etr = values.ETR

      if (tov === '' && etr === '') return

      const safeTov = tov === '' ? null : clampMark(tov)
      const safeEtr = etr === '' ? null : clampMark(etr)
      const percent =
        safeTov !== null && safeEtr !== null
          ? calculatePercent(safeTov, safeEtr)
          : null

      if (safeTov !== null) {
        rowsToUpsert.push({
          school_id: profile.school_id,
          academic_year: currentYear,
          student_enrollment_id: student.enrollment_id,
          student_profile_id: student.student_profile_id,
          class_id: selectedClassId,
          subject_id: selectedSubjectId,
          target_key: 'TOV',
          target_mark: safeTov,
          generated_by_system: false,
          manually_adjusted: false,
          remarks: null,
          entered_by: profile.id,
          updated_at: new Date().toISOString(),
        })
      }

      if (safeEtr !== null) {
        rowsToUpsert.push({
          school_id: profile.school_id,
          academic_year: currentYear,
          student_enrollment_id: student.enrollment_id,
          student_profile_id: student.student_profile_id,
          class_id: selectedClassId,
          subject_id: selectedSubjectId,
          target_key: 'ETR',
          target_mark: safeEtr,
          generated_by_system: false,
          manually_adjusted: false,
          remarks:
            percent !== null && percent !== '' ? `Kenaikan sasaran: ${percent}%` : null,
          entered_by: profile.id,
          updated_at: new Date().toISOString(),
        })
      }

      if (safeTov !== null && safeEtr !== null) {
        const otrs = calculateOTRs(safeTov, safeEtr, otrKeys)

        Object.entries(otrs).forEach(([key, mark]) => {
          rowsToUpsert.push({
            school_id: profile.school_id,
            academic_year: currentYear,
            student_enrollment_id: student.enrollment_id,
            student_profile_id: student.student_profile_id,
            class_id: selectedClassId,
            subject_id: selectedSubjectId,
            target_key: key,
            target_mark: mark,
            generated_by_system: true,
            manually_adjusted: false,
            remarks: 'Dijana automatik oleh sistem',
            entered_by: profile.id,
            updated_at: new Date().toISOString(),
          })
        })
      }
    })

    if (!rowsToUpsert.length) {
      alert('Tiada data untuk disimpan.')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('student_targets')
      .upsert(rowsToUpsert, {
        onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
      })

    if (error) {
      console.error(error)
      alert(`Gagal simpan sasaran: ${error.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    alert('Sasaran berjaya disimpan.')
  }

  if (loading) {
    return <div className="p-6">Loading Sasaran Akademik...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                EduTrack
              </p>
              <h1 className="text-3xl font-bold text-slate-900">Sasaran Akademik Murid</h1>
            </div>

            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100"
            >
              Kembali Dashboard
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Penapis Sasaran</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Pilih Kelas</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.tingkatan} {item.class_name}
                </option>
              ))}
            </select>

            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Pilih Subjek</option>
              {uniqueSubjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subject_name}
                </option>
              ))}
            </select>
          </div>

          {selectedGradeLabel && (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Tingkatan dikesan: <strong>{selectedGradeLabel}</strong>
              {' · '}
              Jumlah OTR: <strong>{otrKeys.length}</strong>
              {otrKeys.length > 0 && (
                <>
                  {' · '}
                  OTR dikesan: <strong>{otrKeys.join(', ')}</strong>
                </>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Senarai Murid & Sasaran</h2>
            <div className="text-sm text-slate-500">
              Jumlah murid: <strong>{sortedStudents.length}</strong>
            </div>
          </div>

          {!selectedClassId || !selectedSubjectId ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-slate-500">
              Sila pilih kelas dan subjek dahulu.
            </div>
          ) : sortedStudents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-slate-500">
              Tiada murid dijumpai untuk kelas ini.
            </div>
          ) : (
            <>
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
                        No IC
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        TOV
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        ETR
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        % Kenaikan
                      </th>

                      {otrKeys.map((key) => (
                        <th
                          key={key}
                          className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {sortedStudents.map((student, index) => {
                      const values = targetMap[student.enrollment_id] || {}
                      const tov = values.TOV
                      const etr = values.ETR
                      const percent =
                        tov !== '' && etr !== ''
                          ? calculatePercent(clampMark(tov), clampMark(etr))
                          : ''
                      const otrs =
                        tov !== '' && etr !== ''
                          ? calculateOTRs(clampMark(tov), clampMark(etr), otrKeys)
                          : {}

                      return (
                        <tr key={student.enrollment_id} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-sm">{index + 1}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">
                            {student.full_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {student.ic_number}
                          </td>

                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={tov ?? ''}
                              onChange={(e) =>
                                updateTargetValue(student.enrollment_id, 'TOV', e.target.value)
                              }
                              className="w-24 rounded-lg border border-slate-300 px-3 py-2"
                            />
                          </td>

                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={etr ?? ''}
                              onChange={(e) =>
                                updateTargetValue(student.enrollment_id, 'ETR', e.target.value)
                              }
                              className="w-24 rounded-lg border border-slate-300 px-3 py-2"
                            />
                          </td>

                          <td className="px-4 py-3 text-sm font-medium text-slate-700">
                            {percent === '' || percent === null ? '-' : `${percent}%`}
                          </td>

                          {otrKeys.map((key) => (
                            <td key={key} className="px-4 py-3 text-sm text-slate-700">
                              {otrs[key] ?? '-'}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6">
                <button
                  onClick={saveTargets}
                  disabled={saving}
                  className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Sasaran'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
