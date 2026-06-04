import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { getDashboardPath } from '../lib/dashboardPath.js'
import {
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import { getGradeNumber, HOLLAND_DIMENSIONS } from '../lib/psychometricImport.js'
import { supabase } from '../lib/supabaseClient.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const getCurrentYear = () => new Date().getFullYear()

const buildYearOptions = (year) => {
  const baseYear = Number(year) || getCurrentYear()
  return [baseYear - 2, baseYear - 1, baseYear, baseYear + 1]
}

const STATUS_LABELS = {
  matched: 'Padanan Tepat',
  review: 'Perlu semakan',
  unmatched: 'Tidak dijumpai',
}

const STATUS_STYLES = {
  matched: 'bg-emerald-100 text-emerald-800',
  review: 'bg-amber-100 text-amber-800',
  unmatched: 'bg-slate-200 text-slate-700',
}

const DIMENSION_DESCRIPTIONS = {
  R: 'Minat terhadap aktiviti praktikal, teknikal, mesin, alat dan kerja lapangan.',
  I: 'Minat menyiasat, menganalisis, sains, matematik dan penyelesaian masalah.',
  A: 'Minat kreativiti, seni, reka bentuk, muzik, lakonan, tarian dan ekspresi.',
  S: 'Minat membantu, membimbing, mengajar, berkomunikasi dan bekerja dengan manusia.',
  E: 'Minat memimpin, mempengaruhi, berniaga, mengurus dan membuat keputusan.',
  K: 'Minat kerja tersusun, data, rekod, pentadbiran, prosedur dan ketelitian.',
}

const DIMENSION_BAR_STYLES = {
  R: 'bg-amber-600',
  I: 'bg-sky-600',
  A: 'bg-fuchsia-600',
  S: 'bg-emerald-600',
  E: 'bg-orange-600',
  K: 'bg-indigo-600',
}

const ARTISTIC_GENERAL_NOTE =
  'Kecenderungan Artistik sesuai dikaitkan dengan bidang seni seperti Seni Halus, Reka Bentuk, Multimedia Kreatif, Muzik, Tari, Teater atau Produksi Seni Persembahan bergantung kepada kombinasi kod Holland murid.'

const ARTISTIC_COMBINATION_NOTES = {
  S: 'Gabungan Artistik dan Sosial sesuai untuk bidang yang melibatkan ekspresi seni dan interaksi manusia seperti lakonan, tari, pendidikan seni dan aktiviti persembahan.',
  K: 'Gabungan Artistik dan Konvensional sesuai untuk reka bentuk grafik, multimedia, produksi dan kerja kreatif yang memerlukan susunan serta ketelitian.',
  I: 'Gabungan Artistik dan Investigatif sesuai untuk multimedia kreatif, reka bentuk digital, teknologi seni dan penghasilan karya berasaskan kajian.',
}

const normalizeSearchText = (value) =>
  String(value || '')
    .trim()
    .toLocaleUpperCase('ms-MY')
    .replace(/\s+/g, ' ')

const toScoreOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const getDifferenceIndex = (rawData) => {
  const found = Object.entries(rawData || {}).find(([key, value]) => {
    if (value === null || value === undefined || value === '') return false
    const normalizedKey = String(key).toLocaleLowerCase('ms-MY').replace(/[^a-z0-9]/g, '')
    return ['indeksperbezaan', 'differenceindex'].includes(normalizedKey)
  })

  return found?.[1] ?? null
}

export default function PsychometricAnalysisPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [classes, setClasses] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [results, setResults] = useState([])
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentEnrollmentId, setSelectedStudentEnrollmentId] = useState('')
  const [individualResult, setIndividualResult] = useState(null)
  const [individualLoading, setIndividualLoading] = useState(false)
  const [individualErrorMessage, setIndividualErrorMessage] = useState('')

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

      if (profileError || !profileData) {
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
      setErrorMessage(error.message || 'Gagal memuatkan Analisis Psikometrik.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const loadData = useCallback(async () => {
    if (!profile?.school_id || !academicYear) return
    setLoading(true)
    setErrorMessage('')

    try {
      let resultQuery = supabase
        .from('psychometric_results')
        .select(`
          id,
          grade_label,
          class_id,
          class_name,
          source_student_name,
          source_ic_number,
          student_profile_id,
          student_enrollment_id,
          match_status,
          match_note,
          raw_data,
          dominant_code,
          primary_dimension,
          secondary_dimension,
          tertiary_dimension,
          updated_at,
          student_profiles (
            id,
            full_name,
            ic_number
          )
        `)
        .eq('school_id', profile.school_id)
        .eq('academic_year', Number(academicYear))
        .eq('assessment_type', 'career_interest')
        .eq('assessment_name', 'IMK')
        .order('updated_at', { ascending: false })
        .limit(500)

      if (selectedGrade) resultQuery = resultQuery.eq('grade_label', selectedGrade)
      if (selectedClassId) resultQuery = resultQuery.eq('class_id', selectedClassId)

      const [
        { data: classData, error: classError },
        { data: enrollmentData, error: enrollmentError },
        { data: resultData, error: resultError },
      ] = await Promise.all([
        supabase
          .from('classes')
          .select('id, tingkatan, class_name')
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
        resultQuery,
      ])

      if (classError) throw classError
      if (enrollmentError) throw enrollmentError
      if (resultError) throw resultError

      setClasses(classData || [])
      setEnrollments(enrollmentData || [])
      setResults(resultData || [])
    } catch (error) {
      console.error(error)
      setResults([])
      setErrorMessage(
        error.message?.includes('psychometric_results')
          ? 'Jadual psikometrik belum tersedia. Jalankan migration psikometrik terkini di Supabase.'
          : error.message || 'Gagal memuatkan analisis IMK.'
      )
    } finally {
      setLoading(false)
    }
  }, [academicYear, profile?.school_id, selectedClassId, selectedGrade])

  useEffect(() => {
    if (checkingAuth) return
    initPage()
  }, [checkingAuth, initPage])

  useEffect(() => {
    loadData()
  }, [loadData])

  const availableGrades = useMemo(
    () =>
      sortLevelsByDisplayOrder(
        classes
          .map((classRow) => classRow.tingkatan)
          .filter((grade) => {
            const gradeNumber = Number(getGradeNumber(grade))
            return gradeNumber >= 1 && gradeNumber <= 5
          })
      ),
    [classes]
  )

  const availableClasses = useMemo(
    () =>
      classes
        .filter((classRow) => !selectedGrade || classRow.tingkatan === selectedGrade)
        .sort((a, b) =>
          getDisplayClassLabel(a.tingkatan, a.class_name).localeCompare(
            getDisplayClassLabel(b.tingkatan, b.class_name),
            'ms',
            { sensitivity: 'base', numeric: true }
          )
        ),
    [classes, selectedGrade]
  )

  const classById = useMemo(
    () => new Map(classes.map((classRow) => [String(classRow.id), classRow])),
    [classes]
  )

  const availableStudents = useMemo(
    () =>
      enrollments
        .filter((enrollment) => {
          const classRow = classById.get(String(enrollment.class_id))
          if (!classRow) return false
          if (selectedGrade && classRow.tingkatan !== selectedGrade) return false
          if (selectedClassId && String(enrollment.class_id) !== String(selectedClassId)) return false
          return true
        })
        .sort((a, b) => {
          const classA = classById.get(String(a.class_id))
          const classB = classById.get(String(b.class_id))
          const classCompare = getDisplayClassLabel(
            classA?.tingkatan,
            classA?.class_name
          ).localeCompare(
            getDisplayClassLabel(classB?.tingkatan, classB?.class_name),
            'ms',
            { sensitivity: 'base', numeric: true }
          )

          if (classCompare !== 0) return classCompare

          return String(a.student_profiles?.full_name || '').localeCompare(
            String(b.student_profiles?.full_name || ''),
            'ms',
            { sensitivity: 'base' }
          )
        }),
    [classById, enrollments, selectedClassId, selectedGrade]
  )

  const visibleStudents = useMemo(() => {
    const searchKey = normalizeSearchText(studentSearch)
    if (!searchKey) return availableStudents

    return availableStudents.filter((enrollment) => {
      if (String(enrollment.id) === String(selectedStudentEnrollmentId)) return true

      const classRow = classById.get(String(enrollment.class_id))
      const searchable = normalizeSearchText(
        [
          enrollment.student_profiles?.full_name,
          enrollment.student_profiles?.ic_number,
          getDisplayClassLabel(classRow?.tingkatan, classRow?.class_name),
        ].join(' ')
      )
      return searchable.includes(searchKey)
    })
  }, [availableStudents, classById, selectedStudentEnrollmentId, studentSearch])

  const selectedStudent = useMemo(
    () =>
      availableStudents.find(
        (enrollment) => String(enrollment.id) === String(selectedStudentEnrollmentId)
      ) || null,
    [availableStudents, selectedStudentEnrollmentId]
  )

  const cachedSelectedStudentResult = useMemo(
    () => {
      if (!selectedStudent) return null

      return (
        results.find(
          (row) =>
            String(row.student_enrollment_id) === String(selectedStudentEnrollmentId)
        ) ||
        results.find(
          (row) =>
            !row.student_enrollment_id &&
            String(row.student_profile_id) === String(selectedStudent.student_profile_id) &&
            String(row.class_id) === String(selectedStudent.class_id)
        ) ||
        null
      )
    },
    [results, selectedStudent, selectedStudentEnrollmentId]
  )
  const selectedStudentResult = individualResult || cachedSelectedStudentResult

  const selectedStudentClass = selectedStudent
    ? classById.get(String(selectedStudent.class_id))
    : null
  const individualScores = useMemo(() => {
    if (!selectedStudentResult) return []

    return HOLLAND_DIMENSIONS.map((dimension, index) => ({
      ...dimension,
      index,
      score: toScoreOrNull(selectedStudentResult.raw_data?.[dimension.key]),
    }))
      .filter((dimension) => dimension.score !== null)
      .sort((a, b) => b.score - a.score || a.index - b.index)
  }, [selectedStudentResult])

  const primaryDimensionKey =
    String(selectedStudentResult?.dominant_code || '').charAt(0) ||
    individualScores[0]?.key ||
    ''
  const primaryDimension =
    HOLLAND_DIMENSIONS.find((dimension) => dimension.key === primaryDimensionKey) || null
  const individualMaxScore = Math.max(...individualScores.map((dimension) => dimension.score), 0)
  const differenceIndex = getDifferenceIndex(selectedStudentResult?.raw_data)
  const artisticNotes = useMemo(() => {
    const dominantCode = String(selectedStudentResult?.dominant_code || '')
    if (!dominantCode.includes('A')) return []

    return [
      ARTISTIC_GENERAL_NOTE,
      ...Object.entries(ARTISTIC_COMBINATION_NOTES)
        .filter(([dimensionKey]) => dominantCode.includes(dimensionKey))
        .map(([, note]) => note),
    ]
  }, [selectedStudentResult?.dominant_code])

  useEffect(() => {
    if (!profile?.school_id || !academicYear || !selectedStudent) {
      setIndividualResult(null)
      setIndividualLoading(false)
      setIndividualErrorMessage('')
      return
    }

    let cancelled = false

    const loadIndividualResult = async () => {
      setIndividualLoading(true)
      setIndividualErrorMessage('')

      try {
        const baseQuery = () =>
          supabase
            .from('psychometric_results')
            .select(`
              id,
              grade_label,
              class_id,
              class_name,
              source_student_name,
              source_ic_number,
              student_profile_id,
              student_enrollment_id,
              match_status,
              match_note,
              raw_data,
              dominant_code,
              primary_dimension,
              secondary_dimension,
              tertiary_dimension,
              updated_at
            `)
            .eq('school_id', profile.school_id)
            .eq('academic_year', Number(academicYear))
            .eq('assessment_type', 'career_interest')
            .eq('assessment_name', 'IMK')

        const { data: enrollmentResult, error: enrollmentResultError } = await baseQuery()
          .eq('student_enrollment_id', selectedStudent.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (enrollmentResultError) throw enrollmentResultError

        let result = enrollmentResult

        if (!result && selectedStudent.student_profile_id && selectedStudent.class_id) {
          const { data: profileResult, error: profileResultError } = await baseQuery()
            .is('student_enrollment_id', null)
            .eq('student_profile_id', selectedStudent.student_profile_id)
            .eq('class_id', selectedStudent.class_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (profileResultError) throw profileResultError
          result = profileResult
        }

        if (!cancelled) setIndividualResult(result || null)
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setIndividualResult(cachedSelectedStudentResult)
          setIndividualErrorMessage(
            cachedSelectedStudentResult ? '' : 'Gagal memuatkan data IMK murid ini.'
          )
        }
      } finally {
        if (!cancelled) setIndividualLoading(false)
      }
    }

    loadIndividualResult()

    return () => {
      cancelled = true
    }
  }, [academicYear, cachedSelectedStudentResult, profile?.school_id, selectedStudent])

  useEffect(() => {
    if (
      selectedStudentEnrollmentId &&
      !availableStudents.some(
        (enrollment) => String(enrollment.id) === String(selectedStudentEnrollmentId)
      )
    ) {
      setSelectedStudentEnrollmentId('')
      setStudentSearch('')
      setIndividualResult(null)
      setIndividualLoading(false)
      setIndividualErrorMessage('')
    }
  }, [availableStudents, selectedStudentEnrollmentId])

  const dimensionSummary = useMemo(() => {
    const counts = Object.fromEntries(HOLLAND_DIMENSIONS.map((dimension) => [dimension.key, 0]))

    results.forEach((row) => {
      const primaryCode = String(row.dominant_code || '').charAt(0)
      if (counts[primaryCode] !== undefined) counts[primaryCode] += 1
    })

    return HOLLAND_DIMENSIONS.map((dimension) => ({
      ...dimension,
      count: counts[dimension.key],
      percent: results.length ? (counts[dimension.key] / results.length) * 100 : 0,
    }))
  }, [results])

  const topCodes = useMemo(() => {
    const counts = new Map()
    results.forEach((row) => {
      if (!row.dominant_code) return
      counts.set(row.dominant_code, (counts.get(row.dominant_code) || 0) + 1)
    })

    return [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      .slice(0, 8)
  }, [results])

  const matchedCount = results.filter((row) => row.match_status === 'matched').length
  const reviewCount = results.filter((row) => row.match_status === 'review').length
  const topDimension = [...dimensionSummary].sort((a, b) => b.count - a.count)[0]
  const dashboardPath = getDashboardPath(profile)

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Analisis Psikometrik...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Analisis Psikometrik"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              Kembali ke Dashboard
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/psikometrik/input')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Input Data Psikometrik
            </button>
          }
        />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Analisis Inventori Minat Kerjaya</h2>
              <p className="mt-1 text-sm text-slate-500">
                Taburan kecenderungan utama Holland RIASEK daripada keputusan IMK yang disimpan.
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              IMK - {academicYear}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select
              value={academicYear}
              onChange={(event) => {
                setAcademicYear(event.target.value)
                setSelectedGrade('')
                setSelectedClassId('')
                setSelectedStudentEnrollmentId('')
                setStudentSearch('')
                setIndividualResult(null)
                setIndividualLoading(false)
                setIndividualErrorMessage('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {buildYearOptions(academicYear).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={selectedGrade}
              onChange={(event) => {
                setSelectedGrade(event.target.value)
                setSelectedClassId('')
                setSelectedStudentEnrollmentId('')
                setStudentSearch('')
                setIndividualResult(null)
                setIndividualLoading(false)
                setIndividualErrorMessage('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua Tingkatan</option>
              {availableGrades.map((grade) => (
                <option key={grade} value={grade}>
                  {getDisplayLevel(grade)}
                </option>
              ))}
            </select>

            <select
              value={selectedClassId}
              onChange={(event) => {
                setSelectedClassId(event.target.value)
                setSelectedStudentEnrollmentId('')
                setStudentSearch('')
                setIndividualResult(null)
                setIndividualLoading(false)
                setIndividualErrorMessage('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua Kelas</option>
              {availableClasses.map((classRow) => (
                <option key={classRow.id} value={classRow.id}>
                  {getDisplayClassLabel(classRow.tingkatan, classRow.class_name)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard title="Jumlah Keputusan" value={results.length} />
          <SummaryCard title="Padanan Tepat" value={matchedCount} tone="emerald" />
          <SummaryCard title="Perlu Semakan" value={reviewCount} tone="amber" />
          <SummaryCard
            title="Kecenderungan Utama"
            value={topDimension?.count ? `${topDimension.key} - ${topDimension.label}` : '-'}
            tone="indigo"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Taburan Dimensi Dominan</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dimensionSummary.map((dimension) => (
                <div key={dimension.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-700 text-lg font-bold text-white">
                      {dimension.key}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-slate-900">{dimension.count}</div>
                      <div className="text-xs font-semibold text-slate-500">
                        {dimension.percent.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-slate-800">{dimension.label}</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-indigo-600"
                      style={{ width: `${Math.min(dimension.percent, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Kod Holland Popular</h2>
            {topCodes.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                Belum ada kod Holland untuk pilihan semasa.
              </div>
            ) : (
              <div className="mt-4 grid gap-2">
                {topCodes.map((item, index) => (
                  <div
                    key={item.code}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400">{index + 1}</span>
                      <span className="font-bold tracking-widest text-indigo-700">{item.code}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{item.count} murid</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Analisis IMK Individu</h2>
            <p className="mt-1 text-sm text-slate-500">
              Pilih murid berdasarkan tahun, tingkatan dan kelas semasa untuk melihat profil
              Holland individu.
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Cari murid
              <input
                type="search"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder="Cari nama, nombor kad pengenalan atau kelas"
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Pilih murid
              <select
                value={selectedStudentEnrollmentId}
                onChange={(event) => {
                  setSelectedStudentEnrollmentId(event.target.value)
                  setIndividualResult(null)
                  setIndividualLoading(Boolean(event.target.value))
                  setIndividualErrorMessage('')
                }}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">
                  {visibleStudents.length
                    ? `Pilih daripada ${visibleStudents.length} murid`
                    : 'Tiada murid sepadan'}
                </option>
                {visibleStudents.map((enrollment) => {
                  const classRow = classById.get(String(enrollment.class_id))
                  return (
                    <option key={enrollment.id} value={enrollment.id}>
                      {enrollment.student_profiles?.full_name || 'Nama murid tidak tersedia'} -{' '}
                      {getDisplayClassLabel(classRow?.tingkatan, classRow?.class_name)}
                    </option>
                  )
                })}
              </select>
            </label>
          </div>

          {!selectedStudent ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Pilih murid untuk melihat analisis IMK individu.
            </div>
          ) : individualLoading ? (
            <div className="mt-5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50 p-8 text-center text-sm text-indigo-700">
              Memuatkan analisis IMK murid...
            </div>
          ) : individualErrorMessage ? (
            <div className="mt-5 rounded-xl border border-dashed border-rose-300 bg-rose-50 p-8 text-center text-sm text-rose-700">
              {individualErrorMessage}
            </div>
          ) : !selectedStudentResult ? (
            <div className="mt-5 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-800">
              Data IMK murid ini belum tersedia.
            </div>
          ) : (
            <div className="mt-5 grid gap-5">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                      Profil Murid
                    </div>
                    <h3 className="mt-1 text-xl font-bold text-slate-950">
                      {selectedStudent.student_profiles?.full_name ||
                        selectedStudentResult.source_student_name ||
                        '-'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {getDisplayClassLabel(
                        selectedStudentClass?.tingkatan,
                        selectedStudentClass?.class_name
                      )}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      STATUS_STYLES[selectedStudentResult.match_status] ||
                      STATUS_STYLES.unmatched
                    }`}
                  >
                    {STATUS_LABELS[selectedStudentResult.match_status] ||
                      selectedStudentResult.match_status}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <IndividualSummary
                    label="Kod Holland"
                    value={selectedStudentResult.dominant_code || '-'}
                    valueClassName="tracking-widest text-indigo-700"
                  />
                  <IndividualSummary
                    label="Dominan"
                    value={primaryDimension?.label || selectedStudentResult.primary_dimension || '-'}
                  />
                  <IndividualSummary
                    label="Status"
                    value={
                      STATUS_LABELS[selectedStudentResult.match_status] ||
                      selectedStudentResult.match_status ||
                      '-'
                    }
                  />
                  {differenceIndex !== null ? (
                    <IndividualSummary label="Indeks Perbezaan" value={differenceIndex} />
                  ) : null}
                </div>

                {selectedStudentResult.match_note ? (
                  <p className="mt-3 text-xs text-slate-600">{selectedStudentResult.match_note}</p>
                ) : null}
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
                <div className="rounded-2xl border border-slate-200 p-4 md:p-5">
                  <h3 className="font-semibold text-slate-900">Skor RIASEK Individu</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Disusun daripada skor tertinggi kepada skor terendah.
                  </p>

                  {individualScores.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                      Skor RIASEK individu belum tersedia.
                    </div>
                  ) : (
                    <div className="mt-5 grid gap-4">
                      {individualScores.map((dimension) => {
                        const width = individualMaxScore
                          ? Math.max((dimension.score / individualMaxScore) * 100, 0)
                          : 0

                        return (
                          <div key={dimension.key} className="grid gap-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium text-slate-700">
                                {dimension.label} ({dimension.key})
                              </span>
                              <span className="font-bold tabular-nums text-slate-900">
                                {dimension.score}
                              </span>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  DIMENSION_BAR_STYLES[dimension.key]
                                }`}
                                style={{ width: `${Math.min(width, 100)}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="grid content-start gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-700 text-lg font-bold text-white">
                        {primaryDimensionKey || '-'}
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Huraian Dominan
                        </div>
                        <h3 className="font-semibold text-slate-900">
                          {primaryDimension?.label ||
                            selectedStudentResult.primary_dimension ||
                            'Belum tersedia'}
                        </h3>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-700">
                      {DIMENSION_DESCRIPTIONS[primaryDimensionKey] ||
                        'Huraian kecenderungan dominan belum tersedia.'}
                    </p>
                  </div>

                  {artisticNotes.map((note, index) => (
                    <div
                      key={note}
                      className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-sm leading-6 text-fuchsia-950 md:p-5"
                    >
                      <div className="font-semibold">
                        {index === 0 ? 'Cadangan Padanan Sekolah Seni' : 'Gabungan Kecenderungan'}
                      </div>
                      <p className="mt-1">{note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Senarai Keputusan IMK</h2>
          {results.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Belum ada keputusan IMK untuk pilihan semasa.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[980px] border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Murid', 'Tingkatan / Kelas', 'Kod Holland', 'Dimensi 1', 'Dimensi 2', 'Dimensi 3', 'Status'].map(
                      (header) => (
                        <th
                          key={header}
                          className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700"
                        >
                          {header}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.student_profiles?.full_name || row.source_student_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {`${row.grade_label || ''} ${row.class_name || ''}`.trim() || '-'}
                      </td>
                      <td className="px-4 py-3 font-bold tracking-widest text-indigo-700">
                        {row.dominant_code || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.primary_dimension || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{row.secondary_dimension || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{row.tertiary_dimension || '-'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            STATUS_STYLES[row.match_status] || STATUS_STYLES.unmatched
                          }`}
                        >
                          {STATUS_LABELS[row.match_status] || row.match_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950',
  }[tone]

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  )
}

function IndividualSummary({ label, value, valueClassName = '' }) {
  return (
    <div className="rounded-xl border border-white/80 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-bold text-slate-900 ${valueClassName}`}>{value}</div>
    </div>
  )
}
