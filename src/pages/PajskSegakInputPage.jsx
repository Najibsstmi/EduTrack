import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BarChart3, Download, Save, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import SegakTabs from '../components/SegakTabs.jsx'
import { supabase } from '../lib/supabaseClient'
import {
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import {
  calculateSegakSummary,
  getBmiCategory,
  getSegakFitnessLevel,
  getSegakFitnessStatement,
  getSegakGrade,
  getSegakStars,
  normalizeSegakScore,
  SEGAK_TERMS,
} from '../lib/pajskSegak.js'
import { downloadCsv, parseCsvText } from '../lib/pbdBulkImport.js'
import { buildSegakYearOptions, usePajskSegakData } from '../lib/usePajskSegakData.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const SEGAK_CSV_HEADERS = [
  'no_kad_pengenalan',
  'nama',
  'tingkatan',
  'kelas',
  'penggal',
  'bmi',
  'skor_segak',
  'tarikh',
]

const todayIsoDate = () => new Date().toISOString().slice(0, 10)

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const normalizeCsvHeader = (value) =>
  String(value || '').replace(/^\uFEFF/, '').trim().toLocaleLowerCase('ms-MY')

const normalizeMatchValue = (value) =>
  String(value || '').trim().toLocaleUpperCase('ms-MY').replace(/\s+/g, ' ')

const getGradeNumber = (value) => {
  const normalized = normalizeMatchValue(value)
  const match =
    normalized.match(/^(?:TINGKATAN|TAHUN|FORM|TING|F|T)?\s*(\d+)$/) ||
    normalized.match(/\b(?:TINGKATAN|TAHUN|FORM|TING|F|T)\s*(\d+)\b/)

  return match?.[1] || ''
}

const normalizeGradeMatchKey = (value) => {
  const gradeNumber = getGradeNumber(value)
  return gradeNumber ? `GRADE_${Number(gradeNumber)}` : normalizeMatchValue(value)
}

const normalizeClassMatchKey = (value, tingkatan = '') => {
  let normalized = normalizeMatchValue(value)
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const gradeNumber = getGradeNumber(tingkatan)
  const aliases = [
    normalizeMatchValue(tingkatan),
    gradeNumber,
    gradeNumber ? `TINGKATAN ${gradeNumber}` : '',
    gradeNumber ? `TAHUN ${gradeNumber}` : '',
    gradeNumber ? `FORM ${gradeNumber}` : '',
    gradeNumber ? `TING ${gradeNumber}` : '',
    gradeNumber ? `F${gradeNumber}` : '',
    gradeNumber ? `T${gradeNumber}` : '',
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)

  aliases.forEach((alias) => {
    if (normalized === alias) {
      normalized = ''
    } else if (normalized.startsWith(`${alias} `)) {
      normalized = normalized.slice(alias.length).trim()
    }
  })

  return normalized
}

const buildClassMatchKey = (tingkatan, className) =>
  `${normalizeGradeMatchKey(tingkatan)}__${normalizeClassMatchKey(className, tingkatan)}`

const normalizeIcNumber = (value) => {
  const normalized = String(value || '').trim().replace(/^'/, '')
  const digits = normalized.replace(/[\s-]/g, '')

  if (/^\d+$/.test(digits)) return digits.padStart(12, '0')

  if (/^\+?\d+(?:\.\d+)?e[+-]?\d+$/i.test(normalized)) {
    const number = Number(normalized)

    if (Number.isSafeInteger(number) && number >= 0) {
      return number.toFixed(0).padStart(12, '0')
    }
  }

  return normalized.toLocaleUpperCase('ms-MY')
}

const isValidIsoDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const normalizeAssessmentDate = (value) => {
  const normalized = String(value || '').trim()
  if (!normalized) return todayIsoDate()
  if (isValidIsoDate(normalized)) return normalized

  const match = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca fail CSV.'))
    reader.readAsText(file)
  })

const splitIntoChunks = (items, size = 500) => {
  const chunks = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

const formatNumber = (value, digits = 2) =>
  value === null || value === undefined || value === '' ? '-' : Number(value).toFixed(digits)

const formatStars = (stars) => {
  if (stars === null || stars === undefined || stars === '') return '-'
  return Number(stars) === 0 ? 'Tiada' : `${stars} Bintang`
}

const termLabel = (term) => (term === 'PENGGAL_2' ? 'Penggal 2' : 'Penggal 1')

export default function PajskSegakInputPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()
  const {
    loading,
    errorMessage,
    setErrorMessage,
    profile,
    setupConfig,
    academicYear,
    setAcademicYear,
    levelMappings,
    classes,
    enrollments,
    segakRows,
    reload,
  } = usePajskSegakData({ checkingAuth })

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('PENGGAL_1')
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState(false)
  const [importingCsv, setImportingCsv] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [failedImportRows, setFailedImportRows] = useState([])
  const importFileInputRef = useRef(null)

  const isSchoolAdmin =
    profile?.is_school_admin === true ||
    profile?.role === 'admin' ||
    profile?.role === 'school_admin'

  const availableTingkatan = useMemo(() => {
    const fromClasses = classes.map((item) => item.tingkatan).filter(Boolean)
    const fallback = setupConfig?.active_grade_labels || []
    return sortLevelsByDisplayOrder(fromClasses.length ? fromClasses : fallback, levelMappings)
  }, [classes, levelMappings, setupConfig])

  const availableClasses = useMemo(() => {
    if (!selectedTingkatan) return []

    return classes
      .filter((item) => item.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
          getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
          'ms',
          { sensitivity: 'base', numeric: true }
        )
      )
  }, [classes, levelMappings, selectedTingkatan])

  const selectedClass = useMemo(
    () => classes.find((item) => String(item.id) === String(selectedClassId)) || null,
    [classes, selectedClassId]
  )

  const studentRows = useMemo(() => {
    if (!selectedClassId) return []

    return enrollments
      .filter((enrollment) => String(enrollment.class_id) === String(selectedClassId))
      .map((enrollment) => ({
        enrollment_id: enrollment.id,
        student_profile_id: enrollment.student_profile_id,
        full_name: enrollment.student_profiles?.full_name || '-',
        ic_number: enrollment.student_profiles?.ic_number || '-',
        gender: enrollment.student_profiles?.gender || '',
      }))
      .sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [enrollments, selectedClassId])

  useEffect(() => {
    if (!selectedClassId) {
      setDrafts({})
      return
    }

    const enrollmentIdSet = new Set(studentRows.map((student) => String(student.enrollment_id)))
    const nextDrafts = {}

    segakRows
      .filter((row) => row.term === selectedTerm)
      .filter((row) => enrollmentIdSet.has(String(row.student_enrollment_id)))
      .forEach((row) => {
        nextDrafts[row.student_enrollment_id] = {
          id: row.id,
          bmi: row.bmi ?? '',
          segak_total_score: row.segak_total_score ?? '',
          is_absent: row.is_absent === true,
          assessment_date: row.assessment_date || '',
          note: row.note || '',
          created_by: row.created_by || '',
          updated_by: row.updated_by || '',
        }
      })

    setDrafts(nextDrafts)
  }, [segakRows, selectedClassId, selectedTerm, studentRows])

  const updateDraft = (enrollmentId, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || {}),
        [field]: value,
      },
    }))
  }

  const toggleAbsent = (enrollmentId, checked) => {
    setDrafts((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || {}),
        is_absent: checked,
        segak_total_score: checked ? '' : prev[enrollmentId]?.segak_total_score ?? '',
      },
    }))
  }

  const summaryRows = useMemo(
    () =>
      studentRows.map((student) => {
        const draft = drafts[student.enrollment_id] || {}
        const bmi = toNumberOrNull(draft.bmi)
        const isAbsent = draft.is_absent === true
        const score = isAbsent ? 0 : normalizeSegakScore(draft.segak_total_score)

        return {
          student_enrollment_id: student.enrollment_id,
          bmi,
          bmi_category: getBmiCategory(bmi),
          segak_total_score: score,
          segak_grade: getSegakGrade(score, isAbsent),
          segak_stars: getSegakStars(score, isAbsent),
          is_absent: isAbsent,
        }
      }),
    [drafts, studentRows]
  )

  const currentSummary = useMemo(() => calculateSegakSummary(summaryRows), [summaryRows])
  const editableFailedImportRows = useMemo(
    () => failedImportRows.filter((row) => row.canEdit),
    [failedImportRows]
  )

  const updateFailedImportRow = (rowId, field, value) => {
    setFailedImportRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    )
  }

  const downloadSegakCsvTemplate = () => {
    if (!isSchoolAdmin) return

    downloadCsv(`template-segak-${academicYear || todayIsoDate()}.csv`, [SEGAK_CSV_HEADERS])
  }

  const importSegakCsv = async (file) => {
    if (!isSchoolAdmin) {
      alert('Import CSV SEGAK hanya dibenarkan untuk admin sekolah.')
      return
    }

    if (!profile?.school_id || !academicYear) {
      alert('Maklumat sekolah atau tahun akademik tidak lengkap.')
      return
    }

    setImportingCsv(true)
    setImportSummary(null)
    setFailedImportRows([])
    setErrorMessage('')
    let totalDataRows = 0

    try {
      const csvText = await readFileAsText(file)
      const csvRows = parseCsvText(csvText)

      if (csvRows.length < 2) {
        throw new Error('CSV tidak mempunyai data murid untuk diimport.')
      }

      totalDataRows = csvRows.length - 1
      const normalizedHeaders = csvRows[0].map((header) => normalizeCsvHeader(header))
      const headerIndexes = SEGAK_CSV_HEADERS.reduce((acc, header) => {
        acc[header] = normalizedHeaders.findIndex((value) => value === header)
        return acc
      }, {})
      const missingHeaders = SEGAK_CSV_HEADERS.filter((header) => headerIndexes[header] < 0)

      if (missingHeaders.length > 0) {
        throw new Error(`Header wajib tiada: ${missingHeaders.join(', ')}.`)
      }

      const duplicateHeaders = SEGAK_CSV_HEADERS.filter(
        (header) => normalizedHeaders.indexOf(header) !== normalizedHeaders.lastIndexOf(header)
      )

      if (duplicateHeaders.length > 0) {
        throw new Error(`Header berulang: ${duplicateHeaders.join(', ')}.`)
      }

      const classLookup = new Map()

      classes.forEach((classRow) => {
        const key = buildClassMatchKey(classRow.tingkatan, classRow.class_name)
        const current = classLookup.get(key) || []
        current.push(classRow)
        classLookup.set(key, current)
      })

      const errors = []
      const parsedRows = []

      csvRows.slice(1).forEach((row, rowIndex) => {
        const rowNumber = rowIndex + 2
        const valueFor = (header) => String(row[headerIndexes[header]] ?? '').trim()
        const icNumber = normalizeIcNumber(valueFor('no_kad_pengenalan'))
        const studentName = valueFor('nama')
        const tingkatan = valueFor('tingkatan')
        const className = valueFor('kelas')
        const termValue = valueFor('penggal')
        const bmiValue = valueFor('bmi')
        const scoreValue = valueFor('skor_segak')
        const dateValue = valueFor('tarikh')
        const rowErrors = []

        if (!icNumber) rowErrors.push('no_kad_pengenalan wajib diisi.')
        if (icNumber && !/^\d{12}$/.test(icNumber)) {
          rowErrors.push(
            'no_kad_pengenalan mesti nombor 12 digit. Gunakan format Excel Custom 000000000000.'
          )
        }
        if (!tingkatan) rowErrors.push('tingkatan wajib diisi.')
        if (!className) rowErrors.push('kelas wajib diisi.')
        if (!['1', '2'].includes(termValue)) rowErrors.push('penggal mesti 1 atau 2.')

        const classMatches =
          tingkatan && className
            ? classLookup.get(buildClassMatchKey(tingkatan, className)) || []
            : []

        if (tingkatan && className && classMatches.length === 0) {
          rowErrors.push('tingkatan dan kelas tidak padan dengan kelas aktif sekolah.')
        } else if (classMatches.length > 1) {
          rowErrors.push('tingkatan dan kelas sepadan dengan lebih daripada satu kelas.')
        }

        const bmi = toNumberOrNull(bmiValue)
        const isBmiValid = !bmiValue || bmi !== null
        if (!isBmiValid) rowErrors.push('bmi mesti nombor.')

        const rawScore = toNumberOrNull(scoreValue)
        const isScoreValid =
          !scoreValue ||
          (rawScore !== null && Number.isInteger(rawScore) && rawScore >= 0 && rawScore <= 20)
        if (!isScoreValid) {
          rowErrors.push('skor_segak mesti integer 0 hingga 20.')
        }

        const assessmentDate = normalizeAssessmentDate(dateValue)
        if (!assessmentDate) rowErrors.push('tarikh mesti dalam format YYYY-MM-DD atau D/M/YYYY.')

        parsedRows.push({
          id: `import-row-${rowNumber}`,
          rowNumber,
          icNumber,
          studentName,
          tingkatan,
          className,
          classRow: classMatches.length === 1 ? classMatches[0] : null,
          term: ['1', '2'].includes(termValue)
            ? termValue === '2'
              ? 'PENGGAL_2'
              : 'PENGGAL_1'
            : '',
          bmi: isBmiValid && bmiValue ? bmi : '',
          score: isScoreValid && scoreValue ? normalizeSegakScore(rawScore) : '',
          assessmentDate: assessmentDate || '',
          validationErrors: rowErrors,
        })
      })

      const studentProfiles = []
      const uniqueIcNumbers = [
        ...new Set(
          parsedRows
            .map((row) => row.icNumber)
            .filter((icNumber) => /^\d{12}$/.test(icNumber))
        ),
      ]

      for (const icChunk of splitIntoChunks(uniqueIcNumbers)) {
        const { data, error } = await supabase
          .from('student_profiles')
          .select('id, school_id, ic_number, full_name')
          .eq('school_id', profile.school_id)
          .in('ic_number', icChunk)

        if (error) throw error
        studentProfiles.push(...(data || []))
      }

      const profilesByIc = new Map()

      studentProfiles.forEach((studentProfile) => {
        if (String(studentProfile.school_id) !== String(profile.school_id)) return

        const key = normalizeIcNumber(studentProfile.ic_number)
        const current = profilesByIc.get(key) || []
        current.push(studentProfile)
        profilesByIc.set(key, current)
      })

      const activeEnrollments = []
      const studentProfileIds = [...new Set(studentProfiles.map((studentProfile) => studentProfile.id))]

      for (const profileIdChunk of splitIntoChunks(studentProfileIds)) {
        const { data, error } = await supabase
          .from('student_enrollments')
          .select('id, school_id, student_profile_id, class_id, academic_year, is_active')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .eq('is_active', true)
          .in('student_profile_id', profileIdChunk)

        if (error) throw error
        activeEnrollments.push(...(data || []))
      }

      const enrollmentsByStudentAndClass = new Map()

      activeEnrollments.forEach((enrollment) => {
        if (
          String(enrollment.school_id) !== String(profile.school_id) ||
          Number(enrollment.academic_year) !== Number(academicYear) ||
          enrollment.is_active !== true
        ) {
          return
        }

        const key = `${enrollment.student_profile_id}__${enrollment.class_id}`
        const current = enrollmentsByStudentAndClass.get(key) || []
        current.push(enrollment)
        enrollmentsByStudentAndClass.set(key, current)
      })

      const existingSegakByKey = new Map(
        segakRows
          .filter(
            (row) =>
              String(row.school_id) === String(profile.school_id) &&
              Number(row.academic_year) === Number(academicYear)
          )
          .map((row) => [`${row.student_enrollment_id}__${row.term}`, row])
      )
      const upsertMap = new Map()
      const failedRows = []

      const addFailedRow = (
        row,
        reasons,
        { studentProfile = null, enrollment = null, existingRow = null, canEdit = null } = {}
      ) => {
        const studentLabel = row.studentName || studentProfile?.full_name || row.icNumber || '-'
        const failure = {
          id: row.id,
          rowNumber: row.rowNumber,
          studentName: studentLabel,
          icNumber: row.icNumber,
          tingkatan: row.tingkatan,
          className: row.className,
          term: row.term,
          enrollmentId: enrollment?.id || '',
          bmi: row.bmi,
          segakTotalScore: row.score,
          assessmentDate: row.assessmentDate,
          note: existingRow?.note || null,
          createdBy: existingRow?.created_by || profile.id,
          reasons,
          canEdit:
            canEdit ??
            Boolean(enrollment?.id && row.classRow?.id && row.term && profile?.school_id),
        }

        failedRows.push(failure)
        errors.push(`Baris ${row.rowNumber}: ${reasons.join(' ')}`)
        return failure
      }

      parsedRows.forEach((row) => {
        const rowErrors = [...row.validationErrors]
        let studentProfile = null
        let enrollment = null

        if (/^\d{12}$/.test(row.icNumber)) {
          const profileMatches = profilesByIc.get(row.icNumber) || []

          if (profileMatches.length === 0) {
            rowErrors.push(
              `Murid ${row.studentName || row.icNumber} tidak ditemui dalam sekolah ini berdasarkan no_kad_pengenalan.`
            )
          } else if (profileMatches.length > 1) {
            rowErrors.push(
              `Lebih daripada satu profil murid ditemui untuk no_kad_pengenalan ${row.icNumber}.`
            )
          } else {
            studentProfile = profileMatches[0]
          }
        }

        const studentLabel = row.studentName || studentProfile?.full_name || row.icNumber || '-'

        if (studentProfile && row.classRow) {
          const enrollmentKey = `${studentProfile.id}__${row.classRow.id}`
          const enrollmentMatches = enrollmentsByStudentAndClass.get(enrollmentKey) || []

          if (enrollmentMatches.length === 0) {
            rowErrors.push(
              `Enrollment aktif ${studentLabel} tidak ditemui untuk kelas dan tahun akademik ini.`
            )
          } else if (enrollmentMatches.length > 1) {
            rowErrors.push(`Lebih daripada satu enrollment aktif ditemui untuk ${studentLabel}.`)
          } else {
            enrollment = enrollmentMatches[0]
          }
        }

        const conflictKey = enrollment && row.term ? `${enrollment.id}__${row.term}` : ''
        const existingRow = conflictKey ? existingSegakByKey.get(conflictKey) : null

        if (rowErrors.length > 0) {
          addFailedRow(row, rowErrors, { studentProfile, enrollment, existingRow })
          return
        }

        if (upsertMap.has(conflictKey)) {
          addFailedRow(row, [`Rekod pendua untuk ${studentLabel} dan ${termLabel(row.term)}.`], {
            studentProfile,
            enrollment,
            existingRow,
            canEdit: false,
          })
          return
        }

        const bmi = row.bmi === '' ? null : row.bmi
        const score = row.score === '' ? null : row.score
        const grade = getSegakGrade(score, false)
        const fitnessLevel = getSegakFitnessLevel(score, false)

        upsertMap.set(conflictKey, {
          sourceRow: row,
          studentProfile,
          enrollment,
          existingRow,
          payload: {
            school_id: profile.school_id,
            student_enrollment_id: enrollment.id,
            academic_year: Number(academicYear),
            term: row.term,
            bmi,
            bmi_category: getBmiCategory(bmi) || null,
            segak_total_score: score,
            segak_grade: grade || null,
            segak_stars: getSegakStars(score, false),
            fitness_level: fitnessLevel || null,
            fitness_statement: getSegakFitnessStatement(score, false) || null,
            is_absent: false,
            assessment_date: row.assessmentDate,
            note: existingRow?.note || null,
            created_by: existingRow?.created_by || profile.id,
            updated_by: profile.id,
          },
        })
      })

      let successCount = 0
      const upsertItems = Array.from(upsertMap.values())

      for (const itemChunk of splitIntoChunks(upsertItems)) {
        const payloads = itemChunk.map((item) => item.payload)
        const hasInvalidSchool = payloads.some(
          (payload) => String(payload.school_id) !== String(profile.school_id)
        )

        if (hasInvalidSchool) {
          throw new Error('Import dihentikan kerana terdapat rekod daripada sekolah lain.')
        }

        const { error } = await supabase.from('student_pajsk_segak').upsert(payloads, {
          onConflict: 'school_id,student_enrollment_id,academic_year,term',
        })

        if (error) {
          itemChunk.forEach((item) => {
            addFailedRow(item.sourceRow, [`Gagal disimpan. ${error.message}`], {
              studentProfile: item.studentProfile,
              enrollment: item.enrollment,
              existingRow: item.existingRow,
              canEdit: true,
            })
          })
        } else {
          successCount += itemChunk.length
        }
      }

      if (successCount > 0) {
        await reload()
      }

      const summary = {
        successCount,
        errorCount: failedRows.length,
        messages: errors.slice(0, 50),
      }

      setFailedImportRows(failedRows)
      setImportSummary(summary)
      alert(`Import selesai: ${successCount} berjaya, ${failedRows.length} gagal.`)
    } catch (error) {
      console.error(error)
      const failedCount = Math.max(totalDataRows, 1)
      setFailedImportRows([])
      setImportSummary({
        successCount: 0,
        errorCount: failedCount,
        messages: [error.message || 'Gagal import CSV SEGAK.'],
      })
      alert(`Import selesai: 0 berjaya, ${failedCount} gagal.`)
    } finally {
      setImportingCsv(false)
    }
  }

  const handleImportFileChange = async (event) => {
    const file = event.target.files?.[0] || null
    event.target.value = ''

    if (file) {
      await importSegakCsv(file)
    }
  }

  const saveSegak = async () => {
    if (!profile?.school_id || !academicYear) {
      alert('Maklumat sekolah atau tahun akademik tidak lengkap.')
      return
    }

    const hasManualClassRows = Boolean(selectedClassId && selectedTerm && studentRows.length)
    const hasImportCorrections = editableFailedImportRows.length > 0

    if (!hasManualClassRows && !hasImportCorrections) {
      alert('Pilih kelas untuk input manual atau betulkan row import yang boleh disimpan.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      const rowsToUpsertMap = new Map()
      const deleteIds = []

      if (hasManualClassRows) {
        studentRows.forEach((student) => {
          const draft = drafts[student.enrollment_id]
          if (!draft) return

          const hasBmi = String(draft.bmi ?? '').trim() !== ''
          const hasScore = String(draft.segak_total_score ?? '').trim() !== ''
          const isAbsent = draft.is_absent === true
          const hasAnyInput = hasBmi || hasScore || isAbsent

          if (!hasAnyInput) {
            if (draft.id) deleteIds.push(draft.id)
            return
          }

          const bmi = toNumberOrNull(draft.bmi)
          const score = isAbsent ? 0 : normalizeSegakScore(draft.segak_total_score)
          const grade = getSegakGrade(score, isAbsent)
          const stars = getSegakStars(score, isAbsent)
          const fitnessLevel = getSegakFitnessLevel(score, isAbsent)
          const conflictKey = `${student.enrollment_id}__${selectedTerm}`

          rowsToUpsertMap.set(conflictKey, {
            school_id: profile.school_id,
            student_enrollment_id: student.enrollment_id,
            academic_year: Number(academicYear),
            term: selectedTerm,
            height_cm: null,
            weight_kg: null,
            bmi,
            bmi_category: getBmiCategory(bmi) || null,
            segak_total_score: score,
            segak_grade: grade || null,
            segak_stars: stars,
            fitness_level: fitnessLevel || null,
            fitness_statement: getSegakFitnessStatement(score, isAbsent) || null,
            is_absent: isAbsent,
            assessment_date: draft.assessment_date || todayIsoDate(),
            note: String(draft.note || '').trim() || null,
            created_by: draft.created_by || profile.id,
            updated_by: profile.id,
          })
        })
      }

      const correctionErrors = []

      editableFailedImportRows.forEach((row) => {
        const bmiValue = String(row.bmi ?? '').trim()
        const scoreValue = String(row.segakTotalScore ?? '').trim()
        const bmi = toNumberOrNull(bmiValue)
        const rawScore = toNumberOrNull(scoreValue)
        const assessmentDate = normalizeAssessmentDate(row.assessmentDate)
        const rowErrors = []

        if (bmiValue && bmi === null) rowErrors.push('BMI mesti nombor.')
        if (
          scoreValue &&
          (rawScore === null || !Number.isInteger(rawScore) || rawScore < 0 || rawScore > 20)
        ) {
          rowErrors.push('Skor SEGAK mesti integer 0 hingga 20.')
        }
        if (!assessmentDate) rowErrors.push('Tarikh mesti dalam format YYYY-MM-DD atau D/M/YYYY.')

        if (rowErrors.length > 0) {
          correctionErrors.push(`Baris ${row.rowNumber}: ${rowErrors.join(' ')}`)
          return
        }

        const score = scoreValue ? normalizeSegakScore(rawScore) : null
        const grade = getSegakGrade(score, false)
        const fitnessLevel = getSegakFitnessLevel(score, false)
        const conflictKey = `${row.enrollmentId}__${row.term}`

        rowsToUpsertMap.set(conflictKey, {
          school_id: profile.school_id,
          student_enrollment_id: row.enrollmentId,
          academic_year: Number(academicYear),
          term: row.term,
          height_cm: null,
          weight_kg: null,
          bmi,
          bmi_category: getBmiCategory(bmi) || null,
          segak_total_score: score,
          segak_grade: grade || null,
          segak_stars: getSegakStars(score, false),
          fitness_level: fitnessLevel || null,
          fitness_statement: getSegakFitnessStatement(score, false) || null,
          is_absent: false,
          assessment_date: assessmentDate,
          note: row.note,
          created_by: row.createdBy || profile.id,
          updated_by: profile.id,
        })
      })

      if (correctionErrors.length > 0) {
        alert(correctionErrors.slice(0, 5).join('\n'))
        return
      }

      const rowsToUpsert = Array.from(rowsToUpsertMap.values())

      if (rowsToUpsert.length === 0 && deleteIds.length === 0) {
        alert('Tiada perubahan SEGAK untuk disimpan.')
        return
      }

      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('student_pajsk_segak')
          .delete()
          .eq('school_id', profile.school_id)
          .in('id', deleteIds)

        if (deleteError) throw deleteError
      }

      if (rowsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('student_pajsk_segak')
          .upsert(rowsToUpsert, {
            onConflict: 'school_id,student_enrollment_id,academic_year,term',
          })

        if (upsertError) throw upsertError
      }

      await reload()

      if (hasImportCorrections) {
        const savedCorrectionIds = new Set(editableFailedImportRows.map((row) => row.id))
        const savedRowNumbers = new Set(editableFailedImportRows.map((row) => row.rowNumber))

        setFailedImportRows((prev) => prev.filter((row) => !savedCorrectionIds.has(row.id)))
        setImportSummary((prev) =>
          prev
            ? {
                ...prev,
                successCount: prev.successCount + savedCorrectionIds.size,
                errorCount: Math.max(0, prev.errorCount - savedCorrectionIds.size),
                messages: prev.messages.filter(
                  (message) =>
                    ![...savedRowNumbers].some((rowNumber) =>
                      message.startsWith(`Baris ${rowNumber}:`)
                    )
                ),
              }
            : prev
        )
      }

      alert(
        hasImportCorrections
          ? 'Pembetulan import SEGAK berjaya disimpan.'
          : 'Rekod SEGAK dan BMI berjaya disimpan.'
      )
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error.message?.includes('student_pajsk_segak')
          ? 'Simpan gagal kerana jadual student_pajsk_segak belum wujud atau constraint/RLS belum dikemaskini. Jalankan SQL migration PBS terkini dahulu.'
          : error.message || 'Gagal menyimpan rekod SEGAK.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Input SEGAK...</div>
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto min-w-0 max-w-7xl space-y-4">
        <AppHeader
          title="Input SEGAK / BMI"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate('/pbs/pajsk/segak')}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>SEGAK</span>
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/pbs/pajsk/segak/analysis')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              <span>Analisis</span>
            </button>
          }
        />

        <SegakTabs active="input" />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Penapis Input SEGAK</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {buildSegakYearOptions(academicYear).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={selectedTingkatan}
              onChange={(event) => {
                setSelectedTingkatan(event.target.value)
                setSelectedClassId('')
                setDrafts({})
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
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
              onChange={(event) => setSelectedClassId(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
              disabled={!selectedTingkatan}
            >
              <option value="">{selectedTingkatan ? 'Pilih Kelas' : 'Pilih Tingkatan dahulu'}</option>
              {availableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {getDisplayClassLabel(item.tingkatan, item.class_name, levelMappings)}
                </option>
              ))}
            </select>

            <select
              value={selectedTerm}
              onChange={(event) => setSelectedTerm(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {SEGAK_TERMS.map((term) => (
                <option key={term} value={term}>
                  {termLabel(term)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard title="Jumlah Murid" value={studentRows.length} />
          <SummaryCard title="Purata BMI" value={formatNumber(currentSummary.averageBmi)} />
          <SummaryCard title="Purata Skor SEGAK" value={formatNumber(currentSummary.averageSegakScore)} />
          <SummaryCard title="Tidak Lengkap" value={currentSummary.incompleteCount} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Senarai Murid {selectedClass ? getDisplayClassLabel(selectedClass.tingkatan, selectedClass.class_name, levelMappings) : ''}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedClass ? `${termLabel(selectedTerm)} - ${academicYear}` : 'Pilih tingkatan dan kelas untuk mula input SEGAK.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {isSchoolAdmin ? (
                <>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleImportFileChange}
                    className="hidden"
                    aria-label="Pilih fail CSV SEGAK"
                  />
                  <button
                    type="button"
                    onClick={downloadSegakCsvTemplate}
                    disabled={importingCsv}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span>Muat Turun Template CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => importFileInputRef.current?.click()}
                    disabled={importingCsv || !profile?.school_id || !academicYear}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-900 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    <span>{importingCsv ? 'Mengimport...' : 'Import CSV SEGAK'}</span>
                  </button>
                </>
              ) : null}

              <button
                type="button"
                onClick={saveSegak}
                disabled={saving || (!studentRows.length && editableFailedImportRows.length === 0)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                <span>
                  {saving
                    ? 'Menyimpan...'
                    : !studentRows.length && editableFailedImportRows.length > 0
                      ? 'Simpan Pembetulan'
                      : 'Simpan Semua'}
                </span>
              </button>
            </div>
          </div>

          {isSchoolAdmin && importSummary ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">
                Import selesai: {importSummary.successCount} berjaya, {importSummary.errorCount}{' '}
                gagal.
              </div>
              {importSummary.messages.length > 0 ? (
                <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-rose-100 bg-white p-3">
                  <div className="text-xs font-semibold uppercase text-rose-700">
                    Ringkasan ralat
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-rose-700">
                    {importSummary.messages.map((message, index) => (
                      <li key={`${message}-${index}`}>{message}</li>
                    ))}
                  </ul>
                  {importSummary.errorCount > importSummary.messages.length ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Ralat diringkaskan; sehingga 50 mesej pertama dipaparkan.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {isSchoolAdmin && failedImportRows.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Pembetulan Manual Row Import Gagal
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {editableFailedImportRows.length} row boleh dibetulkan dan disimpan terus
                    berdasarkan kelas dalam CSV tanpa memilih kelas di penapis.
                  </p>
                </div>
                <div className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                  {failedImportRows.length - editableFailedImportRows.length} row perlukan
                  pembetulan data murid/enrollment
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-amber-200 bg-white">
                <table className="min-w-[1180px] border-collapse text-sm">
                  <thead className="bg-amber-50">
                    <tr>
                      <th className="border-b border-amber-200 px-3 py-3 text-left font-semibold text-slate-700">
                        Baris
                      </th>
                      <th className="border-b border-amber-200 px-3 py-3 text-left font-semibold text-slate-700">
                        Murid
                      </th>
                      <th className="border-b border-amber-200 px-3 py-3 text-left font-semibold text-slate-700">
                        Kelas / Penggal
                      </th>
                      <th className="border-b border-amber-200 px-3 py-3 text-left font-semibold text-slate-700">
                        Sebab Gagal
                      </th>
                      <th className="border-b border-amber-200 px-3 py-3 text-left font-semibold text-slate-700">
                        BMI
                      </th>
                      <th className="border-b border-amber-200 px-3 py-3 text-left font-semibold text-slate-700">
                        Skor SEGAK
                      </th>
                      <th className="border-b border-amber-200 px-3 py-3 text-left font-semibold text-slate-700">
                        Tarikh
                      </th>
                      <th className="border-b border-amber-200 px-3 py-3 text-left font-semibold text-slate-700">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedImportRows.map((row) => (
                      <tr key={row.id} className="border-b border-amber-100">
                        <td className="px-3 py-3 font-semibold text-slate-700">{row.rowNumber}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-900">{row.studentName}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.icNumber || '-'}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <div>{`${row.tingkatan || '-'} ${row.className || '-'}`.trim()}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.term ? termLabel(row.term) : 'Penggal tidak sah'}
                          </div>
                        </td>
                        <td className="max-w-sm px-3 py-3 text-rose-700">
                          {row.reasons.join(' ')}
                        </td>
                        <td className="px-3 py-3">
                          {row.canEdit ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.bmi ?? ''}
                              onChange={(event) =>
                                updateFailedImportRow(row.id, 'bmi', event.target.value)
                              }
                              className="w-28 rounded-lg border border-slate-300 px-3 py-2"
                              placeholder="BMI"
                            />
                          ) : (
                            formatNumber(row.bmi)
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {row.canEdit ? (
                            <input
                              type="number"
                              min="0"
                              max="20"
                              step="1"
                              value={row.segakTotalScore ?? ''}
                              onChange={(event) =>
                                updateFailedImportRow(
                                  row.id,
                                  'segakTotalScore',
                                  event.target.value
                                )
                              }
                              className="w-28 rounded-lg border border-slate-300 px-3 py-2"
                              placeholder="0-20"
                            />
                          ) : (
                            row.segakTotalScore || '-'
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {row.canEdit ? (
                            <input
                              type="date"
                              value={row.assessmentDate || ''}
                              onChange={(event) =>
                                updateFailedImportRow(
                                  row.id,
                                  'assessmentDate',
                                  event.target.value
                                )
                              }
                              className="rounded-lg border border-slate-300 px-3 py-2"
                            />
                          ) : (
                            row.assessmentDate || '-'
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              row.canEdit
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {row.canEdit ? 'Boleh disimpan' : 'Tiada enrollment sah'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {failedImportRows.length > editableFailedImportRows.length ? (
                <p className="mt-3 text-xs leading-5 text-amber-900">
                  Row tanpa padanan murid atau enrollment aktif tidak boleh disimpan dari halaman
                  ini kerana sistem memerlukan student_enrollment_id yang sah bagi sekolah, kelas
                  dan tahun akademik tersebut.
                </p>
              ) : null}
            </div>
          ) : null}

          {!selectedClassId ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Pilih kelas hanya untuk input manual biasa. Import CSV pukal menggunakan kelas pada
              setiap row CSV.
            </div>
          ) : studentRows.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Tiada murid aktif dalam kelas ini.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[1080px] border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Murid
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      No IC
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      BMI
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Kategori BMI
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Tidak Hadir
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Skor SEGAK
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Gred
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Bintang
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Tahap Kecergasan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map((student) => {
                    const draft = drafts[student.enrollment_id] || {}
                    const bmi = toNumberOrNull(draft.bmi)
                    const isAbsent = draft.is_absent === true
                    const score = isAbsent ? 0 : normalizeSegakScore(draft.segak_total_score)
                    const grade = getSegakGrade(score, isAbsent)
                    const stars = getSegakStars(score, isAbsent)
                    const fitnessLevel = getSegakFitnessLevel(score, isAbsent)

                    return (
                      <tr key={student.enrollment_id} className="border-b border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {student.full_name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{student.ic_number}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.bmi ?? ''}
                            onChange={(event) =>
                              updateDraft(student.enrollment_id, 'bmi', event.target.value)
                            }
                            className="w-28 rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="BMI"
                          />
                        </td>
                        <td className="px-4 py-3 text-slate-700">{getBmiCategory(bmi) || '-'}</td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={isAbsent}
                              onChange={(event) =>
                                toggleAbsent(student.enrollment_id, event.target.checked)
                              }
                              className="h-4 w-4 rounded border-slate-300 text-slate-900"
                            />
                            <span>Tidak Hadir</span>
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="1"
                            value={isAbsent ? '' : draft.segak_total_score ?? ''}
                            onChange={(event) =>
                              updateDraft(
                                student.enrollment_id,
                                'segak_total_score',
                                event.target.value
                              )
                            }
                            className="w-28 rounded-lg border border-slate-300 px-3 py-2"
                            disabled={isAbsent}
                            placeholder="0-20"
                          />
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">{grade || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{formatStars(stars)}</td>
                        <td className="px-4 py-3 text-slate-700">{fitnessLevel || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  )
}
