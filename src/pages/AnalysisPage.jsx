import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

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

export default function AnalysisPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [studentRows, setStudentRows] = useState([])
  const [scores, setScores] = useState([])
  const [targets, setTargets] = useState([])
  const [setupConfig, setSetupConfig] = useState(null)

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    setSelectedClassId('all')
    setSelectedSubjectId('')
  }, [selectedTingkatan])

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
    const currentYear = new Date().getFullYear()

    const [
      { data: classesData, error: classesError },
      { data: subjectsData, error: subjectsError },
      { data: enrollmentsData, error: enrollmentsError },
      { data: scoresData, error: scoresError },
      { data: targetsData, error: targetsError },
      { data: setupConfigData, error: setupConfigError },
    ] = await Promise.all([
      supabase
        .from('classes')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', currentYear),

      supabase
        .from('subjects')
        .select('*')
        .eq('school_id', schoolId),

      supabase
        .from('student_enrollments')
        .select(`
          id,
          class_id,
          academic_year,
          student_profile_id,
          classes (
            id,
            tingkatan,
            class_name
          ),
          student_profiles (
            id,
            full_name,
            ic_number,
            gender
          )
        `)
        .eq('school_id', schoolId)
        .eq('academic_year', currentYear),

      supabase
        .from('student_scores')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', currentYear),

      supabase
        .from('student_targets')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', currentYear),

      supabase
        .from('school_setup_configs')
        .select('*')
        .eq('school_id', schoolId)
        .single(),
    ])

    if (classesError) console.error(classesError)
    if (subjectsError) console.error(subjectsError)
    if (enrollmentsError) console.error(enrollmentsError)
    if (scoresError) console.error(scoresError)
    if (targetsError) console.error(targetsError)
    if (setupConfigError) console.error(setupConfigError)

    const mappedStudents = (enrollmentsData || []).map((row) => ({
      enrollment_id: row.id,
      class_id: row.class_id,
      student_profile_id: row.student_profile_id,
      full_name: row.student_profiles?.full_name || '',
      ic_number: row.student_profiles?.ic_number || '',
      gender: row.student_profiles?.gender || '',
      tingkatan: row.classes?.tingkatan || '',
      class_name: row.classes?.class_name || '',
    }))

    setClasses(classesData || [])
    setSubjects(subjectsData || [])
    setStudentRows(mappedStudents)
    setScores(scoresData || [])
    setTargets(targetsData || [])
    setSetupConfig(setupConfigData || null)

    const availableTingkatan = [...new Set((classesData || []).map((c) => c.tingkatan).filter(Boolean))]
      .sort((a, b) => getTingkatanRank(a) - getTingkatanRank(b))

    if (availableTingkatan.length > 0) {
      setSelectedTingkatan(availableTingkatan[0])
    }

    setLoading(false)
  }

  const availableTingkatan = useMemo(() => {
    return [...new Set(classes.map((c) => c.tingkatan).filter(Boolean))]
      .sort((a, b) => getTingkatanRank(a) - getTingkatanRank(b))
  }, [classes])

  const availableClasses = useMemo(() => {
    return classes
      .filter((c) => c.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        String(a.class_name || '').localeCompare(String(b.class_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [classes, selectedTingkatan])

  const availableSubjects = useMemo(() => {
    return subjects
      .filter((s) => s.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [subjects, selectedTingkatan])

  const filteredStudents = useMemo(() => {
    let result = [...studentRows]

    if (selectedTingkatan) {
      result = result.filter((s) => s.tingkatan === selectedTingkatan)
    }

    if (selectedClassId !== 'all') {
      result = result.filter((s) => s.class_id === selectedClassId)
    }

    result.sort((a, b) => {
      const classCompare = String(a.class_name || '').localeCompare(
        String(b.class_name || ''),
        'ms',
        { sensitivity: 'base' }
      )
      if (classCompare !== 0) return classCompare

      const genderRank = (g) => {
        const x = String(g || '').trim().toUpperCase()
        if (x === 'LELAKI') return 1
        if (x === 'PEREMPUAN') return 2
        return 3
      }

      const genderCompare = genderRank(a.gender) - genderRank(b.gender)
      if (genderCompare !== 0) return genderCompare

      return String(a.full_name || '').localeCompare(
        String(b.full_name || ''),
        'ms',
        { sensitivity: 'base' }
      )
    })

    return result
  }, [studentRows, selectedTingkatan, selectedClassId])

  const analysisColumns = useMemo(() => {
    return setupConfig?.exam_structure?.[selectedTingkatan] || []
  }, [setupConfig, selectedTingkatan])

  const mergedRows = useMemo(() => {
    if (!selectedSubjectId) return []

    return filteredStudents.map((student) => {
      const studentScores = scores.filter(
        (s) =>
          s.student_enrollment_id === student.enrollment_id &&
          s.subject_id === selectedSubjectId
      )

      const studentTargets = targets.filter(
        (t) =>
          t.student_enrollment_id === student.enrollment_id &&
          t.subject_id === selectedSubjectId
      )

      const analysis = {}

      analysisColumns.forEach((exam) => {
        const key = String(exam.key || '').toUpperCase()

        if (key.startsWith('OTR') || key === 'ETR') {
          const targetRow = studentTargets.find((t) => t.target_key === key)

          analysis[key] = {
            mark: targetRow?.target_mark ?? null,
            grade_name: targetRow?.grade_name ?? null,
            grade_point: targetRow?.grade_point ?? null,
            label: exam.name || key,
          }
        } else {
          const scoreRow = studentScores.find((s) => s.exam_key === key)

          analysis[key] = {
            mark: scoreRow?.mark ?? null,
            grade_name: scoreRow?.grade_name ?? null,
            grade_point: scoreRow?.grade_point ?? null,
            label: exam.name || key,
          }
        }
      })

      return {
        ...student,
        analysis,
      }
    })
  }, [filteredStudents, scores, targets, selectedSubjectId, analysisColumns])

  const validRows = useMemo(() => {
    if (!analysisColumns.length) return []

    return mergedRows.map((row) => {
      const summaryMap = {}

      analysisColumns.forEach((exam) => {
        const key = String(exam.key || '').toUpperCase()
        summaryMap[key] = row.analysis?.[key] || {
          mark: null,
          grade_name: null,
          grade_point: null,
        }
      })

      return {
        ...row,
        summaryMap,
      }
    })
  }, [mergedRows, analysisColumns])

  const summaryExamKey = useMemo(() => {
    const lastExam = analysisColumns[analysisColumns.length - 1]
    return String(lastExam?.key || '').toUpperCase()
  }, [analysisColumns])

  const gradeDistribution = useMemo(() => {
    if (!summaryExamKey) return []

    const map = {}

    validRows.forEach((row) => {
      const grade = row.summaryMap?.[summaryExamKey]?.grade_name || 'N/A'
      map[grade] = (map[grade] || 0) + 1
    })

    return Object.entries(map)
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => String(a.grade).localeCompare(String(b.grade), 'ms', { sensitivity: 'base' }))
  }, [validRows, summaryExamKey])

  const gpmp = useMemo(() => {
    const points = validRows
      .map((row) => row.summaryMap?.[summaryExamKey]?.grade_point)
      .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
      .map((v) => Number(v))

    if (!points.length) return null

    const total = points.reduce((sum, val) => sum + val, 0)
    return Number((total / points.length).toFixed(2))
  }, [validRows, summaryExamKey])

  const summaryHeadcount = useMemo(() => {
    const marks = validRows
      .map((row) => row.summaryMap?.[summaryExamKey]?.mark)
      .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
      .map((v) => Number(v))

    const overallGrade =
      gradeDistribution.length > 0
        ? gradeDistribution.reduce((max, item) => (item.count > max.count ? item : max), gradeDistribution[0])?.grade
        : '-'

    return {
      jumlahPelajar: filteredStudents.length,
      jumlahHadir: marks.length,
      jumlahTidakHadir: filteredStudents.length - marks.length,
      markahTertinggi: marks.length ? Math.max(...marks) : '-',
      markahTerendah: marks.length ? Math.min(...marks) : '-',
      markahPurata: marks.length
        ? Number((marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(2))
        : '-',
      gpmp: gpmp ?? '-',
      gred: overallGrade || '-',
    }
  }, [filteredStudents, validRows, summaryExamKey, gpmp, gradeDistribution])

  if (loading) {
    return <div className="p-6">Loading Analysis...</div>
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
              <h1 className="text-3xl font-bold text-slate-900">Analisis Akademik</h1>
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
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Filter Analisis</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <select
              value={selectedTingkatan}
              onChange={(e) => setSelectedTingkatan(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              {availableTingkatan.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="all">Semua Kelas</option>
              {availableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.class_name}
                </option>
              ))}
            </select>

            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Pilih Subjek</option>
              {availableSubjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.subject_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card title="Jumlah Murid" value={summaryHeadcount.jumlahPelajar} />
          <Card title="Ada Markah" value={summaryHeadcount.jumlahHadir} />
          <Card title="GPMP" value={summaryHeadcount.gpmp} />
          <Card title="Markah Tertinggi" value={summaryHeadcount.markahTertinggi} />
          <Card title="Markah Purata" value={summaryHeadcount.markahPurata} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Agihan Gred</h2>

            {gradeDistribution.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500">
                Tiada data gred untuk paparan ini.
              </div>
            ) : (
              <table className="min-w-full border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Gred
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                      Bil Murid
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gradeDistribution.map((item) => (
                    <tr key={item.grade} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-sm">{item.grade}</td>
                      <td className="px-4 py-3 text-sm font-medium">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Ringkasan</h2>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-slate-700">
              <div>Jumlah pelajar</div>
              <div><strong>{summaryHeadcount.jumlahPelajar}</strong></div>

              <div>Jumlah hadir</div>
              <div><strong>{summaryHeadcount.jumlahHadir}</strong></div>

              <div>Jumlah tidak hadir</div>
              <div><strong>{summaryHeadcount.jumlahTidakHadir}</strong></div>

              <div>Markah tertinggi</div>
              <div><strong>{summaryHeadcount.markahTertinggi}</strong></div>

              <div>Markah terendah</div>
              <div><strong>{summaryHeadcount.markahTerendah}</strong></div>

              <div>Markah purata</div>
              <div><strong>{summaryHeadcount.markahPurata}</strong></div>

              <div>GPMP</div>
              <div><strong>{summaryHeadcount.gpmp}</strong></div>

              <div>Gred</div>
              <div><strong>{summaryHeadcount.gred}</strong></div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Jadual Analisis Murid</h2>
            <div className="text-sm text-slate-500">
              Jumlah rekod: <strong>{mergedRows.length}</strong>
            </div>
          </div>

          {!selectedSubjectId ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500">
              Sila pilih subjek dan peperiksaan dahulu.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">Bil</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">IC</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">Nama</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">Kelas</th>
                    {analysisColumns.map((exam) => (
                      <React.Fragment key={exam.key}>
                        <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">{exam.name || exam.key}</th>
                        <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">Gred</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mergedRows.map((row, index) => (
                    <tr key={row.enrollment_id} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-sm">{index + 1}</td>
                      <td className="px-4 py-3 text-sm">{row.ic_number}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.full_name}</td>
                      <td className="px-4 py-3 text-sm">{row.class_name}</td>
                      {analysisColumns.map((exam) => {
                        const key = String(exam.key || '').toUpperCase()
                        return (
                          <React.Fragment key={key}>
                            <td className="px-4 py-3 text-sm">
                              {row.analysis?.[key]?.mark ?? '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {row.analysis?.[key]?.grade_name ?? '-'}
                            </td>
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Card({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  )
}
