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
import {
  canInputExamMark,
  getSubjectRuleName,
} from '../lib/ssemjSubjectRules.js'

const BULK_REQUIRED_HEADERS = [
  'tingkatan',
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

const ABSENT_MARK_TEXT = 'TH'

const normalizeText = (value) =>
  String(value ?? '').trim()

const isAbsentMarkInput = (value) =>
  normalizeText(value).toUpperCase() === ABSENT_MARK_TEXT

const isBlankMarkInput = (value) =>
  value === '' || value === null || value === undefined

const normalizeScoreInputValue = (value) =>
  isAbsentMarkInput(value) ? ABSENT_MARK_TEXT : value

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

const formatIcForCsvTemplate = (icNumber) => {
  const normalizedIc = normalizeIC(icNumber)
  return normalizedIc ? `="${normalizedIc}"` : ''
}

const formatIcForErrorCsv = (icNumber) =>
  normalizeIC(icNumber) ? formatIcForCsvTemplate(icNumber) : normalizeText(icNumber)

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

const getBulkImportErrorMessage = (item) =>
  typeof item === 'string' ? item : item?.message || 'Ralat import.'

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

const findGradeFromMark = (mark, gradeScales = []) => {
  const numericMark = Number(mark)
  if (Number.isNaN(numericMark)) return { grade_name: null, grade_point: null }

  const matched = gradeScales.find((grade) => {
    const gradeName = String(grade.grade_name ?? grade.grade ?? '').trim().toUpperCase()
    if (gradeName === ABSENT_MARK_TEXT) return false

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
  const [schoolInfo, setSchoolInfo] = useState(null)
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
  const [bulkSelectedExam, setBulkSelectedExam] = useState('')
  const [bulkExamOptions, setBulkExamOptions] = useState([])

  const [students, setStudents] = useState([])
  const [scores, setScores] = useState({})
  const [guideMarks, setGuideMarks] = useState({})
  const [saving, setSaving] = useState(false)
  const [analysisRefreshKey, setAnalysisRefreshKey] = useState(0)
  const [scoresRefreshKey, setScoresRefreshKey] = useState(0)
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false)
  const [editingStudentId, setEditingStudentId] = useState(null)

  const [bulkCsvFile, setBulkCsvFile] = useState(null)
  const [bulkPreviewRows, setBulkPreviewRows] = useState([])
  const [bulkCsvFormat, setBulkCsvFormat] = useState('')
  const [bulkSubjectHeaders, setBulkSubjectHeaders] = useState([])
  const [bulkImportErrors, setBulkImportErrors] = useState([])
  const [bulkErrorRows, setBulkErrorRows] = useState([])
  const [bulkImportSummary, setBulkImportSummary] = useState(null)
  const [bulkImportPlan, setBulkImportPlan] = useState(null)
  const [bulkImportLoading, setBulkImportLoading] = useState(false)
  const [dynamicTemplateLoading, setDynamicTemplateLoading] = useState(false)
  const [searchParams] = useSearchParams()
  const appliedPrefillExamKeyRef = useRef('')
  const appliedBulkPrefillExamKeyRef = useRef('')

  const dashboardPath = getDashboardPath(profile)
  const isSchoolAdmin =
    profile?.role === 'school_admin' || profile?.is_school_admin === true
  const prefillClassId = searchParams.get('class_id') || ''
  const prefillSubjectName = searchParams.get('subject_name') || ''
  const prefillExamKey = searchParams.get('exam_key') || ''
  const normalizedPrefillExamKey = normalizeExamKey(prefillExamKey)
  const showIncompleteOnlyFromUrl = searchParams.get('show') === 'incomplete'

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    if (!bulkImportSummary && bulkImportErrors.length === 0) return

    bulkImportResultRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [bulkImportSummary, bulkImportErrors])

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

  const inputExamSubjects = useMemo(
    () =>
      subjects.filter((subject) =>
        canInputExamMark({
          schoolInfo,
          tingkatan: subject?.tingkatan,
          subjectName: getSubjectRuleName(subject),
          examKey: selectedExam,
        })
      ),
    [subjects, schoolInfo, selectedExam]
  )

  const bulkInputExamSubjects = useMemo(
    () =>
      subjects.filter((subject) =>
        canInputExamMark({
          schoolInfo,
          tingkatan: subject?.tingkatan,
          subjectName: getSubjectRuleName(subject),
          examKey: bulkSelectedExam,
        })
      ),
    [subjects, schoolInfo, bulkSelectedExam]
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
    () =>
      inputExamSubjects.find((item) => String(item.id) === String(selectedSubject)) ||
      null,
    [inputExamSubjects, selectedSubject]
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

  const displayedEnrollmentIdSet = useMemo(() => {
    return new Set(
      displayedStudents.map((student) => String(student.enrollment_id))
    )
  }, [displayedStudents])

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
      (exam) => normalizeExamKey(exam.key) === normalizeExamKey(selectedExam)
    )

    if (!examStillValid) {
      setSelectedExam('')
    }
  }, [activeExamOptions, selectedExam])

  useEffect(() => {
    const run = async () => {
      if (!profile?.school_id || !selectedGradeLabel) {
        setActiveExamOptions([])
        if (!normalizedPrefillExamKey) {
          setSelectedExam('')
        }
        return
      }

      try {
        const rows = await loadActiveExamOptions(
          profile.school_id,
          selectedGradeLabel,
          setupConfig?.current_academic_year || new Date().getFullYear(),
        )

        setActiveExamOptions(rows)

        const pendingPrefillExamKey =
          normalizedPrefillExamKey &&
          appliedPrefillExamKeyRef.current !== normalizedPrefillExamKey
            ? normalizedPrefillExamKey
            : ''
        const prefillExam = rows.find(
          (item) => normalizeExamKey(item.key) === pendingPrefillExamKey
        )

        if (prefillExam) {
          appliedPrefillExamKeyRef.current = pendingPrefillExamKey
          setSelectedExam(prefillExam.key)
          return
        }

        const currentSelectedStillValid = rows.some(
          (item) => normalizeExamKey(item.key) === normalizeExamKey(selectedExam)
        )

        if (
          pendingPrefillExamKey &&
          currentSelectedStillValid &&
          normalizeExamKey(selectedExam) === pendingPrefillExamKey
        ) {
          appliedPrefillExamKeyRef.current = pendingPrefillExamKey
          return
        }

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
  }, [
    normalizedPrefillExamKey,
    profile?.school_id,
    selectedGradeLabel,
    setupConfig?.current_academic_year,
    selectedExam,
  ])

  useEffect(() => {
    const run = async () => {
      if (!isSchoolAdmin || !profile?.school_id) {
        setBulkExamOptions([])
        setBulkSelectedExam('')
        return
      }

      try {
        const rows = await loadActiveExamOptions(
          profile.school_id,
          '',
          setupConfig?.current_academic_year || new Date().getFullYear(),
          { includeAllGrades: true }
        )

        setBulkExamOptions(rows)

        const pendingPrefillExamKey =
          normalizedPrefillExamKey &&
          appliedBulkPrefillExamKeyRef.current !== normalizedPrefillExamKey
            ? normalizedPrefillExamKey
            : ''
        const prefillExam = rows.find(
          (item) => normalizeExamKey(item.key) === pendingPrefillExamKey
        )

        if (prefillExam) {
          appliedBulkPrefillExamKeyRef.current = pendingPrefillExamKey
          setBulkSelectedExam(prefillExam.key)
          return
        }

        const currentSelectedStillValid = rows.some(
          (item) => normalizeExamKey(item.key) === normalizeExamKey(bulkSelectedExam)
        )

        if (
          pendingPrefillExamKey &&
          currentSelectedStillValid &&
          normalizeExamKey(bulkSelectedExam) === pendingPrefillExamKey
        ) {
          appliedBulkPrefillExamKeyRef.current = pendingPrefillExamKey
          return
        }

        if (!currentSelectedStillValid) {
          setBulkSelectedExam(rows[0]?.key || '')
        }
      } catch (err) {
        console.error('loadBulkExamOptions error:', err)
        setBulkExamOptions([])
        setBulkSelectedExam('')
      }
    }

    run()
  }, [
    bulkSelectedExam,
    isSchoolAdmin,
    normalizedPrefillExamKey,
    profile?.school_id,
    setupConfig?.current_academic_year,
  ])

  useEffect(() => {
    appliedPrefillExamKeyRef.current = ''
    appliedBulkPrefillExamKeyRef.current = ''

    if (!normalizedPrefillExamKey) return

    setSelectedExam(normalizedPrefillExamKey)
    setBulkSelectedExam(normalizedPrefillExamKey)
  }, [normalizedPrefillExamKey])

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
          .select('student_enrollment_id, exam_key, exam_config_id, mark, is_absent')
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
          mapped[row.student_enrollment_id] =
            row.is_absent === true ? ABSENT_MARK_TEXT : row.mark
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
      ? inputExamSubjects.filter(
          (subject) =>
            normalizeGradeLabel(subject.tingkatan) === normalizedSelectedGrade
        )
      : inputExamSubjects

    return filteredSubjects.filter(
      (subject, index, arr) =>
        index ===
        arr.findIndex(
          (item) =>
            normalizeCompareText(item.subject_name) ===
            normalizeCompareText(subject.subject_name)
        )
    )
  }, [inputExamSubjects, selectedGradeLabel])

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
    if (!prefillSubjectName || !selectedClassData || !inputExamSubjects.length) return

    const matchedSubject = inputExamSubjects.find(
      (item) =>
        normalizeCompareText(item.subject_name) === normalizeCompareText(prefillSubjectName) &&
        normalizeGradeLabel(item.tingkatan) === normalizeGradeLabel(selectedClassData.tingkatan)
    )

    if (matchedSubject) {
      setSelectedSubject(matchedSubject.id)
    }
  }, [prefillSubjectName, inputExamSubjects, selectedClassData])

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

    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .select('id, school_name, school_code, school_type')
      .eq('id', profileData.school_id)
      .maybeSingle()

    if (schoolError) {
      console.error(schoolError)
    }

    setSchoolInfo(schoolData || null)

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

    const selectedSubjectRecord = inputExamSubjects.find(
      (subject) => String(subject.id) === String(selectedSubject)
    )
    if (!selectedSubjectRecord) {
      setStudents([])
      setScores({})
      return
    }

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
      if (scoreStudentId) {
        scoreMap[scoreStudentId] = s.is_absent === true
          ? { ...s, mark: ABSENT_MARK_TEXT }
          : s
      }
    })

    setScores(scoreMap)
  }

  useEffect(() => {
    loadStudentsAndScores()
  }, [selectedClass, selectedSubject, selectedExam, profile?.school_id, scoresRefreshKey, inputExamSubjects])

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
        mark: normalizeScoreInputValue(value),
      },
    }))
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

    const examKey = normalizeExamKey(bulkSelectedExam)

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

      const subjectHeaders = getUniqueSubjectHeaders(
        normalizeSubjectRows(subjectRows).filter((subject) =>
          canInputExamMark({
            schoolInfo,
            tingkatan: subject?.tingkatan,
            subjectName: getSubjectRuleName(subject),
            examKey,
          })
        )
      )
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
          formatIcForCsvTemplate(row.ic_number),
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

  const handleBulkCsvFileChange = async (event) => {
    const file = event.target.files?.[0]
    setBulkCsvFile(file || null)
    setBulkPreviewRows([])
    setBulkCsvFormat('')
    setBulkSubjectHeaders([])
    setBulkImportErrors([])
    setBulkErrorRows([])
    setBulkImportSummary(null)
    setBulkImportPlan(null)

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
      if (!normalizeExamKey(bulkSelectedExam)) {
        setBulkImportErrors([
          'Pilih peperiksaan import dahulu sebelum upload format dinamik.',
        ])
        return
      }

      const subjectLookup = buildSubjectLookupMaps(bulkInputExamSubjects)
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

  const validateBulkAdminImportBasics = () => {
    if (!isSchoolAdmin) {
      alert('Hanya school admin dibenarkan menggunakan import pukal admin.')
      return false
    }

    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return false
    }

    if (!bulkPreviewRows.length) {
      alert('Tiada data CSV untuk diimport.')
      return false
    }

    if (bulkCsvFormat === 'dynamic' && !normalizeExamKey(bulkSelectedExam)) {
      alert('Sila pilih peperiksaan dahulu sebelum import format dinamik.')
      return false
    }

    return true
  }

  const buildBulkImportPlan = async () => {
    const currentAcademicYear =
      setupConfig?.current_academic_year || new Date().getFullYear()
    const schoolId = profile.school_id
    const selectedDynamicExamKey = normalizeExamKey(bulkSelectedExam)

    const errors = []
    const errorRowsByNumber = new Map()
    const scoreRowsToUpsert = []
    const targetRowsToUpsert = []
    const otrCandidatePairs = new Map()
    const activeExamConfigCache = new Map()
    const validRowNumbers = new Set()
    let processedCount = 0

    const recordError = (row, message, details = {}) => {
      const rowNumber = row?.__rowNumber || ''
      const errorItem = {
        rowNumber,
        message,
        row: row || {},
        ...details,
      }

      errors.push(errorItem)

      const key = rowNumber || `error-${errors.length}`
      const existing = errorRowsByNumber.get(key) || {
        rowNumber,
        row: row || {},
        reasons: [],
      }

      existing.reasons.push(message)
      errorRowsByNumber.set(key, existing)
    }

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
        recordError(row, `Baris ${rowNumber}: tingkatan kosong`)
        return null
      }

      if (requireClass && !kelas) {
        recordError(row, `Baris ${rowNumber}: kelas kosong`)
        return null
      }

      if (!normalizedIc) {
        recordError(row, `Baris ${rowNumber}: no_ic kosong`)
        return null
      }

      if (kelas) {
        const classIcKey = `${buildClassLookupKey(tingkatan, kelas)}__${normalizedIc}`
        const matchedBundle = enrollmentByClassAndIc.get(classIcKey) || null

        if (!matchedBundle) {
          recordError(
            row,
            `Baris ${rowNumber}: Murid dengan IC '${row.no_ic}' tidak ditemui untuk kelas dan tingkatan tersebut.`
          )
          return null
        }

        return matchedBundle
      }

      const gradeIcKey = buildGradeIcLookupKey(tingkatan, normalizedIc)
      const candidates = enrollmentByGradeAndIc.get(gradeIcKey) || []

      if (candidates.length === 0) {
        recordError(
          row,
          `Baris ${rowNumber}: Murid dengan IC '${row.no_ic}' tidak ditemui untuk kelas dan tingkatan tersebut.`
        )
        return null
      }

      if (candidates.length > 1) {
        recordError(row, `Baris ${rowNumber}: padanan no_ic tidak unik. Sila isi kelas.`)
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
      const isAbsentMark = isAbsentMarkInput(markRaw)
      const matchedStudentEnrollment = matchedBundle.enrollment
      const matchedClass = matchedBundle.classRow
      const matchedStudentProfile = matchedBundle.studentProfile
      const studentName =
        matchedStudentProfile?.full_name || normalizeText(row.nama_murid) || 'Murid'
      const subjectLabel = normalizeText(subjectHeader)

      if (!markRaw && allowBlankSkip) return false

      if (!markRaw) {
        recordError(row, `Baris ${rowNumber}: markah kosong`, {
          subject: subjectLabel,
          mark: markValue,
        })
        return false
      }

      if (!normalizedExamKey) {
        recordError(row, `Baris ${rowNumber}: jenis_peperiksaan kosong`, {
          subject: subjectLabel,
          mark: markValue,
        })
        return false
      }

      if (!isAllowedExamKey(normalizedExamKey)) {
        recordError(
          row,
          `Baris ${rowNumber}: peperiksaan '${normalizedExamKey}' tidak sah.`,
          { subject: subjectLabel, mark: markValue }
        )
        return false
      }

      const matchedSubject =
        subjectLookups.byHeaderAndGrade.get(
          buildSubjectHeaderLookupKey(subjectLabel, matchedClass.tingkatan)
        ) || null

      if (!matchedSubject) {
        recordError(
          row,
          `Baris ${rowNumber}: Subjek '${subjectLabel}' tidak ditemui dalam senarai subjek aktif.`,
          { subject: subjectLabel, mark: markValue }
        )
        return false
      }

      if (
        !canInputExamMark({
          schoolInfo,
          tingkatan: matchedClass.tingkatan,
          subjectName: getSubjectRuleName(matchedSubject),
          examKey: normalizedExamKey,
        })
      ) {
        recordError(
          row,
          `Baris ${rowNumber}: Subjek '${subjectLabel}' tidak dibenarkan untuk ${normalizedExamKey} bagi ${matchedClass.tingkatan}.`,
          { subject: subjectLabel, mark: markValue }
        )
        return false
      }

      if (isAbsentMark && normalizedExamKey === 'ETR') {
        recordError(
          row,
          `Baris ${rowNumber}: TH hanya dibenarkan untuk peperiksaan markah, bukan ETR.`,
          { subject: subjectLabel, mark: markValue }
        )
        return false
      }

      let mark = null
      let gradeInfo = { grade_name: null, grade_point: null }

      if (!isAbsentMark) {
        mark = Number(markRaw)

        if (Number.isNaN(mark) || mark < 0 || mark > 100) {
          recordError(
            row,
            `Baris ${rowNumber}: Markah untuk ${studentName} - ${subjectLabel} mesti antara 0 hingga 100 atau TH.`,
            { subject: subjectLabel, mark: markValue }
          )
          return false
        }
      }

      const matchedExamConfig = await getActiveExamConfigForGrade(
        matchedClass.tingkatan,
        normalizedExamKey
      )

      if (!matchedExamConfig?.id) {
        recordError(
          row,
          `Baris ${rowNumber}: Peperiksaan ${normalizedExamKey} belum dibuka oleh admin sekolah.`,
          { subject: subjectLabel, mark: markValue }
        )
        return false
      }

      if (
        isSelectiveSubject(matchedSubject) &&
        !studentSubjectEnrollmentSet.has(
          `${String(matchedStudentEnrollment.id)}__${String(matchedSubject.id)}`
        )
      ) {
        recordError(
          row,
          `Baris ${rowNumber}: murid IC '${matchedStudentProfile?.ic_number || row.no_ic}' tidak didaftarkan untuk subjek '${matchedSubject.subject_name}'`,
          { subject: subjectLabel, mark: markValue }
        )
        return false
      }

      if (!isAbsentMark) {
        const gradeScalesForTingkatan = (gradeScales || []).filter((grade) => {
          const label =
            grade.tingkatan ??
            grade.grade_label ??
            grade.form_level ??
            grade.level ??
            ''

          return normalizeGradeLabel(label) === normalizeGradeLabel(matchedClass.tingkatan)
        })
        gradeInfo = findGradeFromMark(mark, gradeScalesForTingkatan)
      }

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
          is_absent: isAbsentMark,
          remarks: null,
          entered_by: profile.id,
          verified_by: null,
          verified_at: null,
          updated_at: new Date().toISOString(),
        })
      }

      if (!isAbsentMark) {
        addOtrCandidatePair({
          matchedClass,
          matchedStudentEnrollment,
          matchedStudentProfile,
          matchedSubject,
          examKey: normalizedExamKey,
          mark,
        })
      }

      processedCount += 1
      validRowNumbers.add(rowNumber)
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

    return {
      totalRows: bulkPreviewRows.length,
      validRows: processedCount,
      validCsvRows: validRowNumbers.size,
      errorRows: Array.from(errorRowsByNumber.values()),
      errors,
      scoreRowsToUpsert,
      targetRowsToUpsert,
      otrRowsToUpsert,
    }
  }

  const handleBulkAdminValidate = async () => {
    if (!validateBulkAdminImportBasics()) return

    setBulkImportLoading(true)
    setBulkImportErrors([])
    setBulkErrorRows([])
    setBulkImportSummary(null)
    setBulkImportPlan(null)

    try {
      const plan = await buildBulkImportPlan()

      setBulkImportPlan(plan)
      setBulkImportErrors(plan.errors)
      setBulkErrorRows(plan.errorRows)
      setBulkImportSummary({
        status: 'validated',
        totalRows: plan.totalRows,
        validRows: plan.validRows,
        savedRows: 0,
        successCount: plan.validRows,
        errorRows: plan.errorRows.length,
        errorCount: plan.errors.length,
        importedScores: plan.scoreRowsToUpsert.length,
        importedTargets: plan.targetRowsToUpsert.length,
        generatedOtrs: plan.otrRowsToUpsert.length,
      })

      if (plan.validRows === 0) {
        alert('Semakan selesai. Tiada markah valid untuk disimpan.')
      } else if (plan.errors.length > 0) {
        alert(
          `Semakan selesai. ${plan.validRows} markah valid dan ${plan.errorRows.length} baris ada ralat.`
        )
      } else {
        alert('Semakan selesai. Semua markah valid dan sedia disimpan.')
      }
    } catch (error) {
      console.error(error)
      alert(`Semakan CSV gagal: ${error.message}`)
    } finally {
      setBulkImportLoading(false)
    }
  }

  const handleDownloadBulkErrorCsv = () => {
    if (!bulkErrorRows.length) {
      alert('Tiada ralat CSV untuk dimuat turun.')
      return
    }

    const headers =
      bulkCsvFormat === 'dynamic'
        ? [
            ...DYNAMIC_BULK_TEMPLATE_HEADERS,
            ...bulkSubjectHeaders.map((header) => header.label),
            'sebab_ralat',
          ]
        : [
            'tingkatan',
            'kelas',
            'no_ic',
            'nama_murid',
            'subjek',
            'jenis_peperiksaan',
            'markah',
            'sebab_ralat',
          ]

    const rows = bulkErrorRows.map((item) => {
      const row = item.row || {}
      const reasons = (item.reasons || []).join(' | ')

      if (bulkCsvFormat === 'dynamic') {
        return [
          formatIcForErrorCsv(row.no_ic),
          row.nama_murid || '',
          row.kelas || '',
          row.tingkatan || '',
          ...bulkSubjectHeaders.map((header) => row[header.rowKey] ?? ''),
          reasons,
        ]
      }

      return [
        row.tingkatan || '',
        row.kelas || '',
        formatIcForErrorCsv(row.no_ic),
        row.nama_murid || '',
        row.subjek || '',
        row.jenis_peperiksaan || '',
        row.markah || '',
        reasons,
      ]
    })

    const currentAcademicYear =
      setupConfig?.current_academic_year || new Date().getFullYear()

    downloadCsv(
      `ralat_import_pukal_${currentAcademicYear}.csv`,
      headers,
      rows
    )
  }

  const handleBulkAdminImport = async () => {
    if (!validateBulkAdminImportBasics()) return

    if (!bulkImportPlan) {
      alert('Sila klik Semak CSV dahulu sebelum simpan.')
      return
    }

    if (bulkImportPlan.validRows === 0) {
      alert('Tiada markah valid untuk disimpan.')
      return
    }

    if (
      bulkImportPlan.errors.length > 0 &&
      !window.confirm(
        `${bulkImportPlan.errorRows.length} baris ada ralat dan tidak akan disimpan. Teruskan simpan ${bulkImportPlan.validRows} markah valid?`
      )
    ) {
      return
    }

    setBulkImportLoading(true)

    try {
      let savedCount = 0

      if (bulkImportPlan.targetRowsToUpsert.length > 0) {
        const { error: targetError } = await supabase
          .from('student_targets')
          .upsert(bulkImportPlan.targetRowsToUpsert, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
          })

        if (targetError) throw targetError

        savedCount += bulkImportPlan.targetRowsToUpsert.length
      }

      if (bulkImportPlan.scoreRowsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('student_scores')
          .upsert(bulkImportPlan.scoreRowsToUpsert, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,exam_key',
          })

        if (upsertError) throw upsertError

        savedCount += bulkImportPlan.scoreRowsToUpsert.length
      }

      if (bulkImportPlan.otrRowsToUpsert.length > 0) {
        const { error: otrError } = await supabase
          .from('student_targets')
          .upsert(bulkImportPlan.otrRowsToUpsert, {
            onConflict: 'student_enrollment_id,subject_id,academic_year,target_key',
          })

        if (otrError) throw otrError
      }

      setBulkImportErrors(bulkImportPlan.errors)
      setBulkErrorRows(bulkImportPlan.errorRows)
      setBulkImportSummary({
        status: 'saved',
        totalRows: bulkImportPlan.totalRows,
        validRows: bulkImportPlan.validRows,
        savedRows: savedCount,
        successCount: savedCount,
        errorRows: bulkImportPlan.errorRows.length,
        errorCount: bulkImportPlan.errors.length,
        importedScores: bulkImportPlan.scoreRowsToUpsert.length,
        importedTargets: bulkImportPlan.targetRowsToUpsert.length,
        generatedOtrs: bulkImportPlan.otrRowsToUpsert.length,
      })
      setBulkImportPlan(null)

      if (savedCount > 0 || bulkImportPlan.otrRowsToUpsert.length > 0) {
        await refreshCurrentMarksAndAnalysis()
      }

      if (savedCount > 0 && bulkImportPlan.errors.length === 0) {
        setBulkPreviewRows([])
        setBulkCsvFile(null)
        setBulkCsvFormat('')
        setBulkSubjectHeaders([])
        setBulkErrorRows([])
        alert('Import pukal admin berjaya disimpan.')
      } else if (savedCount > 0 && bulkImportPlan.errors.length > 0) {
        alert(
          `Import pukal admin selesai. ${savedCount} markah berjaya disimpan dan ${bulkImportPlan.errorRows.length} baris ralat tidak disimpan.`
        )
      } else {
        alert('Import pukal admin gagal. Tiada markah berjaya disimpan.')
      }
    } catch (error) {
      console.error(error)
      const errorMessage = String(error.message || '')
      const friendlyMessage = errorMessage.includes('student_score_history')
        ? 'Import gagal kerana policy audit student_score_history belum membenarkan rekod sejarah markah ditulis. Sila jalankan migration RLS student_score_history di Supabase.'
        : `Import pukal admin gagal: ${error.message}`

      alert(friendlyMessage)
    } finally {
      setBulkImportLoading(false)
    }
  }

  const handleSave = async () => {
    if (!profile?.school_id || !selectedClass || !selectedSubject || !selectedExam) return
    if (!selectedSubjectData) {
      alert('Subjek ini tidak termasuk dalam subjek peperiksaan untuk tingkatan ini.')
      return
    }

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

    const normalizedSelectedExam = normalizeExamKey(selectedExam)
    const inputRows = displayedStudents.filter((student) =>
      displayedEnrollmentIdSet.has(String(student.enrollment_id))
    )
    const rowsWithInput = inputRows.filter((student) => {
      const rawMark = scores[student.student_id]?.mark
      return !isBlankMarkInput(rawMark)
    })
    const invalidRows = rowsWithInput.filter((student) => {
      const rawMark = scores[student.student_id]?.mark
      if (isAbsentMarkInput(rawMark)) return false

      const markText = normalizeText(rawMark)
      const mark = Number(markText)
      return markText === '' || Number.isNaN(mark) || mark < 0 || mark > 100
    })
    const absentRows = rowsWithInput.filter((student) =>
      isAbsentMarkInput(scores[student.student_id]?.mark)
    )

    if (invalidRows.length > 0) {
      setSaving(false)
      alert('Markah mesti antara 0 hingga 100, atau taip TH untuk tidak hadir.')
      return
    }

    if (normalizedSelectedExam === 'ETR' && absentRows.length > 0) {
      setSaving(false)
      alert('TH hanya dibenarkan untuk peperiksaan markah, bukan ETR.')
      return
    }

    const payload = rowsWithInput.map((student) => {
      const rawMark = scores[student.student_id]?.mark
      const isAbsent = isAbsentMarkInput(rawMark)
      const mark = isAbsent ? null : Number(normalizeText(rawMark))
      const gradeInfo = isAbsent
        ? { grade_name: null, grade_point: null }
        : findGradeFromMark(mark, gradeScalesForTingkatan)

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
        is_absent: isAbsent,
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

      if (!error && normalizedSelectedExam === 'TOV' && deletedEnrollmentIds.length > 0) {
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

          error = deleteOtrResult.error
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

      if (
        !error &&
        normalizedSelectedExam === 'TOV' &&
        payload.length > 0 &&
        shouldAutoRecalculateOtrs(setupConfig)
      ) {
        const enrollmentIds = payload
          .map((row) => row.student_enrollment_id)
          .filter(Boolean)
        const { data: etrRows, error: etrError } = await supabase
          .from('student_targets')
          .select('student_enrollment_id, target_mark')
          .eq('school_id', schoolId)
          .eq('academic_year', currentYear)
          .eq('class_id', selectedClass)
          .eq('subject_id', selectedSubject)
          .eq('target_key', 'ETR')
          .in('student_enrollment_id', enrollmentIds)

        if (etrError) {
          error = etrError
        } else {
          const etrByEnrollmentId = new Map(
            (etrRows || []).map((row) => [row.student_enrollment_id, row.target_mark])
          )
          const generatedOtrRows = []

          payload.forEach((scoreRow) => {
            if (scoreRow.is_absent === true || scoreRow.mark === null || scoreRow.mark === undefined) return

            const etrMark = etrByEnrollmentId.get(scoreRow.student_enrollment_id)
            if (etrMark === null || etrMark === undefined || etrMark === '') return

            generatedOtrRows.push(
              ...generateOtrRows({
                schoolId,
                academicYear: currentYear,
                studentEnrollmentId: scoreRow.student_enrollment_id,
                studentProfileId: scoreRow.student_profile_id,
                classId: scoreRow.class_id,
                subjectId: scoreRow.subject_id,
                enteredBy: profile.id,
                tingkatan: selectedGradeLabel,
                tovMark: scoreRow.mark,
                etrMark,
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
    <div className="min-h-screen overflow-x-hidden bg-slate-100 p-3 sm:p-4 md:p-6">
      <div className="mx-auto min-w-0 max-w-7xl">
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

        {isSchoolAdmin && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Import Markah CSV</h2>
              <p className="mt-1 text-sm text-slate-500">
                Gunakan template dinamik untuk isi banyak subjek dalam satu baris murid.
              </p>
            </div>
            <span className="inline-block rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
              Admin Sahaja
            </span>
          </div>

              <p className="mt-5 text-sm text-slate-600">
                Template dinamik menggunakan satu baris untuk setiap murid. Column subjek akan
                mengikut subjek aktif yang didaftarkan oleh admin sekolah.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,360px)_auto] md:items-end md:justify-start">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Peperiksaan Import
                  </label>
                  <select
                    value={bulkSelectedExam}
                    onChange={(e) => {
                      setBulkSelectedExam(e.target.value)
                      setBulkImportPlan(null)
                      setBulkImportSummary(null)
                      setBulkImportErrors([])
                      setBulkErrorRows([])
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-500"
                  >
                    {bulkExamOptions.length === 0 ? (
                      <option value="">Tiada peperiksaan dibuka</option>
                    ) : (
                      bulkExamOptions.map((exam) => (
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
                  disabled={!bulkSelectedExam || dynamicTemplateLoading}
                  className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {dynamicTemplateLoading ? 'Sedang jana...' : 'Muat Turun Template Dinamik'}
                </button>
              </div>

              {!bulkSelectedExam && (
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
                        <div className="mb-1.5 text-xs text-slate-500">Markah valid</div>
                        <div className="text-2xl font-extrabold text-emerald-700">{bulkImportSummary.validRows}</div>
                      </div>

                      <div className="rounded-xl border border-emerald-100 bg-white p-3">
                        <div className="mb-1.5 text-xs text-slate-500">
                          {bulkImportSummary.status === 'saved' ? 'Berjaya disimpan' : 'Sedia disimpan'}
                        </div>
                        <div className="text-2xl font-extrabold text-emerald-700">
                          {bulkImportSummary.status === 'saved'
                            ? bulkImportSummary.savedRows ?? bulkImportSummary.successCount
                            : bulkImportSummary.validRows}
                        </div>
                      </div>

                      <div className="rounded-xl border border-emerald-100 bg-white p-3">
                        <div className="mb-1.5 text-xs text-slate-500">Baris ralat</div>
                        <div className="text-2xl font-extrabold text-red-700">{bulkImportSummary.errorRows ?? bulkImportSummary.errorCount}</div>
                      </div>
                    </div>
                    {bulkImportSummary.status === 'validated' && (
                      <p className="mt-3 text-sm font-semibold text-emerald-900">
                        Semakan selesai. Klik simpan untuk masukkan markah valid ke sistem.
                      </p>
                    )}
                  </div>
                )}

                {bulkImportErrors.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="mb-1 text-base font-extrabold text-red-800">Ralat Import</div>
                        <div className="mb-3 text-sm text-red-900">
                          Baris berikut tidak akan disimpan. Betulkan CSV ralat dan import semula jika perlu.
                        </div>
                      </div>
                      {bulkErrorRows.length > 0 && (
                        <button
                          type="button"
                          onClick={handleDownloadBulkErrorCsv}
                          className="rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                        >
                          Muat Turun CSV Ralat
                        </button>
                      )}
                    </div>

                    <ul className="m-0 list-disc space-y-1.5 pl-5 text-sm text-red-700">
                      {bulkImportErrors.slice(0, 20).map((item, index) => (
                        <li key={`${getBulkImportErrorMessage(item)}-${index}`}>
                          {getBulkImportErrorMessage(item)}
                        </li>
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
                  <table className="w-full min-w-[980px] text-sm">
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

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleBulkAdminValidate}
                  disabled={
                    bulkImportLoading ||
                    !bulkPreviewRows.length ||
                    (bulkCsvFormat === 'dynamic' && !bulkSelectedExam)
                  }
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkImportLoading ? 'Sedang semak...' : 'Semak CSV'}
                </button>

                <button
                  type="button"
                  onClick={handleBulkAdminImport}
                  disabled={
                    bulkImportLoading ||
                    !bulkPreviewRows.length ||
                    !bulkImportPlan ||
                    bulkImportPlan.validRows === 0
                  }
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkImportLoading ? 'Sedang simpan...' : 'Simpan Row Valid Sahaja'}
                </button>
              </div>
        </div>
        )}

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
              <table className="w-full min-w-[760px] border-collapse text-sm">
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
                            type="text"
                            inputMode="text"
                            placeholder="0-100 / TH"
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
          schoolInfo={schoolInfo}
          classId={selectedClass}
          subjectId={selectedSubject}
          refreshKey={analysisRefreshKey}
        />
      </div>
    </div>
  )
}
