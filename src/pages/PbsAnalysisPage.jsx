import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import Student360PrintReport from '../components/Student360PrintReport.jsx'
import { getDashboardPath } from '../lib/dashboardPath.js'
import {
  fetchSchoolLevelLabels,
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import { getBmiCategory, getSegakFitnessLevel } from '../lib/pajskSegak.js'
import { HOLLAND_DIMENSIONS } from '../lib/psychometricImport.js'
import { getSubjectRuleName, shouldCountInStudentOverallGp } from '../lib/ssemjSubjectRules.js'
import { supabase } from '../lib/supabaseClient.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const PBD_RADAR_SCORES = {
  1: 17,
  2: 33,
  3: 50,
  4: 67,
  5: 83,
  6: 100,
}

const PBD_DESCRIPTIONS = {
  1: 'memerlukan bimbingan asas',
  2: 'menunjukkan penguasaan terhad',
  3: 'menguasai pengetahuan dan kemahiran asas',
  4: 'menguasai pengetahuan dan kemahiran dengan baik',
  5: 'menguasai dan mengaplikasi kemahiran dengan sangat baik',
  6: 'menguasai serta mengaplikasi kemahiran secara cemerlang',
}

const HOLLAND_COMMENTS = {
  R: 'Kecenderungan dominan Realistik menunjukkan minat terhadap aktiviti praktikal, teknikal dan kerja lapangan.',
  I: 'Kecenderungan dominan Investigatif menunjukkan minat terhadap analisis, penyiasatan dan penyelesaian masalah.',
  A: 'Kecenderungan dominan Artistik menunjukkan minat terhadap kreativiti, reka bentuk dan ekspresi.',
  S: 'Kecenderungan dominan Sosial menunjukkan minat terhadap aktiviti membantu, membimbing dan berkomunikasi.',
  E: 'Kecenderungan dominan Enterprising menunjukkan minat terhadap kepimpinan, pengurusan dan keusahawanan.',
  K: 'Kecenderungan dominan Konvensional menunjukkan minat terhadap kerja tersusun, data dan ketelitian.',
}

const getCurrentYear = () => new Date().getFullYear()

const buildYearOptions = (year) => {
  const baseYear = Number(year) || getCurrentYear()
  return [baseYear - 2, baseYear - 1, baseYear, baseYear + 1]
}

const normalizeKey = (value) => String(value || '').trim().toLocaleUpperCase('ms-MY')

const getGradeNumber = (value) => String(value || '').match(/\d+/)?.[0] || ''

const isSameGrade = (left, right) => {
  const leftKey = normalizeKey(left)
  const rightKey = normalizeKey(right)
  if (leftKey === rightKey) return true

  const leftNumber = getGradeNumber(left)
  const rightNumber = getGradeNumber(right)
  return Boolean(leftNumber && rightNumber && leftNumber === rightNumber)
}

const toNumericMark = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const average = (values, digits = 2) => {
  const numericValues = values
    .map((value) => toNumericMark(value))
    .filter((value) => value !== null)

  if (!numericValues.length) return null

  return Number(
    (numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length).toFixed(digits)
  )
}

const clampScore = (value) => {
  const number = toNumericMark(value)
  return number === null ? null : Math.min(Math.max(number, 0), 100)
}

const groupRowsByEnrollment = (rows) => {
  const grouped = new Map()

  ;(rows || []).forEach((row) => {
    const key = String(row.student_enrollment_id || '')
    if (!key) return
    const current = grouped.get(key) || []
    current.push(row)
    grouped.set(key, current)
  })

  return grouped
}

const getDominantValue = (values) => {
  const counts = new Map()

  values.forEach((value) => {
    if (value === null || value === undefined || value === '') return
    const key = String(value)
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  return [...counts.entries()].sort(
    ([valueA, countA], [valueB, countB]) =>
      countB - countA || valueA.localeCompare(valueB, 'ms', { numeric: true })
  )[0]?.[0] || null
}

const getDominantGrade = (rows) => {
  const counts = new Map()

  rows.forEach((row) => {
    const grade = String(row.grade_name || '').trim()
    if (grade) counts.set(grade, (counts.get(grade) || 0) + 1)
  })

  return [...counts.entries()].sort(
    ([gradeA, countA], [gradeB, countB]) =>
      countB - countA || gradeA.localeCompare(gradeB, 'ms', { sensitivity: 'base' })
  )[0]?.[0] || null
}

const getGradeScalesForLevel = (gradeScales, gradeLabel) =>
  (gradeScales || [])
    .filter((scale) => isSameGrade(scale.grade_label ?? scale.tingkatan, gradeLabel))
    .sort((a, b) => Number(b.min_mark ?? b.min_score ?? 0) - Number(a.min_mark ?? a.min_score ?? 0))

const resolveScoreGrade = (score, levelGradeScales) => {
  const storedGrade = String(score?.grade_name || '').trim()
  const storedGradeKey = normalizeKey(storedGrade)
  const mark = toNumericMark(score?.mark)
  const matchedByStoredGrade = levelGradeScales.find(
    (scale) => normalizeKey(scale.grade_name ?? scale.grade) === storedGradeKey
  )
  const matchedByMark =
    score?.is_absent || mark === null
      ? null
      : levelGradeScales.find((scale) => {
          if (normalizeKey(scale.grade_name ?? scale.grade) === 'TH') return false
          const min = toNumericMark(scale.min_mark ?? scale.min_score)
          const max = toNumericMark(scale.max_mark ?? scale.max_score)
          return min !== null && max !== null && mark >= min && mark <= max
        })
  const matchedScale = matchedByMark || matchedByStoredGrade || null
  const scalePoint = toNumericMark(matchedScale?.grade_point)

  return {
    ...score,
    grade_name: matchedScale?.grade_name ?? matchedScale?.grade ?? storedGrade ?? null,
    grade_point: scalePoint ?? toNumericMark(score?.grade_point),
  }
}

const getGpScaleRange = (gradeScales, gradeLabel) => {
  const points = getGradeScalesForLevel(gradeScales, gradeLabel)
    .map((scale) => toNumericMark(scale.grade_point))
    .filter((point) => point !== null)

  if (!points.length) return null

  return {
    best: Math.min(...points),
    worst: Math.max(...points),
  }
}

const normalizeGpForRadar = (gp, range) => {
  const numericGp = toNumericMark(gp)
  if (numericGp === null || !range) return null
  if (range.best === range.worst) return 100

  return clampScore(((range.worst - numericGp) / (range.worst - range.best)) * 100)
}

const getLatestAcademicExam = ({ scores, examConfigs, gradeLabel }) =>
  examConfigs
    .filter((exam) => isSameGrade(exam.grade_label, gradeLabel))
    .sort((a, b) => Number(b.exam_order || 0) - Number(a.exam_order || 0))
    .find((exam) =>
      scores.some((score) => {
        const sameExam =
          (score.exam_config_id && String(score.exam_config_id) === String(exam.id)) ||
          normalizeKey(score.exam_key) === normalizeKey(exam.exam_key)
        return (
          sameExam &&
          (toNumericMark(score.mark) !== null || toNumericMark(score.grade_point) !== null)
        )
      })
    ) || null

const buildAcademicSummary = ({
  scores,
  examConfigs,
  gradeLabel,
  selectedExam: requestedExam = null,
  subjects = [],
  schoolInfo = null,
  gradeScales = [],
}) => {
  const matchingExams = examConfigs
    .filter((exam) => isSameGrade(exam.grade_label, gradeLabel))
    .sort((a, b) => Number(b.exam_order || 0) - Number(a.exam_order || 0))

  const selectedExam =
    requestedExam ||
    getLatestAcademicExam({
      scores,
      examConfigs: matchingExams,
      gradeLabel,
    })

  if (!selectedExam) {
    return {
      hasData: false,
      score: null,
      gp: null,
      gpScore: null,
      gpRange: getGpScaleRange(gradeScales, gradeLabel),
      averageMark: null,
      subjectCount: 0,
      dominantGrade: null,
      examKey: null,
      examName: null,
      subjectResults: [],
    }
  }

  const examRows = scores.filter(
    (score) =>
      ((score.exam_config_id && String(score.exam_config_id) === String(selectedExam.id)) ||
        normalizeKey(score.exam_key) === normalizeKey(selectedExam.exam_key))
  )
  const levelGradeScales = getGradeScalesForLevel(gradeScales, gradeLabel)
  const resolvedExamRows = examRows.map((score) => resolveScoreGrade(score, levelGradeScales))
  const subjectById = new Map(subjects.map((subject) => [String(subject.id), subject]))
  const marks = resolvedExamRows.map((row) => toNumericMark(row.mark)).filter((mark) => mark !== null)
  const gradePoints = resolvedExamRows
    .filter((row) =>
      shouldCountInStudentOverallGp({
        schoolInfo,
        tingkatan: gradeLabel,
        subjectName: getSubjectRuleName(subjectById.get(String(row.subject_id))),
        examKey: selectedExam.exam_key,
      })
    )
    .map((row) => toNumericMark(row.grade_point))
    .filter((point) => point !== null)
  const averageMark = average(marks)
  const gp = average(gradePoints)
  const gpRange = getGpScaleRange(gradeScales, gradeLabel)
  const subjectResults = resolvedExamRows
    .filter(
      (row) =>
        toNumericMark(row.mark) !== null ||
        toNumericMark(row.grade_point) !== null ||
        String(row.grade_name || '').trim()
    )
    .map((row) => {
      const subject = subjectById.get(String(row.subject_id)) || null

      return {
        subjectId: row.subject_id,
        subjectName: subject?.subject_name || subject?.subject_code || 'Subjek tidak dinamakan',
        subjectCode: subject?.subject_code || '',
        mark: toNumericMark(row.mark),
        grade: row.grade_name || '',
        gradePoint: toNumericMark(row.grade_point),
      }
    })
    .sort((a, b) =>
      a.subjectName.localeCompare(b.subjectName, 'ms', {
        sensitivity: 'base',
        numeric: true,
      })
    )

  return {
    hasData: marks.length > 0 || gradePoints.length > 0,
    score: clampScore(averageMark),
    gp,
    gpScore: normalizeGpForRadar(gp, gpRange),
    gpRange,
    averageMark,
    subjectCount: new Set(
      examRows
        .filter(
          (row) =>
            toNumericMark(row.mark) !== null || toNumericMark(row.grade_point) !== null
        )
        .map((row) => String(row.subject_id))
    ).size,
    dominantGrade: getDominantGrade(resolvedExamRows),
    examKey: selectedExam.exam_key,
    examName: selectedExam.exam_name || selectedExam.exam_key,
    subjectResults,
  }
}

const buildPbdSummary = (rows) => {
  const levels = rows
    .map((row) => toNumericMark(row.tp ?? row.tp_level))
    .filter((level) => Number.isInteger(level) && level >= 1 && level <= 6)

  if (!levels.length) {
    return {
      hasData: false,
      averageTp: null,
      dominantTp: null,
      radarScore: null,
      displayValue: 'Tidak tersedia',
      detail: 'Data PBD belum direkodkan.',
    }
  }

  const averageTp = average(levels, 1)
  const dominantTp = Number(getDominantValue(levels))
  const distribution = [1, 2, 3, 4, 5, 6]
    .map((level) => `TP${level}: ${levels.filter((value) => value === level).length}`)
    .join(' | ')

  return {
    hasData: true,
    averageTp,
    dominantTp,
    radarScore: average(levels.map((level) => PBD_RADAR_SCORES[level])),
    displayValue: `Purata TP ${averageTp.toFixed(1)}`,
    detail: `Tahap dominan TP${dominantTp}, ${PBD_DESCRIPTIONS[dominantTp]}. ${distribution}.`,
  }
}

const getLatestSegakRow = (rows) =>
  [...rows].sort((a, b) => {
    const timeA = Date.parse(a.updated_at || a.assessment_date || '') || 0
    const timeB = Date.parse(b.updated_at || b.assessment_date || '') || 0
    if (timeA !== timeB) return timeB - timeA
    return String(b.term || '').localeCompare(String(a.term || ''))
  })[0] || null

const buildSegakSummary = (rows) => {
  const row = getLatestSegakRow(rows)
  const rawScore = toNumericMark(row?.segak_total_score)
  const normalizedScore = rawScore === null ? null : clampScore(rawScore * 5)
  const bmi = toNumericMark(row?.bmi)
  const bmiCategory = row?.bmi_category || getBmiCategory(bmi)
  const fitnessLevel =
    row?.fitness_level || row?.fitness_statement || getSegakFitnessLevel(rawScore, row?.is_absent)

  return {
    hasData: Boolean(row) && (rawScore !== null || bmi !== null),
    rawScore,
    radarScore: normalizedScore,
    displayValue:
      rawScore === null
        ? 'Tidak tersedia'
        : `${rawScore.toFixed(0)}/20 (${normalizedScore.toFixed(0)}/100)`,
    detail:
      rawScore === null
        ? 'Data SEGAK belum direkodkan.'
        : `${fitnessLevel || 'Kategori kecergasan belum direkodkan'}${
            row?.segak_grade ? ` | Gred ${row.segak_grade}` : ''
          }.`,
    bmi,
    bmiCategory,
    bmiDisplayValue: bmi === null ? 'Tidak tersedia' : bmi.toFixed(2),
    bmiDetail:
      bmi === null
        ? 'Data BMI belum direkodkan.'
        : `Kategori BMI: ${bmiCategory || 'kategori belum direkodkan'}.`,
  }
}

const buildPajskSummary = (kokurikulumRows, ekstraRows) => {
  const rows = [
    ...kokurikulumRows.map((row) => ({ ...row, sourceLabel: 'Kokurikulum' })),
    ...ekstraRows.map((row) => ({ ...row, sourceLabel: 'Ekstrakurikulum' })),
  ].filter((row) => toNumericMark(row.score) !== null || row.grade)
  const primaryRow =
    rows.find((row) => row.sourceLabel === 'Kokurikulum' && toNumericMark(row.score) !== null) ||
    rows.find((row) => toNumericMark(row.score) !== null) ||
    rows[0]
  const score = toNumericMark(primaryRow?.score)

  if (!rows.length) {
    return {
      hasData: false,
      radarScore: null,
      displayValue: 'Tidak tersedia',
      detail: 'Data PAJSK belum direkodkan.',
    }
  }

  const rowDetails = rows
    .map((row) => {
      const rowScore = toNumericMark(row.score)
      return `${row.sourceLabel}: ${
        rowScore === null ? 'markah tidak tersedia' : `${rowScore.toFixed(1)}%`
      }${row.grade ? `, gred ${row.grade}` : ''}`
    })
    .join(' | ')

  return {
    hasData: true,
    radarScore: clampScore(score),
    displayValue:
      score === null
        ? primaryRow?.grade || 'Direkodkan'
        : `${score.toFixed(1)}%${primaryRow?.grade ? ` | Gred ${primaryRow.grade}` : ''}`,
    detail: `${rowDetails}.`,
  }
}

const buildPsychometricSummary = (result) => {
  const scores = HOLLAND_DIMENSIONS.map((dimension) => ({
    ...dimension,
    score: toNumericMark(result?.raw_data?.[dimension.key]),
  }))
  const hasData = scores.some((dimension) => dimension.score !== null)
  const derivedCode = [...scores]
    .filter((dimension) => dimension.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((dimension) => dimension.key)
    .join('')
  const code = String(result?.dominant_code || derivedCode || '').toLocaleUpperCase('ms-MY')
  const dominantKeys = [...code]
    .filter((key, index, keys) => HOLLAND_COMMENTS[key] && keys.indexOf(key) === index)
    .slice(0, 3)
  const expandedCode = dominantKeys
    .map((key) => HOLLAND_DIMENSIONS.find((dimension) => dimension.key === key)?.label)
    .filter(Boolean)
    .join(', ')
  const comment = dominantKeys
    .map((key) => HOLLAND_COMMENTS[key])
    .filter(Boolean)
    .join(' ')

  return {
    hasData,
    code,
    expandedCode: expandedCode || 'Huraian kod Holland belum tersedia.',
    comment: comment || 'Kecenderungan dominan belum dapat ditentukan.',
    maxScore: Math.max(...scores.map((dimension) => dimension.score || 0), 1),
    radar: scores.map((dimension) => ({
      label: dimension.key,
      score: dimension.score,
      available: dimension.score !== null,
      digits: 0,
    })),
  }
}

const findPsychometricResult = (results, student) =>
  results.find(
    (row) => String(row.student_enrollment_id || '') === String(student.id)
  ) ||
  results.find(
    (row) =>
      !row.student_enrollment_id &&
      String(row.student_profile_id || '') === String(student.student_profile_id || '') &&
      String(row.class_id || '') === String(student.class_id || '')
  ) ||
  null

const buildProfileSummarySentences = ({
  academic,
  classRanking,
  pbd,
  segak,
  pajsk,
  psychometric,
}) => [
  academic.hasData
    ? `Dalam ${academic.examName || 'peperiksaan terkini'}, murid mencatat GP ${
        academic.gp === null ? 'yang belum tersedia' : academic.gp.toFixed(2)
      } dan peratus keseluruhan ${
        academic.averageMark === null ? 'yang belum tersedia' : `${academic.averageMark.toFixed(1)}%`
      }${academic.dominantGrade ? ` dengan gred dominan ${academic.dominantGrade}` : ''}${
        classRanking?.rank
          ? ` serta berada pada kedudukan ${classRanking.rank} daripada ${classRanking.classStudentCount} murid dalam kelas berdasarkan GP`
          : ''
      }.`
    : 'Data akademik belum direkodkan untuk tahun akademik ini.',
  pbd.hasData
    ? `PBD menunjukkan purata TP ${pbd.averageTp.toFixed(1)} dengan tahap dominan TP${pbd.dominantTp}, yang ${PBD_DESCRIPTIONS[pbd.dominantTp]}.`
    : 'Data PBD belum direkodkan.',
  segak.radarScore !== null
    ? `Skor SEGAK terkini ialah ${segak.displayValue} dan BMI ${
        segak.bmi === null ? 'belum direkodkan' : `${segak.bmi.toFixed(2)} (${segak.bmiCategory})`
      }.`
    : segak.bmi !== null
      ? `Data SEGAK belum direkodkan, manakala BMI ialah ${segak.bmi.toFixed(2)} (${segak.bmiCategory}).`
      : 'Data SEGAK dan BMI belum direkodkan.',
  pajsk.hasData
    ? `Rekod PAJSK menunjukkan ${pajsk.displayValue}.`
    : 'Data PAJSK belum direkodkan.',
  psychometric.hasData
    ? `Profil IMK berkod ${psychometric.code || '-'} merujuk kepada ${psychometric.expandedCode}; ${psychometric.comment.charAt(0).toLocaleLowerCase('ms-MY')}${psychometric.comment.slice(1)}`
    : 'Data IMK belum tersedia.',
]

const buildStudent360Profile = ({
  student,
  classRow,
  examConfigs,
  levelMappings,
  subjects,
  selectedAcademicExam,
  academicSummary,
  classRanking,
  schoolInfo,
  gradeScales,
  scores,
  pbdCurrentRows,
  pbdLegacyRows,
  segakRows,
  pajskKokurikulumRows,
  pajskEkstraRows,
  psychometricResults,
}) => {
  const academic =
    academicSummary ||
    buildAcademicSummary({
      scores,
      examConfigs,
      gradeLabel: classRow?.tingkatan,
      selectedExam: selectedAcademicExam,
      subjects,
      schoolInfo,
      gradeScales,
    })
  const pbd = buildPbdSummary(pbdCurrentRows.length ? pbdCurrentRows : pbdLegacyRows)
  const segak = buildSegakSummary(segakRows)
  const pajsk = buildPajskSummary(pajskKokurikulumRows, pajskEkstraRows)
  const psychometric = buildPsychometricSummary(findPsychometricResult(psychometricResults, student))
  const pbsRadar = [
    {
      label: 'GP Murid',
      score: academic.gpScore,
      available: academic.gpScore !== null,
      digits: 0,
      displayScore: academic.gp === null ? '-' : academic.gp.toFixed(2),
    },
    {
      label: 'Peratus Keseluruhan',
      score: academic.averageMark,
      available: academic.averageMark !== null,
      digits: 0,
    },
    {
      label: 'PBD',
      score: pbd.radarScore,
      available: pbd.radarScore !== null,
      digits: 0,
    },
    {
      label: 'SEGAK',
      score: segak.radarScore,
      available: segak.radarScore !== null,
      digits: 0,
      displayScore: segak.rawScore === null ? '-' : `${segak.rawScore.toFixed(0)}/20`,
    },
    {
      label: 'PAJSK',
      score: pajsk.radarScore,
      available: pajsk.radarScore !== null,
      digits: 0,
    },
  ]

  return {
    id: student.id,
    studentName: student.student_profiles?.full_name || 'Nama murid tidak tersedia',
    icNumber: student.student_profiles?.ic_number || '',
    className: classRow?.class_name || '-',
    levelName: getDisplayLevel(classRow?.tingkatan, levelMappings) || '-',
    academic,
    classRanking: classRanking || null,
    pbd,
    segak,
    pajsk,
    psychometric,
    pbsRadar,
    summarySentences: buildProfileSummarySentences({
      academic,
      classRanking,
      pbd,
      segak,
      pajsk,
      psychometric,
    }),
  }
}

const buildClassRankingMap = (students, academicByEnrollment) => {
  const studentsByClass = new Map()

  students.forEach((student) => {
    const classId = String(student.class_id || '')
    if (!classId) return
    const current = studentsByClass.get(classId) || []
    current.push(student)
    studentsByClass.set(classId, current)
  })

  const rankings = new Map()

  studentsByClass.forEach((classStudents) => {
    const rankedStudents = classStudents
      .map((student) => ({
        student,
        academic: academicByEnrollment.get(String(student.id)) || null,
      }))
      .filter(({ academic }) => academic?.gp !== null && academic?.gp !== undefined)
      .sort((a, b) => {
        if (a.academic.gp !== b.academic.gp) return a.academic.gp - b.academic.gp

        const averageA = a.academic.averageMark ?? -1
        const averageB = b.academic.averageMark ?? -1
        if (averageA !== averageB) return averageB - averageA

        return String(a.student.student_profiles?.full_name || '').localeCompare(
          String(b.student.student_profiles?.full_name || ''),
          'ms',
          { sensitivity: 'base' }
        )
      })

    rankedStudents.forEach(({ student }, index) => {
      rankings.set(String(student.id), {
        rank: index + 1,
        rankedCount: rankedStudents.length,
        classStudentCount: classStudents.length,
      })
    })
  })

  return rankings
}

export default function PbsAnalysisPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  const [loading, setLoading] = useState(true)
  const [screenReportLoading, setScreenReportLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [levelMappings, setLevelMappings] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [examConfigs, setExamConfigs] = useState([])
  const [gradeScales, setGradeScales] = useState([])
  const [screenReport, setScreenReport] = useState(null)
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedStudentEnrollmentId, setSelectedStudentEnrollmentId] = useState('')
  const [printMode, setPrintMode] = useState(null)
  const [printStudents, setPrintStudents] = useState([])
  const [isPreparingPrint, setIsPreparingPrint] = useState(false)

  const initPage = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    try {
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
        .select('id, school_id, role, is_school_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || !profileData?.school_id) {
        navigate('/login', { replace: true })
        return
      }

      const [
        { data: setupRows, error: setupError },
        { data: schoolData, error: schoolError },
      ] = await Promise.all([
        supabase
          .from('school_setup_configs')
          .select('current_academic_year')
          .eq('school_id', profileData.school_id)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('schools')
          .select('id, school_name, school_code, school_type, logo_url')
          .eq('id', profileData.school_id)
          .maybeSingle(),
      ])

      if (setupError) throw setupError
      if (schoolError) throw schoolError

      setProfile(profileData)
      setSchoolInfo(schoolData || null)
      setAcademicYear(setupRows?.[0]?.current_academic_year || getCurrentYear())
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan Profil PBS Bersepadu.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const loadYearData = useCallback(async () => {
    if (!profile?.school_id || !academicYear) return

    setLoading(true)
    setErrorMessage('')

    try {
      const [
        loadedLevelMappings,
        { data: classRows, error: classError },
        { data: subjectRows, error: subjectError },
        { data: enrollmentRows, error: enrollmentError },
        { data: examRows, error: examError },
        { data: gradeScaleRows, error: gradeScaleError },
      ] = await Promise.all([
        fetchSchoolLevelLabels({
          schoolId: profile.school_id,
          academicYear: Number(academicYear),
        }),
        supabase
          .from('classes')
          .select('id, tingkatan, class_name, academic_year, is_active')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .eq('is_active', true)
          .order('tingkatan', { ascending: true })
          .order('class_name', { ascending: true }),
        supabase
          .from('subjects')
          .select('id, subject_name, subject_code, tingkatan, is_active')
          .eq('school_id', profile.school_id)
          .eq('is_active', true)
          .order('subject_name', { ascending: true }),
        supabase
          .from('student_enrollments')
          .select(`
            id,
            class_id,
            student_profile_id,
            student_profiles (
              id,
              full_name,
              ic_number
            )
          `)
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .eq('is_active', true),
        supabase
          .from('exam_configs')
          .select('id, grade_label, exam_key, exam_name, exam_order, is_active')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .eq('is_active', true)
          .order('exam_order', { ascending: true }),
        supabase
          .from('grade_scales')
          .select('id, grade_label, grade_name, min_mark, max_mark, grade_point, is_pass')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .order('min_mark', { ascending: false }),
      ])

      if (classError) throw classError
      if (subjectError) throw subjectError
      if (enrollmentError) throw enrollmentError
      if (examError) throw examError
      if (gradeScaleError) throw gradeScaleError

      setLevelMappings(loadedLevelMappings || [])
      setClasses(classRows || [])
      setSubjects(subjectRows || [])
      setEnrollments(enrollmentRows || [])
      setExamConfigs(examRows || [])
      setGradeScales(gradeScaleRows || [])
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan data PBS bagi tahun yang dipilih.')
    } finally {
      setLoading(false)
    }
  }, [academicYear, profile?.school_id])

  useEffect(() => {
    if (checkingAuth) return
    initPage()
  }, [checkingAuth, initPage])

  useEffect(() => {
    loadYearData()
  }, [loadYearData])

  const classById = useMemo(
    () => new Map(classes.map((classRow) => [String(classRow.id), classRow])),
    [classes]
  )

  const availableGrades = useMemo(
    () => sortLevelsByDisplayOrder(classes.map((classRow) => classRow.tingkatan), levelMappings),
    [classes, levelMappings]
  )

  const availableClasses = useMemo(
    () =>
      classes
        .filter((classRow) => !selectedGrade || classRow.tingkatan === selectedGrade)
        .sort((a, b) =>
          getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
            getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
            'ms',
            { sensitivity: 'base', numeric: true }
          )
        ),
    [classes, levelMappings, selectedGrade]
  )

  const availableStudents = useMemo(() => {
    if (!selectedClassId) return []

    return enrollments
      .filter((enrollment) => String(enrollment.class_id) === String(selectedClassId))
      .sort((a, b) =>
        String(a.student_profiles?.full_name || '').localeCompare(
          String(b.student_profiles?.full_name || ''),
          'ms',
          { sensitivity: 'base' }
        )
      )
  }, [enrollments, selectedClassId])

  const selectedStudent = useMemo(
    () =>
      availableStudents.find(
        (enrollment) => String(enrollment.id) === String(selectedStudentEnrollmentId)
      ) || null,
    [availableStudents, selectedStudentEnrollmentId]
  )

  const loadStudentReports = useCallback(
    async (studentsToReport, rankingStudents = studentsToReport) => {
      if (!profile?.school_id || !academicYear || !studentsToReport.length) return []

      const reportEnrollmentIds = studentsToReport.map((student) => student.id)
      const rankingEnrollmentIds = [...new Set(rankingStudents.map((student) => student.id))]
      const classIds = [
        ...new Set(studentsToReport.map((student) => student.class_id).filter(Boolean)),
      ]
      let psychometricQuery = supabase
        .from('psychometric_results')
        .select(
          'id, class_id, student_profile_id, student_enrollment_id, dominant_code, primary_dimension, raw_data, updated_at'
        )
        .eq('school_id', profile.school_id)
        .eq('academic_year', Number(academicYear))
        .eq('assessment_type', 'career_interest')
        .eq('assessment_name', 'IMK')

      if (classIds.length) psychometricQuery = psychometricQuery.in('class_id', classIds)

      const [
        scoreResult,
        pbdCurrentResult,
        pbdLegacyResult,
        segakResult,
        pajskKokurikulumResult,
        pajskEkstraResult,
        psychometricResultRows,
      ] = await Promise.all([
        supabase
          .from('student_scores')
          .select(
            'id, student_enrollment_id, subject_id, exam_config_id, exam_key, mark, grade_name, grade_point, is_absent'
          )
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .in('student_enrollment_id', rankingEnrollmentIds),
        supabase
          .from('student_pbd_current')
          .select('id, student_enrollment_id, subject_id, tp, evidence_note, teacher_note, updated_at')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .in('student_enrollment_id', reportEnrollmentIds),
        supabase
          .from('student_pbd_scores')
          .select('id, student_enrollment_id, subject_id, tp_level, evidence_note, updated_at')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .in('student_enrollment_id', reportEnrollmentIds),
        supabase
          .from('student_pajsk_segak')
          .select(
            'id, student_enrollment_id, term, bmi, bmi_category, segak_total_score, segak_grade, fitness_level, fitness_statement, is_absent, assessment_date, updated_at'
          )
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .in('student_enrollment_id', reportEnrollmentIds),
        supabase
          .from('student_pajsk_kokurikulum')
          .select('id, student_enrollment_id, score, grade, remarks, assessment_date, updated_at')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .in('student_enrollment_id', reportEnrollmentIds),
        supabase
          .from('student_pajsk_ekstra')
          .select('id, student_enrollment_id, score, grade, remarks, assessment_date, updated_at')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .in('student_enrollment_id', reportEnrollmentIds),
        psychometricQuery.order('updated_at', { ascending: false }).limit(1000),
      ])

      const rowsFrom = (result, label, required = false) => {
        if (result.error) {
          console.error(`Gagal memuatkan ${label} untuk laporan:`, result.error)
          if (required) throw result.error
        }
        return result.data || []
      }
      const scoreRows = rowsFrom(scoreResult, 'akademik', true)
      const pbdCurrentRows = rowsFrom(pbdCurrentResult, 'PBD semasa')
      const pbdLegacyRows = rowsFrom(pbdLegacyResult, 'PBD lama')
      const segakRows = rowsFrom(segakResult, 'SEGAK')
      const pajskKokurikulumRows = rowsFrom(pajskKokurikulumResult, 'PAJSK kokurikulum')
      const pajskEkstraRows = rowsFrom(pajskEkstraResult, 'PAJSK ekstrakurikulum')
      const psychometricRows = rowsFrom(psychometricResultRows, 'IMK')
      const scoresByEnrollment = groupRowsByEnrollment(scoreRows)
      const pbdCurrentByEnrollment = groupRowsByEnrollment(pbdCurrentRows)
      const pbdLegacyByEnrollment = groupRowsByEnrollment(pbdLegacyRows)
      const segakByEnrollment = groupRowsByEnrollment(segakRows)
      const pajskKokurikulumByEnrollment = groupRowsByEnrollment(pajskKokurikulumRows)
      const pajskEkstraByEnrollment = groupRowsByEnrollment(pajskEkstraRows)
      const classExamById = new Map()

      rankingStudents.forEach((student) => {
        const classId = String(student.class_id || '')
        if (!classId || classExamById.has(classId)) return

        const classRow = classById.get(classId) || null
        const classEnrollmentIds = new Set(
          rankingStudents
            .filter((row) => String(row.class_id || '') === classId)
            .map((row) => String(row.id))
        )
        const classScores = scoreRows.filter((row) =>
          classEnrollmentIds.has(String(row.student_enrollment_id))
        )

        classExamById.set(
          classId,
          getLatestAcademicExam({
            scores: classScores,
            examConfigs,
            gradeLabel: classRow?.tingkatan,
          })
        )
      })

      const academicByEnrollment = new Map(
        rankingStudents.map((student) => {
          const classRow = classById.get(String(student.class_id)) || null
          return [
            String(student.id),
            buildAcademicSummary({
              scores: scoresByEnrollment.get(String(student.id)) || [],
              examConfigs,
              gradeLabel: classRow?.tingkatan,
              selectedExam: classExamById.get(String(student.class_id)) || null,
              subjects,
              schoolInfo,
              gradeScales,
            }),
          ]
        })
      )
      const rankingByEnrollment = buildClassRankingMap(rankingStudents, academicByEnrollment)

      return studentsToReport.map((student) =>
        buildStudent360Profile({
          student,
          classRow: classById.get(String(student.class_id)) || null,
          examConfigs,
          levelMappings,
          subjects,
          selectedAcademicExam: classExamById.get(String(student.class_id)) || null,
          academicSummary: academicByEnrollment.get(String(student.id)) || null,
          classRanking: rankingByEnrollment.get(String(student.id)) || null,
          schoolInfo,
          gradeScales,
          scores: scoresByEnrollment.get(String(student.id)) || [],
          pbdCurrentRows: pbdCurrentByEnrollment.get(String(student.id)) || [],
          pbdLegacyRows: pbdLegacyByEnrollment.get(String(student.id)) || [],
          segakRows: segakByEnrollment.get(String(student.id)) || [],
          pajskKokurikulumRows: pajskKokurikulumByEnrollment.get(String(student.id)) || [],
          pajskEkstraRows: pajskEkstraByEnrollment.get(String(student.id)) || [],
          psychometricResults: psychometricRows,
        })
      )
    },
    [
      academicYear,
      classById,
      examConfigs,
      gradeScales,
      levelMappings,
      profile?.school_id,
      schoolInfo,
      subjects,
    ]
  )

  useEffect(() => {
    if (!selectedStudent) {
      setScreenReport(null)
      setScreenReportLoading(false)
      return
    }

    let cancelled = false

    const loadScreenReport = async () => {
      setScreenReportLoading(true)
      setScreenReport(null)
      setErrorMessage('')

      try {
        const reports = await loadStudentReports([selectedStudent], availableStudents)
        if (!cancelled) setScreenReport(reports[0] || null)
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setScreenReport(null)
          setErrorMessage(error.message || 'Gagal memuatkan laporan Profil Murid 360°.')
        }
      } finally {
        if (!cancelled) setScreenReportLoading(false)
      }
    }

    loadScreenReport()

    return () => {
      cancelled = true
    }
  }, [availableStudents, loadStudentReports, selectedStudent])

  const preparePrintStudents = useCallback(
    async (studentsToPrint, mode) => {
      if (!profile?.school_id || !academicYear || !studentsToPrint.length) return

      setPrintMode(mode)
      setPrintStudents([])
      setIsPreparingPrint(true)
      setErrorMessage('')

      try {
        const rankingStudents = mode === 'class' ? studentsToPrint : availableStudents
        setPrintStudents(await loadStudentReports(studentsToPrint, rankingStudents))
      } catch (error) {
        console.error(error)
        setPrintMode(null)
        setPrintStudents([])
        setErrorMessage(error.message || 'Gagal menyediakan laporan Profil Murid 360°.')
      } finally {
        setIsPreparingPrint(false)
      }
    },
    [academicYear, availableStudents, loadStudentReports, profile?.school_id]
  )

  const handlePrintIndividual = useCallback(() => {
    if (!selectedStudent) return
    preparePrintStudents([selectedStudent], 'individual')
  }, [preparePrintStudents, selectedStudent])

  const handlePrintClass = useCallback(() => {
    if (!selectedClassId || !availableStudents.length) return
    preparePrintStudents(availableStudents, 'class')
  }, [availableStudents, preparePrintStudents, selectedClassId])

  useEffect(() => {
    const resetPrintState = () => {
      setPrintMode(null)
      setPrintStudents([])
      setIsPreparingPrint(false)
    }

    window.addEventListener('afterprint', resetPrintState)
    return () => window.removeEventListener('afterprint', resetPrintState)
  }, [])

  useEffect(() => {
    if (!printMode || isPreparingPrint || !printStudents.length) return undefined

    let cancelled = false
    let printTimer
    let printScheduled = false
    const schedulePrint = () => {
      if (cancelled || printScheduled) return
      printScheduled = true
      printTimer = window.setTimeout(() => window.print(), 100)
    }
    const imageWaitTimer = window.setTimeout(schedulePrint, 1500)
    const images = [...document.querySelectorAll('.print-reports-root img')]
    const imagePromises = images.map((image) => {
      if (image.complete) return Promise.resolve()

      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      })
    })

    Promise.all(imagePromises).then(() => {
      window.clearTimeout(imageWaitTimer)
      schedulePrint()
    })

    return () => {
      cancelled = true
      window.clearTimeout(imageWaitTimer)
      if (printTimer) window.clearTimeout(printTimer)
    }
  }, [isPreparingPrint, printMode, printStudents.length])

  const resetStudentData = () => {
    setSelectedStudentEnrollmentId('')
    setScreenReport(null)
    setScreenReportLoading(false)
  }

  const dashboardPath = getDashboardPath(profile)

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading PBS Bersepadu...</div>
  }

  return (
    <>
      <div className="pbs-screen-only min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="PBS Bersepadu"
          actionRight={
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Kembali ke Dashboard
            </button>
          }
        />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-950">Profil Murid 360°</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                Analisis holistik PBS membezakan dapatan peperiksaan dan bukan peperiksaan
                dalam satu paparan murid tanpa mengubah formula atau proses input sedia ada.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handlePrintIndividual}
                disabled={!selectedStudent || isPreparingPrint}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {isPreparingPrint && printMode === 'individual'
                  ? 'Menyediakan laporan...'
                  : 'Cetak Individu'}
              </button>
              <button
                type="button"
                onClick={handlePrintClass}
                disabled={!selectedClassId || isPreparingPrint}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isPreparingPrint && printMode === 'class'
                  ? 'Menjana laporan kelas...'
                  : 'Cetak Kelas'}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Pilih Murid</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Tahun akademik
              <select
                value={academicYear}
                onChange={(event) => {
                  setAcademicYear(event.target.value)
                  setSelectedGrade('')
                  setSelectedClassId('')
                  resetStudentData()
                }}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
              >
                {buildYearOptions(academicYear).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Tingkatan
              <select
                value={selectedGrade}
                onChange={(event) => {
                  setSelectedGrade(event.target.value)
                  setSelectedClassId('')
                  resetStudentData()
                }}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
              >
                <option value="">Pilih Tingkatan</option>
                {availableGrades.map((grade) => (
                  <option key={grade} value={grade}>
                    {getDisplayLevel(grade, levelMappings)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Kelas
              <select
                value={selectedClassId}
                onChange={(event) => {
                  setSelectedClassId(event.target.value)
                  resetStudentData()
                }}
                disabled={!selectedGrade}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">{selectedGrade ? 'Pilih Kelas' : 'Pilih tingkatan dahulu'}</option>
                {availableClasses.map((classRow) => (
                  <option key={classRow.id} value={classRow.id}>
                    {getDisplayClassLabel(classRow.tingkatan, classRow.class_name, levelMappings)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Murid
              <select
                value={selectedStudentEnrollmentId}
                onChange={(event) => {
                  setSelectedStudentEnrollmentId(event.target.value)
                  setScreenReport(null)
                  setScreenReportLoading(Boolean(event.target.value))
                }}
                disabled={!selectedClassId}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">{selectedClassId ? 'Pilih Murid' : 'Pilih kelas dahulu'}</option>
                {availableStudents.map((enrollment) => (
                  <option key={enrollment.id} value={enrollment.id}>
                    {enrollment.student_profiles?.full_name || 'Nama murid tidak tersedia'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {!selectedStudent ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            Pilih murid untuk melihat Profil PBS Bersepadu.
          </section>
        ) : screenReportLoading ? (
          <section className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 p-10 text-center text-sm text-indigo-700">
            Menyediakan laporan Profil Murid 360°...
          </section>
        ) : screenReport ? (
          <div className="screen-report-shell">
            <Student360PrintReport
              report={screenReport}
              schoolInfo={schoolInfo}
              academicYear={academicYear}
            />
          </div>
        ) : null}
        </div>
      </div>

      <div className="print-reports-root" aria-hidden={!printMode}>
        {printStudents.map((report) => (
          <Student360PrintReport
            key={report.id}
            report={report}
            schoolInfo={schoolInfo}
            academicYear={academicYear}
          />
        ))}
      </div>
    </>
  )
}
