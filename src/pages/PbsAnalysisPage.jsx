import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import AppHeader from '../components/AppHeader.jsx'
import { getDashboardPath } from '../lib/dashboardPath.js'
import {
  fetchSchoolLevelLabels,
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import { HOLLAND_DIMENSIONS } from '../lib/psychometricImport.js'
import { supabase } from '../lib/supabaseClient.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const PBS_DIMENSIONS = [
  { key: 'academic', label: 'Akademik' },
  { key: 'pbd', label: 'PBD' },
  { key: 'segak', label: 'SEGAK' },
  { key: 'pajsk', label: 'PAJSK' },
]

const PSYCHOMETRIC_DIMENSIONS = HOLLAND_DIMENSIONS.map((dimension) => dimension.label)

const EXAM_SUMMARY_ITEMS = [
  'Ringkasan peperiksaan terkini',
  'Prestasi akademik terkini',
  'Gred / markah individu',
]

const NON_EXAM_SUMMARY_ITEMS = [
  'PBD terkini',
  'PAJSK terkini',
  'SEGAK terkini',
  'Psikometrik terkini',
]

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

const buildAcademicSummary = ({ scores, examConfigs, gradeLabel }) => {
  const matchingExams = examConfigs
    .filter((exam) => isSameGrade(exam.grade_label, gradeLabel))
    .sort((a, b) => Number(b.exam_order || 0) - Number(a.exam_order || 0))

  const selectedExam = matchingExams.find((exam) =>
    scores.some((score) => {
      const sameExam =
        (score.exam_config_id && String(score.exam_config_id) === String(exam.id)) ||
        normalizeKey(score.exam_key) === normalizeKey(exam.exam_key)
      return sameExam && toNumericMark(score.mark) !== null
    })
  )

  if (!selectedExam) {
    return {
      hasData: false,
      score: null,
      averageMark: null,
      subjectCount: 0,
      dominantGrade: null,
      examKey: null,
      examName: null,
    }
  }

  const examRows = scores.filter(
    (score) =>
      ((score.exam_config_id && String(score.exam_config_id) === String(selectedExam.id)) ||
        normalizeKey(score.exam_key) === normalizeKey(selectedExam.exam_key)) &&
      toNumericMark(score.mark) !== null
  )
  const marks = examRows.map((row) => toNumericMark(row.mark))
  const averageMark = marks.length
    ? Number((marks.reduce((sum, mark) => sum + mark, 0) / marks.length).toFixed(2))
    : null

  return {
    hasData: marks.length > 0,
    score: averageMark === null ? null : Math.min(Math.max(averageMark, 0), 100),
    averageMark,
    subjectCount: new Set(examRows.map((row) => String(row.subject_id))).size,
    dominantGrade: getDominantGrade(examRows),
    examKey: selectedExam.exam_key,
    examName: selectedExam.exam_name || selectedExam.exam_key,
  }
}

export default function PbsAnalysisPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  const [loading, setLoading] = useState(true)
  const [studentDataLoading, setStudentDataLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [levelMappings, setLevelMappings] = useState([])
  const [classes, setClasses] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [examConfigs, setExamConfigs] = useState([])
  const [studentScores, setStudentScores] = useState([])
  const [psychometricResult, setPsychometricResult] = useState(null)
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedStudentEnrollmentId, setSelectedStudentEnrollmentId] = useState('')

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

      const { data: setupRows, error: setupError } = await supabase
        .from('school_setup_configs')
        .select('current_academic_year')
        .eq('school_id', profileData.school_id)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (setupError) throw setupError

      setProfile(profileData)
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
        { data: enrollmentRows, error: enrollmentError },
        { data: examRows, error: examError },
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
      ])

      if (classError) throw classError
      if (enrollmentError) throw enrollmentError
      if (examError) throw examError

      setLevelMappings(loadedLevelMappings || [])
      setClasses(classRows || [])
      setEnrollments(enrollmentRows || [])
      setExamConfigs(examRows || [])
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

  const selectedClass = selectedStudent
    ? classById.get(String(selectedStudent.class_id)) || null
    : null

  useEffect(() => {
    if (!profile?.school_id || !academicYear || !selectedStudent) {
      setStudentScores([])
      setPsychometricResult(null)
      setStudentDataLoading(false)
      return
    }

    let cancelled = false

    const loadStudentData = async () => {
      setStudentDataLoading(true)
      setErrorMessage('')

      try {
        const { data: scoreRows, error: scoreError } = await supabase
          .from('student_scores')
          .select(`
            id,
            student_enrollment_id,
            subject_id,
            exam_config_id,
            exam_key,
            mark,
            grade_name,
            grade_point,
            is_absent
          `)
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .eq('student_enrollment_id', selectedStudent.id)

        if (scoreError) throw scoreError

        const { data: psychometricRows, error: psychometricError } = await supabase
          .from('psychometric_results')
          .select(`
            id,
            class_id,
            student_profile_id,
            student_enrollment_id,
            match_status,
            dominant_code,
            primary_dimension,
            raw_data,
            updated_at
          `)
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .eq('assessment_type', 'career_interest')
          .eq('assessment_name', 'IMK')
          .eq('student_enrollment_id', selectedStudent.id)
          .order('updated_at', { ascending: false })
          .limit(1)

        if (psychometricError) console.error(psychometricError)

        let selectedPsychometricResult = psychometricRows?.[0] || null

        if (
          !psychometricError &&
          !selectedPsychometricResult &&
          selectedStudent.student_profile_id &&
          selectedStudent.class_id
        ) {
          const { data: profilePsychometricRows, error: profilePsychometricError } =
            await supabase
              .from('psychometric_results')
              .select(`
                id,
                class_id,
                student_profile_id,
                student_enrollment_id,
                match_status,
                dominant_code,
                primary_dimension,
                raw_data,
                updated_at
              `)
              .eq('school_id', profile.school_id)
              .eq('academic_year', Number(academicYear))
              .eq('assessment_type', 'career_interest')
              .eq('assessment_name', 'IMK')
              .is('student_enrollment_id', null)
              .eq('student_profile_id', selectedStudent.student_profile_id)
              .eq('class_id', selectedStudent.class_id)
              .order('updated_at', { ascending: false })
              .limit(1)

          if (profilePsychometricError) {
            console.error(profilePsychometricError)
          } else {
            selectedPsychometricResult = profilePsychometricRows?.[0] || null
          }
        }

        if (!cancelled) {
          setStudentScores(scoreRows || [])
          setPsychometricResult(selectedPsychometricResult)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setStudentScores([])
          setPsychometricResult(null)
          setErrorMessage(error.message || 'Gagal memuatkan data PBS murid.')
        }
      } finally {
        if (!cancelled) setStudentDataLoading(false)
      }
    }

    loadStudentData()

    return () => {
      cancelled = true
    }
  }, [academicYear, profile?.school_id, selectedStudent])

  const academicSummary = useMemo(
    () =>
      buildAcademicSummary({
        scores: studentScores,
        examConfigs,
        gradeLabel: selectedClass?.tingkatan,
      }),
    [examConfigs, selectedClass?.tingkatan, studentScores]
  )

  const radarData = useMemo(
    () =>
      PBS_DIMENSIONS.map((dimension) => ({
        domain: dimension.label,
        score: dimension.key === 'academic' && academicSummary.hasData ? academicSummary.score : 0,
        available: dimension.key === 'academic' && academicSummary.hasData,
      })),
    [academicSummary.hasData, academicSummary.score]
  )

  const psychometricScores = useMemo(
    () =>
      HOLLAND_DIMENSIONS.map((dimension) => ({
        ...dimension,
        score: toNumericMark(psychometricResult?.raw_data?.[dimension.key]),
      })).filter((dimension) => dimension.score !== null),
    [psychometricResult]
  )

  const resetStudentData = () => {
    setSelectedStudentEnrollmentId('')
    setStudentScores([])
    setPsychometricResult(null)
  }

  const dashboardPath = getDashboardPath(profile)

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading PBS Bersepadu...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
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
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              Fasa 1 - Profil Individu
            </span>
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
                  setStudentScores([])
                  setPsychometricResult(null)
                  setStudentDataLoading(Boolean(event.target.value))
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
        ) : studentDataLoading ? (
          <section className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 p-10 text-center text-sm text-indigo-700">
            Memuatkan Profil PBS Bersepadu murid...
          </section>
        ) : (
          <>
            <StudentSummaryCard
              student={selectedStudent}
              classRow={selectedClass}
              academicYear={academicYear}
              academicAvailable={academicSummary.hasData}
              psychometricAvailable={Boolean(psychometricResult)}
              levelMappings={levelMappings}
            />

            <section className="grid gap-4 lg:grid-cols-2">
              {[
                {
                  title: 'Peperiksaan',
                  description: 'Ringkasan akademik berasaskan peperiksaan aktif terkini.',
                  items: EXAM_SUMMARY_ITEMS,
                },
                {
                  title: 'Bukan Peperiksaan',
                  description:
                    'Ringkasan PBS bukan peperiksaan tanpa mencampurkan psikometrik ke radar utama.',
                  items: NON_EXAM_SUMMARY_ITEMS,
                },
              ].map((group) => (
                <div
                  key={group.title}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6"
                >
                  <h2 className="text-lg font-semibold text-slate-900">{group.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{group.description}</p>
                  <div className="mt-4 grid gap-3">
                    {group.items.map((item) => {
                      const itemAvailable =
                        group.title === 'Peperiksaan'
                          ? academicSummary.hasData
                          : item === 'Psikometrik terkini' && Boolean(psychometricResult)
                      return (
                        <div
                          key={item}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                        >
                          <span className="font-semibold text-slate-700">{item}</span>
                          <DataStatus available={itemAvailable} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Radar PBS Bersepadu</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Skor domain utama dinormalisasi kepada skala 0-100.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    Psikometrik diasingkan
                  </span>
                </div>

                <div className="mt-5 h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="70%">
                      <PolarGrid />
                      <PolarAngleAxis dataKey="domain" tick={{ fill: '#475569', fontSize: 12 }} />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                      />
                      <Radar
                        dataKey="score"
                        stroke="#4f46e5"
                        fill="#6366f1"
                        fillOpacity={0.35}
                        strokeWidth={2}
                      />
                      <Tooltip content={<PbsRadarTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {!academicSummary.hasData ? (
                  <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                    Data akademik murid ini belum tersedia.
                  </div>
                ) : null}
              </div>

              <div className="grid content-start gap-3">
                <PbsDomainCard
                  title="Akademik"
                  score={academicSummary.score}
                  available={academicSummary.hasData}
                  details={[
                    ['Purata markah', academicSummary.averageMark],
                    ['Bilangan subjek', academicSummary.subjectCount],
                    ['Peperiksaan', academicSummary.examName || academicSummary.examKey],
                    ['Exam key', academicSummary.examKey],
                    ['Gred dominan', academicSummary.dominantGrade],
                  ]}
                />
                <PbsDomainCard
                  title="PBD"
                  note="Modul PBD akan disambung kemudian."
                />
                <PbsDomainCard
                  title="SEGAK"
                  note="Modul SEGAK/BMI akan disambung kemudian."
                />
                <PbsDomainCard
                  title="PAJSK"
                  note="Modul PAJSK akan disambung kemudian."
                />
              </div>
            </section>

            <PsychometricSummary
              result={psychometricResult}
              scores={psychometricScores}
              onOpen={() => navigate('/analysis/psychometric')}
            />

            <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm md:p-6">
              <h2 className="text-lg font-semibold text-indigo-950">Rumusan PBS Bersepadu</h2>
              <p className="mt-2 text-sm leading-6 text-indigo-900">
                {academicSummary.hasData
                  ? `Profil PBS murid ini telah memaparkan data akademik daripada ${academicSummary.examName || academicSummary.examKey}. Data PBD, SEGAK dan PAJSK belum tersedia untuk analisis menyeluruh.`
                  : 'Data akademik murid ini belum tersedia. Data PBD, SEGAK dan PAJSK juga belum tersedia untuk analisis menyeluruh.'}
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function StudentSummaryCard({
  student,
  classRow,
  academicYear,
  academicAvailable,
  psychometricAvailable,
  levelMappings,
}) {
  const statuses = [
    ['Akademik', academicAvailable],
    ['PBD', false],
    ['SEGAK', false],
    ['PAJSK', false],
    ['Psikometrik', psychometricAvailable],
  ]

  return (
    <section className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Profil PBS Individu Murid
          </div>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">
            {student.student_profiles?.full_name || '-'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {getDisplayClassLabel(classRow?.tingkatan, classRow?.class_name, levelMappings)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <SummaryValue
            label="Tingkatan"
            value={getDisplayLevel(classRow?.tingkatan, levelMappings) || '-'}
          />
          <SummaryValue label="Kelas" value={classRow?.class_name || '-'} />
          <SummaryValue label="Tahun" value={academicYear || '-'} />
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {statuses.map(([label, available]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-2">
              <DataStatus
                available={available}
                unavailableLabel={label === 'Akademik' ? 'Tiada data' : 'Belum tersedia'}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SummaryValue({ label, value }) {
  return (
    <div className="min-w-28 rounded-xl bg-indigo-50 px-3 py-2">
      <div className="text-xs font-semibold text-indigo-600">{label}</div>
      <div className="mt-0.5 font-bold text-indigo-950">{value}</div>
    </div>
  )
}

function DataStatus({ available, unavailableLabel = 'Belum tersedia' }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        available ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
      }`}
    >
      {available ? 'Ada data' : unavailableLabel}
    </span>
  )
}

function PbsDomainCard({ title, score = null, available = false, details = [], note = '' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <div className="mt-1">
            <DataStatus available={available} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-indigo-700">
            {available && score !== null ? Number(score).toFixed(1) : '-'}
          </div>
          <div className="text-xs text-slate-500">Skor / 100</div>
        </div>
      </div>

      {details.length ? (
        <dl className="mt-4 grid gap-2 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-semibold text-slate-800">
                {value === null || value === undefined || value === '' ? '-' : value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-500">{note}</p>
      )}
    </div>
  )
}

function PbsRadarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  const row = payload[0]?.payload
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <div className="font-semibold text-slate-900">{label}</div>
      <div className="mt-1 text-slate-600">
        {row?.available ? `Skor: ${Number(row.score).toFixed(1)}` : 'Belum tersedia'}
      </div>
    </div>
  )
}

function PsychometricSummary({ result, scores, onOpen }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Ringkasan Psikometrik</h2>
          <p className="mt-1 text-sm text-slate-500">
            Psikometrik kekal berasingan daripada radar PBS utama.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
        >
          Buka Analisis Psikometrik
        </button>
      </div>

      {!result ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          Data psikometrik belum tersedia.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Inventori Minat Kerjaya
            </div>
            <div className="mt-2 text-3xl font-bold tracking-widest text-indigo-900">
              {result.dominant_code || '-'}
            </div>
            <div className="mt-2 text-sm text-indigo-800">
              Dominan: {result.primary_dimension || '-'}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(scores.length
              ? scores
              : PSYCHOMETRIC_DIMENSIONS.map((label) => ({ label, key: label, score: null }))
            ).map((dimension) => (
              <div
                key={dimension.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <span className="text-sm font-medium text-slate-700">
                  {dimension.label}
                  {dimension.key?.length === 1 ? ` (${dimension.key})` : ''}
                </span>
                <span className="font-bold text-slate-900">
                  {dimension.score === null ? '-' : dimension.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
