import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { getDashboardPath } from '../lib/dashboardPath'
import {
  generateOtrMarks,
  getOtrKeysForTingkatan,
  shouldAutoRecalculateOtrs,
} from '../lib/otrGeneration'

const REQUIRED_HEADERS = [
  'nama_murid',
  'no_ic',
  'subjek',
  'jenis_peperiksaan',
  'markah',
]

const normalizeText = (value) =>
  String(value || '').trim()

function normalizeIC(ic) {
  return String(ic || '')
    .trim()
    .replace(/\D/g, '')
    .padStart(12, '0')
}

const normalizeKey = (value) =>
  String(value || '').trim().toLowerCase()

const normalizeCsvHeader = (value) => {
  const normalized = normalizeKey(value)
  const compact = normalized.replace(/[^a-z0-9]/g, '')

  if (compact === 'noic' || compact === 'ic' || compact === 'nokadpengenalan') {
    return 'no_ic'
  }

  if (compact === 'namamurid') return 'nama_murid'
  if (compact === 'subjek') return 'subjek'
  if (compact === 'jenispeperiksaan') return 'jenis_peperiksaan'
  if (compact === 'markah') return 'markah'

  return normalized
}

const normalizeExamKey = (value) =>
  String(value || '').trim().toUpperCase()

const isAllowedExamKey = (value) => {
  const key = normalizeExamKey(value)

  if (key === 'TOV' || key === 'ETR') return true
  if (/^AR\d+$/.test(key)) return true

  // OTR tak perlu import manual sebab sistem jana automatik
  return false
}

const parseCsvLine = (line) => {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result.map((item) => item.trim())
}

const parseCsvText = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return { headers: [], rows: [] }
  }

  const headers = parseCsvLine(lines[0]).map((h) => normalizeCsvHeader(h))

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line)
    const row = {}

    headers.forEach((header, i) => {
      row[header] = values[i] ?? ''
    })

    return {
      __rowNumber: index + 2,
      ...row,
    }
  })

  return { headers, rows }
}

const validateCsvData = (headers, rows) => {
  const errors = []

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  )

  if (missingHeaders.length > 0) {
    errors.push(
      `Header wajib tiada: ${missingHeaders.join(', ')}`
    )
  }

  rows.forEach((row) => {
    const nama = normalizeText(row.nama_murid)
    const ic = normalizeText(row.no_ic)
    const subjek = normalizeText(row.subjek)
    const examKey = normalizeExamKey(row.jenis_peperiksaan)
    const markahRaw = normalizeText(row.markah)

    if (!nama) {
      errors.push(`Baris ${row.__rowNumber}: nama_murid kosong`)
    }

    if (!ic) {
      errors.push(`Baris ${row.__rowNumber}: no_ic kosong`)
    }

    if (!subjek) {
      errors.push(`Baris ${row.__rowNumber}: subjek kosong`)
    }

    if (!examKey) {
      errors.push(`Baris ${row.__rowNumber}: jenis_peperiksaan kosong`)
    } else if (!isAllowedExamKey(examKey)) {
      errors.push(
        `Baris ${row.__rowNumber}: jenis_peperiksaan '${examKey}' tidak sah. Guna TOV, ETR, AR1, AR2, AR3 dan seterusnya.`
      )
    }

    if (markahRaw === '') {
      errors.push(`Baris ${row.__rowNumber}: markah kosong`)
    } else {
      const markah = Number(markahRaw)

      if (Number.isNaN(markah)) {
        errors.push(`Baris ${row.__rowNumber}: markah bukan nombor`)
      } else if (markah < 0 || markah > 100) {
        errors.push(`Baris ${row.__rowNumber}: markah mesti antara 0 hingga 100`)
      }
    }
  })

  return errors
}

const findGradeFromMark = (mark, gradeScales = []) => {
  const numericMark = Number(mark)
  if (Number.isNaN(numericMark)) return { grade_name: null, grade_point: null }

  const matched = gradeScales.find((grade) => {
    const min = Number(grade.min_mark ?? grade.min_score ?? 0)
    const max = Number(grade.max_mark ?? grade.max_score ?? 100)
    return numericMark >= min && numericMark <= max
  })

  if (!matched) {
    return { grade_name: null, grade_point: null }
  }

  return {
    grade_name: matched.grade_name ?? matched.grade ?? null,
    grade_point: matched.grade_point ?? matched.point_value ?? matched.grade_value ?? null,
  }
}

const generateOtrRows = ({
  schoolId,
  academicYear,
  studentEnrollmentId,
  studentProfileId,
  classId,
  subjectId,
  enteredBy,
  tingkatan,
  tovMark,
  etrMark,
  setupConfig,
}) => {
  const otrKeys = getOtrKeysForTingkatan(tingkatan, setupConfig)
  if (!otrKeys.length) return []

  const generatedMarks = generateOtrMarks({
    tingkatan,
    tovMark,
    etrMark,
    setupConfig,
    otrKeys,
  })

  return Object.entries(generatedMarks).map(([key, value]) => {

    return {
      school_id: schoolId,
      academic_year: academicYear,
      student_enrollment_id: studentEnrollmentId,
      class_id: classId,
      subject_id: subjectId,
      target_key: key,
      target_mark: value,
      grade_name: null,
      grade_point: null,
      generated_by_system: true,
      manually_adjusted: false,
      remarks: 'Dijana automatik oleh sistem',
      entered_by: enteredBy,
      student_profile_id: studentProfileId,
      updated_at: new Date().toISOString(),
    }
  })
}

export default function StudentScoresPage() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [gradeScales, setGradeScales] = useState([])

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedExam, setSelectedExam] = useState('')

  const [students, setStudents] = useState([])
  const [scores, setScores] = useState({})
  const [saving, setSaving] = useState(false)

  const [csvRows, setCsvRows] = useState([])
  const [csvErrors, setCsvErrors] = useState([])
  const [csvFileName, setCsvFileName] = useState('')
  const [importingCsv, setImportingCsv] = useState(false)
  const [importSummary, setImportSummary] = useState(null)

  const dashboardPath = getDashboardPath(profile)

  useEffect(() => {
    init()
  }, [])

  const getGradeLabelFromClassName = (className = '') => {
    const text = className.toLowerCase()

    if (text.includes('tingkatan 1')) return 'Tingkatan 1'
    if (text.includes('tingkatan 2')) return 'Tingkatan 2'
    if (text.includes('tingkatan 3')) return 'Tingkatan 3'
    if (text.includes('tingkatan 4')) return 'Tingkatan 4'
    if (text.includes('tingkatan 5')) return 'Tingkatan 5'

    return ''
  }

  const selectedClassName = useMemo(() => {
    const selectedClassData = classes.find((c) => c.id === selectedClass)
    if (!selectedClassData) return ''
    return `${selectedClassData.tingkatan || ''} ${selectedClassData.class_name || ''}`.trim()
  }, [classes, selectedClass])

  const selectedGradeLabel = useMemo(() => {
    return getGradeLabelFromClassName(selectedClassName)
  }, [selectedClassName])

  const uniqueExamOptions = useMemo(() => {
    const examsForSelectedGrade = setupConfig?.exam_structure?.[selectedGradeLabel] || []

    return examsForSelectedGrade.filter(
      (exam, index, arr) => index === arr.findIndex((item) => item.key === exam.key)
    )
  }, [setupConfig, selectedGradeLabel])

  const sortedStudents = useMemo(() => {
    const genderRank = (gender) => {
      if (gender === 'LELAKI') return 1
      if (gender === 'PEREMPUAN') return 2
      return 3
    }

    return [...students].sort((a, b) => {
      const genderA = (a.gender || '').toUpperCase()
      const genderB = (b.gender || '').toUpperCase()

      const genderCompare = genderRank(genderA) - genderRank(genderB)
      if (genderCompare !== 0) return genderCompare

      return (a.full_name || '').localeCompare(b.full_name || '', 'ms', {
        sensitivity: 'base',
      })
    })
  }, [students])

  const uniqueSubjects = useMemo(() => {
    const normalizedSelectedGrade = selectedGradeLabel.trim().toLowerCase()

    const filteredSubjects = normalizedSelectedGrade
      ? subjects.filter(
          (subject) =>
            (subject.tingkatan || '').trim().toLowerCase() === normalizedSelectedGrade
        )
      : subjects

    return filteredSubjects.filter(
      (subject, index, arr) =>
        index ===
        arr.findIndex(
          (item) =>
            (item.subject_name || '').trim().toLowerCase() ===
            (subject.subject_name || '').trim().toLowerCase()
        )
    )
  }, [subjects, selectedGradeLabel])

  useEffect(() => {
    if (!selectedSubject) return

    const subjectStillValid = uniqueSubjects.some(
      (subject) => String(subject.id) === String(selectedSubject)
    )

    if (!subjectStillValid) {
      setSelectedSubject('')
    }
  }, [uniqueSubjects, selectedSubject])

  const init = async () => {
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
      .single()

    if (profileError || !profileData) {
      navigate('/login', { replace: true })
      return
    }

    setProfile(profileData)

    const { data: setupData } = await supabase
      .from('school_setup_configs')
      .select('current_academic_year, exam_structure, otr_generation_mode, otr_percentages_default, otr_percentages_by_grade, auto_recalculate_otr_on_etr_change')
      .eq('school_id', profileData.school_id)
      .maybeSingle()

    setSetupConfig(setupData || null)

    await loadInitialData(profileData, setupData)
  }

  const loadInitialData = async (profileData, setupData) => {
    let classQuery = supabase
      .from('classes')
      .select('id, class_name, tingkatan')
      .eq('school_id', profileData.school_id)
      .eq('is_active', true)
      .order('tingkatan', { ascending: true })
      .order('class_name', { ascending: true })

    if (setupData?.current_academic_year) {
      classQuery = classQuery.eq('academic_year', setupData.current_academic_year)
    }

    const { data: classData } = await classQuery
    setClasses(classData || [])

    const [{ data: subjectData }, { data: gradeScaleData }] = await Promise.all([
      supabase
        .from('subjects')
        .select('id, subject_name, subject_code, tingkatan')
        .eq('school_id', profileData.school_id)
        .order('subject_name', { ascending: true }),
      supabase
        .from('grade_scales')
        .select('*')
        .eq('school_id', profileData.school_id),
    ])

    setSubjects(subjectData || [])
    setGradeScales(gradeScaleData || [])
  }

  const loadStudentsAndScores = async () => {
    if (!selectedClass || !selectedSubject || !selectedExam || !profile?.school_id) return

    let enrollmentQuery = supabase
      .from('student_enrollments')
      .select(`
        id,
        student_profile_id,
        class_id,
        academic_year,
        is_active,
        student_profiles (
          id,
          full_name,
          ic_number,
          gender
        )
      `)
      .eq('school_id', profile.school_id)
      .eq('class_id', selectedClass)
      .eq('is_active', true)
      .order('id', { ascending: true })

    if (setupConfig?.current_academic_year) {
      enrollmentQuery = enrollmentQuery.eq('academic_year', setupConfig.current_academic_year)
    }

    const { data: enrollmentData } = await enrollmentQuery

    const studentRows = (enrollmentData || []).map((row) => ({
      enrollment_id: row.id,
      student_id: row.student_profile_id,
      full_name: row.student_profiles?.full_name || '-',
      ic_number: row.student_profiles?.ic_number || '-',
      gender: row.student_profiles?.gender || '',
    }))

    setStudents(studentRows)

    let scoreQuery = supabase
      .from('student_scores')
      .select('*')
      .eq('class_id', selectedClass)
      .eq('subject_id', selectedSubject)
      .eq('exam_key', selectedExam)
      .eq('school_id', profile.school_id)

    if (setupConfig?.current_academic_year) {
      scoreQuery = scoreQuery.eq('academic_year', setupConfig.current_academic_year)
    }

    const { data: scoreData } = await scoreQuery

    const scoreMap = {}
    scoreData?.forEach((s) => {
      const scoreStudentId = s.student_profile_id || s.student_id
      if (scoreStudentId) scoreMap[scoreStudentId] = s
    })

    setScores(scoreMap)
  }

  useEffect(() => {
    loadStudentsAndScores()
  }, [selectedClass, selectedSubject, selectedExam, profile?.school_id])

  const handleScoreChange = (studentId, value) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        mark: value,
      },
    }))
  }

  const downloadTemplateCSV = () => {
    const sample = [
      'nama_murid,no_ic,subjek,jenis_peperiksaan,markah',
      'ALI BIN ABU,090123101234,Sains,TOV,45',
      'ALI BIN ABU,090123101234,Sains,ETR,70',
      'ALI BIN ABU,090123101234,Sains,AR1,58',
      'SITI AISYAH,100201101111,Bahasa Melayu,TOV,60',
      'SITI AISYAH,100201101111,Bahasa Melayu,ETR,80',
      'SITI AISYAH,100201101111,Bahasa Melayu,AR1,72',
    ].join('\n')

    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'template_import_markah_edutrack.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  }

  const handleCsvUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setCsvFileName(file.name)

    const text = await file.text()
    const { headers, rows } = parseCsvText(text)
    const errors = validateCsvData(headers, rows)

    setCsvRows(rows)
    setCsvErrors(errors)
  }

  const importCsvToSupabase = async () => {
    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return
    }

    if (!csvRows.length) {
      alert('Tiada data CSV untuk diimport.')
      return
    }

    if (csvErrors.length > 0) {
      alert('Sila betulkan ralat CSV dahulu sebelum import.')
      return
    }

    setImportingCsv(true)
    setImportSummary(null)

    try {
      const currentYear = setupConfig?.current_academic_year || new Date().getFullYear()
      const schoolId = profile.school_id

      // 1. Ambil semua data rujukan sekali
      const [
        { data: studentProfilesData, error: studentProfilesError },
        { data: studentEnrollmentsData, error: studentEnrollmentsError },
        { data: subjectsData, error: subjectsError },
        { data: classesData, error: classesError },
        { data: setupConfigData, error: setupConfigError },
        { data: gradeScalesData, error: gradeScalesError },
      ] = await Promise.all([
        supabase
          .from('student_profiles')
          .select('id, ic_number, full_name, gender')
          .eq('school_id', schoolId),

        supabase
          .from('student_enrollments')
          .select(`
            id,
            student_profile_id,
            class_id,
            academic_year,
            classes (
              id,
              tingkatan,
              class_name
            )
          `)
          .eq('school_id', schoolId)
          .eq('academic_year', currentYear),

        supabase
          .from('subjects')
          .select('*')
          .eq('school_id', schoolId),

        supabase
          .from('classes')
          .select('*')
          .eq('school_id', schoolId)
          .eq('academic_year', currentYear),

        supabase
          .from('school_setup_configs')
          .select('*')
          .eq('school_id', schoolId)
          .maybeSingle(),

        supabase
          .from('grade_scales')
          .select('*')
          .eq('school_id', schoolId),
      ])

      if (studentProfilesError) throw studentProfilesError
      if (studentEnrollmentsError) throw studentEnrollmentsError
      if (subjectsError) throw subjectsError
      if (classesError) throw classesError
      if (setupConfigError) throw setupConfigError
      if (gradeScalesError) throw gradeScalesError

      const studentByIc = new Map()
      ;(studentProfilesData || []).forEach((student) => {
        const normalizedStudentIc = normalizeIC(student.ic_number)
        if (normalizedStudentIc) {
          studentByIc.set(normalizedStudentIc, student)
        }
      })

      const enrollmentByStudentId = new Map()
      ;(studentEnrollmentsData || []).forEach((enrollment) => {
        enrollmentByStudentId.set(enrollment.student_profile_id, enrollment)
      })

      const subjectByName = new Map()
      ;(subjectsData || []).forEach((subject) => {
        subjectByName.set(
          String(subject.subject_name || '').trim().toLowerCase(),
          subject
        )
      })

      const targetRows = []
      const scoreRows = []
      const importErrors = []

      // untuk auto jana OTR selepas import
      const targetPairs = new Map()

      for (const row of csvRows) {
        const rowNumber = row.__rowNumber
        const ic = normalizeIC(row.no_ic)
        const subjectName = String(row.subjek || '').trim().toLowerCase()
        const examKey = String(row.jenis_peperiksaan || '').trim().toUpperCase()
        const mark = Number(row.markah)

        let student = studentByIc.get(ic)
        if (!student) {
          const { data: studentData, error: studentLookupError } = await supabase
            .from('student_profiles')
            .select('id, ic_number, full_name, gender')
            .eq('school_id', profile.school_id)
            .eq('ic_number', ic)
            .maybeSingle()

          if (studentLookupError) throw studentLookupError

          if (studentData) {
            student = studentData
            studentByIc.set(ic, studentData)
          }
        }

        if (!student) {
          importErrors.push(`Baris ${rowNumber}: No IC ${ic} tidak ditemui.`)
          continue
        }

        const enrollment = enrollmentByStudentId.get(student.id)
        if (!enrollment) {
          importErrors.push(`Baris ${rowNumber}: Enrolment murid ${ic} untuk tahun semasa tidak ditemui.`)
          continue
        }

        const subject = subjectByName.get(subjectName)
        if (!subject) {
          importErrors.push(`Baris ${rowNumber}: Subjek '${row.subjek}' tidak ditemui.`)
          continue
        }

        const classId = enrollment.class_id
        const tingkatan = enrollment.classes?.tingkatan || ''

        if (examKey === 'ETR') {
          targetRows.push({
            school_id: schoolId,
            academic_year: currentYear,
            student_enrollment_id: enrollment.id,
            class_id: classId,
            subject_id: subject.id,
            target_key: examKey,
            target_mark: mark,
            grade_name: null,
            grade_point: null,
            generated_by_system: false,
            manually_adjusted: false,
            remarks: null,
            entered_by: profile.id,
            student_profile_id: student.id,
            updated_at: new Date().toISOString(),
          })

          const pairKey = `${enrollment.id}__${subject.id}`
          const existing = targetPairs.get(pairKey) || {
            school_id: schoolId,
            academic_year: currentYear,
            student_enrollment_id: enrollment.id,
            student_profile_id: student.id,
            class_id: classId,
            subject_id: subject.id,
            tingkatan,
            tov_mark: null,
            etr_mark: null,
          }

          existing.etr_mark = mark
          targetPairs.set(pairKey, existing)
        } else if (examKey === 'TOV' || /^AR\d+$/.test(examKey)) {
          const gradeScalesForTingkatan = (gradeScalesData || []).filter((grade) => {
            const label =
              grade.tingkatan ??
              grade.grade_label ??
              grade.form_level ??
              grade.level ??
              ''

            return String(label).trim().toLowerCase() === String(tingkatan).trim().toLowerCase()
          })

          const gradeInfo = findGradeFromMark(mark, gradeScalesForTingkatan)

          scoreRows.push({
            school_id: schoolId,
            academic_year: currentYear,
            student_enrollment_id: enrollment.id,
            class_id: classId,
            subject_id: subject.id,
            exam_config_id: null,
            exam_key: examKey,
            mark,
            grade_name: gradeInfo.grade_name,
            grade_point: gradeInfo.grade_point,
            is_absent: false,
            remarks: null,
            entered_by: profile.id,
            verified_by: null,
            verified_at: null,
            student_profile_id: student.id,
            updated_at: new Date().toISOString(),
          })

          if (examKey === 'TOV') {
            const pairKey = `${enrollment.id}__${subject.id}`
            const existing = targetPairs.get(pairKey) || {
              school_id: schoolId,
              academic_year: currentYear,
              student_enrollment_id: enrollment.id,
              student_profile_id: student.id,
              class_id: classId,
              subject_id: subject.id,
              tingkatan,
              tov_mark: null,
              etr_mark: null,
            }

            existing.tov_mark = mark
            targetPairs.set(pairKey, existing)
          }
        } else {
          importErrors.push(`Baris ${rowNumber}: Jenis peperiksaan '${examKey}' tidak sah.`)
        }
      }

      if (importErrors.length > 0) {
        setImportSummary({
          success: false,
          importedTargets: 0,
          importedScores: 0,
          generatedOtrs: 0,
          errors: importErrors,
        })
        setImportingCsv(false)
        return
      }

      // 2. Simpan TOV & ETR
      if (targetRows.length > 0) {
        const { error: targetError } = await supabase
          .from('student_targets')
          .upsert(targetRows, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
          })

        if (targetError) throw targetError
      }

      // 3. Simpan AR actual score
      if (scoreRows.length > 0) {
        const { error: scoreError } = await supabase
          .from('student_scores')
          .upsert(scoreRows, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,exam_key',
          })

        if (scoreError) throw scoreError
      }

      // 4. Jana OTR automatik
      const otrRows = []

      for (const [, pair] of targetPairs.entries()) {
        if (
          pair.tov_mark !== null &&
          pair.etr_mark !== null &&
          shouldAutoRecalculateOtrs(setupConfigData)
        ) {
          const generated = generateOtrRows({
            schoolId: pair.school_id,
            academicYear: pair.academic_year,
            studentEnrollmentId: pair.student_enrollment_id,
            studentProfileId: pair.student_profile_id,
            classId: pair.class_id,
            subjectId: pair.subject_id,
            enteredBy: profile.id,
            tingkatan: pair.tingkatan,
            tovMark: pair.tov_mark,
            etrMark: pair.etr_mark,
            setupConfig: setupConfigData,
          })

          otrRows.push(...generated)
        }
      }

      if (otrRows.length > 0) {
        const { error: otrError } = await supabase
          .from('student_targets')
          .upsert(otrRows, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
          })

        if (otrError) throw otrError
      }

      setImportSummary({
        success: true,
        importedTargets: targetRows.length,
        importedScores: scoreRows.length,
        generatedOtrs: otrRows.length,
        errors: [],
      })

      alert('Import CSV berjaya disimpan.')
    } catch (error) {
      console.error(error)
      setImportSummary({
        success: false,
        importedTargets: 0,
        importedScores: 0,
        generatedOtrs: 0,
        errors: [error.message || 'Import gagal.'],
      })
    } finally {
      setImportingCsv(false)
    }
  }

  const handleSave = async () => {
    if (!profile?.school_id || !selectedClass || !selectedSubject || !selectedExam) return

    setSaving(true)

    const currentYear = setupConfig?.current_academic_year || new Date().getFullYear()
    const gradeScalesForTingkatan = (gradeScales || []).filter((grade) => {
      const label =
        grade.tingkatan ??
        grade.grade_label ??
        grade.form_level ??
        grade.level ??
        ''

      return String(label).trim().toLowerCase() === String(selectedGradeLabel).trim().toLowerCase()
    })

    const payload = students
      .filter((student) => {
        const rawMark = scores[student.student_id]?.mark
        return rawMark !== '' && rawMark !== null && rawMark !== undefined && !Number.isNaN(Number(rawMark))
      })
      .map((student) => {
        const mark = Number(scores[student.student_id]?.mark)
        const gradeInfo = findGradeFromMark(mark, gradeScalesForTingkatan)

        return {
          student_enrollment_id: student.enrollment_id,
          student_profile_id: student.student_id,
          class_id: selectedClass,
          subject_id: selectedSubject,
          exam_config_id: null,
          exam_key: selectedExam,
          mark,
          grade_name: gradeInfo.grade_name,
          grade_point: gradeInfo.grade_point,
          is_absent: false,
          remarks: null,
          entered_by: profile.id,
          verified_by: null,
          verified_at: null,
          school_id: profile.school_id,
          academic_year: currentYear,
          updated_at: new Date().toISOString(),
        }
      })

    if (payload.length === 0) {
      setSaving(false)
      alert('Sila masukkan sekurang-kurangnya satu markah sebelum simpan.')
      return
    }

    const { error } = await supabase
      .from('student_scores')
      .upsert(payload, {
        onConflict: 'student_enrollment_id,subject_id,academic_year,exam_key',
      })

    setSaving(false)

    if (error) {
      alert(error.message || 'Error simpan markah')
      console.error(error)
      return
    }

    alert('Markah berjaya disimpan')
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">EduTrack</p>
              <h1 className="text-2xl font-bold text-slate-900">Input Markah Murid</h1>
            </div>
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Kembali Dashboard
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Penapis Data Markah</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="">Pilih Kelas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{`${c.tingkatan || ''} ${c.class_name}`.trim()}</option>
              ))}
            </select>

            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="">Pilih Subjek</option>
              {uniqueSubjects.map((subject) => (
                <option key={subject.id || subject.subject_name} value={subject.id}>
                  {subject.subject_name}
                </option>
              ))}
            </select>

            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="">Pilih Peperiksaan</option>
              {uniqueExamOptions.map((exam) => (
                <option key={exam.key} value={exam.key}>
                  {exam.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Import Markah CSV</h2>
              <p className="mt-1 text-sm text-slate-500">
                Gunakan key sistem untuk jenis peperiksaan: TOV, ETR, AR1, AR2, AR3 dan seterusnya.
                OTR tidak perlu diisi kerana sistem akan jana automatik.
              </p>
            </div>

            <button
              type="button"
              onClick={downloadTemplateCSV}
              className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100"
            >
              Download Template CSV
            </button>
          </div>

          <div className="mt-5">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Upload Fail CSV
            </label>

            <input
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="block w-full rounded-xl border border-slate-300 px-3 py-2"
            />

            {csvFileName && (
              <p className="mt-2 text-sm text-slate-500">
                Fail dipilih: <strong>{csvFileName}</strong>
              </p>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Jumlah Row CSV</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{csvRows.length}</div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Row Valid</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600">
                {csvErrors.length === 0 ? csvRows.length : 0}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Jumlah Error</div>
              <div className="mt-1 text-2xl font-bold text-red-600">{csvErrors.length}</div>
            </div>
          </div>

          {csvErrors.length > 0 && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-semibold text-red-700">Ralat CSV</h3>
              <ul className="mt-2 list-disc pl-5 text-sm text-red-700 space-y-1">
                {csvErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {csvRows.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Preview CSV</h3>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Bil
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Nama Murid
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        No IC
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Subjek
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Jenis Peperiksaan
                      </th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Markah
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {csvRows.slice(0, 15).map((row, index) => (
                      <tr key={index} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-sm">{index + 1}</td>
                        <td className="px-4 py-3 text-sm">{row.nama_murid}</td>
                        <td className="px-4 py-3 text-sm">{row.no_ic}</td>
                        <td className="px-4 py-3 text-sm">{row.subjek}</td>
                        <td className="px-4 py-3 text-sm">{row.jenis_peperiksaan}</td>
                        <td className="px-4 py-3 text-sm">{row.markah}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {csvRows.length > 15 && (
                <p className="mt-2 text-sm text-slate-500">
                  Preview memaparkan 15 row pertama sahaja.
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={importCsvToSupabase}
              disabled={importingCsv || csvRows.length === 0 || csvErrors.length > 0}
              className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {importingCsv ? 'Mengimport...' : 'Import Sekarang'}
            </button>
          </div>

          {importSummary && (
            <div
              className={`mt-4 rounded-xl p-4 text-sm ${
                importSummary.success
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {importSummary.success ? (
                <div className="space-y-1">
                  <div><strong>Import berjaya.</strong></div>
                  <div>Target disimpan: {importSummary.importedTargets}</div>
                  <div>Score disimpan: {importSummary.importedScores}</div>
                  <div>OTR dijana automatik: {importSummary.generatedOtrs}</div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div><strong>Import gagal / ada ralat.</strong></div>
                  {importSummary.errors.map((err, i) => (
                    <div key={i}>- {err}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Senarai Murid & Markah</h2>
            <span className="text-sm text-slate-500">Jumlah murid: {students.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-700">
                  <th className="px-3 py-3 font-semibold">Bil</th>
                  <th className="px-3 py-3 font-semibold">Nama</th>
                  <th className="px-3 py-3 font-semibold">No IC</th>
                  <th className="px-3 py-3 font-semibold">Markah</th>
                </tr>
              </thead>

              <tbody>
                {sortedStudents.map((student, index) => (
                  <tr key={student.student_id} className="border-b">
                    <td className="px-3 py-3 text-slate-700">{index + 1}</td>
                    <td className="px-3 py-3 text-slate-900">{student.full_name}</td>
                    <td className="px-3 py-3 text-slate-700">{student.ic_number}</td>

                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={scores[student.student_id]?.mark ?? ''}
                        onChange={(e) => handleScoreChange(student.student_id, e.target.value)}
                        className="w-28 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !selectedClass || !selectedSubject || !selectedExam}
            className="mt-5 rounded-xl bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Markah'}
          </button>
        </div>
      </div>
    </div>
  )
}
