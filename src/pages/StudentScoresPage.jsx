import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { getDashboardPath } from '../lib/dashboardPath'
import ClassSubjectAnalysisPanel from '../components/ClassSubjectAnalysisPanel'
import {
  normalizeSetupConfigWithExamConfigs,
} from '../lib/examConfig'
import {
  generateOtrMarks,
  getOtrKeysForTingkatan,
  shouldAutoRecalculateOtrs,
} from '../lib/otrGeneration'
import { getRelevantEnrollmentIds } from '../lib/completionMatrix'
import {
  fetchSchoolLevelLabels,
  getDisplayClassLabel,
  getDisplayLevel,
} from '../lib/levelLabels'
import { formatSubjectName, normalizeSubjectRows } from '../lib/subjectLabels.js'
import { compareStudentsByGenderThenName } from '../lib/studentSorting.js'

const REQUIRED_HEADERS = [
  'nama_murid',
  'no_ic',
  'subjek',
  'jenis_peperiksaan',
  'markah',
]

const BULK_REQUIRED_HEADERS = [
  'tingkatan',
  'no_ic',
  'nama_murid',
  'subjek',
  'jenis_peperiksaan',
  'markah',
]

const BULK_TEMPLATE_HEADERS = [
  'tingkatan',
  'kelas',
  'no_ic',
  'nama_murid',
  'subjek',
  'jenis_peperiksaan',
  'markah',
]

const DYNAMIC_BULK_BASE_HEADERS = [
  'no_ic',
  'nama_murid',
  'kelas',
  'tingkatan',
]

const DYNAMIC_BULK_TEMPLATE_HEADERS = [
  'NO KAD PENGENALAN',
  'NAMA MURID',
  'KELAS',
  'TINGKATAN',
]

const normalizeText = (value) =>
  String(value || '').trim()

const normalizeCompareText = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()

const getGradeNumber = (value) => {
  const normalized = normalizeCompareText(value)
  const match =
    normalized.match(/^(?:tingkatan|tahun|form|f|t)?\s*(\d+)$/) ||
    normalized.match(/\b(?:tingkatan|tahun|form|f|t)\s*(\d+)\b/)

  return match?.[1] || ''
}

const normalizeGradeLabel = (value) => {
  const normalized = normalizeCompareText(value)
  const gradeNumber = getGradeNumber(normalized)
  return gradeNumber ? `tingkatan ${gradeNumber}` : normalized
}

const normalizeClassLookupText = (kelas, tingkatan = '') => {
  let normalized = normalizeCompareText(kelas)
  const gradeNumber = getGradeNumber(tingkatan)
  const gradeAliases = [
    normalizeCompareText(tingkatan),
    gradeNumber,
    gradeNumber ? `tingkatan ${gradeNumber}` : '',
    gradeNumber ? `tahun ${gradeNumber}` : '',
    gradeNumber ? `form ${gradeNumber}` : '',
    gradeNumber ? `f${gradeNumber}` : '',
    gradeNumber ? `t${gradeNumber}` : '',
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)

  gradeAliases.forEach((alias) => {
    if (normalized === alias) {
      normalized = ''
    } else if (normalized.startsWith(`${alias} `)) {
      normalized = normalized.slice(alias.length).trim()
    }
  })

  return normalized
}

const buildClassLookupKey = (tingkatan, kelas) =>
  `${normalizeGradeLabel(tingkatan)}__${normalizeClassLookupText(kelas, tingkatan)}`

const buildGradeIcLookupKey = (tingkatan, noIc) =>
  `${normalizeGradeLabel(tingkatan)}__${normalizeIC(noIc)}`

function normalizeIC(ic) {
  const digits = String(ic || '')
    .trim()
    .replace(/\D/g, '')

  return digits ? digits.padStart(12, '0') : ''
}

const normalizeKey = (value) =>
  String(value || '').trim().toLowerCase()

const normalizeCsvHeader = (value) => {
  const normalized = normalizeKey(value)
  const compact = normalized.replace(/[^a-z0-9]/g, '')

  if (
    compact === 'noic' ||
    compact === 'ic' ||
    compact === 'nokadpengenalan' ||
    compact === 'kadpengenalan'
  ) {
    return 'no_ic'
  }

  if (compact === 'namamurid') return 'nama_murid'
  if (compact === 'subjek') return 'subjek'
  if (compact === 'jenispeperiksaan') return 'jenis_peperiksaan'
  if (compact === 'markah') return 'markah'
  if (compact === 'tingkatan') return 'tingkatan'
  if (compact === 'kelas' || compact === 'namakelas') return 'kelas'

  return String(value || '').trim()
}

const normalizeExamKey = (value) =>
  String(value || '').trim().toUpperCase()

const getGuideExamKey = (examKey) => {
  const normalized = normalizeExamKey(examKey)

  if (normalized === 'ETR') return 'TOV'
  if (normalized === 'TOV') return 'ETR'

  return ''
}

const getGuideLabel = (examKey) => {
  const guideKey = getGuideExamKey(examKey)
  return guideKey || 'Panduan'
}

const getExamDisplayLabel = (exam) => {
  const key = normalizeExamKey(exam?.key || exam?.exam_key)
  const name = normalizeText(exam?.name || exam?.exam_name)

  if (!key) return name || ''
  if (!name || normalizeExamKey(name) === key) return key

  return `${key} - ${name}`
}

const normalizeSubjectType = (value) =>
  String(value || '').trim().toLowerCase()

const isSelectiveSubject = (subject) =>
  normalizeSubjectType(subject?.subject_type) === 'selective'

const isAllowedExamKey = (value) => {
  const key = normalizeExamKey(value)

  // OTR tak perlu import manual sebab sistem jana automatik
  return Boolean(key) && !key.startsWith('OTR')
}

const isScoreExamKey = (examKey) => {
  const key = normalizeExamKey(examKey)
  return Boolean(key) && key !== 'ETR' && !key.startsWith('OTR')
}

const getSubjectCsvHeader = (subject) =>
  normalizeText(subject?.subject_code) || normalizeText(subject?.subject_name)

const normalizeSubjectLookupText = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

const buildSubjectHeaderLookupKey = (header, tingkatan) =>
  `${normalizeSubjectLookupText(header)}__${normalizeGradeLabel(tingkatan)}`

const buildSubjectLookupMaps = (subjectRows = []) => {
  const byHeaderAndGrade = new Map()
  const byHeader = new Map()

  ;(subjectRows || []).forEach((subject) => {
    const keys = [
      normalizeText(subject?.subject_code),
      normalizeText(subject?.subject_name),
    ].filter(Boolean)

    keys.forEach((key) => {
      const normalizedHeader = normalizeSubjectLookupText(key)
      const gradeKey = buildSubjectHeaderLookupKey(key, subject?.tingkatan)

      if (!byHeaderAndGrade.has(gradeKey)) {
        byHeaderAndGrade.set(gradeKey, subject)
      }

      if (!byHeader.has(normalizedHeader)) {
        byHeader.set(normalizedHeader, [])
      }

      byHeader.get(normalizedHeader).push(subject)
    })
  })

  return { byHeaderAndGrade, byHeader }
}

const getUniqueSubjectHeaders = (subjectRows = []) => {
  const seen = new Set()

  return (subjectRows || [])
    .map((subject) => getSubjectCsvHeader(subject))
    .filter(Boolean)
    .filter((header) => {
      const key = normalizeSubjectLookupText(header)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const escapeCsvValue = (value) =>
  `"${String(value ?? '').replace(/"/g, '""')}"`

const downloadCsv = (filename, headers, rows) => {
  const csvLines = [
    headers.map(escapeCsvValue).join(','),
    ...rows.map((row) => row.map(escapeCsvValue).join(',')),
  ]

  const csvContent = '\uFEFF' + csvLines.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
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

  const rawHeaders = parseCsvLine(lines[0]).map((h) => normalizeText(h))
  const headers = rawHeaders.map((h) => normalizeCsvHeader(h))

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

  return { headers, rawHeaders, rows }
}

const detectBulkCsvFormat = (headers = [], rawHeaders = []) => {
  const normalizedHeaders = headers.map((header) =>
    String(header || '').trim().toLowerCase()
  )

  const hasLegacyHeaders = BULK_REQUIRED_HEADERS.every((header) =>
    normalizedHeaders.includes(header)
  )

  if (hasLegacyHeaders) {
    return {
      format: 'legacy',
      subjectHeaders: [],
      errors: [],
    }
  }

  const firstFourHeaders = normalizedHeaders.slice(0, 4)
  const hasDynamicBaseHeaders = DYNAMIC_BULK_BASE_HEADERS.every(
    (header, index) => firstFourHeaders[index] === header
  )

  if (!hasDynamicBaseHeaders) {
    return {
      format: 'unknown',
      subjectHeaders: [],
      errors: [
        'Format CSV tidak dikenali. Guna format lama atau template dinamik rasmi.',
      ],
    }
  }

  const subjectHeaders = rawHeaders
    .slice(4)
    .map((rawHeader, index) => ({
      label: normalizeText(rawHeader),
      rowKey: headers[index + 4],
    }))
    .filter((item) => item.label)

  if (subjectHeaders.length === 0) {
    return {
      format: 'dynamic',
      subjectHeaders,
      errors: ['Sekurang-kurangnya satu column subjek diperlukan.'],
    }
  }

  return {
    format: 'dynamic',
    subjectHeaders,
    errors: [],
  }
}

const validateCsvData = (headers, rows, expectedHeaders = REQUIRED_HEADERS) => {
  const errors = []

  const missingHeaders = expectedHeaders.filter(
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
        `Baris ${row.__rowNumber}: jenis_peperiksaan '${examKey}' tidak sah. OTR dijana automatik dan tidak perlu diimport manual.`
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

const getMatchedExamConfig = (examConfigs = [], gradeLabel, examKey) =>
  (examConfigs || []).find(
    (item) =>
      normalizeGradeLabel(item?.grade_label) === normalizeGradeLabel(gradeLabel) &&
      normalizeExamKey(item?.exam_key) === normalizeExamKey(examKey) &&
      item?.is_active !== false
  ) || null

const applySmartExamScoreFilter = (query, examKey, examConfigId) => {
  const normalizedExamKey = normalizeExamKey(examKey)

  if (!normalizedExamKey) return query

  if (examConfigId) {
    return query.or(`exam_config_id.eq.${examConfigId},exam_key.eq.${normalizedExamKey}`)
  }

  return query.eq('exam_key', normalizedExamKey)
}

const ensureExamConfigRecord = async ({
  schoolId,
  academicYear,
  gradeLabel,
  examKey,
}) => {
  const normalizedExamKey = normalizeExamKey(examKey)

  if (!schoolId || !academicYear || !gradeLabel || !normalizedExamKey) {
    return null
  }

  const { data: existingExamConfig, error: existingExamConfigError } = await supabase
    .from('exam_configs')
    .select('id, school_id, academic_year, grade_label, exam_key, exam_name, is_active')
    .eq('school_id', schoolId)
    .eq('academic_year', academicYear)
    .eq('grade_label', gradeLabel)
    .eq('exam_key', normalizedExamKey)
    .maybeSingle()

  if (existingExamConfigError) throw existingExamConfigError

  if (existingExamConfig) {
    return existingExamConfig
  }

  const { data: newExam, error: newExamError } = await supabase
    .from('exam_configs')
    .insert({
      school_id: schoolId,
      academic_year: academicYear,
      grade_label: gradeLabel,
      exam_key: normalizedExamKey,
      exam_name: normalizedExamKey,
      is_active: true,
    })
    .select('id, school_id, academic_year, grade_label, exam_key, exam_name, is_active')
    .single()

  if (newExamError) throw newExamError

  return newExam
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
  const studentListRef = useRef(null)
  const bulkImportResultRef = useRef(null)

  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [gradeScales, setGradeScales] = useState([])
  const [levelMappings, setLevelMappings] = useState([])

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [allEnrollments, setAllEnrollments] = useState([])
  const [studentSubjectEnrollments, setStudentSubjectEnrollments] = useState([])

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedExam, setSelectedExam] = useState('')
  const [activeExamOptions, setActiveExamOptions] = useState([])

  const [students, setStudents] = useState([])
  const [scores, setScores] = useState({})
  const [guideMarks, setGuideMarks] = useState({})
  const [saving, setSaving] = useState(false)
  const [analysisRefreshKey, setAnalysisRefreshKey] = useState(0)
  const [scoresRefreshKey, setScoresRefreshKey] = useState(0)
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false)
  const [editingStudentId, setEditingStudentId] = useState(null)

  const [csvRows, setCsvRows] = useState([])
  const [csvErrors, setCsvErrors] = useState([])
  const [csvFileName, setCsvFileName] = useState('')
  const [importMode, setImportMode] = useState('normal')
  const [csvImportPolicy, setCsvImportPolicy] = useState('partial')
  const [importingCsv, setImportingCsv] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [bulkCsvFile, setBulkCsvFile] = useState(null)
  const [bulkPreviewRows, setBulkPreviewRows] = useState([])
  const [bulkCsvFormat, setBulkCsvFormat] = useState('')
  const [bulkSubjectHeaders, setBulkSubjectHeaders] = useState([])
  const [bulkImportErrors, setBulkImportErrors] = useState([])
  const [bulkImportSummary, setBulkImportSummary] = useState(null)
  const [bulkImportLoading, setBulkImportLoading] = useState(false)
  const [dynamicTemplateLoading, setDynamicTemplateLoading] = useState(false)
  const [searchParams] = useSearchParams()

  const dashboardPath = getDashboardPath(profile)
  const isSchoolAdmin =
    profile?.role === 'school_admin' || profile?.is_school_admin === true
  const prefillClassId = searchParams.get('class_id') || ''
  const prefillSubjectName = searchParams.get('subject_name') || ''
  const prefillExamKey = searchParams.get('exam_key') || ''
  const showIncompleteOnlyFromUrl = searchParams.get('show') === 'incomplete'

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    if (importMode !== 'bulk_admin') return
    if (!bulkImportSummary && bulkImportErrors.length === 0) return

    bulkImportResultRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [bulkImportSummary, bulkImportErrors, importMode])

  const getGradeLabelFromClassName = (className = '') => {
    const text = className.toLowerCase()

    if (text.includes('tingkatan 1')) return 'Tingkatan 1'
    if (text.includes('tingkatan 2')) return 'Tingkatan 2'
    if (text.includes('tingkatan 3')) return 'Tingkatan 3'
    if (text.includes('tingkatan 4')) return 'Tingkatan 4'
    if (text.includes('tingkatan 5')) return 'Tingkatan 5'

    return ''
  }

  const selectedClassData = useMemo(
    () => classes.find((c) => String(c.id) === String(selectedClass)) || null,
    [classes, selectedClass]
  )

  const selectedGradeLabel = useMemo(() => {
    if (selectedClassData?.tingkatan) {
      return String(selectedClassData.tingkatan).trim()
    }

    const classLabel = `${selectedClassData?.tingkatan || ''} ${selectedClassData?.class_name || ''}`.trim()
    return getGradeLabelFromClassName(classLabel)
  }, [selectedClassData])

  const selectedExamConfig = useMemo(
    () =>
      activeExamOptions.find(
        (item) => normalizeExamKey(item?.key) === normalizeExamKey(selectedExam)
      ) || null,
    [activeExamOptions, selectedExam]
  )

  const loadActiveExamOptions = async (
    schoolId,
    gradeLabel,
    academicYear,
    options = {}
  ) => {
    if (!schoolId || !academicYear) return []
    if (!options.includeAllGrades && !gradeLabel) return []

    let query = supabase
      .from('exam_configs')
      .select('id, exam_key, exam_name, exam_order, grade_label, academic_year, is_active')
      .eq('school_id', schoolId)
      .eq('academic_year', academicYear)
      .eq('is_active', true)
      .order('exam_order', { ascending: true })

    if (!options.includeAllGrades) {
      query = query.eq('grade_label', gradeLabel)
    }

    const { data, error } = await query

    if (error) throw error

    const mapped = (data || [])
      .map((item) => ({
        id: item.id,
        key: normalizeExamKey(item.exam_key),
        name: item.exam_name || item.exam_key,
        grade_label: item.grade_label,
        exam_order: item.exam_order,
      }))
      .filter((item) => isAllowedExamKey(item.key))

    if (!options.includeAllGrades) return mapped

    const deduped = new Map()

    mapped.forEach((item) => {
      if (!deduped.has(item.key)) {
        deduped.set(item.key, item)
      }
    })

    return Array.from(deduped.values()).sort((a, b) => {
      const orderA = Number.isFinite(Number(a.exam_order)) ? Number(a.exam_order) : 500
      const orderB = Number.isFinite(Number(b.exam_order)) ? Number(b.exam_order) : 500
      return orderA - orderB || String(a.key).localeCompare(String(b.key), 'ms')
    })
  }

  const selectedSubjectData = useMemo(
    () => subjects.find((item) => String(item.id) === String(selectedSubject)) || null,
    [subjects, selectedSubject]
  )

  const selectedClassLabel = getDisplayClassLabel(
    selectedClassData?.tingkatan,
    selectedClassData?.class_name,
    levelMappings
  )
  const selectedSubjectLabel = String(selectedSubjectData?.subject_name || '').trim()

  const displayedStudents = useMemo(() => {
    return Array.isArray(students) ? students : []
  }, [students])

  const visibleStudents = useMemo(() => {
    if (!showIncompleteOnly) return displayedStudents || []

    return (displayedStudents || []).filter((student) => {
      if (String(editingStudentId) === String(student.student_id)) {
        return true
      }

      const foundScore = scores?.[student.student_id]
      const mark = foundScore?.mark
      return mark === '' || mark === null || mark === undefined
    })
  }, [displayedStudents, showIncompleteOnly, scores, editingStudentId])

  const displayedStudentIdSet = useMemo(() => {
    return new Set(displayedStudents.map((student) => String(student.student_id)))
  }, [displayedStudents])

  const displayedEnrollmentIdSet = useMemo(() => {
    return new Set(
      displayedStudents.map((student) => String(student.enrollment_id))
    )
  }, [displayedStudents])

  const displayedStudentLookupByIc = useMemo(() => {
    const map = new Map()

    ;(displayedStudents || []).forEach((student) => {
      const normalizedIc = normalizeIC(student.ic_number)
      if (!normalizedIc) return

      map.set(normalizedIc, {
        ...student,
        student_profile_id: student.student_id,
      })
    })

    return map
  }, [displayedStudents])

  const subjectLookupByGrade = useMemo(() => {
    return buildSubjectLookupMaps(subjects).byHeaderAndGrade
  }, [subjects])

  const resolveSubjectFromCsvRow = (csvSubjectName) => {
    const gradeLabel = selectedClassData?.tingkatan || ''
    const lookupKey = buildSubjectHeaderLookupKey(csvSubjectName, gradeLabel)

    return subjectLookupByGrade.get(lookupKey) || null
  }

  const allowedExamKeysForSelectedGrade = useMemo(() => {
    return new Set(
      (activeExamOptions || []).map((exam) => String(exam?.key || '').trim().toUpperCase())
    )
  }, [activeExamOptions])

  useEffect(() => {
    if (!prefillClassId || !classes.length) return

    const exists = classes.some((item) => String(item.id) === String(prefillClassId))
    if (exists) {
      setSelectedClass(prefillClassId)
    }
  }, [prefillClassId, classes])

  useEffect(() => {
    if (!selectedExam || !activeExamOptions.length) return

    const examStillValid = activeExamOptions.some(
      (exam) => String(exam.key) === String(selectedExam)
    )

    if (!examStillValid) {
      setSelectedExam('')
    }
  }, [activeExamOptions, selectedExam])

  useEffect(() => {
    const run = async () => {
      const includeAllGrades = importMode === 'bulk_admin'

      if (!profile?.school_id || (!includeAllGrades && !selectedGradeLabel)) {
        setActiveExamOptions([])
        setSelectedExam('')
        return
      }

      try {
        const rows = await loadActiveExamOptions(
          profile.school_id,
          selectedGradeLabel,
          setupConfig?.current_academic_year || new Date().getFullYear(),
          { includeAllGrades }
        )

        setActiveExamOptions(rows)

        const currentSelectedStillValid = rows.some(
          (item) => item.key === normalizeExamKey(selectedExam)
        )

        if (!currentSelectedStillValid) {
          setSelectedExam(rows[0]?.key || '')
        }
      } catch (err) {
        console.error('loadActiveExamOptions error:', err)
        setActiveExamOptions([])
        setSelectedExam('')
      }
    }

    run()
  }, [profile?.school_id, selectedGradeLabel, setupConfig?.current_academic_year, selectedExam, importMode])

  useEffect(() => {
    if (!prefillExamKey) return
    setSelectedExam(String(prefillExamKey).trim().toUpperCase())
  }, [prefillExamKey])

  const sortedStudents = useMemo(() => {
    return [...visibleStudents].sort((a, b) => compareStudentsByGenderThenName(a, b))
  }, [visibleStudents])

  useEffect(() => {
    const loadGuideMarks = async () => {
      const guideExamKey = getGuideExamKey(selectedExam)
      const guideExamConfigId =
        activeExamOptions.find(
          (exam) => normalizeExamKey(exam?.key) === normalizeExamKey(guideExamKey)
        )?.id || null

      if (
        !profile?.school_id ||
        !selectedClass ||
        !selectedSubject ||
        !guideExamKey ||
        !Array.isArray(sortedStudents) ||
        sortedStudents.length === 0
      ) {
        setGuideMarks({})
        return
      }

      try {
        const enrollmentIds = sortedStudents
          .map((student) => student.student_enrollment_id || student.enrollment_id || student.id)
          .filter(Boolean)

        if (enrollmentIds.length === 0) {
          setGuideMarks({})
          return
        }

        let scoreQuery = supabase
          .from('student_scores')
          .select('student_enrollment_id, exam_key, exam_config_id, mark')
          .eq('school_id', profile.school_id)
          .eq('class_id', selectedClass)
          .eq('subject_id', selectedSubject)
          .in('student_enrollment_id', enrollmentIds)

        scoreQuery = applySmartExamScoreFilter(
          scoreQuery,
          guideExamKey,
          guideExamConfigId
        )

        const { data, error } = await scoreQuery

        if (error) throw error

        const mapped = {}
        ;(data || []).forEach((row) => {
          mapped[row.student_enrollment_id] = row.mark
        })

        setGuideMarks(mapped)
      } catch (err) {
        console.error('loadGuideMarks error:', err)
        setGuideMarks({})
      }
    }

    loadGuideMarks()
  }, [profile?.school_id, selectedClass, selectedSubject, selectedExam, sortedStudents, activeExamOptions])

  const uniqueSubjects = useMemo(() => {
    const normalizedSelectedGrade = normalizeGradeLabel(selectedGradeLabel)

    const filteredSubjects = normalizedSelectedGrade
      ? subjects.filter(
          (subject) =>
            normalizeGradeLabel(subject.tingkatan) === normalizedSelectedGrade
        )
      : subjects

    return filteredSubjects.filter(
      (subject, index, arr) =>
        index ===
        arr.findIndex(
          (item) =>
            normalizeCompareText(item.subject_name) ===
            normalizeCompareText(subject.subject_name)
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

  useEffect(() => {
    if (!prefillSubjectName || !selectedClassData || !subjects.length) return

    const matchedSubject = subjects.find(
      (item) =>
        normalizeCompareText(item.subject_name) === normalizeCompareText(prefillSubjectName) &&
        normalizeGradeLabel(item.tingkatan) === normalizeGradeLabel(selectedClassData.tingkatan)
    )

    if (matchedSubject) {
      setSelectedSubject(matchedSubject.id)
    }
  }, [prefillSubjectName, subjects, selectedClassData])

  useEffect(() => {
    if (showIncompleteOnlyFromUrl) {
      setShowIncompleteOnly(true)
    }
  }, [showIncompleteOnlyFromUrl])

  const incompleteStudentIds = useMemo(() => {
    if (!displayedStudents.length) return []

    return displayedStudents
      .filter((student) => {
        const foundScore = scores[student.student_id]
        const mark = foundScore?.mark

        return mark === '' || mark === null || mark === undefined
      })
      .map((student) => student.enrollment_id)
  }, [displayedStudents, scores, selectedSubject, selectedExam])

  useEffect(() => {
    if (!showIncompleteOnlyFromUrl) return
    if (!studentListRef.current) return
    if (!selectedClass || !selectedSubject || !selectedExam) return

    const timer = setTimeout(() => {
      studentListRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 300)

    return () => clearTimeout(timer)
  }, [showIncompleteOnlyFromUrl, selectedClass, selectedSubject, selectedExam, visibleStudents.length])

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

    const { data: setupRows, error: setupError } = await supabase
      .from('school_setup_configs')
      .select('current_academic_year, exam_structure, active_grade_labels, ar_count_by_grade, otr_count_by_grade, otr_generation_mode, otr_percentages_default, otr_percentages_by_grade, auto_recalculate_otr_on_etr_change')
      .eq('school_id', profileData.school_id)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)

    if (setupError) {
      console.error(setupError)
    }

    const currentYear = setupRows?.[0]?.current_academic_year || new Date().getFullYear()

    const loadedLevelMappings = await fetchSchoolLevelLabels({
      schoolId: profileData.school_id,
      academicYear: currentYear,
    })

    const { data: examConfigRows, error: examConfigError } = await supabase
      .from('exam_configs')
      .select('id, grade_label, exam_key, exam_name, exam_order, is_active')
      .eq('school_id', profileData.school_id)
      .eq('academic_year', currentYear)

    if (examConfigError) {
      console.error(examConfigError)
    }

    const setupData = normalizeSetupConfigWithExamConfigs(
      setupRows?.[0] || null,
      examConfigRows || []
    )

    setSetupConfig(setupData || null)
    setLevelMappings(loadedLevelMappings)

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

    const [
      { data: subjectData },
      { data: gradeScaleData },
      { data: enrollmentData },
      { data: studentSubjectEnrollmentData },
    ] = await Promise.all([
      supabase
        .from('subjects')
        .select('id, subject_name, subject_code, tingkatan, subject_type, is_core')
        .eq('school_id', profileData.school_id)
        .eq('is_active', true)
        .order('subject_name', { ascending: true }),
      supabase
        .from('grade_scales')
        .select('*')
        .eq('school_id', profileData.school_id),
      supabase
        .from('student_enrollments')
        .select(`
          id,
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
        .eq('school_id', profileData.school_id)
        .eq('academic_year', setupData?.current_academic_year || new Date().getFullYear())
        .eq('is_active', true),
      supabase
        .from('student_subject_enrollments')
        .select('student_enrollment_id, subject_id, academic_year, is_active')
        .eq('school_id', profileData.school_id)
        .eq('academic_year', setupData?.current_academic_year || new Date().getFullYear())
        .eq('is_active', true),
    ])

    setSubjects(normalizeSubjectRows(subjectData))
    setGradeScales(gradeScaleData || [])
    setAllEnrollments(enrollmentData || [])
    setStudentSubjectEnrollments(studentSubjectEnrollmentData || [])
  }

  const loadStudentsAndScores = async () => {
    if (!selectedClass || !selectedSubject || !selectedExam || !profile?.school_id) return

    const currentYear = setupConfig?.current_academic_year || new Date().getFullYear()

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

    enrollmentQuery = enrollmentQuery.eq('academic_year', currentYear)

    const [
      { data: enrollmentData },
      { data: studentSubjectEnrollmentData },
    ] = await Promise.all([
      enrollmentQuery,
      supabase
        .from('student_subject_enrollments')
        .select('subject_id, student_enrollment_id, academic_year, is_active')
        .eq('school_id', profile.school_id)
        .eq('subject_id', selectedSubject)
        .eq('academic_year', currentYear)
        .eq('is_active', true),
    ])

    const studentRows = (enrollmentData || []).map((row) => ({
      enrollment_id: row.id,
      student_id: row.student_profile_id,
      full_name: row.student_profiles?.full_name || '-',
      ic_number: row.student_profiles?.ic_number || '-',
      gender: row.student_profiles?.gender || '',
    }))

    const selectedSubjectRecord = subjects.find(
      (subject) => String(subject.id) === String(selectedSubject)
    )
    const classEnrollmentIdSet = new Set(studentRows.map((student) => student.enrollment_id))
    const relevantEnrollmentIds = getRelevantEnrollmentIds({
      classId: selectedClass,
      subject: selectedSubjectRecord,
      enrollments: enrollmentData || [],
      studentSubjectEnrollments: (studentSubjectEnrollmentData || []).filter((row) =>
        classEnrollmentIdSet.has(row.student_enrollment_id)
      ),
    })
    const relevantEnrollmentIdSet = new Set(relevantEnrollmentIds)
    const filteredStudents = studentRows.filter((student) =>
      relevantEnrollmentIdSet.has(student.enrollment_id)
    )

    setStudents(filteredStudents)

    const normalizedSelectedExam = normalizeExamKey(selectedExam)
    let scoreData = []

    if (normalizedSelectedExam === 'ETR') {
      const { data: targetData } = await supabase
        .from('student_targets')
        .select('*')
        .eq('class_id', selectedClass)
        .eq('subject_id', selectedSubject)
        .eq('school_id', profile.school_id)
        .eq('academic_year', currentYear)
        .eq('target_key', 'ETR')

      scoreData = (targetData || []).map((target) => ({
        ...target,
        mark: target.target_mark,
      }))
    } else {
      let scoreQuery = supabase
        .from('student_scores')
        .select('*')
        .eq('class_id', selectedClass)
        .eq('subject_id', selectedSubject)
        .eq('school_id', profile.school_id)

      scoreQuery = scoreQuery.eq('academic_year', currentYear)

      scoreQuery = applySmartExamScoreFilter(
        scoreQuery,
        selectedExam,
        selectedExamConfig?.id || null
      )

      const { data } = await scoreQuery
      scoreData = data || []
    }

    const scoreMap = {}
    scoreData?.forEach((s) => {
      const scoreStudentId = s.student_profile_id || s.student_id
      if (scoreStudentId) scoreMap[scoreStudentId] = s
    })

    setScores(scoreMap)
  }

  useEffect(() => {
    loadStudentsAndScores()
  }, [selectedClass, selectedSubject, selectedExam, profile?.school_id, scoresRefreshKey])

  const refreshCurrentMarksAndAnalysis = async () => {
    try {
      setScoresRefreshKey((prev) => prev + 1)
      setAnalysisRefreshKey((prev) => prev + 1)
    } catch (err) {
      console.error('refreshCurrentMarksAndAnalysis error:', err)
    }
  }

  const handleScoreChange = (studentId, value) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        mark: value,
      },
    }))
  }

  const downloadTemplateCsv = () => {
    const isBulkAdmin = importMode === 'bulk_admin'

    const headers = isBulkAdmin ? BULK_TEMPLATE_HEADERS : REQUIRED_HEADERS

    const sampleRows = isBulkAdmin
      ? [
          ['Tingkatan 3', 'BANGSAWAN', '030101010101', 'ALI BIN ABU', 'Sains', 'TOV', '45'],
          ['Tingkatan 2', 'INANG', '040202020202', 'SITI AISYAH', 'Bahasa Melayu', 'ETR', '80'],
        ]
      : [
          ['ALI BIN ABU', '030101010101', 'Sains', 'TOV', '45'],
          ['SITI AISYAH', '040202020202', 'Bahasa Melayu', 'ETR', '80'],
        ]

    const csvLines = [
      headers.join(','),
      ...sampleRows.map((row) =>
        row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')
      ),
    ]

    const csvContent = '\uFEFF' + csvLines.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = isBulkAdmin
      ? 'template_import_pukal_admin.csv'
      : 'template_import_biasa.csv'

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const downloadDynamicBulkTemplateCsv = async () => {
    if (!isSchoolAdmin) {
      alert('Hanya school admin dibenarkan menggunakan import pukal admin.')
      return
    }

    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return
    }

    const examKey = normalizeExamKey(selectedExam)

    if (!examKey) {
      alert('Sila pilih peperiksaan dahulu.')
      return
    }

    setDynamicTemplateLoading(true)

    try {
      const currentAcademicYear =
        setupConfig?.current_academic_year || new Date().getFullYear()
      const schoolId = profile.school_id

      const [
        { data: classRows, error: classError },
        { data: subjectRows, error: subjectError },
        { data: enrollmentRows, error: enrollmentError },
        { data: examConfigRows, error: examConfigError },
      ] = await Promise.all([
        supabase
          .from('classes')
          .select('id, class_name, tingkatan, academic_year, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', currentAcademicYear)
          .eq('is_active', true)
          .order('tingkatan', { ascending: true })
          .order('class_name', { ascending: true }),

        supabase
          .from('subjects')
          .select('id, subject_name, subject_code, tingkatan, subject_type, is_core, is_active')
          .eq('school_id', schoolId)
          .eq('is_active', true)
          .order('tingkatan', { ascending: true })
          .order('subject_name', { ascending: true }),

        supabase
          .from('student_enrollments')
          .select(`
            id,
            class_id,
            student_profile_id,
            academic_year,
            is_active,
            student_profiles (
              id,
              full_name,
              ic_number,
              gender
            )
          `)
          .eq('school_id', schoolId)
          .eq('academic_year', currentAcademicYear)
          .eq('is_active', true),

        supabase
          .from('exam_configs')
          .select('id, grade_label, exam_key, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', currentAcademicYear)
          .eq('exam_key', examKey)
          .eq('is_active', true),
      ])

      if (classError) throw classError
      if (subjectError) throw subjectError
      if (enrollmentError) throw enrollmentError
      if (examConfigError) throw examConfigError

      const classById = new Map(
        (classRows || []).map((classRow) => [String(classRow.id), classRow])
      )
      const activeExamGradeSet = new Set(
        (examConfigRows || []).map((row) => normalizeGradeLabel(row.grade_label))
      )
      const gradesInTemplate = new Set(
        (enrollmentRows || [])
          .map((enrollment) => classById.get(String(enrollment.class_id))?.tingkatan)
          .map((tingkatan) => normalizeGradeLabel(tingkatan))
          .filter(Boolean)
      )
      const missingActiveExam = Array.from(gradesInTemplate).some(
        (gradeLabel) => !activeExamGradeSet.has(gradeLabel)
      )

      if (!activeExamGradeSet.size || missingActiveExam) {
        alert('Peperiksaan ini belum dibuka oleh admin sekolah.')
        return
      }

      const subjectHeaders = getUniqueSubjectHeaders(normalizeSubjectRows(subjectRows))
      const headers = [...DYNAMIC_BULK_TEMPLATE_HEADERS, ...subjectHeaders]
      const templateRows = (enrollmentRows || [])
        .map((enrollment) => {
          const classRow = classById.get(String(enrollment.class_id))
          const studentProfile = enrollment.student_profiles

          if (!classRow || !studentProfile) return null

          return {
            ic_number: studentProfile.ic_number || '',
            full_name: studentProfile.full_name || '',
            gender: studentProfile.gender || '',
            class_name: classRow.class_name || '',
            tingkatan: classRow.tingkatan || '',
          }
        })
        .filter(Boolean)
        .sort((a, b) => {
          const gradeCompare = normalizeGradeLabel(a.tingkatan).localeCompare(
            normalizeGradeLabel(b.tingkatan),
            'ms',
            { numeric: true, sensitivity: 'base' }
          )

          if (gradeCompare !== 0) return gradeCompare

          const studentCompare = compareStudentsByGenderThenName(a, b)

          if (studentCompare !== 0) return studentCompare

          return String(a.class_name || '').localeCompare(
            String(b.class_name || ''),
            'ms',
            { numeric: true, sensitivity: 'base' }
          )
        })
        .map((row) => [
          row.ic_number,
          row.full_name,
          row.class_name,
          row.tingkatan,
          ...subjectHeaders.map(() => ''),
        ])

      downloadCsv(
        `template_import_pukal_dinamik_${examKey}_${currentAcademicYear}.csv`,
        headers,
        templateRows
      )
    } catch (error) {
      console.error(error)
      alert(`Gagal jana template dinamik: ${error.message}`)
    } finally {
      setDynamicTemplateLoading(false)
    }
  }

  const handleCsvUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setCsvFileName(file.name)

    const text = await file.text()
    const { headers: parsedHeaders, rows } = parseCsvText(text)
    const expectedHeaders =
      importMode === 'bulk_admin' ? BULK_REQUIRED_HEADERS : REQUIRED_HEADERS

    const normalizedHeaders = parsedHeaders.map((header) =>
      String(header || '').trim().toLowerCase()
    )

    const errors = validateCsvData(normalizedHeaders, rows, expectedHeaders)

    setCsvRows(rows)
    setCsvErrors(errors)
    setImportSummary(null)
  }

  const handleBulkCsvFileChange = async (event) => {
    const file = event.target.files?.[0]
    setBulkCsvFile(file || null)
    setBulkPreviewRows([])
    setBulkCsvFormat('')
    setBulkSubjectHeaders([])
    setBulkImportErrors([])
    setBulkImportSummary(null)

    if (!file) return

    const text = await file.text()
    const { headers: parsedHeaders, rawHeaders, rows } = parseCsvText(text)
    const detectedFormat = detectBulkCsvFormat(parsedHeaders, rawHeaders)

    setBulkCsvFormat(detectedFormat.format)
    setBulkSubjectHeaders(detectedFormat.subjectHeaders)

    if (detectedFormat.errors.length > 0) {
      setBulkImportErrors(detectedFormat.errors)
      return
    }

    if (detectedFormat.format === 'dynamic') {
      const subjectLookup = buildSubjectLookupMaps(subjects)
      const unknownSubjectHeaders = detectedFormat.subjectHeaders.filter(
        (header) => !subjectLookup.byHeader.has(normalizeSubjectLookupText(header.label))
      )

      if (unknownSubjectHeaders.length > 0) {
        setBulkImportErrors(
          unknownSubjectHeaders.map(
            (header) =>
              `Subjek '${header.label}' tidak ditemui dalam senarai subjek aktif.`
          )
        )
        return
      }
    }

    setBulkPreviewRows(rows)
  }

  const importCsvToSupabase = async () => {
    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return
    }

    if (!selectedClassData?.id || !selectedClassData?.tingkatan) {
      alert('Sila pilih kelas dahulu sebelum import CSV.')
      return
    }

    if (!csvRows.length) {
      alert('Tiada data CSV untuk diimport.')
      return
    }

    if (csvImportPolicy === 'strict' && csvErrors.length > 0) {
      alert('Sila betulkan ralat CSV dahulu sebelum import.')
      return
    }

    setImportingCsv(true)
    setImportSummary(null)

    try {
      const currentYear =
        setupConfig?.current_academic_year || new Date().getFullYear()
      const schoolId = profile.school_id

      const [
        { data: setupConfigRows, error: setupConfigError },
        { data: examConfigData, error: examConfigError },
        { data: gradeScalesData, error: gradeScalesError },
      ] = await Promise.all([
        supabase
          .from('school_setup_configs')
          .select('*')
          .eq('school_id', schoolId)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1),

        supabase
          .from('exam_configs')
          .select('grade_label, exam_key, exam_name, exam_order, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', currentYear),

        supabase
          .from('grade_scales')
          .select('*')
          .eq('school_id', schoolId),
      ])

      if (setupConfigError) throw setupConfigError
      if (examConfigError) throw examConfigError
      if (gradeScalesError) throw gradeScalesError

      const normalizedSetupConfig = normalizeSetupConfigWithExamConfigs(
        setupConfigRows?.[0] || null,
        examConfigData || []
      )

      const targetRows = []
      const scoreRows = []
      const importErrors = []
      const skippedRows = []
      const successRows = []

      const resolvedRows = []

      csvRows.forEach((row) => {
        const csvSubject = normalizeText(row.subjek)
        const examKey = normalizeExamKey(row.jenis_peperiksaan)
        const matchedSubject = resolveSubjectFromCsvRow(csvSubject)
        const matchedStudent = displayedStudentLookupByIc.get(normalizeIC(row.no_ic))

        if (!matchedSubject) {
          importErrors.push(
            `Baris ${row.__rowNumber}: subjek '${csvSubject}' tidak sepadan dengan ${selectedClassData.tingkatan}`
          )
          return
        }

        if (!allowedExamKeysForSelectedGrade.has(examKey)) {
          importErrors.push(
            `Baris ${row.__rowNumber}: peperiksaan '${examKey}' tidak dibenarkan untuk ${selectedClassData.tingkatan}`
          )
          return
        }

        if (
          selectedSubjectData &&
          String(matchedSubject.id) !== String(selectedSubjectData.id)
        ) {
          importErrors.push(
            `Baris ${row.__rowNumber}: subjek CSV '${csvSubject}' tidak sama dengan subjek dipilih '${selectedSubjectData.subject_name}'`
          )
          return
        }

        if (!matchedStudent) {
          importErrors.push(
            `Baris ${row.__rowNumber}: murid dengan IC '${row.no_ic}' tidak dijumpai dalam paparan subjek ini`
          )
          return
        }

        if (!displayedStudentIdSet.has(String(matchedStudent.student_id))) {
          importErrors.push(
            `Baris ${row.__rowNumber}: murid dengan IC '${row.no_ic}' tidak dijumpai dalam paparan subjek ini`
          )
          return
        }

        resolvedRows.push({
          ...row,
          __matchedStudent: matchedStudent,
          __resolvedSubject: matchedSubject,
          __resolvedExamKey: examKey,
        })
      })

      if (importErrors.length > 0) {
        setCsvErrors(importErrors)
        setImportSummary({
          success: false,
          importedTargets: 0,
          importedScores: 0,
          generatedOtrs: 0,
          successCount: 0,
          skippedCount: 0,
          failedCount: importErrors.length,
          errors: importErrors,
        })
        alert('Import dihentikan kerana ada subjek, peperiksaan, atau murid yang tidak sepadan dengan kelas dipilih.')
        return
      }

      const distinctResolvedSubjectIds = Array.from(
        new Set(resolvedRows.map((row) => row.__resolvedSubject?.id).filter(Boolean))
      )

      if (distinctResolvedSubjectIds.length > 1) {
        const subjectErrors = [
          'CSV ini mengandungi lebih daripada satu subjek. Sila import satu subjek bagi satu masa.',
        ]

        setCsvErrors(subjectErrors)
        setImportSummary({
          success: false,
          importedTargets: 0,
          importedScores: 0,
          generatedOtrs: 0,
          successCount: 0,
          skippedCount: 0,
          failedCount: 1,
          errors: subjectErrors,
        })
        alert(subjectErrors[0])
        return
      }

      const targetPairs = new Map()

      for (const row of resolvedRows) {
        const rowNumber = row.__rowNumber
        const ic = normalizeIC(row.no_ic)
        const examKey = row.__resolvedExamKey
        const mark = Number(row.markah)
        const subject = row.__resolvedSubject
        const matchedStudent = row.__matchedStudent

        if (!row.nama_murid || !ic || !examKey || row.markah === '') {
          const message = `Baris ${rowNumber}: data asas CSV tidak lengkap.`
          if (csvImportPolicy === 'strict') {
            importErrors.push(message)
          } else {
            skippedRows.push(message)
          }
          continue
        }

        if (Number.isNaN(mark) || mark < 0 || mark > 100) {
          const message = `Baris ${rowNumber}: markah tidak sah.`
          if (csvImportPolicy === 'strict') {
            importErrors.push(message)
          } else {
            skippedRows.push(message)
          }
          continue
        }

        if (!isAllowedExamKey(examKey)) {
          const message = `Baris ${rowNumber}: jenis peperiksaan '${examKey}' tidak sah.`
          if (csvImportPolicy === 'strict') {
            importErrors.push(message)
          } else {
            skippedRows.push(message)
          }
          continue
        }

        const classId = selectedClassData.id
        const tingkatan = selectedClassData.tingkatan || ''
        const matchedExamConfig = getMatchedExamConfig(examConfigData || [], tingkatan, examKey)

        if (isScoreExamKey(examKey) && !matchedExamConfig?.id) {
          const message = `Baris ${rowNumber}: konfigurasi peperiksaan '${examKey}' tidak ditemui untuk ${tingkatan}`
          if (csvImportPolicy === 'strict') {
            importErrors.push(message)
          } else {
            skippedRows.push(message)
          }
          continue
        }

        if (examKey === 'ETR') {
          targetRows.push({
            school_id: schoolId,
            academic_year: currentYear,
            student_enrollment_id: matchedStudent.enrollment_id,
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
            student_profile_id: matchedStudent.student_profile_id,
            updated_at: new Date().toISOString(),
          })

          const pairKey = `${matchedStudent.enrollment_id}__${subject.id}`
          const existing = targetPairs.get(pairKey) || {
            school_id: schoolId,
            academic_year: currentYear,
            student_enrollment_id: matchedStudent.enrollment_id,
            student_profile_id: matchedStudent.student_profile_id,
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
            student_enrollment_id: matchedStudent.enrollment_id,
            class_id: classId,
            subject_id: subject.id,
            exam_config_id: matchedExamConfig.id,
            exam_key: examKey,
            mark,
            grade_name: gradeInfo.grade_name,
            grade_point: gradeInfo.grade_point,
            is_absent: false,
            remarks: null,
            entered_by: profile.id,
            verified_by: null,
            verified_at: null,
            student_profile_id: matchedStudent.student_profile_id,
            updated_at: new Date().toISOString(),
          })

          if (examKey === 'TOV') {
            const pairKey = `${matchedStudent.enrollment_id}__${subject.id}`
            const existing = targetPairs.get(pairKey) || {
              school_id: schoolId,
              academic_year: currentYear,
              student_enrollment_id: matchedStudent.enrollment_id,
              student_profile_id: matchedStudent.student_profile_id,
              class_id: classId,
              subject_id: subject.id,
              tingkatan,
              tov_mark: null,
              etr_mark: null,
            }

            existing.tov_mark = mark
            targetPairs.set(pairKey, existing)
          }
        }

        successRows.push(`Baris ${rowNumber}: berjaya diproses.`)
      }

      if (csvImportPolicy === 'strict' && importErrors.length > 0) {
        setImportSummary({
          success: false,
          importedTargets: 0,
          importedScores: 0,
          generatedOtrs: 0,
          successCount: 0,
          skippedCount: 0,
          failedCount: importErrors.length,
          errors: importErrors,
        })
        setImportingCsv(false)
        return
      }

      if (targetRows.length > 0) {
        const { error: targetError } = await supabase
          .from('student_targets')
          .upsert(targetRows, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
          })

        if (targetError) throw targetError
      }

      if (scoreRows.length > 0) {
        const { error: scoreError } = await supabase
          .from('student_scores')
          .upsert(scoreRows, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,exam_key',
          })

        if (scoreError) throw scoreError
      }

      const otrRows = []

      for (const [, pair] of targetPairs.entries()) {
        if (pair.tov_mark !== null && pair.etr_mark !== null) {
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
            setupConfig: normalizedSetupConfig,
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
        successCount: successRows.length,
        skippedCount: skippedRows.length,
        failedCount: csvImportPolicy === 'strict' ? importErrors.length : skippedRows.length,
        errors: csvImportPolicy === 'strict' ? importErrors : skippedRows,
      })

      if (selectedClass && selectedSubject && selectedExam) {
        await loadStudentsAndScores()
      }

      if (csvImportPolicy === 'partial') {
        alert(
          `Import selesai. ${successRows.length} baris berjaya diproses, ${skippedRows.length} baris diabaikan.`
        )
      } else {
        alert('Import CSV berjaya disimpan.')
      }
    } catch (error) {
      console.error(error)
      setImportSummary({
        success: false,
        importedTargets: 0,
        importedScores: 0,
        generatedOtrs: 0,
        successCount: 0,
        skippedCount: 0,
        failedCount: 1,
        errors: [error.message || 'Import gagal.'],
      })
    } finally {
      setImportingCsv(false)
    }
  }

  const handleBulkAdminImport = async () => {
    if (!isSchoolAdmin) {
      alert('Hanya school admin dibenarkan menggunakan import pukal admin.')
      return
    }

    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return
    }

    if (!bulkPreviewRows.length) {
      alert('Tiada data CSV untuk diimport.')
      return
    }

    if (bulkCsvFormat === 'dynamic' && !normalizeExamKey(selectedExam)) {
      alert('Sila pilih peperiksaan dahulu sebelum import format dinamik.')
      return
    }

    setBulkImportLoading(true)
    setBulkImportErrors([])
    setBulkImportSummary(null)

    try {
      const currentAcademicYear =
        setupConfig?.current_academic_year || new Date().getFullYear()
      const schoolId = profile.school_id
      const selectedDynamicExamKey = normalizeExamKey(selectedExam)

      const errors = []
      const scoreRowsToUpsert = []
      const targetRowsToUpsert = []
      const otrCandidatePairs = new Map()
      const activeExamConfigCache = new Map()
      let processedCount = 0

      const classById = new Map(
        (classes || []).map((item) => [String(item.id), item])
      )
      const enrollmentByClassAndIc = new Map()
      const enrollmentByGradeAndIc = new Map()
      const subjectLookups = buildSubjectLookupMaps(subjects)
      const studentSubjectEnrollmentSet = new Set(
        (studentSubjectEnrollments || [])
          .filter(
            (row) =>
              Number(row.academic_year) === Number(currentAcademicYear) &&
              row.is_active === true
          )
          .map(
            (row) =>
              `${String(row.student_enrollment_id)}__${String(row.subject_id)}`
          )
      )

      ;(allEnrollments || []).forEach((enrollment) => {
        const classRow = classById.get(String(enrollment.class_id))
        const studentProfile = enrollment.student_profiles

        if (!classRow || !studentProfile) return

        const tingkatan = classRow.tingkatan
        const kelas = classRow.class_name
        const normalizedIc = normalizeIC(studentProfile.ic_number)

        if (!tingkatan || !kelas || !normalizedIc) return

        const bundle = {
          enrollment,
          classRow,
          studentProfile,
        }
        const classAliases = [
          kelas,
          `${tingkatan} ${kelas}`,
          getDisplayClassLabel(tingkatan, kelas, levelMappings),
        ].filter(Boolean)

        classAliases.forEach((classAlias) => {
          const classIcKey = `${buildClassLookupKey(tingkatan, classAlias)}__${normalizedIc}`
          enrollmentByClassAndIc.set(classIcKey, bundle)
        })

        const gradeIcKey = buildGradeIcLookupKey(tingkatan, normalizedIc)
        if (!enrollmentByGradeAndIc.has(gradeIcKey)) {
          enrollmentByGradeAndIc.set(gradeIcKey, [])
        }

        enrollmentByGradeAndIc.get(gradeIcKey).push(bundle)
      })

      const getActiveExamConfigForGrade = async (tingkatan, examKey) => {
        const normalizedExamKey = normalizeExamKey(examKey)
        const cacheKey = `${normalizeGradeLabel(tingkatan)}__${normalizedExamKey}`

        if (activeExamConfigCache.has(cacheKey)) {
          return activeExamConfigCache.get(cacheKey)
        }

        const activeExamRows = await loadActiveExamOptions(
          schoolId,
          tingkatan,
          currentAcademicYear
        )
        const matchedExamConfig =
          activeExamRows.find(
            (item) => normalizeExamKey(item.key) === normalizedExamKey
          ) || null

        activeExamConfigCache.set(cacheKey, matchedExamConfig)
        return matchedExamConfig
      }

      const addOtrCandidatePair = ({
        matchedClass,
        matchedStudentEnrollment,
        matchedStudentProfile,
        matchedSubject,
        examKey,
        mark,
      }) => {
        if (examKey !== 'TOV' && examKey !== 'ETR') return

        const pairKey = `${matchedStudentEnrollment.id}__${matchedSubject.id}`
        const existing = otrCandidatePairs.get(pairKey) || {
          school_id: schoolId,
          academic_year: currentAcademicYear,
          student_enrollment_id: matchedStudentEnrollment.id,
          student_profile_id:
            matchedStudentEnrollment.student_profile_id || matchedStudentProfile?.id,
          class_id: matchedClass.id,
          subject_id: matchedSubject.id,
          tingkatan: matchedClass.tingkatan,
          tov_mark: null,
          etr_mark: null,
        }

        if (examKey === 'TOV') existing.tov_mark = mark
        if (examKey === 'ETR') existing.etr_mark = mark

        otrCandidatePairs.set(pairKey, existing)
      }

      const resolveEnrollmentBundle = (row, requireClass) => {
        const rowNumber = row.__rowNumber
        const tingkatan = normalizeText(row.tingkatan)
        const kelas = normalizeText(row.kelas)
        const normalizedIc = normalizeIC(row.no_ic)

        if (!tingkatan) {
          errors.push(`Baris ${rowNumber}: tingkatan kosong`)
          return null
        }

        if (requireClass && !kelas) {
          errors.push(`Baris ${rowNumber}: kelas kosong`)
          return null
        }

        if (!normalizedIc) {
          errors.push(`Baris ${rowNumber}: no_ic kosong`)
          return null
        }

        if (kelas) {
          const classIcKey = `${buildClassLookupKey(tingkatan, kelas)}__${normalizedIc}`
          const matchedBundle = enrollmentByClassAndIc.get(classIcKey) || null

          if (!matchedBundle) {
            errors.push(
              `Baris ${rowNumber}: Murid dengan IC '${row.no_ic}' tidak ditemui untuk kelas dan tingkatan tersebut.`
            )
            return null
          }

          return matchedBundle
        }

        const gradeIcKey = buildGradeIcLookupKey(tingkatan, normalizedIc)
        const candidates = enrollmentByGradeAndIc.get(gradeIcKey) || []

        if (candidates.length === 0) {
          errors.push(
            `Baris ${rowNumber}: Murid dengan IC '${row.no_ic}' tidak ditemui untuk kelas dan tingkatan tersebut.`
          )
          return null
        }

        if (candidates.length > 1) {
          errors.push(`Baris ${rowNumber}: padanan no_ic tidak unik. Sila isi kelas.`)
          return null
        }

        return candidates[0]
      }

      const processMarkCell = async ({
        row,
        matchedBundle,
        subjectHeader,
        markValue,
        examKey,
        allowBlankSkip = false,
      }) => {
        const rowNumber = row.__rowNumber
        const normalizedExamKey = normalizeExamKey(examKey)
        const markRaw = normalizeText(markValue)
        const matchedStudentEnrollment = matchedBundle.enrollment
        const matchedClass = matchedBundle.classRow
        const matchedStudentProfile = matchedBundle.studentProfile
        const studentName =
          matchedStudentProfile?.full_name || normalizeText(row.nama_murid) || 'Murid'
        const subjectLabel = normalizeText(subjectHeader)

        if (!markRaw && allowBlankSkip) return false

        if (!markRaw) {
          errors.push(`Baris ${rowNumber}: markah kosong`)
          return false
        }

        if (!normalizedExamKey) {
          errors.push(`Baris ${rowNumber}: jenis_peperiksaan kosong`)
          return false
        }

        if (!isAllowedExamKey(normalizedExamKey)) {
          errors.push(
            `Baris ${rowNumber}: peperiksaan '${normalizedExamKey}' tidak sah.`
          )
          return false
        }

        const matchedSubject =
          subjectLookups.byHeaderAndGrade.get(
            buildSubjectHeaderLookupKey(subjectLabel, matchedClass.tingkatan)
          ) || null

        if (!matchedSubject) {
          errors.push(
            `Baris ${rowNumber}: Subjek '${subjectLabel}' tidak ditemui dalam senarai subjek aktif.`
          )
          return false
        }

        const mark = Number(markRaw)

        if (Number.isNaN(mark) || mark < 0 || mark > 100) {
          errors.push(
            `Baris ${rowNumber}: Markah untuk ${studentName} - ${subjectLabel} mesti antara 0 hingga 100.`
          )
          return false
        }

        const matchedExamConfig = await getActiveExamConfigForGrade(
          matchedClass.tingkatan,
          normalizedExamKey
        )

        if (!matchedExamConfig?.id) {
          errors.push(
            `Baris ${rowNumber}: Peperiksaan ${normalizedExamKey} belum dibuka oleh admin sekolah.`
          )
          return false
        }

        if (
          isSelectiveSubject(matchedSubject) &&
          !studentSubjectEnrollmentSet.has(
            `${String(matchedStudentEnrollment.id)}__${String(matchedSubject.id)}`
          )
        ) {
          errors.push(
            `Baris ${rowNumber}: murid IC '${matchedStudentProfile?.ic_number || row.no_ic}' tidak didaftarkan untuk subjek '${matchedSubject.subject_name}'`
          )
          return false
        }

        const gradeScalesForTingkatan = (gradeScales || []).filter((grade) => {
          const label =
            grade.tingkatan ??
            grade.grade_label ??
            grade.form_level ??
            grade.level ??
            ''

          return normalizeGradeLabel(label) === normalizeGradeLabel(matchedClass.tingkatan)
        })
        const gradeInfo = findGradeFromMark(mark, gradeScalesForTingkatan)

        if (normalizedExamKey === 'ETR') {
          targetRowsToUpsert.push({
            school_id: schoolId,
            academic_year: currentAcademicYear,
            class_id: matchedClass.id,
            student_enrollment_id: matchedStudentEnrollment.id,
            student_profile_id: matchedStudentEnrollment.student_profile_id,
            subject_id: matchedSubject.id,
            target_key: 'ETR',
            target_mark: mark,
            grade_name: null,
            grade_point: null,
            generated_by_system: false,
            manually_adjusted: false,
            remarks: null,
            entered_by: profile.id,
            updated_at: new Date().toISOString(),
          })
        } else if (isScoreExamKey(normalizedExamKey)) {
          scoreRowsToUpsert.push({
            school_id: schoolId,
            academic_year: currentAcademicYear,
            class_id: matchedClass.id,
            student_enrollment_id: matchedStudentEnrollment.id,
            student_profile_id: matchedStudentEnrollment.student_profile_id,
            subject_id: matchedSubject.id,
            exam_config_id: matchedExamConfig.id,
            exam_key: normalizedExamKey,
            mark,
            grade_name: gradeInfo.grade_name,
            grade_point: gradeInfo.grade_point,
            is_absent: false,
            remarks: null,
            entered_by: profile.id,
            verified_by: null,
            verified_at: null,
            updated_at: new Date().toISOString(),
          })
        }

        addOtrCandidatePair({
          matchedClass,
          matchedStudentEnrollment,
          matchedStudentProfile,
          matchedSubject,
          examKey: normalizedExamKey,
          mark,
        })

        processedCount += 1
        return true
      }

      for (const row of bulkPreviewRows) {
        const matchedBundle = resolveEnrollmentBundle(
          row,
          bulkCsvFormat === 'dynamic'
        )

        if (!matchedBundle) continue

        if (bulkCsvFormat === 'dynamic') {
          for (const subjectHeader of bulkSubjectHeaders) {
            await processMarkCell({
              row,
              matchedBundle,
              subjectHeader: subjectHeader.label,
              markValue: row[subjectHeader.rowKey],
              examKey: selectedDynamicExamKey,
              allowBlankSkip: true,
            })
          }

          continue
        }

        await processMarkCell({
          row,
          matchedBundle,
          subjectHeader: row.subjek,
          markValue: row.markah,
          examKey: row.jenis_peperiksaan,
          allowBlankSkip: false,
        })
      }

      let savedCount = 0

      if (targetRowsToUpsert.length > 0) {
        const { error: targetError } = await supabase
          .from('student_targets')
          .upsert(targetRowsToUpsert, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
          })

        if (targetError) throw targetError

        savedCount += targetRowsToUpsert.length
      }

      if (scoreRowsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('student_scores')
          .upsert(scoreRowsToUpsert, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,exam_key',
          })

        if (upsertError) throw upsertError

        savedCount += scoreRowsToUpsert.length
      }

      const otrRowsToUpsert = []

      if (otrCandidatePairs.size > 0 && shouldAutoRecalculateOtrs(setupConfig)) {
        const pairs = Array.from(otrCandidatePairs.values())
        const enrollmentIds = [
          ...new Set(pairs.map((pair) => pair.student_enrollment_id).filter(Boolean)),
        ]
        const subjectIds = [
          ...new Set(pairs.map((pair) => pair.subject_id).filter(Boolean)),
        ]

        if (pairs.some((pair) => pair.tov_mark === null) && enrollmentIds.length && subjectIds.length) {
          const { data: tovRows, error: tovError } = await supabase
            .from('student_scores')
            .select('student_enrollment_id, subject_id, mark')
            .eq('school_id', schoolId)
            .eq('academic_year', currentAcademicYear)
            .eq('exam_key', 'TOV')
            .in('student_enrollment_id', enrollmentIds)
            .in('subject_id', subjectIds)

          if (tovError) throw tovError

          const tovMap = new Map(
            (tovRows || []).map((row) => [
              `${row.student_enrollment_id}__${row.subject_id}`,
              row.mark,
            ])
          )

          pairs.forEach((pair) => {
            if (pair.tov_mark !== null) return
            const key = `${pair.student_enrollment_id}__${pair.subject_id}`
            const tovMark = tovMap.get(key)
            if (tovMark !== undefined && tovMark !== null && tovMark !== '') {
              pair.tov_mark = tovMark
            }
          })
        }

        if (pairs.some((pair) => pair.etr_mark === null) && enrollmentIds.length && subjectIds.length) {
          const { data: etrRows, error: etrError } = await supabase
            .from('student_targets')
            .select('student_enrollment_id, subject_id, target_mark')
            .eq('school_id', schoolId)
            .eq('academic_year', currentAcademicYear)
            .eq('target_key', 'ETR')
            .in('student_enrollment_id', enrollmentIds)
            .in('subject_id', subjectIds)

          if (etrError) throw etrError

          const etrMap = new Map(
            (etrRows || []).map((row) => [
              `${row.student_enrollment_id}__${row.subject_id}`,
              row.target_mark,
            ])
          )

          pairs.forEach((pair) => {
            if (pair.etr_mark !== null) return
            const key = `${pair.student_enrollment_id}__${pair.subject_id}`
            const etrMark = etrMap.get(key)
            if (etrMark !== undefined && etrMark !== null && etrMark !== '') {
              pair.etr_mark = etrMark
            }
          })
        }

        pairs.forEach((pair) => {
          if (pair.tov_mark === null || pair.etr_mark === null) return

          otrRowsToUpsert.push(
            ...generateOtrRows({
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
              setupConfig,
            })
          )
        })
      }

      if (otrRowsToUpsert.length > 0) {
        const { error: otrError } = await supabase
          .from('student_targets')
          .upsert(otrRowsToUpsert, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
          })

        if (otrError) throw otrError
      }

      setBulkImportErrors(errors)
      setBulkImportSummary({
        totalRows: bulkPreviewRows.length,
        validRows: processedCount,
        savedRows: savedCount,
        successCount: savedCount,
        errorRows: errors.length,
        errorCount: errors.length,
        importedScores: scoreRowsToUpsert.length,
        importedTargets: targetRowsToUpsert.length,
        generatedOtrs: otrRowsToUpsert.length,
      })

      if (savedCount > 0 || otrRowsToUpsert.length > 0) {
        await refreshCurrentMarksAndAnalysis()
      }

      if (savedCount > 0 && errors.length === 0) {
        setBulkPreviewRows([])
        setBulkCsvFile(null)
        setBulkCsvFormat('')
        setBulkSubjectHeaders([])
        alert('Import pukal admin berjaya disimpan.')
      } else if (savedCount > 0 && errors.length > 0) {
        alert(`Import pukal admin selesai. ${savedCount} markah berjaya disimpan dan ${errors.length} ralat ditemui.`)
      } else {
        alert('Import pukal admin gagal. Tiada markah berjaya disimpan.')
      }
    } catch (error) {
      console.error(error)
      alert(`Import pukal admin gagal: ${error.message}`)
    } finally {
      setBulkImportLoading(false)
    }
  }

  const handleSave = async () => {
    if (!profile?.school_id || !selectedClass || !selectedSubject || !selectedExam) return

    setSaving(true)

    const schoolId = profile.school_id
    const currentYear = setupConfig?.current_academic_year || new Date().getFullYear()
    let selectedExamConfigId = null

    try {
      let examConfig = await ensureExamConfigRecord({
        schoolId,
        academicYear: currentYear,
        gradeLabel: selectedGradeLabel,
        examKey: selectedExam,
      })

      if (!examConfig) {
        console.warn('exam_config tak jumpa -> fallback guna exam_key sahaja')
      }

      if (examConfig?.is_active === false) {
        setSaving(false)
        alert('Peperiksaan ini belum dibuka atau telah ditutup oleh admin sekolah.')
        return
      }

      selectedExamConfigId = examConfig?.id || null
    } catch (error) {
      setSaving(false)
      console.error('ensureExamConfigRecord error:', error)
      alert('Gagal menyemak status peperiksaan.')
      return
    }

    const gradeScalesForTingkatan = (gradeScales || []).filter((grade) => {
      const label =
        grade.tingkatan ??
        grade.grade_label ??
        grade.form_level ??
        grade.level ??
        ''

      return String(label).trim().toLowerCase() === String(selectedGradeLabel).trim().toLowerCase()
    })

    const payload = displayedStudents
      .filter((student) => {
        if (!displayedEnrollmentIdSet.has(String(student.enrollment_id))) {
          return false
        }

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
          exam_config_id: selectedExamConfigId,
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

    const deleteIds = displayedStudents
      .filter((student) => displayedEnrollmentIdSet.has(String(student.enrollment_id)))
      .map((student) => {
        const existing = scores[student.student_id]
        const rawMark = existing?.mark
        const shouldDelete =
          existing?.id &&
          (rawMark === '' || rawMark === null || rawMark === undefined)

        return shouldDelete ? existing.id : null
      })
      .filter(Boolean)
    const deletedEnrollmentIds = displayedStudents
      .filter((student) => displayedEnrollmentIdSet.has(String(student.enrollment_id)))
      .map((student) => {
        const existing = scores[student.student_id]
        const rawMark = existing?.mark
        const shouldDelete =
          existing?.id &&
          (rawMark === '' || rawMark === null || rawMark === undefined)

        return shouldDelete ? student.enrollment_id : null
      })
      .filter(Boolean)

    if (payload.length === 0 && deleteIds.length === 0) {
      setSaving(false)
      alert('Sila masukkan sekurang-kurangnya satu markah sebelum simpan.')
      return
    }

    const normalizedSelectedExam = normalizeExamKey(selectedExam)
    let error = null

    if (normalizedSelectedExam === 'ETR') {
      if (deleteIds.length > 0) {
        const deleteResult = await supabase
          .from('student_targets')
          .delete()
          .in('id', deleteIds)

        if (deleteResult.error) {
          error = deleteResult.error
        }
      }

      if (!error && deletedEnrollmentIds.length > 0) {
        const otrKeys = getOtrKeysForTingkatan(selectedGradeLabel, setupConfig)

        if (otrKeys.length > 0) {
          const deleteOtrResult = await supabase
            .from('student_targets')
            .delete()
            .eq('school_id', schoolId)
            .eq('academic_year', currentYear)
            .eq('class_id', selectedClass)
            .eq('subject_id', selectedSubject)
            .eq('generated_by_system', true)
            .in('student_enrollment_id', deletedEnrollmentIds)
            .in('target_key', otrKeys)

          if (deleteOtrResult.error) {
            error = deleteOtrResult.error
          }
        }
      }

      const targetPayload = payload.map((row) => ({
        school_id: row.school_id,
        academic_year: row.academic_year,
        student_enrollment_id: row.student_enrollment_id,
        student_profile_id: row.student_profile_id,
        class_id: row.class_id,
        subject_id: row.subject_id,
        target_key: 'ETR',
        target_mark: row.mark,
        grade_name: null,
        grade_point: null,
        generated_by_system: false,
        manually_adjusted: false,
        remarks: null,
        entered_by: row.entered_by,
        updated_at: row.updated_at,
      }))

      if (!error && targetPayload.length > 0) {
        const result = await supabase
          .from('student_targets')
          .upsert(targetPayload, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
          })

        error = result.error
      }

      if (
        !error &&
        targetPayload.length > 0 &&
        shouldAutoRecalculateOtrs(setupConfig)
      ) {
        const enrollmentIds = targetPayload
          .map((row) => row.student_enrollment_id)
          .filter(Boolean)
        const { data: tovRows, error: tovError } = await supabase
          .from('student_scores')
          .select('student_enrollment_id, mark')
          .eq('school_id', schoolId)
          .eq('academic_year', currentYear)
          .eq('class_id', selectedClass)
          .eq('subject_id', selectedSubject)
          .eq('exam_key', 'TOV')
          .in('student_enrollment_id', enrollmentIds)

        if (tovError) {
          error = tovError
        } else {
          const tovByEnrollmentId = new Map(
            (tovRows || []).map((row) => [row.student_enrollment_id, row.mark])
          )
          const generatedOtrRows = []

          targetPayload.forEach((target) => {
            const tovMark = tovByEnrollmentId.get(target.student_enrollment_id)
            if (tovMark === null || tovMark === undefined || tovMark === '') return

            generatedOtrRows.push(
              ...generateOtrRows({
                schoolId,
                academicYear: currentYear,
                studentEnrollmentId: target.student_enrollment_id,
                studentProfileId: target.student_profile_id,
                classId: target.class_id,
                subjectId: target.subject_id,
                enteredBy: profile.id,
                tingkatan: selectedGradeLabel,
                tovMark,
                etrMark: target.target_mark,
                setupConfig,
              })
            )
          })

          if (generatedOtrRows.length > 0) {
            const otrResult = await supabase
              .from('student_targets')
              .upsert(generatedOtrRows, {
                onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
              })

            error = otrResult.error
          }
        }
      }
    } else {
      if (deleteIds.length > 0) {
        const deleteResult = await supabase
          .from('student_scores')
          .delete()
          .in('id', deleteIds)

        if (deleteResult.error) {
          error = deleteResult.error
        }
      }

      if (!error && payload.length > 0) {
        const result = await supabase
          .from('student_scores')
          .upsert(payload, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,exam_key',
          })

        error = result.error
      }
    }

    setSaving(false)

    if (error) {
      const errorMessage = String(error.message || '')
      const friendlyMessage = errorMessage.includes('student_score_history')
        ? 'Markah tidak dapat disimpan/dipadam kerana policy audit student_score_history belum membenarkan rekod sejarah ditulis. Sila kemaskini RLS policy Supabase untuk student_score_history.'
        : error.message || 'Error simpan markah'

      alert(friendlyMessage)
      console.error(error)
      return
    }

    await refreshCurrentMarksAndAnalysis()
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
                <option key={c.id} value={c.id}>
                  {getDisplayClassLabel(c.tingkatan, c.class_name, levelMappings)}
                </option>
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
                  {formatSubjectName(subject.subject_name)}
                </option>
              ))}
            </select>

            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
            >
              {activeExamOptions.length === 0 ? (
                <option value="">Tiada peperiksaan dibuka</option>
              ) : (
                activeExamOptions.map((exam) => (
                  <option key={exam.key} value={exam.key}>
                    {getExamDisplayLabel(exam)}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Import Markah CSV</h2>
              <p className="mt-1 text-sm text-slate-500">
                {importMode === 'bulk_admin'
                  ? 'Gunakan template dinamik untuk isi banyak subjek dalam satu baris murid.'
                  : 'Gunakan template import biasa yang mengandungi nama_murid, no_ic, subjek, jenis_peperiksaan dan markah sahaja. Kelas dan tingkatan tidak perlu kerana konteks sudah dipilih pada halaman ini.'}
              </p>
            </div>

            {importMode === 'normal' && (
              <button
                type="button"
                onClick={downloadTemplateCsv}
                className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100"
              >
                Muat Turun Template Import Biasa
              </button>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportMode('normal')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                importMode === 'normal'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              Mode Biasa
            </button>

            {isSchoolAdmin && (
              <button
                type="button"
                onClick={() => setImportMode('bulk_admin')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  importMode === 'bulk_admin'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-700'
                }`}
              >
                Mode Pukal Admin
              </button>
            )}
          </div>

          {importMode === 'normal' && (
            <>
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

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Mode Import</p>
            <div className="mt-3 flex flex-col gap-3 md:flex-row">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="csvImportPolicy"
                  value="strict"
                  checked={csvImportPolicy === 'strict'}
                  onChange={(e) => setCsvImportPolicy(e.target.value)}
                />
                Strict - hentikan import jika ada ralat
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="csvImportPolicy"
                  value="partial"
                  checked={csvImportPolicy === 'partial'}
                  onChange={(e) => setCsvImportPolicy(e.target.value)}
                />
                Partial - import data yang valid sahaja, abaikan baris ralat
              </label>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={importCsvToSupabase}
              disabled={!csvFileName || importingCsv || csvRows.length === 0}
              className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:opacity-80"
            >
              {importingCsv ? 'Sedang Import...' : 'Import Data'}
            </button>
          </div>

          {importSummary && (
            <div
              className={`mt-4 rounded-2xl border p-4 text-sm ${
                importSummary.success
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <p className="font-semibold">
                {importSummary.success ? 'Import selesai.' : 'Import gagal / ada ralat.'}
              </p>

              <div className="mt-2 space-y-1">
                <p>Skor berjaya diimport: {importSummary.importedScores}</p>
                <p>ETR berjaya diimport: {importSummary.importedTargets}</p>
                <p>OTR dijana automatik: {importSummary.generatedOtrs}</p>
                <p>Baris berjaya diproses: {importSummary.successCount || 0}</p>
                <p>Baris diabaikan / gagal: {importSummary.failedCount || 0}</p>
              </div>

              {importSummary.errors?.length > 0 && (
                <div className="mt-3">
                  <p className="font-medium">Butiran ralat / baris diabaikan:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {importSummary.errors.slice(0, 20).map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>

                  {importSummary.errors.length > 20 && (
                    <p className="mt-2 text-xs">
                      Preview memaparkan 20 ralat pertama sahaja.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
            </>
          )}

          {importMode === 'bulk_admin' && isSchoolAdmin && (
            <div className="mt-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  Import Pukal Admin
                </h2>
                <span className="inline-block rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
                  Admin Sahaja
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Template dinamik menggunakan satu baris untuk setiap murid. Column subjek akan
                mengikut subjek aktif yang didaftarkan oleh admin sekolah.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,360px)_auto] md:items-end md:justify-start">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Peperiksaan Import
                  </label>
                  <select
                    value={selectedExam}
                    onChange={(e) => setSelectedExam(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
                  >
                    {activeExamOptions.length === 0 ? (
                      <option value="">Tiada peperiksaan dibuka</option>
                    ) : (
                      activeExamOptions.map((exam) => (
                        <option key={exam.key} value={exam.key}>
                          {getExamDisplayLabel(exam)}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={downloadDynamicBulkTemplateCsv}
                  disabled={!selectedExam || dynamicTemplateLoading}
                  className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {dynamicTemplateLoading ? 'Sedang jana...' : 'Muat Turun Template Dinamik'}
                </button>
              </div>

              {!selectedExam && (
                <p className="mt-2 text-sm text-amber-700">
                  Pilih peperiksaan dahulu untuk muat turun template dinamik atau import format dinamik.
                </p>
              )}

              <div className="mt-4">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleBulkCsvFileChange}
                  className="block w-full text-sm text-slate-700"
                />
                {bulkCsvFile && (
                  <p className="mt-2 text-sm text-slate-500">
                    Fail dipilih: <strong>{bulkCsvFile.name}</strong>
                    {bulkCsvFormat && (
                      <>
                        {' '}
                        <span className="font-semibold">
                          ({bulkCsvFormat === 'dynamic' ? 'format dinamik' : 'format lama'})
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div ref={bulkImportResultRef}>
                {bulkImportSummary && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="mb-3 text-base font-extrabold text-emerald-800">Ringkasan Import</div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-emerald-100 bg-white p-3">
                        <div className="mb-1.5 text-xs text-slate-500">Jumlah baris CSV</div>
                        <div className="text-2xl font-extrabold text-slate-900">{bulkImportSummary.totalRows}</div>
                      </div>

                      <div className="rounded-xl border border-emerald-100 bg-white p-3">
                        <div className="mb-1.5 text-xs text-slate-500">Baris valid</div>
                        <div className="text-2xl font-extrabold text-emerald-700">{bulkImportSummary.validRows}</div>
                      </div>

                      <div className="rounded-xl border border-emerald-100 bg-white p-3">
                        <div className="mb-1.5 text-xs text-slate-500">Berjaya disimpan</div>
                        <div className="text-2xl font-extrabold text-emerald-700">{bulkImportSummary.savedRows ?? bulkImportSummary.successCount}</div>
                      </div>

                      <div className="rounded-xl border border-emerald-100 bg-white p-3">
                        <div className="mb-1.5 text-xs text-slate-500">Jumlah ralat</div>
                        <div className="text-2xl font-extrabold text-red-700">{bulkImportSummary.errorRows ?? bulkImportSummary.errorCount}</div>
                      </div>
                    </div>
                  </div>
                )}

                {bulkImportErrors.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                    <div className="mb-1 text-base font-extrabold text-red-800">Ralat Import</div>
                    <div className="mb-3 text-sm text-red-900">
                      Baris berikut tidak disimpan. Sila semak dan betulkan CSV jika perlu.
                    </div>

                    <ul className="m-0 list-disc space-y-1.5 pl-5 text-sm text-red-700">
                      {bulkImportErrors.slice(0, 20).map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>

                    {bulkImportErrors.length > 20 && (
                      <div className="mt-2 text-sm font-bold text-red-900">
                        Dan {bulkImportErrors.length - 20} ralat lagi...
                      </div>
                    )}
                  </div>
                )}
              </div>

              {bulkPreviewRows.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    {bulkCsvFormat === 'dynamic' ? (
                      <>
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left">No IC</th>
                            <th className="px-3 py-2 text-left">Nama</th>
                            <th className="px-3 py-2 text-left">Kelas</th>
                            <th className="px-3 py-2 text-left">Tingkatan</th>
                            {bulkSubjectHeaders.slice(0, 10).map((header) => (
                              <th key={header.rowKey} className="px-3 py-2 text-left">
                                {header.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bulkPreviewRows.slice(0, 20).map((row) => (
                            <tr key={row.__rowNumber} className="border-t border-slate-100">
                              <td className="px-3 py-2">{row.no_ic}</td>
                              <td className="px-3 py-2">{row.nama_murid}</td>
                              <td className="px-3 py-2">{row.kelas}</td>
                              <td className="px-3 py-2">{getDisplayLevel(row.tingkatan, levelMappings)}</td>
                              {bulkSubjectHeaders.slice(0, 10).map((header) => (
                                <td key={header.rowKey} className="px-3 py-2">
                                  {row[header.rowKey]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </>
                    ) : (
                      <>
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Tingkatan</th>
                            <th className="px-3 py-2 text-left">Kelas</th>
                            <th className="px-3 py-2 text-left">No IC</th>
                            <th className="px-3 py-2 text-left">Nama</th>
                            <th className="px-3 py-2 text-left">Subjek</th>
                            <th className="px-3 py-2 text-left">Peperiksaan</th>
                            <th className="px-3 py-2 text-left">Markah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkPreviewRows.slice(0, 20).map((row) => (
                            <tr key={row.__rowNumber} className="border-t border-slate-100">
                              <td className="px-3 py-2">{getDisplayLevel(row.tingkatan, levelMappings)}</td>
                              <td className="px-3 py-2">{row.kelas}</td>
                              <td className="px-3 py-2">{row.no_ic}</td>
                              <td className="px-3 py-2">{row.nama_murid}</td>
                              <td className="px-3 py-2">{row.subjek}</td>
                              <td className="px-3 py-2">{row.jenis_peperiksaan}</td>
                              <td className="px-3 py-2">{row.markah}</td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}
                  </table>
                  {bulkCsvFormat === 'dynamic' && bulkSubjectHeaders.length > 10 && (
                    <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                      Preview memaparkan 10 column subjek pertama sahaja.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleBulkAdminImport}
                  disabled={
                    bulkImportLoading ||
                    !bulkPreviewRows.length ||
                    (bulkCsvFormat === 'dynamic' && !selectedExam)
                  }
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkImportLoading ? 'Sedang import...' : 'Simpan Import Pukal Admin'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div ref={studentListRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Senarai Murid & Markah</h2>
            <span className="text-sm text-slate-500">Jumlah murid: {visibleStudents.length}</span>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowIncompleteOnly(false)}
              className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                !showIncompleteOnly
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-900'
              }`}
            >
              Semua Murid
            </button>

            <button
              type="button"
              onClick={() => setShowIncompleteOnly(true)}
              className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                showIncompleteOnly
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-900'
              }`}
            >
              Belum Isi Sahaja
            </button>
          </div>

          {visibleStudents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              {showIncompleteOnly && displayedStudents.length > 0
                ? `Semua murid bagi ${selectedSubjectLabel || 'subjek ini'} di ${selectedClassLabel || 'kelas ini'} sudah mempunyai markah.`
                : isSelectiveSubject(selectedSubjectData)
                ? `Tiada murid didaftarkan untuk ${selectedSubjectLabel || 'subjek ini'} di ${selectedClassLabel || 'kelas ini'} lagi. Sila urus murid subjek dahulu.`
                : 'Tiada murid untuk dipaparkan.'}
            </div>
          ) : (
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
                  {sortedStudents.map((student, index) => {
                    const isIncomplete = incompleteStudentIds.includes(student.enrollment_id)
                    const currentExamKey = normalizeExamKey(selectedExam)
                    const guideLabel = getGuideLabel(currentExamKey)
                    const enrollmentId =
                      student.student_enrollment_id || student.enrollment_id || student.id
                    const guideMark = guideMarks[enrollmentId]
                    const guideText =
                      guideMark === null || guideMark === undefined || guideMark === ''
                        ? `${guideLabel} belum diisi`
                        : `${guideLabel}: ${guideMark}`

                    return (
                    <tr
                      key={student.student_id}
                      className="border-b"
                      style={{ background: isIncomplete ? '#fef2f2' : '#ffffff' }}
                    >
                      <td className="px-3 py-3 text-slate-700">{index + 1}</td>
                      <td className="px-3 py-3 text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{student.full_name}</span>
                          {isIncomplete && (
                            <span
                              title="Belum isi"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700"
                            >
                              !
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{student.ic_number}</td>

                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {currentExamKey === 'ETR' && (
                            <div className="min-w-[108px] rounded-[10px] border border-slate-300 bg-slate-50 px-[10px] py-2 text-center text-xs font-bold leading-tight text-slate-600">
                              {guideText}
                            </div>
                          )}

                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={scores[student.student_id]?.mark ?? ''}
                            onFocus={() => setEditingStudentId(student.student_id)}
                            onBlur={() => setEditingStudentId(null)}
                            onChange={(e) => handleScoreChange(student.student_id, e.target.value)}
                            className="w-28 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                          />

                          {currentExamKey === 'TOV' && (
                            <div className="min-w-[108px] rounded-[10px] border border-emerald-200 bg-emerald-50 px-[10px] py-2 text-center text-xs font-bold leading-tight text-emerald-700">
                              {guideText}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !selectedExam || activeExamOptions.length === 0}
            className="mt-5 rounded-xl bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Markah'}
          </button>
        </div>

        <ClassSubjectAnalysisPanel
          schoolId={profile?.school_id}
          classId={selectedClass}
          subjectId={selectedSubject}
          refreshKey={analysisRefreshKey}
        />
      </div>
    </div>
  )
}
