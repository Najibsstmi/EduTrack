import { useEffect, useMemo, useState } from 'react'
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

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [selectedExamKey, setSelectedExamKey] = useState('')

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
    ])

    if (classesError) console.error(classesError)
    if (subjectsError) console.error(subjectsError)
    if (enrollmentsError) console.error(enrollmentsError)
    if (scoresError) console.error(scoresError)
    if (targetsError) console.error(targetsError)

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

  const availableExamKeys = useMemo(() => {
    const keys = [...new Set(scores.map((s) => s.exam_key).filter(Boolean))]
    return keys.sort((a, b) => String(a).localeCompare(String(b), 'ms', { sensitivity: 'base' }))
  }, [scores])

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

  const mergedRows = useMemo(() => {
    if (!selectedSubjectId || !selectedExamKey) return []

    return filteredStudents.map((student) => {
      const scoreRow = scores.find(
        (s) =>
          s.student_enrollment_id === student.enrollment_id &&
          s.subject_id === selectedSubjectId &&
          s.exam_key === selectedExamKey
      )

      const studentTargets = targets.filter(
        (t) =>
          t.student_enrollment_id === student.enrollment_id &&
          t.subject_id === selectedSubjectId
      )

      const getTargetMark = (key) => {
        const row = studentTargets.find((t) => t.target_key === key)
        return row?.target_mark ?? null
      }

      return {
        ...student,
        mark: scoreRow?.mark ?? null,
        grade_name: scoreRow?.grade_name ?? null,
        grade_point: scoreRow?.grade_point ?? null,
        tov_mark: getTargetMark('TOV'),
        otr1_mark: getTargetMark('OTR1'),
        otr2_mark: getTargetMark('OTR2'),
        otr3_mark: getTargetMark('OTR3'),
        etr_mark: getTargetMark('ETR'),
      }
    })
  }, [filteredStudents, scores, targets, selectedSubjectId, selectedExamKey])

  const validRows = useMemo(() => {
    return mergedRows.filter((row) => row.mark !== null || row.grade_name)
  }, [mergedRows])

  const gradeDistribution = useMemo(() => {
    const map = {}

    validRows.forEach((row) => {
      const grade = row.grade_name || 'N/A'
      map[grade] = (map[grade] || 0) + 1
    })

    return Object.entries(map)
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => String(a.grade).localeCompare(String(b.grade), 'ms', { sensitivity: 'base' }))
  }, [validRows])

  const gpmp = useMemo(() => {
    const rowsWithPoint = validRows.filter((row) => row.grade_point !== null && row.grade_point !== undefined)

    if (!rowsWithPoint.length) return null

    const total = rowsWithPoint.reduce((sum, row) => sum + Number(row.grade_point || 0), 0)
    return Number((total / rowsWithPoint.length).toFixed(2))
  }, [validRows])

  const summary = useMemo(() => {
    const marks = validRows
      .map((r) => Number(r.mark))
      .filter((v) => !Number.isNaN(v))

    return {
      totalStudents: filteredStudents.length,
      totalWithScore: validRows.length,
      highest: marks.length ? Math.max(...marks) : null,
      lowest: marks.length ? Math.min(...marks) : null,
      average: marks.length
        ? Number((marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(2))
        : null,
    }
  }, [filteredStudents, validRows])

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

          <div className="grid gap-4 md:grid-cols-4">
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

            <select
              value={selectedExamKey}
              onChange={(e) => setSelectedExamKey(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Pilih Peperiksaan</option>
              {availableExamKeys.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card title="Jumlah Murid" value={summary.totalStudents} />
          <Card title="Ada Markah" value={summary.totalWithScore} />
          <Card title="GPMP" value={gpmp ?? '-'} />
          <Card title="Markah Tertinggi" value={summary.highest ?? '-'} />
          <Card title="Markah Purata" value={summary.average ?? '-'} />
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

            <div className="space-y-3 text-sm text-slate-700">
              <div>Jumlah murid keseluruhan: <strong>{summary.totalStudents}</strong></div>
              <div>Jumlah murid ada markah: <strong>{summary.totalWithScore}</strong></div>
              <div>GPMP: <strong>{gpmp ?? '-'}</strong></div>
              <div>Markah tertinggi: <strong>{summary.highest ?? '-'}</strong></div>
              <div>Markah terendah: <strong>{summary.lowest ?? '-'}</strong></div>
              <div>Markah purata: <strong>{summary.average ?? '-'}</strong></div>
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

          {!selectedSubjectId || !selectedExamKey ? (
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
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">TOV</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">OTR1</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">OTR2</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">OTR3</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">{selectedExamKey}</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">Gred</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">ETR</th>
                  </tr>
                </thead>
                <tbody>
                  {mergedRows.map((row, index) => (
                    <tr key={row.enrollment_id} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-sm">{index + 1}</td>
                      <td className="px-4 py-3 text-sm">{row.ic_number}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.full_name}</td>
                      <td className="px-4 py-3 text-sm">{row.class_name}</td>
                      <td className="px-4 py-3 text-sm">{row.tov_mark ?? '-'}</td>
                      <td className="px-4 py-3 text-sm">{row.otr1_mark ?? '-'}</td>
                      <td className="px-4 py-3 text-sm">{row.otr2_mark ?? '-'}</td>
                      <td className="px-4 py-3 text-sm">{row.otr3_mark ?? '-'}</td>
                      <td className="px-4 py-3 text-sm">{row.mark ?? '-'}</td>
                      <td className="px-4 py-3 text-sm">{row.grade_name ?? '-'}</td>
                      <td className="px-4 py-3 text-sm">{row.etr_mark ?? '-'}</td>
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
