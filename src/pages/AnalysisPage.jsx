import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

const getExamMetric = (analysis, examKey) => {
  const key = String(examKey || '').toUpperCase()
  return analysis?.[key] || { mark: null, grade_name: null, grade_point: null }
}

const getDefaultExamOrder = (examKey) => {
  const key = String(examKey || '').trim().toUpperCase()

  if (key === 'TOV') return 0
  if (key === 'ETR') return 999

  const otrMatch = key.match(/^OTR(\d+)$/)
  if (otrMatch) return Number(otrMatch[1]) * 10

  const arMatch = key.match(/^AR(\d+)$/)
  if (arMatch) return Number(arMatch[1]) * 10 + 1

  return 500
}

const isPassGrade = (grade) => {
  const value = String(grade || '').trim().toUpperCase()
  return ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E'].includes(value)
}

const isFailGrade = (grade) => {
  const value = String(grade || '').trim().toUpperCase()
  return value === 'G'
}

const isTHGrade = (grade) => {
  return String(grade || '').trim().toUpperCase() === 'TH'
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

const findGradeFromMark = (mark, tingkatan, gradeScales) => {
  const numericMark = Number(mark)
  if (Number.isNaN(numericMark)) return { grade_name: null, grade_point: null }

  const form = String(tingkatan || '').trim().toLowerCase()
  const matched = (gradeScales || []).find((item) => {
    const itemForm = String(
      item.tingkatan ?? item.grade_label ?? item.form_level ?? item.level ?? ''
    )
      .trim()
      .toLowerCase()
    const min = Number(item.min_mark ?? item.min_score ?? 0)
    const max = Number(item.max_mark ?? item.max_score ?? 100)

    return itemForm === form && numericMark >= min && numericMark <= max
  })

  if (!matched) return { grade_name: null, grade_point: null }

  return {
    grade_name: matched.grade_name ?? matched.grade ?? null,
    grade_point:
      matched.grade_point ??
      matched.point_value ??
      matched.grade_value ??
      null,
  }
}

const normalizeMetric = (metric, tingkatan, gradeScales) => {
  const mark = metric?.mark

  if (mark === null || mark === undefined || mark === '' || Number.isNaN(Number(mark))) {
    return {
      mark: mark ?? null,
      grade_name: metric?.grade_name ?? null,
      grade_point: metric?.grade_point ?? null,
      label: metric?.label,
    }
  }

  if (metric?.grade_name) return metric

  const computedGrade = findGradeFromMark(mark, tingkatan, gradeScales)

  return {
    ...metric,
    grade_name: computedGrade.grade_name,
    grade_point: computedGrade.grade_point,
  }
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
  const [gradeScales, setGradeScales] = useState([])
  const [setupConfig, setSetupConfig] = useState(null)
  const [levelMappings, setLevelMappings] = useState([])

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')

  const dashboardPath = getDashboardPath(profile)

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
      { data: gradeScalesData, error: gradeScalesError },
      { data: setupConfigRows, error: setupConfigError },
    ] = await Promise.all([
      supabase
        .from('classes')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year', currentYear),

      supabase
        .from('subjects')
        .select('*')
        .eq('school_id', schoolId)
        .eq('is_active', true),

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
        .from('grade_scales')
        .select('*')
        .eq('school_id', schoolId),

      supabase
        .from('school_setup_configs')
        .select('*')
        .eq('school_id', schoolId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1),
    ])

    if (classesError) console.error(classesError)
    if (subjectsError) console.error(subjectsError)
    if (enrollmentsError) console.error(enrollmentsError)
    if (scoresError) console.error(scoresError)
    if (targetsError) console.error(targetsError)
    if (gradeScalesError) console.error(gradeScalesError)
    if (setupConfigError) console.error(setupConfigError)

    const currentAcademicYear =
      setupConfigRows?.[0]?.current_academic_year || currentYear

    const { data: examConfigRows, error: examConfigError } = await supabase
      .from('exam_configs')
      .select('grade_label, exam_key, exam_name, exam_order, is_active')
      .eq('school_id', schoolId)
      .eq('academic_year', currentAcademicYear)

    const loadedLevelMappings = await fetchSchoolLevelLabels({
      schoolId,
      academicYear: currentAcademicYear,
    })

    if (examConfigError) console.error(examConfigError)

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
    setSetupConfig(
      normalizeSetupConfigWithExamConfigs(setupConfigRows?.[0] || null, examConfigRows || [])
    )

    const availableTingkatan = sortLevelsByDisplayOrder(
      [...new Set((classesData || []).map((c) => c.tingkatan).filter(Boolean))],
      loadedLevelMappings
    )

    if (availableTingkatan.length > 0) {
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
    const examMap = new Map()

    const addExam = ({ key, name, order }) => {
      const normalizedKey = String(key || '').trim().toUpperCase()
      if (!normalizedKey) return

      const current = examMap.get(normalizedKey)
      examMap.set(normalizedKey, {
        key: normalizedKey,
        name: name || current?.name || normalizedKey,
        order: Number.isFinite(Number(order))
          ? Number(order)
          : current?.order ?? getDefaultExamOrder(normalizedKey),
      })
    }

    addExam({ key: 'TOV', name: 'TOV', order: 0 })

    getExamStructureForGrade(setupConfig, selectedTingkatan).forEach((exam) => {
      addExam({
        key: exam.key,
        name: exam.name || exam.key,
        order: getDefaultExamOrder(exam.key),
      })
    })

    const selectedEnrollmentIds = new Set(
      filteredStudents.map((student) => student.enrollment_id)
    )

    ;(scores || [])
      .filter(
        (score) =>
          (!selectedSubjectId || score.subject_id === selectedSubjectId) &&
          selectedEnrollmentIds.has(score.student_enrollment_id)
      )
      .forEach((score) => {
        addExam({ key: score.exam_key, name: score.exam_key })
      })

    ;(targets || [])
      .filter(
        (target) =>
          (!selectedSubjectId || target.subject_id === selectedSubjectId) &&
          selectedEnrollmentIds.has(target.student_enrollment_id)
      )
      .forEach((target) => {
        addExam({ key: target.target_key, name: target.target_key })
      })

    return Array.from(examMap.values()).sort((a, b) => {
      const orderDiff = a.order - b.order
      if (orderDiff !== 0) return orderDiff

      return String(a.name || '').localeCompare(String(b.name || ''), 'ms', {
        sensitivity: 'base',
      })
    })
  }, [setupConfig, selectedTingkatan, filteredStudents, scores, targets, selectedSubjectId])

  const gradeColumns = useMemo(() => {
    return (gradeScales || [])
      .filter((grade) => {
        const label =
          grade.tingkatan ??
          grade.grade_label ??
          grade.form_level ??
          grade.level ??
          ''

        return String(label).trim().toLowerCase() === String(selectedTingkatan).trim().toLowerCase()
      })
      .sort((a, b) => {
        const minA = Number(a.min_mark ?? a.min_score ?? 0)
        const minB = Number(b.min_mark ?? b.min_score ?? 0)
        return minB - minA
      })
      .map((grade) => grade.grade_name ?? grade.grade ?? '')
      .filter(Boolean)
  }, [gradeScales, selectedTingkatan])

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
          const targetRow = studentTargets.find((t) => String(t.target_key || '').toUpperCase() === key)

          analysis[key] = normalizeMetric({
            mark: targetRow?.target_mark ?? null,
            grade_name: targetRow?.grade_name ?? null,
            grade_point: targetRow?.grade_point ?? null,
            label: exam.name || key,
          }, student.tingkatan, gradeScales)
        } else {
          const scoreRow = studentScores.find((s) => String(s.exam_key || '').toUpperCase() === key)

          analysis[key] = normalizeMetric({
            mark: scoreRow?.mark ?? null,
            grade_name: scoreRow?.grade_name ?? null,
            grade_point: scoreRow?.grade_point ?? null,
            label: exam.name || key,
          }, student.tingkatan, gradeScales)
        }
      })

      return {
        ...student,
        analysis,
      }
    })
  }, [filteredStudents, scores, targets, selectedSubjectId, analysisColumns, gradeScales])

  const summaryExamKey = useMemo(() => {
    const firstRealExam = analysisColumns.find((exam) => {
      const key = String(exam.key || '').toUpperCase()
      return key === 'TOV' || /^AR\d+$/.test(key) || key === 'ETR' || key.startsWith('OTR')
    })
    return String(firstRealExam?.key || '').toUpperCase()
  }, [analysisColumns])

  const summaryStats = useMemo(() => {
    if (!summaryExamKey) {
      return {
        totalStudents: filteredStudents.length,
        totalWithScore: 0,
        highest: null,
        lowest: null,
        average: null,
        gpmp: null,
      }
    }

    const examRows = mergedRows.map((row) => getExamMetric(row.analysis, summaryExamKey))

    const marks = examRows
      .map((item) => item.mark)
      .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
      .map((v) => Number(v))

    const points = mergedRows
      .map((row) => {
        const metric = getExamMetric(row.analysis, summaryExamKey)
        return getCurrentGradePoint(metric.grade_name, row.tingkatan, gradeScales)
      })
      .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
      .map((v) => Number(v))

    return {
      totalStudents: filteredStudents.length,
      totalWithScore: marks.length,
      highest: marks.length ? Math.max(...marks) : null,
      lowest: marks.length ? Math.min(...marks) : null,
      average: marks.length
        ? Number((marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(2))
        : null,
      gpmp: points.length
        ? Number((points.reduce((a, b) => a + b, 0) / points.length).toFixed(2))
        : null,
    }
  }, [filteredStudents, mergedRows, summaryExamKey, gradeScales])

  const summaryTableRows = useMemo(() => {
    if (!analysisColumns.length) return []

    return analysisColumns.map((exam) => {
      const examKey = String(exam.key || '').toUpperCase()
      const examLabel = exam.name || examKey

      const examData = mergedRows.map((row) => getExamMetric(row.analysis, examKey))

      const grades = examData.map((item) => item.grade_name || null)

      const gradeCounts = {}
      gradeColumns.forEach((grade) => {
        gradeCounts[grade] = grades.filter(
          (g) => String(g || '').trim().toUpperCase() === String(grade).trim().toUpperCase()
        ).length
      })

      const jumlahMurid = mergedRows.length

      const thCount = grades.filter((g) => isTHGrade(g)).length

      const hadir = grades.filter((g) => {
        const value = String(g || '').trim().toUpperCase()
        return value && value !== 'TH'
      }).length

      const tidakHadir = thCount

      const lulus = grades.filter((g) => isPassGrade(g)).length
      const gagal = grades.filter((g) => isFailGrade(g)).length

      const points = mergedRows
        .map((row) => {
          const metric = getExamMetric(row.analysis, examKey)
          return getCurrentGradePoint(metric.grade_name, row.tingkatan, gradeScales)
        })
        .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
        .map((v) => Number(v))

      const gpmp =
        points.length > 0
          ? Number((points.reduce((a, b) => a + b, 0) / points.length).toFixed(2))
          : null

      return {
        examKey,
        examLabel,
        jumlahMurid,
        hadir,
        tidakHadir,
        ...gradeCounts,
        lulus,
        peratusLulus: jumlahMurid ? Number(((lulus / jumlahMurid) * 100).toFixed(2)) : 0,
        gagal,
        peratusGagal: jumlahMurid ? Number(((gagal / jumlahMurid) * 100).toFixed(2)) : 0,
        gpmp,
      }
    })
  }, [analysisColumns, mergedRows, gradeColumns, gradeScales])

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

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate('/analysis/student')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:px-4 md:py-2 font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Analisis Individu
              </button>
              <button
                onClick={() => navigate('/analysis/student-subject')}
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
          <h2 className="mb-4 text-lg md:text-xl font-semibold text-slate-900">Filter Analisis</h2>

          <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-3">
            <select
              value={selectedTingkatan}
              onChange={(e) => setSelectedTingkatan(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 md:px-4 md:py-3 text-sm w-full"
            >
              {availableTingkatan.map((item) => (
                <option key={item} value={item}>
                  {getDisplayLevel(item, levelMappings)}
                </option>
              ))}
            </select>

            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 md:px-4 md:py-3 text-sm w-full"
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
              className="rounded-lg border border-slate-300 px-3 py-2.5 md:px-4 md:py-3 text-sm w-full"
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

        <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-5">
          <Card title="Murid" value={summaryStats.totalStudents} />
          <Card title="Ada Markah" value={summaryStats.totalWithScore} />
          <Card title="GPMP" value={summaryStats.gpmp ?? '-'} />
          <Card title="Tertinggi" value={summaryStats.highest ?? '-'} />
          <Card title="Purata" value={summaryStats.average ?? '-'} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-4 text-lg md:text-xl font-semibold text-slate-900">Ringkasan</h2>

            {summaryTableRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500">
                Tiada data ringkasan untuk paparan ini.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="min-w-full border-collapse text-xs md:text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border-b px-3 py-3 text-left font-semibold">Jenis Peperiksaan</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">Jumlah Murid</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">Hadir</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">Tak Hadir</th>
                      {gradeColumns.map((grade) => (
                        <th key={grade} className="border-b px-3 py-3 text-left font-semibold">
                          {grade}
                        </th>
                      ))}
                      <th className="border-b px-3 py-3 text-left font-semibold">Lulus</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">% Lulus</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">Gagal</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">% Gagal</th>
                      <th className="border-b px-3 py-3 text-left font-semibold">GPMP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryTableRows.map((row) => (
                      <tr key={row.examKey} className="border-b border-slate-100">
                        <td className="px-3 py-3 font-medium">{row.examLabel}</td>
                        <td className="px-3 py-3">{row.jumlahMurid}</td>
                        <td className="px-3 py-3">{row.hadir}</td>
                        <td className="px-3 py-3">{row.tidakHadir}</td>
                        {gradeColumns.map((grade) => (
                          <td key={`${row.examKey}-${grade}`} className="px-3 py-3">
                            {row[grade] ?? 0}
                          </td>
                        ))}
                        <td className="px-3 py-3">{row.lulus}</td>
                        <td className="px-3 py-3">{row.peratusLulus}%</td>
                        <td className="px-3 py-3">{row.gagal}</td>
                        <td className="px-3 py-3">{row.peratusGagal}%</td>
                        <td className="px-3 py-3">{row.gpmp ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg md:text-xl font-semibold text-slate-900">Jadual Murid</h2>
            <div className="text-xs md:text-sm text-slate-500">
              Rekod: <strong>{mergedRows.length}</strong>
            </div>
          </div>

          {!selectedSubjectId ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500 text-sm">
              Sila pilih subjek dahulu.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <table className="min-w-full border-collapse text-xs md:text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">Bil</th>
                    <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">IC</th>
                    <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">Nama</th>
                    <th className="border-b border-slate-200 px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-semibold text-slate-700">Kelas</th>
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
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{index + 1}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{row.ic_number}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium text-slate-800">{row.full_name}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{row.class_name}</td>
                      {analysisColumns.map((exam) => {
                        const key = String(exam.key || '').toUpperCase()
                        return (
                          <React.Fragment key={key}>
                            <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                              {row.analysis?.[key]?.mark ?? '-'}
                            </td>
                            <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
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
  const colorMap = {
    'Murid': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', value: 'text-blue-900' },
    'Ada Markah': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', value: 'text-emerald-900' },
    'GPMP': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600', value: 'text-purple-900' },
    'Tertinggi': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600', value: 'text-amber-900' },
    'Purata': { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-600', value: 'text-rose-900' },
  }

  const colors = colorMap[title] || { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', value: 'text-slate-900' }

  return (
    <div className={`rounded-lg border ${colors.bg} ${colors.border} p-4 md:p-5 shadow-sm`}>
      <div className={`text-xs md:text-sm ${colors.text} font-medium`}>{title}</div>
      <div className={`mt-2 text-xl md:text-2xl font-bold ${colors.value}`}>{value}</div>
    </div>
  )
}
