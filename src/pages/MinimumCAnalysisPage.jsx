import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  Printer,
  RefreshCw,
  Target,
  Users,
} from 'lucide-react'
import {
  Bar,
  BarChart,
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
import {
  analyzeFourSubjects,
  buildAssessmentIndex,
  buildRpmSubjectMap,
  formatPercentage,
  RPM_SUBJECT_CONFIG,
  summarizeFourSubjectResults,
  summarizeSubject,
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
const getLevelNumber = (value) => Number(String(value || '').match(/\d+/)?.[0] || 0)
const isSameLevel = (a, b) => {
  if (!a || !b) return true
  const normalizedA = String(a).trim().toLowerCase()
  const normalizedB = String(b).trim().toLowerCase()
  return normalizedA === normalizedB || getLevelNumber(a) === getLevelNumber(b)
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
  const [refreshToken, setRefreshToken] = useState(0)

  const [school, setSchool] = useState(null)
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [students, setStudents] = useState([])
  const [scores, setScores] = useState([])
  const [targets, setTargets] = useState([])
  const [gradeScales, setGradeScales] = useState([])
  const [examConfigs, setExamConfigs] = useState([])
  const [subjectEnrollments, setSubjectEnrollments] = useState([])

  const [selectedLevel, setSelectedLevel] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [selectedExamKey, setSelectedExamKey] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [activeTab, setActiveTab] = useState('summary')
  const [studentStatusFilter, setStudentStatusFilter] = useState('all')
  const [interventionFilter, setInterventionFilter] = useState('all')

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
    setLoading(true)
    setError('')
    const year = Number(selectedAcademicYear)

    const results = await Promise.all([
      supabase.from('schools').select('id, school_name, school_code, logo_url').eq('id', selectedSchoolId).maybeSingle(),
      supabase.from('classes').select('*').eq('school_id', selectedSchoolId).eq('academic_year', year),
      supabase.from('subjects').select('*').eq('school_id', selectedSchoolId).eq('is_active', true),
      supabase
        .from('student_enrollments')
        .select('id, class_id, academic_year, student_profile_id, classes(id, tingkatan, class_name), student_profiles(id, full_name, ic_number, gender)')
        .eq('school_id', selectedSchoolId)
        .eq('academic_year', year)
        .eq('is_active', true),
      supabase.from('student_scores').select('*').eq('school_id', selectedSchoolId).eq('academic_year', year),
      supabase.from('student_targets').select('*').eq('school_id', selectedSchoolId).eq('academic_year', year),
      supabase.from('grade_scales').select('*').eq('school_id', selectedSchoolId),
      supabase
        .from('exam_configs')
        .select('id, grade_label, exam_key, exam_name, exam_order, is_active')
        .eq('school_id', selectedSchoolId)
        .eq('academic_year', year),
      supabase
        .from('student_subject_enrollments')
        .select('student_enrollment_id, subject_id, is_active')
        .eq('school_id', selectedSchoolId)
        .eq('is_active', true),
    ])

    const firstError = results.find((result) => result.error)?.error
    if (firstError) {
      setError(firstError.message || 'Data analisis tidak dapat dimuatkan.')
      setLoading(false)
      return
    }

    const enrollmentRows = results[3].data || []
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
    setScores(results[4].data || [])
    setTargets(results[5].data || [])
    setGradeScales(results[6].data || [])
    setExamConfigs(results[7].data || [])
    setSubjectEnrollments(results[8].data || [])
    setSelectedLevel('')
    setSelectedClassId('all')
    setSelectedSubjectId('')
    setLoading(false)
  }, [selectedAcademicYear, selectedSchoolId])

  useEffect(() => {
    const timer = window.setTimeout(() => loadAnalysisData(), 0)
    return () => window.clearTimeout(timer)
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
        label: label || current?.label || normalized,
        order: Number.isFinite(Number(order)) ? Number(order) : current?.order ?? getExamOrder(normalized),
        isTarget: isTargetExam(normalized),
      })
    }
    examConfigs
      .filter((row) => !selectedLevel || isSameLevel(row.grade_label, selectedLevel))
      .forEach((row) => addExam(row.exam_key, row.exam_name, row.exam_order, row.is_active))
    scores.forEach((row) => addExam(row.exam_key, row.exam_key))
    targets.forEach((row) => addExam(row.target_key, row.target_key))
    return [...map.values()].sort((a, b) => a.order - b.order || sortMalay(a.label, b.label))
  }, [examConfigs, scores, targets, selectedLevel])

  const effectiveExamKey = examOptions.some((row) => row.key === selectedExamKey)
    ? selectedExamKey
    : (examOptions.find((row) => !row.isTarget) || examOptions[0])?.key || ''

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

  const subjectEnrollmentSet = useMemo(
    () => new Set(subjectEnrollments.map((row) => `${row.student_enrollment_id}__${row.subject_id}`)),
    [subjectEnrollments]
  )

  const getStudentsForSubject = useCallback((subject) => {
    const levelStudents = filteredStudents.filter(
      (student) => !subject.tingkatan || isSameLevel(student.tingkatan, subject.tingkatan)
    )
    const isSelective = String(subject.subject_type || '').trim().toLowerCase() === 'selective'
    if (!isSelective) return levelStudents
    return levelStudents.filter((student) =>
      subjectEnrollmentSet.has(`${student.enrollment_id}__${subject.id}`)
    )
  }, [filteredStudents, subjectEnrollmentSet])

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

  const subjectSummaries = useMemo(
    () => relevantSubjects
      .map((subject) => summarizeSubject({
        students: getStudentsForSubject(subject),
        subject,
        assessmentIndex: selectedAssessmentIndex,
        examKey: effectiveExamKey,
        gradeScales,
      }))
      .filter((row) => row.evaluatedCount > 0 || row.noDataCount > 0)
      .sort((a, b) => {
        if (a.minimumCRate === null) return 1
        if (b.minimumCRate === null) return -1
        return a.minimumCRate - b.minimumCRate || sortMalay(a.subject.subject_name, b.subject.subject_name)
      }),
    [relevantSubjects, getStudentsForSubject, selectedAssessmentIndex, effectiveExamKey, gradeScales]
  )

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
    }
  }), [examOptions, targets, scores, filteredStudents, relevantSubjects, gradeScales])

  const filteredFourSubjectRows = useMemo(() => fourSubjectRows.filter((row) => {
    if (studentStatusFilter === 'achieved') return row.status === 'Capai'
    if (studentStatusFilter === 'below') return row.status === 'Belum Capai'
    if (studentStatusFilter === 'incomplete') return !row.isComplete
    return true
  }), [fourSubjectRows, studentStatusFilter])

  const interventionRows = useMemo(() => fourSubjectRows.filter((row) => {
    if (interventionFilter === 'incomplete') return !row.isComplete
    if (/^[1-4]$/.test(interventionFilter)) return row.belowCount === Number(interventionFilter)
    return row.status !== 'Capai' || !row.isComplete
  }), [fourSubjectRows, interventionFilter])

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

  if (loadingContext) return <div className="min-h-screen bg-slate-50 p-6 text-slate-600">Memuatkan Analisis Minimum C...</div>

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
                <button type="button" onClick={handleExportCsv} disabled={!fourSubjectRows.length} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/20 disabled:opacity-60">
                  <Download size={16} /> Eksport CSV
                </button>
                <button type="button" onClick={() => window.print()} disabled={!fourSubjectRows.length} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-blue-950 hover:bg-blue-50 disabled:opacity-60">
                  <Printer size={16} /> Cetak Laporan
                </button>
              </div>
            </div>
          </header>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><p><strong>Nota dasar:</strong> Analisis Tingkatan 1 hingga Tingkatan 5 ini ialah pemantauan dalaman sekolah. Ia tidak mendakwa semua tingkatan diwajibkan melapor kepada KPM dan bukan pengganti pelaporan rasmi.</p></div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {isMasterAdmin ? <FilterSelect label="Sekolah" value={selectedSchoolId} onChange={setSelectedSchoolId} options={schools.map((row) => ({ value: row.id, label: row.school_name }))} /> : null}
              <FilterSelect label="Tahun Akademik" value={selectedAcademicYear} onChange={setSelectedAcademicYear} options={academicYears.map((year) => ({ value: String(year), label: String(year) }))} />
              <FilterSelect label="Tingkatan" value={selectedLevel} onChange={(value) => { setSelectedLevel(value); setSelectedClassId('all') }} options={[{ value: '', label: 'Semua Tingkatan' }, ...levelOptions.map((level) => ({ value: level, label: level }))]} />
              <FilterSelect label="Kelas" value={effectiveClassId} onChange={setSelectedClassId} options={[{ value: 'all', label: 'Semua Kelas' }, ...classOptions.map((row) => ({ value: String(row.id), label: row.class_name }))]} />
              <FilterSelect label="Jenis Peperiksaan" value={effectiveExamKey} onChange={setSelectedExamKey} options={examOptions.map((exam) => ({ value: exam.key, label: `${exam.label}${exam.isTarget ? ' (Sasaran)' : ''}` }))} />
              <FilterSelect label="Subjek" value={effectiveSubjectId} onChange={setSelectedSubjectId} options={subjectSummaries.map((row) => ({ value: String(row.subject.id), label: row.subject.subject_name }))} />
            </div>
          </section>

          {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</div> : null}
          {loading ? <LoadingState /> : null}

          {!loading && !effectiveExamKey ? <EmptyState text="Tiada peperiksaan aktif atau rekod pentaksiran untuk penapis ini." /> : null}

          {!loading && effectiveExamKey ? (
            <>
              {selectedExam?.isTarget ? (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
                  <strong>{selectedExam.label}</strong> dilabel sebagai sasaran atau ramalan dan tidak dicampurkan dengan keputusan peperiksaan sebenar.
                </div>
              ) : null}

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
              {activeTab === 'intervention' ? <InterventionTab rows={interventionRows} filter={interventionFilter} onFilter={setInterventionFilter} /> : null}
            </>
          ) : null}
        </div>
      </main>

      <MinimumCPrintReport
        school={school}
        academicYear={selectedAcademicYear}
        filterLabels={filterLabels}
        exam={selectedExam}
        summary={summary}
        subjectSummaries={subjectSummaries}
        fourSubjectRows={fourSubjectRows}
      />
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
    { label: 'Peratus Pencapaian', value: formatPercentage(summary.achievementRate), detail: 'Berdasarkan rekod lengkap', icon: Target, tone: 'green', filter: 'achieved' },
    { label: 'Belum Capai', value: summary.belowCount, detail: 'Sekurang-kurangnya satu bawah C', icon: BarChart3, tone: 'red', filter: 'below' },
    { label: 'Rekod Tidak Lengkap', value: summary.incompleteCount, detail: 'Kosong atau tidak hadir', icon: AlertTriangle, tone: 'amber', filter: 'incomplete' },
  ]
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
  }
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map((card) => { const Icon = card.icon; return <button key={card.label} type="button" onClick={() => onSelect(card.filter)} className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[card.tone]}`}><div className="flex items-start justify-between gap-3"><span className="text-xs font-bold uppercase tracking-wide opacity-70">{card.label}</span><Icon size={18} /></div><strong className="mt-3 block text-2xl font-black">{card.value}</strong><span className="mt-1 block text-xs opacity-75">{card.detail}</span></button> })}</section>
}

function SummaryTab({ trendRows, subjectSummaries, summary }) {
  const chartRows = subjectSummaries.slice(0, 12).map((row) => ({ name: row.subject.subject_name, peratus: row.minimumCRate }))
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <ChartCard title="Perbandingan Peperiksaan" subtitle="Peperiksaan tanpa data tidak dipaparkan sebagai 0%.">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={trendRows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} unit="%" /><Tooltip formatter={(value) => value === null ? 'Tiada Data' : `${Number(value).toFixed(1)}%`} /><Legend /><Line type="monotone" dataKey="pencapaian" name="Capai 4 Subjek" stroke="#16a34a" strokeWidth={3} connectNulls={false} /></LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Minimum C Mengikut Subjek" subtitle="Disusun daripada pencapaian terendah.">
        {chartRows.length ? <ResponsiveContainer width="100%" height={320}><BarChart data={chartRows} layout="vertical" margin={{ left: 28 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} unit="%" /><YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => formatPercentage(value)} /><Bar dataKey="peratus" name="Minimum C" fill="#2563eb" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer> : <EmptyState text="Tiada data subjek untuk carta." compact />}
      </ChartCard>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
        <h2 className="text-lg font-black text-slate-900">Ringkasan Pencapaian Empat Subjek</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Capai 4/4" value={summary.achievedCount} tone="green" />
          {[1, 2, 3, 4].map((count) => <MiniStat key={count} label={`Bawah C: ${count}`} value={summary.belowByCount[count]} tone="red" />)}
          <MiniStat label="Tidak Lengkap" value={summary.incompleteCount} tone="amber" />
        </div>
      </section>
    </div>
  )
}

function SubjectTab({ rows, selected, onSelect }) {
  return (
    <div className="space-y-5">
      <ChartCard title="Graf Pencapaian Subjek" subtitle="Klik baris jadual untuk melihat murid bagi subjek tersebut.">
        {rows.length ? <ResponsiveContainer width="100%" height={Math.max(320, rows.slice(0, 15).length * 32)}><BarChart data={rows.slice(0, 15).map((row) => ({ name: row.subject.subject_name, peratus: row.minimumCRate }))} layout="vertical" margin={{ left: 35 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} unit="%" /><YAxis dataKey="name" type="category" width={125} tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => formatPercentage(value)} /><Bar dataKey="peratus" fill="#0f766e" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer> : <EmptyState text="Tiada rekod subjek untuk penapis ini." compact />}
      </ChartCard>
      <TableCard title="Jadual Analisis Mengikut Subjek">
        <table className="min-w-[760px] w-full text-sm"><thead><tr><TableHead>Subjek</TableHead><TableHead>Murid Dinilai</TableHead><TableHead>Minimum C</TableHead><TableHead>% Minimum C</TableHead><TableHead>Bawah C</TableHead><TableHead>Tiada Data</TableHead></tr></thead><tbody>{rows.map((row, index) => <tr key={row.subject.id} onClick={() => onSelect(row.subject.id)} className={`cursor-pointer border-b border-slate-100 hover:bg-blue-50 ${selected?.subject.id === row.subject.id ? 'bg-blue-50' : ''}`}><TableCell><span className="font-bold text-slate-900">{row.subject.subject_name}</span>{index === 0 && row.minimumCRate !== null ? <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Terendah</span> : null}</TableCell><TableCell>{row.evaluatedCount}</TableCell><TableCell>{row.minimumCCount}</TableCell><TableCell>{formatPercentage(row.minimumCRate)}</TableCell><TableCell>{row.belowCount}</TableCell><TableCell>{row.noDataCount}</TableCell></tr>)}</tbody></table>
      </TableCard>
      {selected ? <TableCard title={`Senarai Murid · ${selected.subject.subject_name}`}><table className="min-w-[680px] w-full text-sm"><thead><tr><TableHead>Nama Murid</TableHead><TableHead>Kelas</TableHead><TableHead>Gred</TableHead><TableHead>Status</TableHead></tr></thead><tbody>{selected.studentResults.map((row) => <tr key={row.enrollment_id} className="border-b border-slate-100"><TableCell><span className="font-semibold">{row.full_name}</span></TableCell><TableCell>{row.class_name}</TableCell><TableCell>{getGradeDisplay(row.metric)}</TableCell><TableCell><MetricBadge state={row.metric.state} /></TableCell></tr>)}</tbody></table></TableCard> : null}
    </div>
  )
}

function FourSubjectTab({ rows, summary, filter, onFilter }) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><MiniStat label="Capai 4/4" value={summary.achievedCount} tone="green" />{[1, 2, 3, 4].map((count) => <MiniStat key={count} label={`Bawah C: ${count}`} value={summary.belowByCount[count]} tone="red" />)}<MiniStat label="Tidak Lengkap" value={summary.incompleteCount} tone="amber" /></section>
      <TableCard title="Pencapaian Empat Subjek RPM" action={<FilterSelect label="Paparan Murid" value={filter} onChange={onFilter} options={[{ value: 'all', label: 'Semua Murid' }, { value: 'achieved', label: 'Capai Sasaran' }, { value: 'below', label: 'Belum Capai' }, { value: 'incomplete', label: 'Rekod Tidak Lengkap' }]} />}>
        <StudentFourSubjectTable rows={rows} />
      </TableCard>
    </div>
  )
}

function InterventionTab({ rows, filter, onFilter }) {
  return (
    <TableCard title="Murid Memerlukan Intervensi" action={<FilterSelect label="Kategori" value={filter} onChange={onFilter} options={[{ value: 'all', label: 'Semua Intervensi' }, ...[1, 2, 3, 4].map((count) => ({ value: String(count), label: `Belum capai ${count} subjek` })), { value: 'incomplete', label: 'Rekod Tidak Lengkap' }]} />}>
      <table className="min-w-[1050px] w-full text-sm"><thead><tr><TableHead>Nama Murid</TableHead><TableHead>Kelas</TableHead>{RPM_SUBJECT_CONFIG.map((item) => <TableHead key={item.key}>{item.shortLabel}</TableHead>)}<TableHead>Bawah C</TableHead><TableHead>Subjek Intervensi</TableHead><TableHead>Kelengkapan Data</TableHead></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.enrollment_id} className="border-b border-slate-100"><TableCell><span className="font-semibold text-slate-900">{row.full_name}</span></TableCell><TableCell>{row.class_name}</TableCell>{RPM_SUBJECT_CONFIG.map((item) => <TableCell key={item.key}><GradeBadge result={row.subjects[item.key]} /></TableCell>)}<TableCell>{row.belowCount}</TableCell><TableCell>{row.interventionSubjects.join(', ') || '—'}</TableCell><TableCell><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.isComplete ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>{row.isComplete ? 'Lengkap' : 'Tidak Lengkap'}</span></TableCell></tr>) : <tr><td colSpan={9} className="p-8 text-center text-slate-500">Tiada murid dalam kategori ini.</td></tr>}</tbody></table>
      <p className="border-t border-slate-100 p-4 text-xs text-slate-500">Senarai ini dijana daripada rekod markah sedia ada. Catatan dan pengurusan tindakan intervensi boleh ditambah pada fasa seterusnya tanpa menjadi prasyarat analisis.</p>
    </TableCard>
  )
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
function LoadingState() { return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm"><RefreshCw className="mx-auto mb-3 animate-spin text-blue-600" /><p className="font-semibold">Mengira analisis Minimum C...</p></div> }
function EmptyState({ text, compact = false }) { return <div className={`rounded-2xl border border-dashed border-slate-300 bg-white text-center text-slate-500 ${compact ? 'p-8' : 'p-12'}`}><AlertTriangle className="mx-auto mb-3 text-amber-500" /><p className="font-semibold">{text}</p></div> }
