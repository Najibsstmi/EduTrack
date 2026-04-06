import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { getDashboardPath } from '../lib/dashboardPath'
import {
  getExamStructureForGrade,
  normalizeSetupConfigWithExamConfigs,
} from '../lib/examConfig'

const ChevronLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

const isTargetKey = (key = '') => {
  const value = String(key).trim().toUpperCase()
  return value.startsWith('OTR') || value === 'ETR'
}

const getCurrentGradePoint = (gradeName, tingkatan, gradeScales) => {
  const grade = String(gradeName || '').trim().toUpperCase()
  const form = String(tingkatan || '').trim().toLowerCase()

  const matched = (gradeScales || []).find((item) => {
    const itemGrade = String(item.grade_name ?? item.grade ?? '').trim().toUpperCase()
    const itemForm = String(
      item.tingkatan ?? item.grade_label ?? item.form_level ?? item.level ?? ''
    )
      .trim()
      .toLowerCase()

    return itemGrade === grade && itemForm === form
  })

  const point = matched?.grade_point
  return point === null || point === undefined || point === ''
    ? null
    : Number(point)
}

const getBarColors = (index, total) => {
  const colors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
    '#06b6d4', '#f97316', '#6366f1', '#84cc16', '#0891b2', '#d946ef',
  ]
  return colors[index % colors.length]
}

const BarChart = ({ rows, height = 300 }) => {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
        Tiada data untuk paparan graf.
      </div>
    )
  }

  const numericRows = rows
    .map((row, index) => ({
      ...row,
      numericMark: Number(row.mark),
      index,
    }))
    .filter((row) => row.numericMark !== null && !Number.isNaN(row.numericMark))

  if (!numericRows.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
        Tiada data markah untuk paparan graf.
      </div>
    )
  }

  const maxMark = Math.max(...numericRows.map((r) => r.numericMark), 100)
  const chartWidth = Math.max(600, numericRows.length * 80)
  const chartHeight = height
  const padding = { top: 20, right: 20, bottom: 60, left: 60 }
  const plotWidth = chartWidth - padding.left - padding.right
  const plotHeight = chartHeight - padding.top - padding.bottom
  const barWidth = plotWidth / numericRows.length * 0.7
  const barSpacing = plotWidth / numericRows.length

  return (
    <div className="overflow-x-auto -mx-4 md:mx-0 mb-6">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-auto md:min-w-[720px]"
        role="img"
        aria-label="Carta bar prestasi subjek"
      >
        <rect
          x="0"
          y="0"
          width={chartWidth}
          height={chartHeight}
          rx="20"
          fill="#f8fafc"
        />

        {/* Y-axis */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={chartHeight - padding.bottom}
          stroke="#94a3b8"
          strokeWidth="2"
        />

        {/* X-axis */}
        <line
          x1={padding.left}
          y1={chartHeight - padding.bottom}
          x2={chartWidth - padding.right}
          y2={chartHeight - padding.bottom}
          stroke="#94a3b8"
          strokeWidth="2"
        />

        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = Math.round(maxMark * ratio)
          const y = chartHeight - padding.bottom - ratio * plotHeight

          return (
            <g key={`y-${value}`}>
              <line
                x1={padding.left - 5}
                y1={y}
                x2={padding.left}
                y2={y}
                stroke="#94a3b8"
                strokeWidth="2"
              />
              <text
                x={padding.left - 12}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill="#64748b"
              >
                {value}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {numericRows.map((row) => {
          const barX = padding.left + row.index * barSpacing + (barSpacing - barWidth) / 2
          const barHeight = (row.numericMark / maxMark) * plotHeight
          const barY = chartHeight - padding.bottom - barHeight
          const color = getBarColors(row.index, numericRows.length)

          return (
            <g key={row.subject_id}>
              <rect
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill={color}
                rx="4"
              />
              <text
                x={barX + barWidth / 2}
                y={barY - 8}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill="#1e293b"
              >
                {row.numericMark}
              </text>
              <text
                x={barX + barWidth / 2}
                y={chartHeight - padding.bottom + 20}
                textAnchor="middle"
                fontSize="11"
                fill="#475569"
              >
                {row.subject_name.substring(0, 15)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function StudentIndividualAnalysisPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [studentRows, setStudentRows] = useState([])
  const [scores, setScores] = useState([])
  const [targets, setTargets] = useState([])
  const [gradeScales, setGradeScales] = useState([])

  const [selectedTingkatan, setSelectedTingkatan] = useState(
    location.state?.selectedTingkatan || ''
  )
  const [selectedClassId, setSelectedClassId] = useState(
    location.state?.selectedClassId || ''
  )
  const [selectedStudentId, setSelectedStudentId] = useState(
    location.state?.selectedStudentId || ''
  )

  const dashboardPath = getDashboardPath(profile)
  const [selectedExamKey, setSelectedExamKey] = useState('')
  const [hasAppliedInitialState, setHasAppliedInitialState] = useState(false)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (!hasAppliedInitialState && location.state) {
      setHasAppliedInitialState(true)
      return
    }

    setSelectedClassId('')
    setSelectedStudentId('')
    setSelectedExamKey('')
  }, [selectedTingkatan, hasAppliedInitialState, location.state])

  useEffect(() => {
    if (!hasAppliedInitialState && location.state) {
      setHasAppliedInitialState(true)
      return
    }

    setSelectedStudentId('')
    setSelectedExamKey('')
  }, [selectedClassId, hasAppliedInitialState, location.state])

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

    const { data: setupRows, error: setupError } = await supabase
      .from('school_setup_configs')
      .select('*')
      .eq('school_id', schoolId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)

    if (setupError) {
      console.error(setupError)
    }

    const currentYear = setupRows?.[0]?.current_academic_year || new Date().getFullYear()

    const { data: examConfigRows, error: examConfigError } = await supabase
      .from('exam_configs')
      .select('grade_label, exam_key, exam_name, exam_order, is_active')
      .eq('school_id', schoolId)
      .eq('academic_year', currentYear)

    if (examConfigError) {
      console.error(examConfigError)
    }

    setSetupConfig(
      normalizeSetupConfigWithExamConfigs(setupRows?.[0] || null, examConfigRows || [])
    )

    const [
      { data: classesData, error: classesError },
      { data: subjectsData, error: subjectsError },
      { data: enrollmentsData, error: enrollmentsError },
      { data: scoresData, error: scoresError },
      { data: targetsData, error: targetsError },
      { data: gradeScalesData, error: gradeScalesError },
    ] = await Promise.all([
      supabase
        .from('classes')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', currentYear)
        .eq('is_active', true),

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
        .eq('academic_year', currentYear)
        .eq('is_active', true),

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
        .from('grade_scales')
        .select('*')
        .eq('school_id', schoolId),
    ])

    if (classesError) console.error(classesError)
    if (subjectsError) console.error(subjectsError)
    if (enrollmentsError) console.error(enrollmentsError)
    if (scoresError) console.error(scoresError)
    if (targetsError) console.error(targetsError)
    if (gradeScalesError) console.error(gradeScalesError)

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
    setGradeScales(gradeScalesData || [])

    const availableTingkatan = [...new Set((classesData || []).map((c) => c.tingkatan).filter(Boolean))]
      .sort((a, b) => getTingkatanRank(a) - getTingkatanRank(b))

    if (!location.state?.selectedTingkatan && availableTingkatan.length > 0) {
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

  const availableStudents = useMemo(() => {
    return studentRows
      .filter((s) => s.tingkatan === selectedTingkatan)
      .filter((s) => !selectedClassId || s.class_id === selectedClassId)
      .sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [studentRows, selectedTingkatan, selectedClassId])

  const examOptions = useMemo(() => {
    return getExamStructureForGrade(setupConfig, selectedTingkatan)
  }, [setupConfig, selectedTingkatan])

  const selectedStudent = useMemo(() => {
    return availableStudents.find(
      (student) => String(student.student_profile_id) === String(selectedStudentId)
    ) || null
  }, [availableStudents, selectedStudentId])

  const subjectAnalysisRows = useMemo(() => {
    if (!selectedStudent || !selectedExamKey) return []

    const relevantSubjects = subjects
      .filter((subject) => subject.tingkatan === selectedStudent.tingkatan)
      .sort((a, b) =>
        String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )

    return relevantSubjects.map((subject) => {
      let metric = null

      if (isTargetKey(selectedExamKey)) {
        metric = targets.find(
          (t) =>
            t.student_enrollment_id === selectedStudent.enrollment_id &&
            t.subject_id === subject.id &&
            String(t.target_key || '').toUpperCase() === String(selectedExamKey).toUpperCase()
        )
      } else {
        metric = scores.find(
          (s) =>
            s.student_enrollment_id === selectedStudent.enrollment_id &&
            s.subject_id === subject.id &&
            String(s.exam_key || '').toUpperCase() === String(selectedExamKey).toUpperCase()
        )
      }

      const currentGradeName = metric?.grade_name ?? null

      return {
        subject_id: subject.id,
        subject_name: subject.subject_name || '-',
        subject_code: subject.subject_code || '',
        mark: isTargetKey(selectedExamKey) ? metric?.target_mark ?? null : metric?.mark ?? null,
        grade_name: currentGradeName,
        grade_point: getCurrentGradePoint(
          currentGradeName,
          selectedStudent.tingkatan,
          gradeScales
        ),
      }
    })
  }, [selectedStudent, selectedExamKey, subjects, scores, targets, gradeScales])

  const summary = useMemo(() => {
    const rowsWithMark = subjectAnalysisRows.filter(
      (row) => row.mark !== null && row.mark !== undefined && !Number.isNaN(Number(row.mark))
    )

    const gradePoints = subjectAnalysisRows
      .map((row) => row.grade_point)
      .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
      .map((v) => Number(v))

    const grades = subjectAnalysisRows
      .map((row) => row.grade_name)
      .filter(Boolean)

    const lulusCount = grades.filter((g) => {
      const x = String(g).trim().toUpperCase()
      return ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E'].includes(x)
    }).length

    const gagalCount = grades.filter((g) => {
      const x = String(g).trim().toUpperCase()
      return x === 'G'
    }).length

    const thCount = grades.filter((g) => {
      const x = String(g).trim().toUpperCase()
      return x === 'TH'
    }).length

    const marks = rowsWithMark.map((row) => Number(row.mark))

    return {
      totalSubjects: subjectAnalysisRows.length,
      adaMarkah: rowsWithMark.length,
      lulus: lulusCount,
      gagal: gagalCount,
      th: thCount,
      tertinggi: marks.length ? Math.max(...marks) : null,
      terendah: marks.length ? Math.min(...marks) : null,
      purata: marks.length
        ? Number((marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(2))
        : null,
      gpmp: gradePoints.length
        ? Number((gradePoints.reduce((a, b) => a + b, 0) / gradePoints.length).toFixed(2))
        : null,
    }
  }, [subjectAnalysisRows])

  const selectedExamLabel = useMemo(() => {
    const matched = examOptions.find(
      (exam) => String(exam.key || '').toUpperCase() === String(selectedExamKey || '').toUpperCase()
    )
    return matched?.name || selectedExamKey || '-'
  }, [examOptions, selectedExamKey])

  if (loading) {
    return <div className="p-6">Loading Analisis Individu...</div>
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
              <h1 className="text-3xl font-bold text-slate-900">
                Analisis Individu Murid
              </h1>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate('/analysis/class')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Analisis Kelas
              </button>

              <button
                onClick={() =>
                  navigate('/analysis/student-subject', {
                    state: {
                      selectedTingkatan,
                      selectedClassId,
                      selectedStudentId,
                    },
                  })
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Analisis Trend
              </button>

              <button
                onClick={() => navigate(dashboardPath)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1.5"
              >
                <ChevronLeftIcon />
                <span>Dashboard</span>
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
          <h2 className="mb-4 text-lg md:text-xl font-semibold text-slate-900">Filter Murid</h2>

          <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-4">
            <select
              value={selectedTingkatan}
              onChange={(e) => setSelectedTingkatan(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Pilih Tingkatan</option>
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
              <option value="">Pilih Kelas</option>
              {availableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.class_name}
                </option>
              ))}
            </select>

            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Pilih Murid</option>
              {availableStudents.map((item) => (
                <option key={item.student_profile_id} value={item.student_profile_id}>
                  {item.full_name}
                </option>
              ))}
            </select>

            <select
              value={selectedExamKey}
              onChange={(e) => setSelectedExamKey(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Pilih Peperiksaan</option>
              {examOptions.map((exam) => (
                <option key={exam.key} value={exam.key}>
                  {exam.name || exam.key}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedStudent && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
            <h2 className="mb-4 text-lg md:text-xl font-semibold text-slate-900">Maklumat Murid</h2>

            <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3">
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 md:p-5">
                <div className="text-sm text-blue-600 font-medium">Nama</div>
                <div className="mt-1 text-lg md:text-xl font-bold text-blue-900">{selectedStudent.full_name}</div>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 md:p-5">
                <div className="text-sm text-emerald-600 font-medium">No IC</div>
                <div className="mt-1 text-lg md:text-xl font-bold text-emerald-900">{selectedStudent.ic_number}</div>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 md:p-5">
                <div className="text-sm text-amber-600 font-medium">Tingkatan</div>
                <div className="mt-1 text-lg md:text-xl font-bold text-amber-900">{selectedStudent.tingkatan}</div>
              </div>
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-4 md:p-5">
                <div className="text-sm text-purple-600 font-medium">Kelas</div>
                <div className="mt-1 text-lg md:text-xl font-bold text-purple-900">{selectedStudent.class_name}</div>
              </div>
            </div>
          </div>
        )}

        {selectedStudent && selectedExamKey && (
          <>
            <div className="grid gap-4 md:grid-cols-6">
              <Card title="Bil Subjek" value={summary.totalSubjects} />
              <Card title="Ada Markah" value={summary.adaMarkah} />
              <Card title="Lulus" value={summary.lulus} />
              <Card title="Gagal" value={summary.gagal} />
              <Card title="TH" value={summary.th} />
              <Card title="GPMP Individu" value={summary.gpmp ?? '-'} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-slate-900">
                  Prestasi Semua Subjek
                </h2>
                <div className="text-sm text-slate-500">
                  Peperiksaan: <strong>{selectedExamLabel}</strong>
                </div>
              </div>

              <BarChart rows={subjectAnalysisRows} height={320} />

              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="min-w-full border-collapse text-xs md:text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Bil
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Subjek
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Kod
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Markah
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Gred
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        GP
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {subjectAnalysisRows.map((row, index) => (
                      <tr key={row.subject_id} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-sm">{index + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">
                          {row.subject_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {row.subject_code || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {row.mark ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {row.grade_name ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {row.grade_point ?? '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!selectedStudent || !selectedExamKey ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 md:p-6 text-slate-500 text-sm">
            Sila pilih murid dan peperiksaan untuk melihat analisis.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Card({ title, value }) {
  const colorMap = {
    'Bil Subjek': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', value: 'text-blue-900' },
    'Ada Markah': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', value: 'text-emerald-900' },
    'Lulus': { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600', value: 'text-green-900' },
    'Gagal': { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-600', value: 'text-rose-900' },
    'TH': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', value: 'text-amber-900' },
    'GPMP Individu': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600', value: 'text-purple-900' },
  }

  const colors = colorMap[title] || { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', value: 'text-slate-900' }

  return (
    <div className={`rounded-lg border ${colors.bg} ${colors.border} p-4 md:p-5 shadow-sm`}>
      <div className={`text-sm ${colors.text} font-medium`}>{title}</div>
      <div className={`mt-2 text-2xl font-bold ${colors.value}`}>{value}</div>
    </div>
  )
}
