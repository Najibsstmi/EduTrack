import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { getDashboardPath } from '../lib/dashboardPath'
import {
  getExamStructureForGrade,
  normalizeSetupConfigWithExamConfigs,
} from '../lib/examConfig'
import {
  fetchSchoolLevelLabels,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels'

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

export default function StudentSubjectTrendPage() {
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
  const [levelMappings, setLevelMappings] = useState([])

  const [selectedTingkatan, setSelectedTingkatan] = useState(
    location.state?.selectedTingkatan || ''
  )
  const [selectedClassId, setSelectedClassId] = useState(
    location.state?.selectedClassId || ''
  )
  const [selectedStudentId, setSelectedStudentId] = useState(
    location.state?.selectedStudentId || ''
  )
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [hasAppliedInitialState, setHasAppliedInitialState] = useState(false)

  const dashboardPath = getDashboardPath(profile)

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
    setSelectedSubjectId('')
  }, [selectedTingkatan])

  useEffect(() => {
    if (!hasAppliedInitialState && location.state) {
      setHasAppliedInitialState(true)
      return
    }

    setSelectedStudentId('')
    setSelectedSubjectId('')
  }, [selectedClassId])

  useEffect(() => {
    if (!hasAppliedInitialState && location.state) {
      setHasAppliedInitialState(true)
      return
    }

    setSelectedSubjectId('')
  }, [selectedStudentId])

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

    const loadedLevelMappings = await fetchSchoolLevelLabels({
      schoolId,
      academicYear: currentYear,
    })

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
    setLevelMappings(loadedLevelMappings)

    const availableTingkatan = sortLevelsByDisplayOrder(
      [...new Set((classesData || []).map((c) => c.tingkatan).filter(Boolean))],
      loadedLevelMappings
    )

    if (!location.state?.selectedTingkatan && availableTingkatan.length > 0) {
      setSelectedTingkatan(availableTingkatan[0])
    }

    setLoading(false)
  }

  const availableTingkatan = useMemo(() => {
    return sortLevelsByDisplayOrder(
      [...new Set(classes.map((c) => c.tingkatan).filter(Boolean))],
      levelMappings
    )
  }, [classes, levelMappings])

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

  const availableSubjects = useMemo(() => {
    return subjects
      .filter((s) => s.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [subjects, selectedTingkatan])

  useEffect(() => {
    if (!selectedSubjectId && availableSubjects.length > 0) {
      setSelectedSubjectId(String(availableSubjects[0].id))
    }
  }, [availableSubjects, selectedSubjectId])

  const examOptions = useMemo(() => {
    return getExamStructureForGrade(setupConfig, selectedTingkatan)
  }, [setupConfig, selectedTingkatan])

  const selectedStudent = useMemo(() => {
    return availableStudents.find(
      (student) => String(student.enrollment_id) === String(selectedStudentId)
    ) || null
  }, [availableStudents, selectedStudentId])

  const trendRows = useMemo(() => {
    if (!selectedStudent || !selectedSubjectId || !examOptions.length) return []

    return examOptions.map((exam) => {
      const examKey = String(exam.key || '').toUpperCase()
      let metric = null

      if (isTargetKey(examKey)) {
        metric = targets.find(
          (t) =>
            t.student_enrollment_id === selectedStudent.enrollment_id &&
            String(t.subject_id) === String(selectedSubjectId) &&
            String(t.target_key || '').toUpperCase() === examKey
        )
      } else {
        metric = scores.find(
          (s) =>
            s.student_enrollment_id === selectedStudent.enrollment_id &&
            String(s.subject_id) === String(selectedSubjectId) &&
            String(s.exam_key || '').toUpperCase() === examKey
        )
      }

      const gradeName = metric?.grade_name ?? null

      return {
        examKey,
        examLabel: exam.name || examKey,
        mark: isTargetKey(examKey) ? metric?.target_mark ?? null : metric?.mark ?? null,
        grade_name: gradeName,
        grade_point: getCurrentGradePoint(gradeName, selectedStudent.tingkatan, gradeScales),
      }
    })
  }, [selectedStudent, selectedSubjectId, examOptions, scores, targets, gradeScales])

  const selectedSubject = useMemo(() => {
    return availableSubjects.find((s) => String(s.id) === String(selectedSubjectId)) || null
  }, [availableSubjects, selectedSubjectId])

  const chartRows = useMemo(() => {
    return trendRows.map((row, index) => ({
      ...row,
      index,
      numericMark:
        row.mark === null || row.mark === undefined || Number.isNaN(Number(row.mark))
          ? null
          : Number(row.mark),
    }))
  }, [trendRows])

  if (loading) {
    return <div className="p-6">Loading Trend Subjek...</div>
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
              <h1 className="text-3xl font-bold text-slate-900">Trend Subjek Murid</h1>
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
                  navigate('/analysis/student', {
                    state: {
                      selectedTingkatan,
                      selectedClassId,
                      selectedStudentId,
                    },
                  })
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Analisis Individu
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
          <h2 className="mb-4 text-lg md:text-xl font-semibold text-slate-900">Filter Trend</h2>

          <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-4">
            <select
              value={selectedTingkatan}
              onChange={(e) => setSelectedTingkatan(e.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              <option value="">Pilih Tingkatan</option>
              {availableTingkatan.map((item) => (
                <option key={item} value={item}>
                  {getDisplayLevel(item, levelMappings)}
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
                <option key={item.enrollment_id} value={item.enrollment_id}>
                  {item.full_name}
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
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-4 md:p-5">
                <div className="text-sm text-purple-600 font-medium">Tingkatan</div>
                <div className="mt-1 text-lg md:text-xl font-bold text-purple-900">
                  {getDisplayLevel(selectedStudent.tingkatan, levelMappings)}
                </div>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 md:p-5 md:col-span-2">
                <div className="text-sm text-amber-600 font-medium">Subjek</div>
                <div className="mt-1 text-lg md:text-xl font-bold text-amber-900">{selectedSubject?.subject_name || '-'}</div>
              </div>
            </div>
          </div>
        )}

        {selectedStudent && selectedSubjectId ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg md:text-xl font-semibold text-slate-900">Graf Prestasi</h2>
                <div className="text-sm text-slate-500">
                  Jumlah peperiksaan: <strong>{trendRows.length}</strong>
                </div>
              </div>

              <TrendPerformanceChart rows={chartRows} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg md:text-xl font-semibold text-slate-900">Trend Prestasi</h2>
                <div className="text-sm text-slate-500">
                  Jumlah peperiksaan: <strong>{trendRows.length}</strong>
                </div>
              </div>

              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="min-w-full border-collapse text-xs md:text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">
                        Bil
                      </th>
                      <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">
                        Peperiksaan
                      </th>
                      <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">
                        Markah
                      </th>
                      <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">
                        Gred
                      </th>
                      <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">
                        GP
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendRows.map((row, index) => (
                      <tr key={row.examKey} className="border-b border-slate-100">
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{index + 1}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium text-slate-800">{row.examLabel}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{row.mark ?? '-'}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{row.grade_name ?? '-'}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{row.grade_point ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 md:p-6 text-slate-500 text-sm">
            Sila pilih murid dan subjek untuk melihat trend.
          </div>
        )}
      </div>
    </div>
  )
}

function TrendPerformanceChart({ rows }) {
  const formatAxisLabelLines = (value, maxCharsPerLine = 12, maxLines = 2) => {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean)

    if (!words.length) {
      return ['-']
    }

    const lines = []
    let currentLine = ''

    words.forEach((word) => {
      const nextLine = currentLine ? `${currentLine} ${word}` : word

      if (nextLine.length <= maxCharsPerLine) {
        currentLine = nextLine
        return
      }

      if (currentLine) {
        lines.push(currentLine)
        currentLine = word
        return
      }

      lines.push(word.slice(0, maxCharsPerLine))
      currentLine = word.slice(maxCharsPerLine)
    })

    if (currentLine) {
      lines.push(currentLine)
    }

    const visibleLines = lines.slice(0, maxLines)
    const hasOverflow = lines.length > maxLines || words.join(' ').length > visibleLines.join(' ').length

    if (hasOverflow && visibleLines.length) {
      const lastIndex = visibleLines.length - 1
      visibleLines[lastIndex] = `${visibleLines[lastIndex].slice(0, Math.max(0, maxCharsPerLine - 1)).trimEnd()}…`
    }

    return visibleLines
  }

  const chartWidth = 920
  const chartHeight = 320
  const padding = { top: 24, right: 24, bottom: 86, left: 48 }
  const numericRows = rows.filter((row) => row.numericMark !== null)

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
        Tiada data peperiksaan untuk diplotkan.
      </div>
    )
  }

  if (!numericRows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
        Graf akan dipaparkan apabila sekurang-kurangnya satu markah peperiksaan wujud.
      </div>
    )
  }

  const plotWidth = chartWidth - padding.left - padding.right
  const plotHeight = chartHeight - padding.top - padding.bottom
  const xStep = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth / 2
  const yTicks = [0, 20, 40, 60, 80, 100]

  const getX = (index) => padding.left + (rows.length === 1 ? plotWidth / 2 : index * xStep)
  const getY = (mark) => padding.top + ((100 - mark) / 100) * plotHeight

  const linePoints = numericRows
    .map((row) => `${getX(row.index)},${getY(row.numericMark)}`)
    .join(' ')

  return (
    <div className="space-y-4 w-full">
      <div className="md:overflow-x-auto -mx-4 md:mx-0 scrollbar-hide">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto md:min-w-[720px] md:w-auto md:max-h-96"
          role="img"
          aria-label="Graf prestasi murid ikut peperiksaan"
        >
          <rect x="0" y="0" width={chartWidth} height={chartHeight} rx="20" fill="#f8fafc" />

          {yTicks.map((tick) => {
            const y = getY(tick)

            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="#cbd5e1"
                  strokeDasharray="4 6"
                />
                <text
                  x={padding.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="#64748b"
                >
                  {tick}
                </text>
              </g>
            )
          })}

          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={chartHeight - padding.bottom}
            stroke="#94a3b8"
          />
          <line
            x1={padding.left}
            y1={chartHeight - padding.bottom}
            x2={chartWidth - padding.right}
            y2={chartHeight - padding.bottom}
            stroke="#94a3b8"
          />

          <polyline
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={linePoints}
          />

          {rows.map((row) => {
            const x = getX(row.index)
            const hasMark = row.numericMark !== null
            const y = hasMark ? getY(row.numericMark) : chartHeight - padding.bottom
            const examLabelLines = formatAxisLabelLines(row.examLabel, 12, 2)
            const gradeLabelLines = formatAxisLabelLines(row.grade_name || '-', 12, 1)

            return (
              <g key={row.examKey}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={chartHeight - padding.bottom}
                  stroke="#e2e8f0"
                />

                {hasMark ? (
                  <>
                    <circle cx={x} cy={y} r="5" fill="#2563eb" />
                    <text
                      x={x}
                      y={y - 12}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="600"
                      fill="#1e293b"
                    >
                      {row.numericMark}
                    </text>
                  </>
                ) : (
                  <circle cx={x} cy={y} r="4" fill="#cbd5e1" />
                )}

                <text
                  x={x}
                  y={chartHeight - padding.bottom + 20}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#475569"
                >
                  {examLabelLines.map((line, index) => (
                    <tspan key={`${row.examKey}-exam-${index}`} x={x} dy={index === 0 ? 0 : 13}>
                      {line}
                    </tspan>
                  ))}
                </text>

                <text
                  x={x}
                  y={chartHeight - padding.bottom + 50}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#94a3b8"
                >
                  {gradeLabelLines.map((line, index) => (
                    <tspan key={`${row.examKey}-grade-${index}`} x={x} dy={index === 0 ? 0 : 12}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-slate-500">
        <div className="rounded-full bg-slate-100 px-3 py-1">
          Markah tertinggi: {Math.max(...numericRows.map((row) => row.numericMark))}
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1">
          Markah terendah: {Math.min(...numericRows.map((row) => row.numericMark))}
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1">
          Data ada markah: {numericRows.length}/{rows.length}
        </div>
      </div>
    </div>
  )
}
