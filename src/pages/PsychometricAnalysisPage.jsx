import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Brain,
  ClipboardList,
  Search,
  UserRound,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { getDashboardPath } from '../lib/dashboardPath.js'
import {
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import {
  getGradeNumber,
  getInstrumentDimensions,
} from '../lib/psychometricImport.js'
import { supabase } from '../lib/supabaseClient.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const getCurrentYear = () => new Date().getFullYear()

const buildYearOptions = (year) => {
  const baseYear = Number(year) || getCurrentYear()
  return [baseYear - 2, baseYear - 1, baseYear, baseYear + 1]
}

const ANALYSIS_TABS = [
  { key: 'overview', label: 'Ringkasan', icon: BarChart3 },
  { key: 'IMK', label: 'IMK', description: 'Inventori Minat Kerjaya', icon: ClipboardList },
  { key: 'ITP', label: 'ITP', description: 'Inventori Tret Personaliti', icon: Brain },
  { key: 'APTITUD_KHUSUS', label: 'Aptitud', description: 'Aptitud Khusus', icon: AlertTriangle },
  { key: 'individual', label: 'Individu', icon: UserRound },
]

const INSTRUMENT_META = {
  IMK: {
    shortLabel: 'IMK',
    title: 'Inventori Minat Kerjaya',
    subtitle: 'Taburan Holland RIASEK dan kod minat kerjaya murid.',
    metricLabel: 'Kod Holland',
    primaryLabel: 'Dimensi Dominan',
    emptyTitle: 'Belum ada data IMK',
    tone: 'indigo',
  },
  ITP: {
    shortLabel: 'ITP',
    title: 'Inventori Tret Personaliti',
    subtitle: 'Tret dominan, gabungan tret popular dan pola mengikut kelas.',
    metricLabel: 'Tret Utama',
    primaryLabel: 'Tret Dominan',
    emptyTitle: 'Belum ada data ITP',
    tone: 'sky',
  },
  APTITUD_KHUSUS: {
    shortLabel: 'Aptitud',
    title: 'Aptitud Khusus',
    subtitle: 'Ruang analisis untuk kekuatan kebolehan murid apabila import aptitud diaktifkan.',
    metricLabel: 'Domain Aptitud',
    primaryLabel: 'Domain Utama',
    emptyTitle: 'Modul Aptitud belum diaktifkan',
    tone: 'violet',
  },
}

const STATUS_LABELS = {
  matched: 'Padanan Tepat',
  review: 'Perlu Semakan',
  unmatched: 'Tidak Dijumpai',
}

const STATUS_STYLES = {
  matched: 'bg-emerald-100 text-emerald-800',
  review: 'bg-amber-100 text-amber-800',
  unmatched: 'bg-slate-200 text-slate-700',
}

const DIMENSION_DESCRIPTIONS = {
  R: 'Aktiviti praktikal, teknikal, mesin, alat dan kerja lapangan.',
  I: 'Penyiasatan, analisis, sains, matematik dan penyelesaian masalah.',
  A: 'Kreativiti, seni, reka bentuk, muzik, lakonan dan ekspresi.',
  S: 'Membantu, membimbing, mengajar, berkomunikasi dan bekerja dengan manusia.',
  E: 'Memimpin, mempengaruhi, berniaga, mengurus dan membuat keputusan.',
  K: 'Kerja tersusun, data, rekod, pentadbiran, prosedur dan ketelitian.',
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

const normalizeDimensionToken = (value) => normalizeSearchText(value).replace(/[^A-Z0-9]/g, '')

const toScoreOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const getMeta = (assessmentName) =>
  INSTRUMENT_META[assessmentName] || {
    shortLabel: assessmentName,
    title: assessmentName,
    subtitle: 'Analisis keputusan psikometrik.',
    metricLabel: 'Kod / Domain',
    primaryLabel: 'Dominan',
    emptyTitle: 'Belum ada data',
    tone: 'slate',
  }

const getStudentName = (row) =>
  row?.student_profiles?.full_name || row?.source_student_name || 'Nama murid tidak tersedia'

const findDimension = (value, dimensions = []) => {
  const token = normalizeDimensionToken(value)
  if (!token) return null

  return (
    dimensions.find((dimension) =>
      [dimension.key, dimension.label, ...(dimension.aliases || [])].some(
        (term) => normalizeDimensionToken(term) === token
      )
    ) || null
  )
}

const getCanonicalDimensionKey = (value, dimensions = []) =>
  findDimension(value, dimensions)?.key || String(value || '').trim().toLocaleUpperCase('ms-MY')

const getDominantKeys = (code, dimensions = []) => {
  const normalizedCode = String(code || '').trim().toLocaleUpperCase('ms-MY')
  if (!normalizedCode) return []

  if (normalizedCode.includes('-')) {
    return normalizedCode
      .split('-')
      .map((item) => getCanonicalDimensionKey(item, dimensions))
      .filter(Boolean)
  }

  if (dimensions.every((dimension) => String(dimension.key).length === 1)) {
    return [...normalizedCode].map((item) => getCanonicalDimensionKey(item, dimensions)).filter(Boolean)
  }

  return dimensions
    .filter((dimension) =>
      [dimension.key, ...(dimension.aliases || [])].some((term) =>
        normalizedCode.includes(String(term).toLocaleUpperCase('ms-MY'))
      )
    )
    .map((dimension) => dimension.key)
}

const formatDimensionName = (value, dimensions = []) => {
  const dimension = findDimension(value, dimensions)
  if (dimension) return `${dimension.label} (${dimension.key})`
  return String(value || '').trim() || '-'
}

const formatCodeExpansion = (code, dimensions = []) =>
  getDominantKeys(code, dimensions)
    .map((key) => formatDimensionName(key, dimensions))
    .filter((label) => label && label !== '-')
    .join(' + ')

const getSortedScores = (row, dimensions = []) =>
  dimensions
    .map((dimension, index) => ({
      ...dimension,
      index,
      score: toScoreOrNull(row?.raw_data?.[dimension.key]),
    }))
    .filter((dimension) => dimension.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)

const getPrimaryKey = (row, dimensions = []) =>
  getDominantKeys(row?.dominant_code, dimensions)[0] || getSortedScores(row, dimensions)[0]?.key || ''

const summarizeRows = (rows = [], dimensions = []) => {
  const counts = Object.fromEntries(dimensions.map((dimension) => [dimension.key, 0]))

  rows.forEach((row) => {
    const primaryKey = getPrimaryKey(row, dimensions)
    if (counts[primaryKey] !== undefined) counts[primaryKey] += 1
  })

  const dimensionSummary = dimensions.map((dimension) => ({
    ...dimension,
    count: counts[dimension.key] || 0,
    percent: rows.length ? ((counts[dimension.key] || 0) / rows.length) * 100 : 0,
  }))

  const topDimension = [...dimensionSummary].sort((a, b) => b.count - a.count)[0] || null
  const topCodes = getTopCodes(rows)

  return {
    total: rows.length,
    matched: rows.filter((row) => row.match_status === 'matched').length,
    review: rows.filter((row) => row.match_status === 'review').length,
    unmatched: rows.filter((row) => row.match_status === 'unmatched').length,
    dimensionSummary,
    topDimension,
    topCodes,
  }
}

const getTopCodes = (rows = [], limit = 8) => {
  const counts = new Map()

  rows.forEach((row) => {
    if (!row.dominant_code) return
    counts.set(row.dominant_code, (counts.get(row.dominant_code) || 0) + 1)
  })

  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, limit)
}

const getDifferenceIndex = (rawData) => {
  const found = Object.entries(rawData || {}).find(([key, value]) => {
    if (value === null || value === undefined || value === '') return false
    const normalizedKey = String(key).toLocaleLowerCase('ms-MY').replace(/[^a-z0-9]/g, '')
    return ['indeksperbezaan', 'differenceindex'].includes(normalizedKey)
  })

  return found?.[1] ?? null
}

const findStudentResult = (rows, student, assessmentName) => {
  if (!student) return null

  return (
    rows.find(
      (row) =>
        row.assessment_name === assessmentName &&
        String(row.student_enrollment_id || '') === String(student.id)
    ) ||
    rows.find(
      (row) =>
        row.assessment_name === assessmentName &&
        !row.student_enrollment_id &&
        String(row.student_profile_id || '') === String(student.student_profile_id || '') &&
        String(row.class_id || '') === String(student.class_id || '')
    ) ||
    null
  )
}

const buildClassTraitMatrix = ({ rows, classes, dimensions, limit = 8 }) => {
  const classById = new Map(classes.map((classRow) => [String(classRow.id), classRow]))
  const summary = summarizeRows(rows, dimensions)
  const topKeys = summary.dimensionSummary
    .filter((dimension) => dimension.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((dimension) => dimension.key)
  const grouped = new Map()

  rows.forEach((row) => {
    const classKey = String(row.class_id || `${row.grade_label || ''} ${row.class_name || ''}`)
    if (!classKey.trim()) return

    const current = grouped.get(classKey) || {
      classKey,
      label:
        getDisplayClassLabel(
          classById.get(String(row.class_id))?.tingkatan || row.grade_label,
          classById.get(String(row.class_id))?.class_name || row.class_name
        ) || '-',
      total: 0,
      counts: Object.fromEntries(topKeys.map((key) => [key, 0])),
    }
    const primaryKey = getPrimaryKey(row, dimensions)
    if (current.counts[primaryKey] !== undefined) current.counts[primaryKey] += 1
    current.total += 1
    grouped.set(classKey, current)
  })

  return {
    topKeys,
    rows: [...grouped.values()]
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'ms', { numeric: true }))
      .slice(0, limit),
  }
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
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
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
          assessment_type,
          assessment_name,
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
        .order('updated_at', { ascending: false })
        .limit(2000)

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
          : error.message || 'Gagal memuatkan analisis psikometrik.'
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
        [...new Set(classes.map((classRow) => classRow.tingkatan))]
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

  const rowsByInstrument = useMemo(
    () => ({
      IMK: results.filter((row) => row.assessment_name === 'IMK'),
      ITP: results.filter((row) => row.assessment_name === 'ITP'),
      APTITUD_KHUSUS: results.filter(
        (row) => row.assessment_name === 'APTITUD_KHUSUS' || row.assessment_type === 'aptitude'
      ),
    }),
    [results]
  )

  const summaries = useMemo(
    () => ({
      IMK: summarizeRows(rowsByInstrument.IMK, getInstrumentDimensions('IMK')),
      ITP: summarizeRows(rowsByInstrument.ITP, getInstrumentDimensions('ITP')),
      APTITUD_KHUSUS: summarizeRows(rowsByInstrument.APTITUD_KHUSUS, []),
    }),
    [rowsByInstrument]
  )

  const reviewRows = useMemo(
    () =>
      results
        .filter((row) => ['review', 'unmatched'].includes(row.match_status))
        .slice(0, 10),
    [results]
  )

  const selectedStudentResults = useMemo(
    () => ({
      IMK: findStudentResult(results, selectedStudent, 'IMK'),
      ITP: findStudentResult(results, selectedStudent, 'ITP'),
      APTITUD_KHUSUS: findStudentResult(results, selectedStudent, 'APTITUD_KHUSUS'),
    }),
    [results, selectedStudent]
  )

  const resetStudentSelection = () => {
    setSelectedStudentEnrollmentId('')
    setStudentSearch('')
  }

  const updateYear = (value) => {
    setAcademicYear(value)
    setSelectedGrade('')
    setSelectedClassId('')
    resetStudentSelection()
  }

  const updateGrade = (value) => {
    setSelectedGrade(value)
    setSelectedClassId('')
    resetStudentSelection()
  }

  const updateClass = (value) => {
    setSelectedClassId(value)
    resetStudentSelection()
  }

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
              <h2 className="text-lg font-semibold text-slate-900">Papan Analisis Psikometrik</h2>
              <p className="mt-1 text-sm text-slate-500">
                Ringkasan Inventori Minat Kerjaya, Inventori Tret Personaliti dan Aptitud Khusus
                berdasarkan tahun, tingkatan dan kelas yang dipilih.
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              Tahun pentaksiran: {academicYear}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select
              value={academicYear}
              onChange={(event) => updateYear(event.target.value)}
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
              onChange={(event) => updateGrade(event.target.value)}
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
              onChange={(event) => updateClass(event.target.value)}
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

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {ANALYSIS_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="grid text-left leading-tight">
                    <span>{tab.label}</span>
                    {tab.description ? (
                      <span className="text-[11px] font-medium opacity-80">{tab.description}</span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {activeTab === 'overview' ? (
          <OverviewTab
            summaries={summaries}
            reviewRows={reviewRows}
            availableStudentCount={availableStudents.length}
            onSelectTab={setActiveTab}
          />
        ) : null}

        {activeTab === 'IMK' ? (
          <InstrumentTab
            assessmentName="IMK"
            rows={rowsByInstrument.IMK}
            classes={classes}
            summary={summaries.IMK}
            variant="career"
          />
        ) : null}

        {activeTab === 'ITP' ? (
          <InstrumentTab
            assessmentName="ITP"
            rows={rowsByInstrument.ITP}
            classes={classes}
            summary={summaries.ITP}
            variant="personality"
          />
        ) : null}

        {activeTab === 'APTITUD_KHUSUS' ? (
          <AptitudeTab rows={rowsByInstrument.APTITUD_KHUSUS} summary={summaries.APTITUD_KHUSUS} />
        ) : null}

        {activeTab === 'individual' ? (
          <IndividualTab
            classById={classById}
            selectedStudent={selectedStudent}
            selectedStudentResults={selectedStudentResults}
            studentSearch={studentSearch}
            visibleStudents={visibleStudents}
            onSearchChange={setStudentSearch}
            onStudentChange={setSelectedStudentEnrollmentId}
            selectedStudentEnrollmentId={selectedStudentEnrollmentId}
          />
        ) : null}
      </div>
    </div>
  )
}

function OverviewTab({ summaries, reviewRows, availableStudentCount, onSelectTab }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-3">
        {['IMK', 'ITP', 'APTITUD_KHUSUS'].map((assessmentName) => (
          <InstrumentOverviewCard
            key={assessmentName}
            assessmentName={assessmentName}
            summary={summaries[assessmentName]}
            availableStudentCount={availableStudentCount}
            onClick={() => onSelectTab(assessmentName)}
          />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Kualiti Padanan</h2>
          {reviewRows.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
              Semua rekod dalam pilihan semasa tiada isu padanan aktif.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[760px] border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Murid', 'Instrumen', 'Kelas', 'Status', 'Nota'].map((header) => (
                      <th
                        key={header}
                        className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reviewRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-4 py-3 font-medium text-slate-900">{getStudentName(row)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="font-semibold text-slate-800">
                          {getMeta(row.assessment_name).shortLabel}
                        </div>
                        <div className="text-xs text-slate-500">{getMeta(row.assessment_name).title}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {`${row.grade_label || ''} ${row.class_name || ''}`.trim() || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.match_status} />
                      </td>
                      <td className="max-w-md px-4 py-3 text-xs leading-5 text-slate-500">
                        {row.match_note || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Liputan Data</h2>
          <div className="mt-4 grid gap-3">
            {['IMK', 'ITP', 'APTITUD_KHUSUS'].map((assessmentName) => {
              const meta = getMeta(assessmentName)
              const summary = summaries[assessmentName]
              const percent = availableStudentCount
                ? Math.min((summary.total / availableStudentCount) * 100, 100)
                : 0

              return (
                <div key={assessmentName} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-800">{meta.shortLabel}</div>
                      <div className="text-xs text-slate-500">{meta.title}</div>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-slate-950">
                      {summary.total}/{availableStudentCount || 0}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-slate-900"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}

function InstrumentOverviewCard({ assessmentName, summary, availableStudentCount, onClick }) {
  const meta = getMeta(assessmentName)
  const topLabel = summary.topDimension?.count
    ? formatDimensionName(summary.topDimension.key, getInstrumentDimensions(assessmentName))
    : '-'
  const coverage = availableStudentCount
    ? Math.min((summary.total / availableStudentCount) * 100, 100)
    : 0
  const toneClass = {
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950',
    sky: 'border-sky-200 bg-sky-50 text-sky-950',
    violet: 'border-violet-200 bg-violet-50 text-violet-950',
    slate: 'border-slate-200 bg-slate-50 text-slate-950',
  }[meta.tone]

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{meta.shortLabel}</div>
          <h2 className="mt-1 text-lg font-bold">{meta.title}</h2>
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">
          {coverage.toFixed(0)}%
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <MiniMetric label="Rekod" value={summary.total} />
        <MiniMetric label="Padanan" value={summary.matched} />
        <MiniMetric label="Semakan" value={summary.review} />
      </div>

      <div className="mt-4 rounded-xl bg-white/70 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
          {meta.primaryLabel}
        </div>
        <div className="mt-1 font-bold">{topLabel}</div>
      </div>
    </button>
  )
}

function InstrumentTab({ assessmentName, rows, classes, summary, variant }) {
  const meta = getMeta(assessmentName)
  const dimensions = getInstrumentDimensions(assessmentName)
  const topDimensionLabel = summary.topDimension?.count
    ? formatDimensionName(summary.topDimension.key, dimensions)
    : '-'
  const matrix = buildClassTraitMatrix({ rows, classes, dimensions })

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{meta.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{meta.subtitle}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {rows.length} rekod
          </span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Jumlah Keputusan" value={summary.total} />
        <SummaryCard title="Padanan Tepat" value={summary.matched} tone="emerald" />
        <SummaryCard title="Perlu Semakan" value={summary.review} tone="amber" />
        <SummaryCard title={meta.primaryLabel} value={topDimensionLabel} tone={meta.tone} />
      </section>

      {rows.length === 0 ? (
        <EmptyPanel title={meta.emptyTitle} detail="Data akan dipaparkan selepas import disimpan." />
      ) : variant === 'career' ? (
        <CareerPanels rows={rows} summary={summary} />
      ) : (
        <PersonalityPanels rows={rows} summary={summary} matrix={matrix} dimensions={dimensions} />
      )}

      <ResultTable assessmentName={assessmentName} rows={rows} />
    </div>
  )
}

function CareerPanels({ rows, summary }) {
  const dimensions = getInstrumentDimensions('IMK')

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Taburan Dimensi Dominan</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.dimensionSummary.map((dimension) => (
            <DimensionCard key={dimension.key} dimension={dimension} />
          ))}
        </div>
      </div>

      <TopCodePanel
        title="Kod Holland Popular"
        rows={rows}
        dimensions={dimensions}
        emptyText="Belum ada kod Holland."
      />
    </section>
  )
}

function PersonalityPanels({ summary, matrix, dimensions }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Ranking Tret Dominan</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {summary.dimensionSummary.map((dimension) => (
            <TraitRow key={dimension.key} dimension={dimension} />
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        <TopCodePanel
          title="Gabungan Tret Popular"
          rows={summary.topCodes}
          dimensions={dimensions}
          emptyText="Belum ada gabungan tret."
          precomputed
        />
        <ClassTraitMatrix matrix={matrix} dimensions={dimensions} />
      </div>
    </section>
  )
}

function AptitudeTab({ rows, summary }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Jumlah Keputusan" value={summary.total} />
        <SummaryCard title="Padanan Tepat" value={summary.matched} tone="emerald" />
        <SummaryCard title="Perlu Semakan" value={summary.review} tone="amber" />
        <SummaryCard title="Status Modul" value={rows.length ? 'Aktif' : 'Belum Aktif'} tone="violet" />
      </section>

      {rows.length === 0 ? (
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                Aptitud Khusus
              </div>
              <h2 className="mt-1 text-xl font-bold text-violet-950">Modul Aptitud belum diaktifkan</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-violet-900">
                Ruang ini disediakan untuk analisis domain aptitud, kekuatan kebolehan, dan profil
                murid apabila format import aptitud dimasukkan.
              </p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-violet-900">
              Sedia untuk fasa seterusnya
            </div>
          </div>
        </section>
      ) : (
        <ResultTable assessmentName="APTITUD_KHUSUS" rows={rows} />
      )}
    </div>
  )
}

function IndividualTab({
  classById,
  selectedStudent,
  selectedStudentResults,
  studentSearch,
  visibleStudents,
  onSearchChange,
  onStudentChange,
  selectedStudentEnrollmentId,
}) {
  const selectedStudentClass = selectedStudent
    ? classById.get(String(selectedStudent.class_id))
    : null

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Profil Psikometrik Individu</h2>
          <p className="mt-1 text-sm text-slate-500">
            Paparan gabungan IMK, ITP dan Aptitud untuk seorang murid.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Cari murid
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={studentSearch}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Cari nama, nombor kad pengenalan atau kelas"
                className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 text-sm font-normal outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Pilih murid
            <select
              value={selectedStudentEnrollmentId}
              onChange={(event) => onStudentChange(event.target.value)}
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
      </section>

      {!selectedStudent ? (
        <EmptyPanel title="Pilih murid untuk melihat profil individu" detail="Gunakan carian atau senarai murid." />
      ) : (
        <section className="grid gap-4">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Profil Murid
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-950">
              {selectedStudent.student_profiles?.full_name || 'Nama murid tidak tersedia'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {getDisplayClassLabel(selectedStudentClass?.tingkatan, selectedStudentClass?.class_name)}
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <StudentInstrumentProfile
              assessmentName="IMK"
              result={selectedStudentResults.IMK}
              dimensions={getInstrumentDimensions('IMK')}
            />
            <StudentInstrumentProfile
              assessmentName="ITP"
              result={selectedStudentResults.ITP}
              dimensions={getInstrumentDimensions('ITP')}
            />
            <StudentInstrumentProfile
              assessmentName="APTITUD_KHUSUS"
              result={selectedStudentResults.APTITUD_KHUSUS}
              dimensions={[]}
            />
          </div>
        </section>
      )}
    </div>
  )
}

function StudentInstrumentProfile({ assessmentName, result, dimensions }) {
  const meta = getMeta(assessmentName)
  const scores = getSortedScores(result, dimensions)
  const maxScore = Math.max(...scores.map((dimension) => dimension.score || 0), 1)
  const primaryKey = getPrimaryKey(result, dimensions)
  const primaryDimension = dimensions.find((dimension) => dimension.key === primaryKey) || null
  const dominantExpansion = formatCodeExpansion(result?.dominant_code, dimensions)
  const differenceIndex = assessmentName === 'IMK' ? getDifferenceIndex(result?.raw_data) : null
  const artisticNotes = useMemo(() => {
    if (assessmentName !== 'IMK') return []
    const dominantCode = String(result?.dominant_code || '')
    if (!dominantCode.includes('A')) return []

    return [
      ARTISTIC_GENERAL_NOTE,
      ...Object.entries(ARTISTIC_COMBINATION_NOTES)
        .filter(([dimensionKey]) => dominantCode.includes(dimensionKey))
        .map(([, note]) => note),
    ]
  }, [assessmentName, result?.dominant_code])

  if (!result) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {meta.shortLabel}
        </div>
        <h3 className="mt-1 font-bold text-slate-900">{meta.emptyTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">Data belum tersedia untuk murid ini.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {meta.shortLabel}
          </div>
          <h3 className="mt-1 font-bold text-slate-900">{meta.title}</h3>
        </div>
        <StatusBadge status={result.match_status} />
      </div>

      <div className="mt-4 grid gap-3">
        <IndividualSummary
          label={meta.metricLabel}
          value={result.dominant_code || '-'}
          detail={dominantExpansion}
          valueClassName="tracking-widest text-indigo-700"
        />
        <IndividualSummary
          label={meta.primaryLabel}
          value={
            primaryDimension
              ? formatDimensionName(primaryDimension.key, dimensions)
              : formatDimensionName(result.primary_dimension, dimensions)
          }
        />
        {differenceIndex !== null ? (
          <IndividualSummary label="Indeks Perbezaan" value={differenceIndex} />
        ) : null}
      </div>

      {scores.length ? (
        <div className="mt-5 grid gap-3">
          {scores.slice(0, assessmentName === 'ITP' ? 8 : scores.length).map((dimension) => {
            const width = Math.max((dimension.score / maxScore) * 100, 0)
            return (
              <div key={dimension.key} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">
                    {dimension.label} ({dimension.key})
                  </span>
                  <span className="font-bold tabular-nums text-slate-900">{dimension.score}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${
                      DIMENSION_BAR_STYLES[dimension.key] || 'bg-slate-900'
                    }`}
                    style={{ width: `${Math.min(width, 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {assessmentName === 'IMK' && primaryKey ? (
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {DIMENSION_DESCRIPTIONS[primaryKey] || 'Huraian kecenderungan dominan belum tersedia.'}
        </p>
      ) : null}

      {artisticNotes.map((note) => (
        <div
          key={note}
          className="mt-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3 text-xs leading-5 text-fuchsia-950"
        >
          {note}
        </div>
      ))}
    </div>
  )
}

function ResultTable({ assessmentName, rows }) {
  const meta = getMeta(assessmentName)
  const dimensions = getInstrumentDimensions(assessmentName)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <h2 className="text-lg font-semibold text-slate-900">
        Senarai Keputusan {meta.shortLabel} - {meta.title}
      </h2>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          Tiada keputusan untuk pilihan semasa.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[980px] border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Murid', 'Tingkatan / Kelas', meta.metricLabel, 'Dimensi 1', 'Dimensi 2', 'Dimensi 3', 'Status'].map(
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
              {rows.map((row) => {
                const dominantKeys = getDominantKeys(row.dominant_code, dimensions)
                const dominantExpansion = formatCodeExpansion(row.dominant_code, dimensions)

                return (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="px-4 py-3 font-medium text-slate-900">{getStudentName(row)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {`${row.grade_label || ''} ${row.class_name || ''}`.trim() || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold tracking-widest text-indigo-700">
                        {row.dominant_code || '-'}
                      </div>
                      {dominantExpansion ? (
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          {dominantExpansion}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDimensionName(row.primary_dimension || dominantKeys[0], dimensions)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDimensionName(row.secondary_dimension || dominantKeys[1], dimensions)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDimensionName(row.tertiary_dimension || dominantKeys[2], dimensions)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.match_status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DimensionCard({ dimension }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-700 text-lg font-bold text-white">
          {dimension.key}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-900">{dimension.count}</div>
          <div className="text-xs font-semibold text-slate-500">{dimension.percent.toFixed(1)}%</div>
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
  )
}

function TraitRow({ dimension }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            {dimension.key}
          </span>
          <span className="truncate text-sm font-semibold text-slate-800">{dimension.label}</span>
        </div>
        <div className="text-right">
          <div className="font-bold tabular-nums text-slate-950">{dimension.count}</div>
          <div className="text-xs text-slate-500">{dimension.percent.toFixed(1)}%</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-sky-600"
          style={{ width: `${Math.min(dimension.percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

function TopCodePanel({ title, rows, dimensions = [], emptyText, precomputed = false }) {
  const items = precomputed ? rows : getTopCodes(rows)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {items.map((item, index) => {
            const expansion = formatCodeExpansion(item.code, dimensions)

            return (
              <div
                key={item.code}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 text-xs font-bold text-slate-400">{index + 1}</span>
                  <div className="min-w-0">
                    <div className="font-bold tracking-widest text-indigo-700">{item.code}</div>
                    {expansion ? (
                      <div className="mt-1 text-xs leading-5 text-slate-500">{expansion}</div>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-700">
                  {item.count} murid
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ClassTraitMatrix({ matrix, dimensions }) {
  const dimensionByKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]))

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <h2 className="text-lg font-semibold text-slate-900">Tret Mengikut Kelas</h2>
      {matrix.rows.length === 0 || matrix.topKeys.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          Belum ada data kelas untuk ITP.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[620px] border-collapse text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                  Kelas
                </th>
                {matrix.topKeys.map((key) => (
                  <th
                    key={key}
                    className="border-b border-slate-200 px-3 py-3 text-center font-semibold text-slate-700"
                    title={dimensionByKey.get(key)?.label || key}
                  >
                    <span className="grid gap-0.5">
                      <span>{key}</span>
                      <span className="text-[11px] font-medium text-slate-500">
                        {dimensionByKey.get(key)?.label || key}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.classKey} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.label}</td>
                  {matrix.topKeys.map((key) => {
                    const count = row.counts[key] || 0
                    const opacity = row.total ? Math.min(count / row.total, 1) : 0

                    return (
                      <td key={key} className="px-3 py-3 text-center">
                        <span
                          className="inline-flex min-w-10 justify-center rounded-lg px-2 py-1 text-xs font-bold text-slate-950"
                          style={{
                            backgroundColor: `rgba(14, 165, 233, ${0.12 + opacity * 0.55})`,
                          }}
                        >
                          {count}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ title, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950',
    sky: 'border-sky-200 bg-sky-50 text-sky-950',
    violet: 'border-violet-200 bg-violet-50 text-violet-950',
  }[tone]

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  )
}

function MiniMetric({ label, value }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  )
}

function IndividualSummary({ label, value, detail = '', valueClassName = '' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-bold text-slate-900 ${valueClassName}`}>{value}</div>
      {detail ? <div className="mt-1 text-xs leading-5 text-slate-500">{detail}</div> : null}
    </div>
  )
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        STATUS_STYLES[status] || STATUS_STYLES.unmatched
      }`}
    >
      {STATUS_LABELS[status] || status || '-'}
    </span>
  )
}

function EmptyPanel({ title, detail }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500">
        <ClipboardList className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </section>
  )
}
