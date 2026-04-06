import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const DEFAULT_OTR1_PERCENTAGE = 0.4
const DEFAULT_OTR2_PERCENTAGE = 0.75

function clampMark(value) {
  const num = Number(value)
  if (Number.isNaN(num)) return ''
  if (num < 0) return 0
  if (num > 100) return 100
  return num
}

function calculatePercent(tov, etr) {
  const start = Number(tov)
  const end = Number(etr)

  if (Number.isNaN(start) || Number.isNaN(end)) return ''
  if (start <= 0) return ''
  return Number((((end - start) / start) * 100).toFixed(1))
}

function getAcademicYear(setupConfig) {
  return Number(setupConfig?.current_academic_year || new Date().getFullYear())
}

function getOtrSettings(setupConfig) {
  return {
    mode: setupConfig?.otr_calculation_method || 'linear',
    otr1Percentage: Number(
      setupConfig?.otr1_percentage ?? DEFAULT_OTR1_PERCENTAGE
    ),
    otr2Percentage: Number(
      setupConfig?.otr2_percentage ?? DEFAULT_OTR2_PERCENTAGE
    ),
    autoRecalculate:
      setupConfig?.auto_recalculate_otr_on_etr_change !== false,
  }
}

function calculateOTRMarks({ tov, etr, otrKeys, setupConfig }) {
  const start = Number(tov)
  const end = Number(etr)

  if (Number.isNaN(start) || Number.isNaN(end)) return {}

  const safeKeys = Array.isArray(otrKeys) ? otrKeys : []
  if (!safeKeys.length) return {}

  const {
    mode,
    otr1Percentage,
    otr2Percentage,
  } = getOtrSettings(setupConfig)

  if (mode === 'percentage_to_etr') {
    const result = {}

    safeKeys.forEach((key, index) => {
      let percentage

      if (key === 'OTR1') percentage = otr1Percentage
      else if (key === 'OTR2') percentage = otr2Percentage
      else percentage = (index + 1) / (safeKeys.length + 1)

      const value = start + (end - start) * percentage
      result[key] = Math.round(value)
    })

    return result
  }

  // fallback linear
  const gap = end - start
  const result = {}

  safeKeys.forEach((key, index) => {
    const step = index + 1
    const value = start + (gap * step) / (safeKeys.length + 1)
    result[key] = Math.round(value)
  })

  return result
}

function findGradeFromMark(mark, gradeScales) {
  const numericMark = Number(mark)

  if (Number.isNaN(numericMark)) {
    return {
      grade_name: null,
      grade_point: null,
    }
  }

  const matched = (gradeScales || []).find((grade) => {
    const min = Number(grade.min_mark ?? grade.min_score ?? 0)
    const max = Number(grade.max_mark ?? grade.max_score ?? 100)
    return numericMark >= min && numericMark <= max
  })

  if (!matched) {
    return {
      grade_name: null,
      grade_point: null,
    }
  }

  return {
    grade_name: matched.grade_name ?? null,
    grade_point: matched.grade_point ?? null,
  }
}

export default function TargetsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [students, setStudents] = useState([])
  const [setupConfig, setSetupConfig] = useState(null)
  const [gradeScales, setGradeScales] = useState([])

  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')

  // map sasaran sedia ada
  const [targetMap, setTargetMap] = useState({})
  // map TOV sebenar dari student_scores
  const [tovMap, setTovMap] = useState({})

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (selectedClassId && selectedSubjectId) {
      loadStudentsByClass(selectedClassId)
      loadTovScores(selectedClassId, selectedSubjectId)
      loadExistingTargets(selectedClassId, selectedSubjectId)
    } else if (selectedClassId) {
      loadStudentsByClass(selectedClassId)
      setTovMap({})
      setTargetMap({})
    } else {
      setStudents([])
      setTovMap({})
      setTargetMap({})
    }
  }, [selectedClassId, selectedSubjectId])

  useEffect(() => {
    setSelectedSubjectId('')
    setTovMap({})
    setTargetMap({})
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
      { data: gradeData, error: gradeError },
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
        .eq('is_active', true)
        .order('subject_name', { ascending: true }),

      supabase
        .from('school_setup_configs')
        .select('*')
        .eq('school_id', schoolId)
        .maybeSingle(),

      supabase
        .from('grade_scales')
        .select('*')
        .eq('school_id', schoolId),
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

    if (gradeError) {
      console.error(gradeError)
      alert('Gagal ambil skala gred sekolah')
    }

    setClasses(classData || [])
    setSubjects(subjectData || [])
    setSetupConfig(setupData || null)
    setGradeScales(gradeData || [])
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
      .eq('is_active', true)

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

  const loadTovScores = async (classId, subjectId) => {
    if (!profile?.school_id || !classId || !subjectId) {
      setTovMap({})
      return
    }

    const academicYear = getAcademicYear(setupConfig)

    const { data, error } = await supabase
      .from('student_scores')
      .select('student_enrollment_id, mark')
      .eq('school_id', profile.school_id)
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .eq('academic_year', academicYear)
      .eq('exam_key', 'TOV')

    if (error) {
      console.error(error)
      alert('Gagal ambil TOV sedia ada.')
      return
    }

    const map = {}
    ;(data || []).forEach((row) => {
      map[row.student_enrollment_id] = row.mark ?? ''
    })

    setTovMap(map)
  }

  const loadExistingTargets = async (classId, subjectId) => {
    if (!profile?.school_id || !classId || !subjectId) {
      setTargetMap({})
      return
    }

    const academicYear = getAcademicYear(setupConfig)

    const { data, error } = await supabase
      .from('student_targets')
      .select('*')
      .eq('school_id', profile.school_id)
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .eq('academic_year', academicYear)

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
          ETR: '',
          OTR1: '',
          OTR2: '',
          manualFlags: {},
        }
      }

      if (row.target_key === 'ETR') {
        map[key].ETR = row.target_mark ?? ''
      }

      if (row.target_key === 'OTR1' || row.target_key === 'OTR2') {
        map[key][row.target_key] = row.target_mark ?? ''
        map[key].manualFlags[row.target_key] = !!row.manually_adjusted
      }
    })

    setTargetMap(map)
  }

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedClassId) || null,
    [classes, selectedClassId]
  )

  const selectedGradeLabel = selectedClass?.tingkatan || ''

  const examStructureForGrade = setupConfig?.exam_structure?.[selectedGradeLabel] || []

  const otrKeys = useMemo(() => {
    const keys = examStructureForGrade
      .filter((item) => String(item.key || '').startsWith('OTR'))
      .map((item) => item.key)

    if (keys.length > 0) return keys

    return ['OTR1', 'OTR2']
  }, [examStructureForGrade])

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

      return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ms', {
        sensitivity: 'base',
      })
    })
  }, [students])

  const getGradeScalesForTingkatan = (tingkatan) => {
    return (gradeScales || []).filter((grade) => {
      const label = grade.tingkatan ?? grade.form_level ?? grade.level ?? ''
      return (
        String(label).trim().toLowerCase() === String(tingkatan).trim().toLowerCase()
      )
    })
  }

  const getGradeInfo = (mark) => {
    const gradeSet = getGradeScalesForTingkatan(selectedGradeLabel)
    return findGradeFromMark(mark, gradeSet)
  }

  const updateTargetValue = (studentEnrollmentId, field, value) => {
    setTargetMap((prev) => ({
      ...prev,
      [studentEnrollmentId]: {
        ...(prev[studentEnrollmentId] || {
          ETR: '',
          OTR1: '',
          OTR2: '',
          manualFlags: {},
        }),
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

    const academicYear = getAcademicYear(setupConfig)
    const settings = getOtrSettings(setupConfig)
    const rowsToUpsert = []

    for (const student of sortedStudents) {
      const values = targetMap[student.enrollment_id] || {}
      const tovRaw = tovMap[student.enrollment_id]
      const etrRaw = values.ETR

      const hasTov = tovRaw !== '' && tovRaw !== null && tovRaw !== undefined
      const hasEtr = etrRaw !== '' && etrRaw !== null && etrRaw !== undefined

      if (!hasTov && !hasEtr) {
        continue
      }

      if (!hasTov && hasEtr) {
        alert(`TOV belum ada untuk ${student.full_name}. Masukkan TOV dahulu di Input Markah.`)
        return
      }

      if (!hasEtr) {
        continue
      }

      const safeTov = clampMark(tovRaw)
      const safeEtr = clampMark(etrRaw)

      const etrGradeInfo = getGradeInfo(safeEtr)
      const percent = calculatePercent(safeTov, safeEtr)

      rowsToUpsert.push({
        school_id: profile.school_id,
        academic_year: academicYear,
        student_enrollment_id: student.enrollment_id,
        student_profile_id: student.student_profile_id,
        class_id: selectedClassId,
        subject_id: selectedSubjectId,
        target_key: 'ETR',
        target_mark: safeEtr,
        grade_name: etrGradeInfo.grade_name,
        grade_point: etrGradeInfo.grade_point,
        generated_by_system: false,
        manually_adjusted: false,
        remarks:
          percent !== null && percent !== ''
            ? `Kenaikan sasaran: ${percent}%`
            : null,
        entered_by: profile.id,
        updated_at: new Date().toISOString(),
      })

      if (settings.autoRecalculate) {
        const generatedOtrs = calculateOTRMarks({
          tov: safeTov,
          etr: safeEtr,
          otrKeys,
          setupConfig,
        })

        otrKeys.forEach((key) => {
          const targetMark = generatedOtrs[key]
          if (targetMark === null || targetMark === undefined || targetMark === '') return

          const existingManualFlag = values?.manualFlags?.[key] === true
          if (existingManualFlag) return

          const gradeInfo = getGradeInfo(targetMark)

          rowsToUpsert.push({
            school_id: profile.school_id,
            academic_year: academicYear,
            student_enrollment_id: student.enrollment_id,
            student_profile_id: student.student_profile_id,
            class_id: selectedClassId,
            subject_id: selectedSubjectId,
            target_key: key,
            target_mark: targetMark,
            grade_name: gradeInfo.grade_name,
            grade_point: gradeInfo.grade_point,
            generated_by_system: true,
            manually_adjusted: false,
            remarks: 'Dijana automatik oleh sistem',
            entered_by: profile.id,
            updated_at: new Date().toISOString(),
          })
        })
      }
    }

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
    await loadExistingTargets(selectedClassId, selectedSubjectId)
    alert('Sasaran berjaya disimpan.')
  }

  if (loading) {
    return (
      <div className="p-6 text-slate-600">Loading Sasaran Akademik...</div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                EduTrack
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">
                Sasaran Akademik Murid
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                TOV diambil automatik daripada Input Markah. Masukkan ETR dan sistem
                akan jana OTR secara automatik ikut tetapan sekolah.
              </p>
            </div>

            <button
              onClick={() => navigate('/home')}
              className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100"
            >
              Kembali Dashboard
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Penapis Sasaran</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
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
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Tingkatan dikesan: <span className="font-semibold">{selectedGradeLabel}</span>
              {' · '}
              Tahun akademik: <span className="font-semibold">{getAcademicYear(setupConfig)}</span>
              {' · '}
              Mode OTR: <span className="font-semibold">{setupConfig?.otr_calculation_method || 'linear'}</span>
              {' · '}
              OTR1: <span className="font-semibold">{Number(setupConfig?.otr1_percentage ?? DEFAULT_OTR1_PERCENTAGE) * 100}%</span>
              {' · '}
              OTR2: <span className="font-semibold">{Number(setupConfig?.otr2_percentage ?? DEFAULT_OTR2_PERCENTAGE) * 100}%</span>
              {' · '}
              OTR dikesan: <span className="font-semibold">{otrKeys.join(', ')}</span>
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Senarai Murid & Sasaran
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Jumlah murid: {sortedStudents.length}
              </p>
            </div>
          </div>

          {!selectedClassId || !selectedSubjectId ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">
              Sila pilih kelas dan subjek dahulu.
            </div>
          ) : sortedStudents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">
              Tiada murid dijumpai untuk kelas ini.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-slate-700">
                      <th className="px-4 py-3 font-semibold">Bil</th>
                      <th className="px-4 py-3 font-semibold">Nama</th>
                      <th className="px-4 py-3 font-semibold">No IC</th>
                      <th className="px-4 py-3 font-semibold">TOV</th>
                      <th className="px-4 py-3 font-semibold">ETR</th>
                      <th className="px-4 py-3 font-semibold">% Kenaikan</th>
                      {otrKeys.map((key) => (
                        <th key={key} className="px-4 py-3 font-semibold">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStudents.map((student, index) => {
                      const values = targetMap[student.enrollment_id] || {}
                      const tov = tovMap[student.enrollment_id]
                      const etr = values.ETR

                      const hasTov = tov !== '' && tov !== null && tov !== undefined
                      const hasEtr = etr !== '' && etr !== null && etr !== undefined

                      const percent =
                        hasTov && hasEtr
                          ? calculatePercent(clampMark(tov), clampMark(etr))
                          : ''

                      const generatedOtrs =
                        hasTov && hasEtr
                          ? calculateOTRMarks({
                              tov: clampMark(tov),
                              etr: clampMark(etr),
                              otrKeys,
                              setupConfig,
                            })
                          : {}

                      return (
                        <tr key={student.enrollment_id} className="border-b last:border-b-0">
                          <td className="px-4 py-3">{index + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {student.full_name}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {student.ic_number}
                          </td>

                          <td className="px-4 py-3">
                            <div className="w-24 rounded-lg bg-slate-100 px-3 py-2 text-center font-medium text-slate-700">
                              {hasTov ? clampMark(tov) : '-'}
                            </div>
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
                              disabled={!hasTov}
                            />
                          </td>

                          <td className="px-4 py-3">
                            {percent === '' || percent === null ? '-' : `${percent}%`}
                          </td>

                          {otrKeys.map((key) => (
                            <td key={key} className="px-4 py-3">
                              {generatedOtrs[key] ?? values[key] ?? '-'}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={saveTargets}
                  disabled={saving}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
