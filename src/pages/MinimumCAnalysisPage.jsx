import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  Printer,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../lib/supabaseClient.js'
import { getDashboardPath } from '../lib/dashboardPath.js'
import { formatExamDisplayName } from '../lib/examConfig.js'
import {
  analyzeFourSubjects,
  buildAssessmentIndex,
  buildRpmSubjectMap,
  formatPercentage,
  RPM_SUBJECT_CONFIG,
  summarizeFourSubjectResults,
  summarizeRpmSubjects,
} from '../lib/minimumCAnalysis.js'
import MinimumCPrintReport from '../components/MinimumCPrintReport.jsx'

const TABS = [
  { key: 'summary', label: 'Ringkasan Minimum C' },
  { key: 'subject', label: 'Analisis Mengikut Subjek' },
  { key: 'rpm', label: 'Analisis Empat Subjek RPM' },
  { key: 'intervention', label: 'Intervensi Murid' },
]

const normalizeExamKey = (value) => String(value || '').trim().toUpperCase()
const isTargetExam = (value) => {
  const key = normalizeExamKey(value)
  return key === 'ETR' || key.startsWith('OTR')
}
async function fetchAllRows(buildQuery) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await buildQuery().range(offset, offset + 999)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if ((data || []).length < 1000) return { data: rows, error: null }
  }
}

const getLevelNumber = (value) => Number(String(value || '').match(/\d+/)?.[0] || 0)
const isSameLevel = (a, b) => {
  if (!a || !b) return true
  const normalizedA = String(a).trim().toLowerCase()
  const normalizedB = String(b).trim().toLowerCase()
  return normalizedA === normalizedB || (getLevelNumber(a) > 0 && getLevelNumber(a) === getLevelNumber(b))
}
const sortMalay = (a, b) =>
  String(a || '').localeCompare(String(b || ''), 'ms', { sensitivity: 'base' })
const getExamOrder = (key) => {
  const normalized = normalizeExamKey(key)
  if (normalized === 'TOV') return 0
  if (normalized === 'ETR') return 999
  const otr = normalized.match(/^OTR(\d+)$/)
  if (otr) return Number(otr[1]) * 10
  const ar = normalized.match(/^AR(\d+)$/)
  if (ar) return Number(ar[1]) * 10 + 1
  if (normalized === 'PAT') return 800
  return 500
}

const getGradeDisplay = (result) => {
  if (result?.state === 'absent') return 'TH'
  return result?.grade || '—'
}

const escapeCsvCell = (value) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default function MinimumCAnalysisPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [schools, setSchools] = useState([])
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [academicYears, setAcademicYears] = useState([])
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('')
  const [loadingContext, setLoadingContext] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [duplicateEnrollments, setDuplicateEnrollments] = useState(0)
  const [loadedContext, setLoadedContext] = useState('')
  const requestId = useRef(0)
  const [refreshToken, setRefreshToken] = useState(0)

  const [school, setSchool] = useState(null)
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [students, setStudents] = useState([])
  const [scores, setScores] = useState([])
  const [targets, setTargets] = useState([])
  const [gradeScales, setGradeScales] = useState([])
  const [examConfigs, setExamConfigs] = useState([])

  const [selectedLevel, setSelectedLevel] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [selectedExamKey, setSelectedExamKey] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [activeTab, setActiveTab] = useState('summary')
  const [studentStatusFilter, setStudentStatusFilter] = useState('all')
  const [interventionFilter, setInterventionFilter] = useState('all')
  const [interventionClass, setInterventionClass] = useState('all')
  const [interventionSubject, setInterventionSubject] = useState('all')

  const isMasterAdmin = Boolean(
    profile?.is_master_admin || String(profile?.role || '').toLowerCase() === 'master_admin'
  )

  useEffect(() => {
    let active = true

    const loadContext = async () => {
      setLoadingContext(true)
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) {
        navigate('/login', { replace: true })
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle()

      if (!active) return
      if (profileError || !profileData) {
        setError('Profil pengguna tidak dapat dimuatkan.')
        setLoadingContext(false)
        return
      }

      setProfile(profileData)
      const master = Boolean(
        profileData.is_master_admin ||
          String(profileData.role || '').toLowerCase() === 'master_admin'
      )
      if (!master && profileData.is_active !== true) {
        await supabase.auth.signOut()
        navigate('/login', { replace: true })
        return
      }
      if (!master && profileData.approval_status !== 'approved') {
        navigate('/pending', { replace: true })
        return
      }
      let schoolRows = []

      if (master) {
        const { data, error: schoolError } = await supabase
          .from('schools')
          .select('id, school_name, school_code, logo_url')
          .order('school_name', { ascending: true })
        if (schoolError) setError(schoolError.message)
        schoolRows = data || []
      } else if (profileData.school_id) {
        const { data, error: schoolError } = await supabase
          .from('schools')
          .select('id, school_name, school_code, logo_url')
          .eq('id', profileData.school_id)
          .maybeSingle()
        if (schoolError) setError(schoolError.message)
        if (data) schoolRows = [data]
      }

      setSchools(schoolRows)
      setSelectedSchoolId(profileData.school_id || schoolRows[0]?.id || '')
      setLoadingContext(false)
    }

    loadContext()
    return () => { active = false }
  }, [navigate])

  useEffect(() => {
    if (!selectedSchoolId) return
    let active = true

    const loadYears = async () => {
      const [{ data: setupRows }, { data: enrollmentYears }] = await Promise.all([
        supabase
          .from('school_setup_configs')
          .select('current_academic_year, created_at')
          .eq('school_id', selectedSchoolId)
          .order('created_at', { ascending: false }),
        supabase
          .from('student_enrollments')
          .select('academic_year')
          .eq('school_id', selectedSchoolId),
      ])
      if (!active) return
      const values = [
        ...(setupRows || []).map((row) => row.current_academic_year),
        ...(enrollmentYears || []).map((row) => row.academic_year),
        new Date().getFullYear(),
      ]
        .map(Number)
        .filter(Number.isFinite)
      const options = [...new Set(values)].sort((a, b) => b - a)
      setAcademicYears(options)
      setSelectedAcademicYear(String(options[0] || new Date().getFullYear()))
    }

    loadYears()
    return () => { active = false }
  }, [selectedSchoolId])

  const loadAnalysisData = useCallback(async () => {
    if (!selectedSchoolId || !selectedAcademicYear) return
    const currentRequest = ++requestId.current
    setLoading(true)
    setError('')
    const year = Number(selectedAcademicYear)

    const results = await Promise.all([
      supabase.from('schools').select('id, school_name, school_code, logo_url').eq('id', selectedSchoolId).maybeSingle(),
      supabase.from('classes').select('*').eq('school_id', selectedSchoolId).eq('academic_year', year),
      supabase.from('subjects').select('*').eq('school_id', selectedSchoolId).eq('is_active', true),
      fetchAllRows(() => supabase
        .from('student_enrollments')
        .select('id, class_id, academic_year, student_profile_id, classes(id, tingkatan, class_name), student_profiles(id, full_name, ic_number, gender)')
        .eq('school_id', selectedSchoolId)
        .eq('academic_year', year)
        .eq('is_active', true).order('id')),
      fetchAllRows(() => supabase.from('student_scores').select('*').eq('school_id', selectedSchoolId).eq('academic_year', year).order('id')),
      fetchAllRows(() => supabase.from('student_targets').select('*').eq('school_id', selectedSchoolId).eq('academic_year', year).order('id')),
      supabase.from('grade_scales').select('*').eq('school_id', selectedSchoolId).eq('academic_year', year),
      supabase
        .from('exam_configs')
        .select('id, grade_label, exam_key, exam_name, exam_order, is_active')
        .eq('school_id', selectedSchoolId)
        .eq('academic_year', year),
    ])

    if (currentRequest !== requestId.current) return
    const firstError = results.find((result) => result.error)?.error
    if (firstError) {
      setError(firstError.message || 'Data analisis tidak dapat dimuatkan.')
      setLoading(false)
      return
    }

    const seenStudents = new Set()
    const allEnrollments = results[3].data || []
    const enrollmentRows = allEnrollments.filter((row) => {
      const key = String(row.student_profile_id || row.id)
      if (seenStudents.has(key)) return false
      seenStudents.add(key)
      return true
    })
    setDuplicateEnrollments(allEnrollments.length - enrollmentRows.length)
    setSchool(results[0].data || null)
    setClasses(results[1].data || [])
    setSubjects(results[2].data || [])
    setStudents(
      enrollmentRows.map((row) => ({
        enrollment_id: row.id,
        student_profile_id: row.student_profile_id,
        class_id: row.class_id,
        full_name: row.student_profiles?.full_name || '',
        ic_number: row.student_profiles?.ic_number || '',
        gender: row.student_profiles?.gender || '',
        tingkatan: row.classes?.tingkatan || '',
        class_name: row.classes?.class_name || '',
      }))
    )
    const configById = new Map((results[7].data || []).map((config) => [String(config.id), config]))
    const enrollmentLevel = new Map(enrollmentRows.map((row) => [String(row.id), row.classes?.tingkatan]))
    setScores((results[4].data || []).filter((row) => {
      const config = row.exam_config_id ? configById.get(String(row.exam_config_id)) : null
      return !row.exam_config_id || (config && isSameLevel(config.grade_label, enrollmentLevel.get(String(row.student_enrollment_id))))
    }).map((row) => ({ ...row, exam_key: configById.get(String(row.exam_config_id))?.exam_key || row.exam_key })))
    setTargets(results[5].data || [])
    setGradeScales(results[6].data || [])
    setExamConfigs(results[7].data || [])
    setSelectedLevel('')
    setSelectedClassId('all')
    setSelectedSubjectId('')
    setLoadedContext(`${selectedSchoolId}__${selectedAcademicYear}`)
    setLoading(false)
  }, [selectedAcademicYear, selectedSchoolId])

  useEffect(() => {
    const timer = window.setTimeout(() => loadAnalysisData(), 0)
    return () => { window.clearTimeout(timer); requestId.current += 1 }
  }, [loadAnalysisData, refreshToken])

  const levelOptions = useMemo(
    () => [...new Set(classes.map((row) => row.tingkatan).filter(Boolean))].sort((a, b) => getLevelNumber(a) - getLevelNumber(b) || sortMalay(a, b)),
    [classes]
  )

  const classOptions = useMemo(
    () => classes
      .filter((row) => !selectedLevel || isSameLevel(row.tingkatan, selectedLevel))
      .sort((a, b) => sortMalay(a.class_name, b.class_name)),
    [classes, selectedLevel]
  )

  const effectiveClassId =
    selectedClassId === 'all' || classOptions.some((row) => String(row.id) === selectedClassId)
      ? selectedClassId
      : 'all'

  const examOptions = useMemo(() => {
    const map = new Map()
    const addExam = (key, label, order, active = true) => {
      const normalized = normalizeExamKey(key)
      if (!normalized || active === false) return
      const current = map.get(normalized)
      map.set(normalized, {
        key: normalized,
        label: formatExamDisplayName(current?.label || label || normalized),
        order: Number.isFinite(Number(order)) ? Number(order) : current?.order ?? getExamOrder(normalized),
        isTarget: isTargetExam(normalized),
      })
    }
    examConfigs
      .filter((row) => !selectedLevel || isSameLevel(row.grade_label, selectedLevel))
      .forEach((row) => addExam(row.exam_key, row.exam_name, row.exam_order, row.is_active))
    const eligible = new Set(students.filter((row) => (!selectedLevel || isSameLevel(row.tingkatan, selectedLevel)) && (effectiveClassId === 'all' || String(row.class_id) === effectiveClassId)).map((row) => row.enrollment_id))
    scores.filter((row) => eligible.has(row.student_enrollment_id)).forEach((row) => addExam(row.exam_key, row.exam_key))
    targets.filter((row) => eligible.has(row.student_enrollment_id)).forEach((row) => addExam(row.target_key, row.target_key))
    return [...map.values()].sort((a, b) => a.order - b.order || sortMalay(a.label, b.label))
  }, [examConfigs, scores, targets, students, selectedLevel, effectiveClassId])

  const effectiveExamKey = examOptions.some((row) => row.key === selectedExamKey)
    ? selectedExamKey
    : (examOptions.find((row) => !row.isTarget) || examOptions[0])?.key || ''

  const dataCurrent = Boolean(selectedSchoolId && selectedAcademicYear && loadedContext === `${selectedSchoolId}__${selectedAcademicYear}` && !error)
  const selectedExam = examOptions.find((row) => row.key === effectiveExamKey) || null
  const selectedAssessmentIndex = useMemo(
    () => isTargetExam(effectiveExamKey)
      ? buildAssessmentIndex(targets, 'target_key')
      : buildAssessmentIndex(scores, 'exam_key'),
    [scores, targets, effectiveExamKey]
  )

  const filteredStudents = useMemo(
    () => students
      .filter((row) => !selectedLevel || isSameLevel(row.tingkatan, selectedLevel))
      .filter((row) => effectiveClassId === 'all' || String(row.class_id) === effectiveClassId)
      .sort((a, b) => sortMalay(a.full_name, b.full_name)),
    [students, selectedLevel, effectiveClassId]
  )

  const relevantSubjects = useMemo(
    () => subjects
      .filter((row) => !selectedLevel || isSameLevel(row.tingkatan, selectedLevel))
      .sort((a, b) => sortMalay(a.subject_name, b.subject_name)),
    [subjects, selectedLevel]
  )

  const fourSubjectRows = useMemo(
    () => analyzeFourSubjects({
      students: filteredStudents,
      subjectMap: buildRpmSubjectMap(relevantSubjects),
      assessmentIndex: selectedAssessmentIndex,
      examKey: effectiveExamKey,
      gradeScales,
    }),
    [filteredStudents, relevantSubjects, selectedAssessmentIndex, effectiveExamKey, gradeScales]
  )
  const summary = useMemo(() => summarizeFourSubjectResults(fourSubjectRows), [fourSubjectRows])

  const subjectSummaries = useMemo(() => summarizeRpmSubjects(fourSubjectRows), [fourSubjectRows])

  const effectiveSubjectId = subjectSummaries.some(
    (row) => String(row.subject.id) === selectedSubjectId
  )
    ? selectedSubjectId
    : String(subjectSummaries[0]?.subject.id || '')

  const selectedSubjectSummary = subjectSummaries.find(
    (row) => String(row.subject.id) === effectiveSubjectId
  ) || null

  const trendRows = useMemo(() => examOptions.map((exam) => {
    const index = exam.isTarget
      ? buildAssessmentIndex(targets, 'target_key')
      : buildAssessmentIndex(scores, 'exam_key')
    const rows = analyzeFourSubjects({
      students: filteredStudents,
      subjectMap: buildRpmSubjectMap(relevantSubjects),
      assessmentIndex: index,
      examKey: exam.key,
      gradeScales,
    })
    const examSummary = summarizeFourSubjectResults(rows)
    const hasAnyData = rows.some((row) =>
      Object.values(row.subjects).some((result) => ['achieved', 'below'].includes(result.state))
    )
    return {
      key: exam.key,
      name: exam.label,
      isTarget: exam.isTarget,
      pencapaian: hasAnyData ? examSummary.achievementRate : null,
      capai: hasAnyData ? examSummary.achievedCount : null,
      belumCapai: hasAnyData ? examSummary.belowCount : null,
      lengkap: examSummary.completeCount,
    }
  }), [examOptions, targets, scores, filteredStudents, relevantSubjects, gradeScales])

  const filteredFourSubjectRows = useMemo(() => fourSubjectRows.filter((row) => {
    if (studentStatusFilter === 'achieved') return row.status === 'Capai'
    if (studentStatusFilter === 'below') return row.status === 'Belum Capai'
    if (studentStatusFilter === 'incomplete') return !row.isComplete
    if (studentStatusFilter.startsWith('count:')) return row.isComplete && row.achievedCount === Number(studentStatusFilter.slice(6))
    return true
  }), [fourSubjectRows, studentStatusFilter])

  const interventionRows = useMemo(() => fourSubjectRows.filter((row) => {
    if (interventionClass !== 'all' && String(row.class_id) !== interventionClass) return false
    if (interventionSubject !== 'all' && row.subjects[interventionSubject]?.state !== 'below') return false
    if (interventionFilter === 'incomplete') return !row.isComplete
    if (!row.isComplete) return interventionFilter === 'all'
    if (/^[1-4]$/.test(interventionFilter)) return row.belowCount === Number(interventionFilter)
    return row.belowCount > 0
  }).sort((a, b) => Number(!a.isComplete) - Number(!b.isComplete) || a.belowCount - b.belowCount || sortMalay(a.full_name, b.full_name)), [fourSubjectRows, interventionFilter, interventionClass, interventionSubject])

  const filterLabels = useMemo(() => ({
    level: selectedLevel || 'Semua tingkatan',
    className: effectiveClassId === 'all'
      ? 'Semua kelas'
      : classes.find((row) => String(row.id) === effectiveClassId)?.class_name || 'Kelas',
  }), [selectedLevel, effectiveClassId, classes])

  const handleExportCsv = () => {
    const headers = ['Nama Murid', 'Kelas', 'BM', 'BI', 'Matematik', 'Sejarah', 'Status', 'Bilangan Bawah C', 'Status Data', 'Subjek Intervensi']
    const rows = fourSubjectRows.map((row) => [
      row.full_name,
      row.class_name,
      getGradeDisplay(row.subjects.bm),
      getGradeDisplay(row.subjects.bi),
      getGradeDisplay(row.subjects.matematik),
      getGradeDisplay(row.subjects.sejarah),
      row.status,
      row.belowCount,
      row.isComplete ? 'Lengkap' : 'Tidak Lengkap',
      row.interventionSubjects.join('; '),
    ])
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `analisis-minimum-c-${selectedAcademicYear}-${effectiveExamKey || 'tiada-data'}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  if (loadingContext) return <LoadingState />

  return (
    <>
      <main className="minimum-c-screen min-h-screen bg-slate-50 p-3 sm:p-4 lg:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 p-5 text-white shadow-xl sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-3xl">
                <button type="button" onClick={() => navigate(getDashboardPath(profile))} className="mb-5 inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">
                  <ArrowLeft size={16} /> Dashboard
                </button>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Analisis Akademik</p>
                <h1 className="mt-2 text-2xl font-black sm:text-4xl">Analisis Minimum C</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
                  Pemantauan dalaman pencapaian Bahasa Melayu, Bahasa Inggeris, Matematik dan Sejarah selaras dengan hala tuju RPM 2026–2035.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/20 disabled:opacity-60">
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Segar Semula
                </button>
                <button type="button" onClick={handleExportCsv} disabled={!dataCurrent || loading || !fourSubjectRows.length} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/20 disabled:opacity-60">
                  <Download size={16} /> Eksport CSV
                </button>
                <button type="button" onClick={() => window.print()} disabled={!dataCurrent || loading || !fourSubjectRows.length} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-blue-950 hover:bg-blue-50 disabled:opacity-60">
                  <Printer size={16} /> Cetak Laporan
                </button>
              </div>
            </div>
          </header>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><p><strong>Nota dasar:</strong> Tingkatan 1 hingga 4 ialah pemantauan awal; Tingkatan 5 ialah pemantauan dalaman persediaan SPM. Ia tidak mendakwa semua tingkatan diwajibkan melapor kepada KPM dan bukan pengganti pelaporan rasmi.</p></div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {isMasterAdmin ? <FilterSelect label="Sekolah" value={selectedSchoolId} onChange={setSelectedSchoolId} options={schools.map((row) => ({ value: row.id, label: row.school_name }))} /> : null}
              <FilterSelect label="Tahun Akademik" value={selectedAcademicYear} onChange={setSelectedAcademicYear} options={academicYears.map((year) => ({ value: String(year), label: String(year) }))} />
              <FilterSelect label="Tingkatan" value={selectedLevel} onChange={(value) => { setSelectedLevel(value); setSelectedClassId('all') }} options={[{ value: '', label: 'Semua Tingkatan' }, ...levelOptions.map((level) => ({ value: level, label: level }))]} />
              <FilterSelect label="Kelas" value={effectiveClassId} onChange={setSelectedClassId} options={[{ value: 'all', label: 'Semua Kelas' }, ...classOptions.map((row) => ({ value: String(row.id), label: row.class_name }))]} />
              <FilterSelect label="Jenis Peperiksaan" value={effectiveExamKey} onChange={setSelectedExamKey} options={examOptions.map((exam) => ({ value: exam.key, label: `${exam.label}${exam.isTarget ? ' (Sasaran)' : ''}` }))} />
            </div>
          </section>

          {duplicateEnrollments > 0 ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Terdapat {duplicateEnrollments} pendaftaran aktif pendua bagi murid dalam tahun ini. Satu pendaftaran setiap murid digunakan; pentadbir perlu menyemak rekod kelas.</div> : null}
          {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</div> : null}
          {loading || (!dataCurrent && !error && selectedSchoolId && selectedAcademicYear) ? <LoadingState /> : null}

          {!loading && dataCurrent && !effectiveExamKey ? <EmptyState text="Tiada peperiksaan aktif atau rekod pentaksiran untuk penapis ini." /> : null}

          {!loading && dataCurrent && effectiveExamKey ? (
            <>
              {selectedExam?.isTarget ? (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
                  <strong>{selectedExam.label}</strong> dilabel sebagai sasaran atau ramalan dan tidak dicampurkan dengan keputusan peperiksaan sebenar.
                </div>
              ) : null}

              {summary.incompleteCount > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Data tidak lengkap mungkin disebabkan markah kosong, tidak hadir, subjek yang belum dipetakan atau skala gred tahun dan tingkatan yang belum dikonfigurasi. Sila semak konfigurasi dan rekod peperiksaan.</div>}
              <StatsGrid summary={summary} onSelect={(filter, tab = 'rpm') => { setStudentStatusFilter(filter); setActiveTab(tab) }} />

              <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Tab Analisis Minimum C">
                {TABS.map((tab) => (
                  <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${activeTab === tab.key ? 'bg-blue-700 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {tab.label}
                  </button>
                ))}
              </nav>

              {activeTab === 'summary' ? <SummaryTab trendRows={trendRows} subjectSummaries={subjectSummaries} summary={summary} /> : null}
              {activeTab === 'subject' ? <SubjectTab rows={subjectSummaries} selected={selectedSubjectSummary} onSelect={(id) => setSelectedSubjectId(String(id))} /> : null}
              {activeTab === 'rpm' ? <FourSubjectTab rows={filteredFourSubjectRows} summary={summary} filter={studentStatusFilter} onFilter={setStudentStatusFilter} /> : null}
              {activeTab === 'intervention' ? <InterventionTab rows={interventionRows} filter={interventionFilter} onFilter={setInterventionFilter} classes={classOptions} classId={interventionClass} onClass={setInterventionClass} subject={interventionSubject} onSubject={setInterventionSubject} navigate={navigate} currentYear={selectedAcademicYear} schoolId={selectedSchoolId} /> : null}
            </>
          ) : null}
        </div>
      </main>

      {dataCurrent && !loading && <MinimumCPrintReport
        school={school}
        academicYear={selectedAcademicYear}
        filterLabels={filterLabels}
        exam={selectedExam}
        summary={summary}
        subjectSummaries={subjectSummaries}
        fourSubjectRows={fourSubjectRows}
      />}
    </>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
        {options.length ? options.map((option) => <option key={`${label}-${option.value}`} value={option.value}>{option.label}</option>) : <option value="">Tiada pilihan</option>}
      </select>
    </label>
  )
}

function StatsGrid({ summary, onSelect }) {
  const cards = [
    { label: 'Jumlah Murid', value: summary.totalStudents, detail: 'Dalam kohort dipilih', icon: Users, tone: 'blue', filter: 'all' },
    { label: 'Keputusan Lengkap', value: summary.completeCount, detail: `${formatPercentage(summary.coverageRate)} liputan data`, icon: Database, tone: 'blue', filter: 'all' },
    { label: 'Capai Minimum C', value: summary.achievedCount, detail: 'Empat daripada empat subjek', icon: CheckCircle2, tone: 'green', filter: 'achieved' },
    { label: 'Peratus Pencapaian', value: summary.achievementRate === null ? 'Tiada data mencukupi' : formatPercentage(summary.achievementRate), detail: 'Berdasarkan rekod lengkap', icon: Target, tone: 'green', filter: 'achieved' },
    { label: 'Rekod Tidak Lengkap', value: summary.incompleteCount, detail: 'Kosong atau tidak hadir', icon: AlertTriangle, tone: 'amber', filter: 'incomplete' },
  ]
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
  }
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map((card) => { const Icon = card.icon; return <button key={card.label} type="button" onClick={() => onSelect(card.filter)} className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[card.tone]}`}><div className="flex items-start justify-between gap-3"><span className="text-xs font-bold uppercase tracking-wide opacity-70">{card.label}</span><Icon size={18} /></div><strong className="mt-3 block text-2xl font-black">{card.value}</strong><span className="mt-1 block text-xs opacity-75">{card.detail}</span></button> })}</section>
}

function SummaryTab({ trendRows, subjectSummaries, summary }) {
  const actualRows = trendRows.filter((row) => !row.isTarget)
  const comparable = actualRows.filter((row) => row.pencapaian !== null)
  const last = comparable[comparable.length - 1]
  const previous = comparable[comparable.length - 2]
  const difference = last && previous ? last.pencapaian - previous.pencapaian : null
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <ChartCard title="Perbandingan Peperiksaan" subtitle="Kadar berdasarkan murid yang lengkap dalam setiap peperiksaan; titik tanpa data tidak disambungkan.">
        <ResponsiveContainer width="100%" height={300}><LineChart data={actualRows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} unit="%" /><Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-lg border bg-white p-3 text-sm shadow"><strong>{label}</strong><div>{formatPercentage(payload[0].payload.pencapaian)} · {payload[0].payload.capai}/{payload[0].payload.lengkap} murid lengkap</div></div> : null} /><Legend /><Line type="monotone" dataKey="pencapaian" name="Capai 4 Subjek" stroke="#16a34a" strokeWidth={3} connectNulls={false} /></LineChart></ResponsiveContainer>
        <p className="text-sm text-slate-600">{difference === null ? 'Tiada dua peperiksaan dengan data mencukupi untuk perbandingan.' : `${difference > 0 ? 'Meningkat' : difference < 0 ? 'Menurun' : 'Kekal'} ${Math.abs(difference).toFixed(1)} mata peratusan (${previous.name} → ${last.name}). Penyebut mungkin berbeza.`}</p>
        <div className="mt-3 flex flex-wrap gap-2">{actualRows.map((row) => <span key={row.key} className="rounded-lg bg-slate-100 px-2 py-1 text-xs">{row.name}: {row.lengkap} lengkap</span>)}</div>
      </ChartCard>
      <ChartCard title="Minimum C Mengikut Subjek" subtitle="Penyebut ialah murid dengan keputusan sah bagi setiap subjek.">
        <div className="space-y-4">{subjectSummaries.map((row) => <div key={row.subject.id}><div className="mb-1 flex justify-between gap-2 text-sm"><strong>{row.subject.subject_name}</strong><span>{row.minimumCRate === null ? 'Tiada data mencukupi' : `${formatPercentage(row.minimumCRate)} (${row.minimumCCount}/${row.evaluatedCount} murid)`}</span></div><div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-blue-600" style={{ width: `${row.minimumCRate || 0}%` }} /></div></div>)}</div>
      </ChartCard>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><h2 className="text-lg font-black">Ringkasan Pencapaian Empat Subjek</h2><p className="mt-1 text-sm text-slate-500">Kategori bawah C hanya merangkumi murid dengan keputusan lengkap.</p><div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><MiniStat label="Capai 4/4" value={summary.achievedCount} tone="green" />{[1, 2, 3, 4].map((count) => <MiniStat key={count} label={`Bawah C: ${count}`} value={summary.belowByCount[count]} tone="red" />)}<MiniStat label="Tidak Lengkap" value={summary.incompleteCount} tone="amber" /></div></section>
    </div>
  )
}

function SubjectTab({ rows, selected, onSelect }) {
  return <div className="space-y-5"><TableCard title="Analisis Mengikut Subjek"><table className="w-full min-w-[800px] text-sm"><thead><tr><TableHead>Subjek</TableHead><TableHead>Calon Sah</TableHead><TableHead>Capai C</TableHead><TableHead>Belum Capai</TableHead><TableHead>% Capai</TableHead><TableHead>Taburan Gred</TableHead></tr></thead><tbody>{rows.map((row) => <tr key={row.subject.id} className={`border-b ${selected?.subject.id === row.subject.id ? 'bg-blue-50' : ''}`}><TableCell><button type="button" className="font-bold text-blue-700 underline" onClick={() => onSelect(row.subject.id)}>{row.subject.subject_name}</button></TableCell><TableCell>{row.evaluatedCount}</TableCell><TableCell>{row.minimumCCount}</TableCell><TableCell>{row.belowCount}</TableCell><TableCell>{row.minimumCRate === null ? 'Tiada data mencukupi' : formatPercentage(row.minimumCRate)}</TableCell><TableCell>{Object.entries(row.gradeDistribution).sort(([a], [b]) => a.localeCompare(b)).map(([grade, count]) => `${grade}: ${count}`).join(' · ') || '—'}</TableCell></tr>)}</tbody></table></TableCard>
    {selected && <TableCard title={`Murid belum mencapai C · ${selected.subject.subject_name}`}><table className="w-full min-w-[500px] text-sm"><thead><tr><TableHead>Nama Murid</TableHead><TableHead>Kelas</TableHead><TableHead>Gred</TableHead></tr></thead><tbody>{selected.studentResults.filter((row) => row.metric.state === 'below').map((row) => <tr key={row.enrollment_id} className="border-b"><TableCell>{row.full_name}</TableCell><TableCell>{row.class_name}</TableCell><TableCell>{getGradeDisplay(row.metric)}</TableCell></tr>)}</tbody></table>{!selected.belowCount && <p className="p-4 text-sm text-slate-500">Tiada murid di bawah C dalam keputusan sah.</p>}</TableCard>}</div>
}

function FourSubjectTab({ rows, summary, filter, onFilter }) {
  const counts = [4, 3, 2, 1, 0].map((count) => ({ label: `${count}/4`, count: count === 4 ? summary.achievedCount : summary.belowByCount[4 - count], value: `count:${count}` }))
  return <div className="space-y-5"><ChartCard title="Taburan Pencapaian Empat Subjek" subtitle="Kategori 0 hingga 4 hanya menggunakan keputusan lengkap. Klik kategori untuk melihat murid."><div className="space-y-2">{counts.map((item) => <button key={item.value} type="button" onClick={() => onFilter(item.value)} className="flex w-full items-center gap-3 text-left text-sm"><strong className="w-12">{item.label}</strong><span className="h-5 flex-1 rounded bg-slate-100"><span className="block h-5 rounded bg-blue-600" style={{ width: `${summary.completeCount ? item.count / summary.completeCount * 100 : 0}%` }} /></span><span className="w-16 text-right">{item.count} murid</span></button>)}<button type="button" onClick={() => onFilter('incomplete')} className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">Tidak lengkap: {summary.incompleteCount} murid</button></div></ChartCard>
    <TableCard title="Pencapaian Empat Subjek RPM" action={<FilterSelect label="Paparan Murid" value={filter} onChange={onFilter} options={[{ value: 'all', label: 'Semua Murid' }, { value: 'achieved', label: 'Capai Sasaran' }, { value: 'below', label: 'Belum Capai' }, { value: 'incomplete', label: 'Rekod Tidak Lengkap' }, ...counts.map((item) => ({ value: item.value, label: `Capai ${item.label}` }))]} />}><StudentFourSubjectTable rows={rows} /></TableCard></div>
}

function InterventionTab({ rows, filter, onFilter, classes, classId, onClass, subject, onSubject, navigate, currentYear, schoolId }) {
  const completeRows = rows.filter((row) => row.isComplete)
  const incompleteRows = rows.filter((row) => !row.isComplete)
  const renderTable = (list) => <table className="w-full min-w-[950px] text-sm"><thead><tr><TableHead>Nama Murid</TableHead><TableHead>Kelas</TableHead>{RPM_SUBJECT_CONFIG.map((item) => <TableHead key={item.key}>{item.shortLabel}</TableHead>)}<TableHead>Subjek Belum Capai</TableHead><TableHead>Keutamaan</TableHead></tr></thead><tbody>{list.length ? list.map((row) => <tr key={row.enrollment_id} className="border-b"><TableCell><button type="button" className="font-semibold text-blue-700 underline" onClick={() => navigate('/analysis/student', { state: { selectedTingkatan: row.tingkatan, selectedClassId: row.class_id, selectedStudentId: row.enrollment_id, academicYear: currentYear, schoolId } })} title={`Analisis individu tahun ${currentYear}`}>{row.full_name}</button></TableCell><TableCell>{row.class_name}</TableCell>{RPM_SUBJECT_CONFIG.map((item) => <TableCell key={item.key}><GradeBadge result={row.subjects[item.key]} /></TableCell>)}<TableCell>{row.belowCount} · {row.interventionSubjects.join(', ') || '—'}</TableCell><TableCell>{row.isComplete ? `Prioriti ${Math.min(row.belowCount, 3)}` : 'Lengkapkan data'}</TableCell></tr>) : <tr><td colSpan={8} className="p-6 text-center text-slate-500">Tiada murid dalam kategori ini.</td></tr>}</tbody></table>
  return <div className="space-y-5"><section className="grid gap-4 rounded-2xl border bg-white p-4 sm:grid-cols-3"><FilterSelect label="Kelas" value={classId} onChange={onClass} options={[{ value: 'all', label: 'Semua Kelas' }, ...classes.map((row) => ({ value: String(row.id), label: row.class_name }))]} /><FilterSelect label="Subjek Belum Capai" value={subject} onChange={onSubject} options={[{ value: 'all', label: 'Semua Subjek' }, ...RPM_SUBJECT_CONFIG.map((item) => ({ value: item.key, label: item.label }))]} /><FilterSelect label="Bilangan Subjek" value={filter} onChange={onFilter} options={[{ value: 'all', label: 'Semua' }, ...[1, 2, 3, 4].map((count) => ({ value: String(count), label: `${count} subjek` })), { value: 'incomplete', label: 'Rekod Tidak Lengkap' }]} /></section><p className="text-sm text-slate-500">Keutamaan 1, 2 dan 3 ialah cadangan kerja sekolah, bukan klasifikasi rasmi KPM. Analisis individu menggunakan tahun akademik yang dipilih.</p><TableCard title="Murid Memerlukan Intervensi">{renderTable(completeRows)}</TableCard><TableCard title="Murid Memerlukan Pelengkapan Data">{renderTable(incompleteRows)}</TableCard></div>
}

function StudentFourSubjectTable({ rows }) {
  return <table className="min-w-[900px] w-full text-sm"><thead><tr><TableHead>Nama Murid</TableHead><TableHead>Kelas</TableHead>{RPM_SUBJECT_CONFIG.map((item) => <TableHead key={item.key}>{item.shortLabel}</TableHead>)}<TableHead>Status</TableHead><TableHead>Kelengkapan</TableHead></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.enrollment_id} className="border-b border-slate-100"><TableCell><span className="font-semibold text-slate-900">{row.full_name}</span></TableCell><TableCell>{row.class_name}</TableCell>{RPM_SUBJECT_CONFIG.map((item) => <TableCell key={item.key}><GradeBadge result={row.subjects[item.key]} /></TableCell>)}<TableCell><StatusBadge status={row.status} /></TableCell><TableCell>{row.isComplete ? 'Lengkap' : `${row.incompleteCount} tiada data`}</TableCell></tr>) : <tr><td colSpan={8} className="p-8 text-center text-slate-500">Tiada murid untuk penapis ini.</td></tr>}</tbody></table>
}

function ChartCard({ title, subtitle, children }) { return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h2 className="text-lg font-black text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p><div className="mt-5">{children}</div></section> }
function TableCard({ title, action, children }) { return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 p-4 sm:p-5"><h2 className="text-lg font-black text-slate-900">{title}</h2>{action}</div><div className="overflow-x-auto">{children}</div></section> }
function TableHead({ children }) { return <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">{children}</th> }
function TableCell({ children }) { return <td className="px-4 py-3 text-slate-700">{children}</td> }
function MiniStat({ label, value, tone }) { const tones = { green: 'border-emerald-200 bg-emerald-50 text-emerald-900', red: 'border-red-200 bg-red-50 text-red-900', amber: 'border-amber-200 bg-amber-50 text-amber-900' }; return <div className={`rounded-2xl border p-4 ${tones[tone]}`}><span className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</span><strong className="mt-2 block text-2xl font-black">{value}</strong></div> }
function GradeBadge({ result }) { const styles = result?.state === 'achieved' ? 'bg-emerald-100 text-emerald-800' : result?.state === 'below' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'; return <span className={`inline-flex min-w-9 justify-center rounded-lg px-2 py-1 text-xs font-black ${styles}`}>{getGradeDisplay(result)}</span> }
function StatusBadge({ status }) { const styles = status === 'Capai' ? 'bg-emerald-100 text-emerald-800' : status === 'Belum Capai' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'; return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles}`}>{status}</span> }
function MetricBadge({ state }) { const labels = { achieved: 'Capai Minimum C', below: 'Bawah C', absent: 'Tidak Hadir', missing: 'Tiada Data' }; const styles = state === 'achieved' ? 'bg-emerald-100 text-emerald-800' : state === 'below' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'; return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles}`}>{labels[state] || 'Tiada Data'}</span> }
function LoadingState() { return <div role="status" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"><p className="text-sm font-semibold text-slate-600">Mengira analisis Minimum C...</p><div className="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-5">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-24 rounded-xl bg-slate-100" />)}</div></div> }
function EmptyState({ text, compact = false }) { return <div className={`rounded-2xl border border-dashed border-slate-300 bg-white text-center text-slate-500 ${compact ? 'p-8' : 'p-12'}`}><AlertTriangle className="mx-auto mb-3 text-amber-500" /><p className="font-semibold">{text}</p></div> }
