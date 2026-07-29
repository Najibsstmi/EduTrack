import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, ExternalLink, Save, Upload, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { getDashboardPath } from '../lib/dashboardPath.js'
import {
  fetchSchoolLevelLabels,
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import { downloadCsv } from '../lib/pbdBulkImport.js'
import {
  getGradeNumber,
  getInstrumentDimensions,
  getInstrumentGradeWarning,
  preparePsychometricPreview,
  PSYCHOMETRIC_INSTRUMENTS,
  readPsychometricFile,
  summarizePreviewRows,
} from '../lib/psychometricImport.js'
import { supabase } from '../lib/supabaseClient.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const getCurrentYear = () => new Date().getFullYear()

const buildYearOptions = (year) => {
  const baseYear = Number(year) || getCurrentYear()
  return [baseYear - 2, baseYear - 1, baseYear, baseYear + 1]
}

const STATUS_LABELS = {
  matched: 'Padanan dijumpai',
  review: 'Perlu semakan',
  unmatched: 'Tidak dijumpai',
  error: 'Ralat',
}

const STATUS_STYLES = {
  matched: 'bg-emerald-100 text-emerald-800',
  review: 'bg-amber-100 text-amber-800',
  unmatched: 'bg-slate-200 text-slate-700',
  error: 'bg-rose-100 text-rose-800',
}

export default function PsychometricInputPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)
  const [parsingFile, setParsingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [levelMappings, setLevelMappings] = useState([])
  const [classes, setClasses] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [results, setResults] = useState([])

  const [assessmentName, setAssessmentName] = useState('IMK')
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [sourceFile, setSourceFile] = useState(null)
  const [previewRows, setPreviewRows] = useState([])
  const [importSummary, setImportSummary] = useState(null)

  const selectedInstrument = useMemo(
    () =>
      PSYCHOMETRIC_INSTRUMENTS.find(
        (instrument) => instrument.assessmentName === assessmentName
      ) || PSYCHOMETRIC_INSTRUMENTS[0],
    [assessmentName]
  )

  const isSchoolAdmin =
    profile?.is_school_admin === true ||
    profile?.role === 'admin' ||
    profile?.role === 'school_admin' ||
    profile?.role === 'master_admin'
  const dashboardPath = getDashboardPath(profile)
  const selectedDimensions = useMemo(
    () => getInstrumentDimensions(assessmentName),
    [assessmentName]
  )
  const canImportPsychometric =
    isSchoolAdmin && selectedDimensions.length > 0 && Boolean(profile?.school_id)

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
        .select('id, full_name, email, school_id, role, is_school_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || !profileData) {
        navigate('/login', { replace: true })
        return
      }

      const { data: setupRows, error: setupError } = await supabase
        .from('school_setup_configs')
        .select('current_academic_year, active_grade_labels')
        .eq('school_id', profileData.school_id)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (setupError) throw setupError

      const setupData = setupRows?.[0] || null
      setProfile(profileData)
      setSetupConfig(setupData)
      setAcademicYear(setupData?.current_academic_year || getCurrentYear())
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan halaman psikometrik.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const loadYearData = useCallback(async (schoolId, year) => {
    if (!schoolId || !year) return
    setLoading(true)
    setErrorMessage('')

    try {
      const [
        loadedLevelMappings,
        { data: classData, error: classError },
        { data: enrollmentData, error: enrollmentError },
      ] = await Promise.all([
        fetchSchoolLevelLabels({ schoolId, academicYear: year }),
        supabase
          .from('classes')
          .select('id, tingkatan, class_name, academic_year, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true)
          .order('tingkatan', { ascending: true })
          .order('class_name', { ascending: true }),
        supabase
          .from('student_enrollments')
          .select(`
            id,
            school_id,
            class_id,
            student_profile_id,
            academic_year,
            is_active,
            student_profiles (
              id,
              full_name,
              ic_number
            )
          `)
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true),
      ])

      if (classError) throw classError
      if (enrollmentError) throw enrollmentError

      setLevelMappings(loadedLevelMappings || [])
      setClasses(classData || [])
      setEnrollments(enrollmentData || [])
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan kelas dan murid psikometrik.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadResults = useCallback(async () => {
    if (!profile?.school_id || !academicYear || !selectedInstrument?.assessmentName) return
    setLoadingResults(true)

    try {
      let query = supabase
        .from('psychometric_results')
        .select(`
          id,
          academic_year,
          grade_label,
          class_id,
          class_name,
          student_profile_id,
          student_enrollment_id,
          assessment_name,
          source_student_name,
          source_ic_number,
          match_status,
          match_note,
          raw_data,
          dominant_code,
          updated_at,
          student_profiles (
            id,
            full_name,
            ic_number
          )
        `)
        .eq('school_id', profile.school_id)
        .eq('academic_year', Number(academicYear))
        .eq('assessment_type', selectedInstrument.assessmentType)
        .eq('assessment_name', selectedInstrument.assessmentName)
        .order('updated_at', { ascending: false })
        .limit(250)

      if (selectedGrade) query = query.eq('grade_label', selectedGrade)
      if (selectedClassId) query = query.eq('class_id', selectedClassId)

      const { data, error } = await query
      if (error) throw error
      setResults(data || [])
    } catch (error) {
      console.error(error)
      setResults([])
      setErrorMessage(
        error.message?.includes('psychometric_results')
          ? 'Jadual psikometrik belum tersedia. Jalankan migration psikometrik terkini di Supabase.'
          : error.message || 'Gagal memuatkan keputusan psikometrik.'
      )
    } finally {
      setLoadingResults(false)
    }
  }, [academicYear, profile?.school_id, selectedClassId, selectedGrade, selectedInstrument])

  useEffect(() => {
    if (checkingAuth) return
    initPage()
  }, [checkingAuth, initPage])

  useEffect(() => {
    if (!profile?.school_id || !academicYear) return
    loadYearData(profile.school_id, academicYear)
  }, [academicYear, loadYearData, profile?.school_id])

  useEffect(() => {
    loadResults()
  }, [loadResults])

  const availableGrades = useMemo(() => {
    const classGrades = classes.map((classRow) => classRow.tingkatan).filter(Boolean)
    const setupGrades = setupConfig?.active_grade_labels || []
    const source = classGrades.length ? classGrades : setupGrades
    const secondaryGrades = source.filter((grade) => {
      const gradeNumber = Number(getGradeNumber(grade))
      return gradeNumber >= 1 && gradeNumber <= 5
    })

    return sortLevelsByDisplayOrder(
      secondaryGrades.length
        ? secondaryGrades
        : ['Tingkatan 1', 'Tingkatan 2', 'Tingkatan 3', 'Tingkatan 4', 'Tingkatan 5'],
      levelMappings
    )
  }, [classes, levelMappings, setupConfig])

  const availableClasses = useMemo(() => {
    if (!selectedGrade) return []

    return classes
      .filter((classRow) => classRow.tingkatan === selectedGrade)
      .sort((a, b) =>
        getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
          getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
          'ms',
          { sensitivity: 'base', numeric: true }
        )
      )
  }, [classes, levelMappings, selectedGrade])

  const previewSummary = useMemo(() => summarizePreviewRows(previewRows), [previewRows])
  const instrumentWarning = getInstrumentGradeWarning(assessmentName, selectedGrade)

  const clearPreview = () => {
    setPreviewRows([])
    setSourceFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const changeAssessmentName = (value) => {
    setAssessmentName(value)
    setImportSummary(null)
    clearPreview()
  }

  const changeAcademicYear = (value) => {
    setAcademicYear(value)
    setSelectedGrade('')
    setSelectedClassId('')
    setImportSummary(null)
    clearPreview()
  }

  const changeGrade = (value) => {
    setSelectedGrade(value)
    setSelectedClassId('')
    setImportSummary(null)
    clearPreview()
  }

  const changeClass = (value) => {
    setSelectedClassId(value)
    setImportSummary(null)
    clearPreview()
  }

  const getStudentReviewUrl = (row) => {
    const params = new URLSearchParams()
    const searchText =
      row.source_ic_number ||
      row.student_profiles?.ic_number ||
      row.source_student_name ||
      row.student_profiles?.full_name ||
      ''

    if (row.grade_label || row.source_grade_label) {
      params.set('tingkatan', row.grade_label || row.source_grade_label)
    }
    if (row.class_name || row.source_class_name) {
      params.set('kelas', row.class_name || row.source_class_name)
    }
    if (searchText) params.set('search', searchText)
    if (row.student_enrollment_id) params.set('editEnrollmentId', row.student_enrollment_id)

    const query = params.toString()
    return query ? `/students?${query}` : '/students'
  }

  const openStudentReviewTab = (row) => {
    window.open(getStudentReviewUrl(row), '_blank', 'noopener,noreferrer')
  }

  const downloadTemplate = () => {
    const recommendedGrade = selectedInstrument.recommendedGrades?.[0]
    const exampleGrade =
      selectedGrade || availableGrades[0] || (recommendedGrade ? `Tingkatan ${recommendedGrade}` : 'Tingkatan 1')
    const exampleGradeNumber = getGradeNumber(exampleGrade) || exampleGrade
    const exampleClass = availableClasses[0]?.class_name || 'NAMA_KELAS'
    const exampleScores = selectedDimensions.map((_, index) => 8 + (index % 5))

    downloadCsv(`template-${assessmentName.toLocaleLowerCase('ms-MY')}-${academicYear || getCurrentYear()}.csv`, [
      ['no_kp', 'nama', 'tingkatan', 'kelas', ...selectedDimensions.map((dimension) => dimension.key)],
      ['100101011234', 'Ahmad Firdaus bin Ali', exampleGradeNumber, exampleClass, ...exampleScores],
    ])
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!canImportPsychometric) {
      setErrorMessage('Import hanya tersedia untuk IMK/ITP dan admin sekolah.')
      return
    }

    setParsingFile(true)
    setErrorMessage('')
    setImportSummary(null)

    try {
      const tableRows = await readPsychometricFile(file)
      const preparedRows = preparePsychometricPreview({
        tableRows,
        classes,
        enrollments,
        selectedGrade,
        selectedClassId,
        assessmentName,
      })

      setSourceFile(file)
      setPreviewRows(preparedRows)
    } catch (error) {
      console.error(error)
      clearPreview()
      setErrorMessage(error.message || 'Gagal membaca fail psikometrik.')
    } finally {
      setParsingFile(false)
    }
  }

  const savePreview = async () => {
    if (!canImportPsychometric || !profile?.school_id || !sourceFile) {
      setErrorMessage('Maklumat import psikometrik belum lengkap.')
      return
    }

    const validRows = previewRows.filter((row) => row.match_status !== 'error')
    if (validRows.length === 0) {
      setErrorMessage('Tiada row sah untuk disimpan.')
      return
    }

    setSaving(true)
    setErrorMessage('')
    let createdBatchId = null

    try {
      const { data: batch, error: batchError } = await supabase
        .from('psychometric_import_batches')
        .insert({
          school_id: profile.school_id,
          assessment_type: selectedInstrument.assessmentType,
          assessment_name: selectedInstrument.assessmentName,
          academic_year: Number(academicYear),
          grade_label: selectedGrade || 'PELBAGAI',
          source_filename: sourceFile.name,
          total_rows: previewSummary.total,
          matched_rows: previewSummary.matched,
          review_rows: previewSummary.review,
          unmatched_rows: previewSummary.unmatched,
          error_rows: previewSummary.error,
          created_by: profile.id,
        })
        .select('id')
        .single()

      if (batchError) throw batchError
      createdBatchId = batch.id

      const rowsToUpsert = validRows.map((row) => ({
        school_id: profile.school_id,
        student_profile_id: row.student_profile_id,
        student_enrollment_id: row.student_enrollment_id,
        academic_year: Number(academicYear),
        grade_label: row.grade_label || selectedGrade,
        class_id: row.class_id,
        class_name: row.class_name,
        assessment_type: selectedInstrument.assessmentType,
        assessment_name: selectedInstrument.assessmentName,
        source_filename: sourceFile.name,
        source_student_name: row.source_student_name,
        source_ic_number: row.source_ic_number || null,
        match_status: row.match_status,
        match_note: row.match_note,
        raw_data: row.raw_data,
        dominant_code: row.dominant_code,
        primary_dimension: row.primary_dimension,
        secondary_dimension: row.secondary_dimension,
        tertiary_dimension: row.tertiary_dimension,
        import_batch_id: batch.id,
        created_by: profile.id,
      }))

      const { error: upsertError } = await supabase.from('psychometric_results').upsert(rowsToUpsert, {
        onConflict: 'school_id,student_enrollment_id,academic_year,assessment_name',
      })
      if (upsertError) throw upsertError

      setImportSummary({
        ...previewSummary,
        saved: rowsToUpsert.length,
        sourceFilename: sourceFile.name,
      })
      clearPreview()
      await loadResults()
    } catch (error) {
      console.error(error)

      if (createdBatchId) {
        const { error: cleanupError } = await supabase
          .from('psychometric_import_batches')
          .delete()
          .eq('id', createdBatchId)
          .eq('school_id', profile.school_id)
        if (cleanupError) console.error('Gagal membersihkan batch import:', cleanupError)
      }

      setErrorMessage(
        error.message?.includes('psychometric_')
          ? 'Simpan gagal. Pastikan migration psikometrik terkini sudah dijalankan dan anda ialah admin sekolah.'
          : error.message || 'Gagal menyimpan data psikometrik.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Input Data Psikometrik...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Input Data Psikometrik"
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
              onClick={() => navigate('/analysis/psychometric')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Analisis Psikometrik
            </button>
          }
        />

        <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-800 p-5 text-white shadow-sm md:p-7">
          <div className="max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">
              Pentaksiran Psikometrik
            </div>
            <h2 className="mt-2 text-2xl font-bold">Import keputusan murid, bukan bina ujian.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Import keputusan psikometrik berdasarkan panduan KPM. Modul ini menyokong data IMK
              dengan konstruk Holland RIASEK dan ITP dengan skor tret personaliti.
            </p>
          </div>
        </section>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Pilihan Instrumen</h2>
              <p className="mt-1 text-sm text-slate-500">
                Tingkatan dan kelas ialah penapis pilihan. Biarkan kosong untuk import pukal
                berdasarkan maklumat dalam setiap row fail.
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              Tahun pentaksiran: {academicYear}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Jenis instrumen
              <select
                value={assessmentName}
                onChange={(event) => changeAssessmentName(event.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
              >
                {PSYCHOMETRIC_INSTRUMENTS.map((instrument) => (
                  <option key={instrument.assessmentName} value={instrument.assessmentName}>
                    {instrument.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Tahun pentaksiran
              <select
                value={academicYear}
                onChange={(event) => changeAcademicYear(event.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
              >
                {buildYearOptions(academicYear).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Tingkatan
              <select
                value={selectedGrade}
                onChange={(event) => changeGrade(event.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal"
              >
                <option value="">Semua Tingkatan / Ikut Fail</option>
                {availableGrades.map((grade) => (
                  <option key={grade} value={grade}>
                    {getDisplayLevel(grade, levelMappings)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-slate-700">
              Kelas
              <select
                value={selectedClassId}
                onChange={(event) => changeClass(event.target.value)}
                disabled={!selectedGrade}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-normal disabled:bg-slate-100"
              >
                <option value="">
                  {selectedGrade ? 'Semua kelas dalam tingkatan' : 'Semua Kelas / Ikut Fail'}
                </option>
                {availableClasses.map((classRow) => (
                  <option key={classRow.id} value={classRow.id}>
                    {getDisplayClassLabel(classRow.tingkatan, classRow.class_name, levelMappings)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {instrumentWarning ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              {instrumentWarning}
            </div>
          ) : null}

          {selectedDimensions.length === 0 ? (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
              Instrumen ini boleh dipilih untuk persediaan aliran kerja, tetapi import pukal belum
              disediakan untuknya.
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Upload Keputusan {selectedInstrument.assessmentName}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                Fail tidak terus disimpan. {selectedInstrument.resultDescription}
              </p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              disabled={selectedDimensions.length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Muat Turun Template CSV
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/50 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Format diterima: CSV, XLSX atau XLS export psikometrik
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Header: no_kp, ic atau ID Pengenalan, nama, tingkatan, kelas,{' '}
                  {selectedDimensions.map((dimension) => dimension.key).join(', ')}. No KP boleh
                  kosong jika padanan nama dan kelas diperlukan.
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Tingkatan boleh ditulis sebagai 1, T1, F1, Form 1, Tingkatan 1 atau Tingkatan
                  Satu. Untuk export lama .xls, sistem boleh mengambil tingkatan daripada tajuk fail.
                  Untuk kelas, tulis nama kelas sahaja seperti BALADA atau BONEKA.
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-indigo-700">
                  Tidak perlu pilih tingkatan atau kelas sebelum upload. Jika dipilih, sistem akan
                  menggunakannya sebagai semakan tambahan.
                </p>
              </div>
              <label
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white ${
                  canImportPsychometric
                    ? 'cursor-pointer bg-indigo-700 hover:bg-indigo-800'
                    : 'cursor-not-allowed bg-slate-400'
                }`}
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {parsingFile ? 'Membaca fail...' : 'Pilih Fail'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  onChange={handleFileChange}
                  disabled={!canImportPsychometric || parsingFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {!isSchoolAdmin ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Akaun guru boleh melihat data psikometrik sekolah, tetapi import hanya dibenarkan
              kepada admin sekolah.
            </div>
          ) : null}
        </section>

        {previewRows.length > 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Preview Sebelum Simpan</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {sourceFile?.name} - Semak row berstatus amaran sebelum menyimpan.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={clearPreview}
                  disabled={saving}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Batal
                </button>
                <button
                  type="button"
                  onClick={savePreview}
                  disabled={saving || previewSummary.total === previewSummary.error}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving ? 'Menyimpan...' : 'Simpan Data'}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryCard title="Jumlah Row" value={previewSummary.total} />
              <SummaryCard title="Padanan" value={previewSummary.matched} tone="emerald" />
              <SummaryCard title="Perlu Semakan" value={previewSummary.review} tone="amber" />
              <SummaryCard title="Tidak Dijumpai" value={previewSummary.unmatched} />
              <SummaryCard title="Ralat" value={previewSummary.error} tone="rose" />
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[1180px] border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      'Nama',
                      'No KP',
                      'Kelas',
                      ...selectedDimensions.map((dimension) => dimension.key),
                      selectedInstrument.resultLabel || 'Kod / Tret Utama',
                      'Status Padanan',
                    ].map((header) => (
                      <th
                        key={header}
                        className="border-b border-slate-200 px-3 py-3 text-left font-semibold text-slate-700"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {row.source_student_name || '-'}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{row.source_ic_number || '-'}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {`${row.source_grade_label} ${row.source_class_name}`.trim() || '-'}
                      </td>
                      {selectedDimensions.map((dimension) => (
                        <td key={dimension.key} className="px-3 py-3 text-slate-700">
                          {row.raw_data?.[dimension.key] ?? '-'}
                        </td>
                      ))}
                      <td className="px-3 py-3 font-bold tracking-widest text-indigo-700">
                        {row.dominant_code || '-'}
                      </td>
                      <td className="max-w-sm px-3 py-3">
                        {['review', 'unmatched'].includes(row.match_status) ? (
                          <button
                            type="button"
                            onClick={() => openStudentReviewTab(row)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition hover:brightness-95 ${
                              STATUS_STYLES[row.match_status]
                            }`}
                            title="Buka Urus Murid di tab baru"
                          >
                            <span>{STATUS_LABELS[row.match_status]}</span>
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </button>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              STATUS_STYLES[row.match_status]
                            }`}
                          >
                            {STATUS_LABELS[row.match_status]}
                          </span>
                        )}
                        <div className="mt-2 text-xs leading-5 text-slate-500">{row.match_note}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {importSummary ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-emerald-950">Import berjaya disimpan</h2>
            <p className="mt-1 text-sm text-emerald-800">{importSummary.sourceFilename}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryCard title="Disimpan" value={importSummary.saved} tone="emerald" />
              <SummaryCard title="Padanan" value={importSummary.matched} />
              <SummaryCard title="Perlu Semakan" value={importSummary.review} />
              <SummaryCard title="Tidak Dijumpai" value={importSummary.unmatched} />
              <SummaryCard title="Ralat Diabaikan" value={importSummary.error} tone="rose" />
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Data Psikometrik Disimpan</h2>
              <p className="mt-1 text-sm text-slate-500">
                Senarai mengikut tahun, instrumen, tingkatan dan kelas yang dipilih.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {results.length} rekod dipaparkan
            </span>
          </div>

          {loadingResults ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              Memuatkan keputusan psikometrik...
            </div>
          ) : results.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Belum ada data psikometrik untuk pilihan semasa.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[980px] border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      'Murid',
                      'No KP',
                      'Tingkatan / Kelas',
                      'Instrumen',
                      selectedInstrument.resultLabel || 'Kod / Tret Utama',
                      'Status',
                    ].map(
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
                        {row.student_profiles?.ic_number || row.source_ic_number || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {`${row.grade_label || ''} ${row.class_name || ''}`.trim() || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.assessment_name}</td>
                      <td className="px-4 py-3 font-bold tracking-widest text-indigo-700">
                        {row.dominant_code || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {['review', 'unmatched'].includes(row.match_status) ? (
                          <div className="grid gap-1.5">
                            <button
                              type="button"
                              onClick={() => openStudentReviewTab(row)}
                              className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition hover:brightness-95 ${
                                STATUS_STYLES[row.match_status] || STATUS_STYLES.unmatched
                              }`}
                              title="Buka Urus Murid di tab baru"
                            >
                              <span>{STATUS_LABELS[row.match_status] || row.match_status}</span>
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </button>
                            {row.match_note ? (
                              <span className="max-w-xs text-xs leading-5 text-slate-500">
                                {row.match_note}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              STATUS_STYLES[row.match_status] || STATUS_STYLES.unmatched
                            }`}
                          >
                            {STATUS_LABELS[row.match_status] || row.match_status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {assessmentName === 'IMK' ? 'Panduan Ringkas RIASEK' : `Dimensi ${assessmentName}`}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {selectedDimensions.map((dimension) => (
              <div
                key={dimension.key}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-700 text-lg font-bold text-white">
                  {dimension.key}
                </div>
                <div className="font-semibold text-slate-800">{dimension.label}</div>
              </div>
            ))}
          </div>
          {selectedDimensions.length > 0 ? (
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Jika skor sama, susunan dimensi instrumen digunakan sebagai tie-breaker sementara.
            </p>
          ) : null}
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
    rose: 'border-rose-200 bg-rose-50 text-rose-950',
  }[tone]

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  )
}
