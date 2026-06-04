import { parseCsvText } from './pbdBulkImport.js'

export const HOLLAND_DIMENSIONS = [
  { key: 'R', label: 'Realistik' },
  { key: 'I', label: 'Investigatif' },
  { key: 'A', label: 'Artistik' },
  { key: 'S', label: 'Sosial' },
  { key: 'E', label: 'Enterprising' },
  { key: 'K', label: 'Konvensional' },
]

export const PSYCHOMETRIC_INSTRUMENTS = [
  {
    assessmentType: 'career_interest',
    assessmentName: 'IMK',
    label: 'Inventori Minat Kerjaya (IMK)',
    recommendedGrades: [1, 3, 5],
  },
  {
    assessmentType: 'personality',
    assessmentName: 'ITP',
    label: 'Inventori Tret Personaliti (ITP)',
    recommendedGrades: [2, 4],
  },
  {
    assessmentType: 'aptitude',
    assessmentName: 'APTITUD_KHUSUS',
    label: 'Aptitud Khusus',
    recommendedGrades: [3],
  },
]

const HEADER_ALIASES = {
  ic_number: new Set([
    'nokp',
    'ic',
    'noic',
    'nokadpengenalan',
    'kadpengenalan',
    'icnumber',
    'nric',
  ]),
  student_name: new Set(['nama', 'namamurid', 'fullname', 'namapelajar']),
  class_name: new Set(['kelas', 'classname', 'namakelas']),
  grade_label: new Set(['tingkatan', 'tahun', 'grade', 'gradelabel', 'tahap']),
  R: new Set(['r', 'realistik']),
  I: new Set(['i', 'investigatif']),
  A: new Set(['a', 'artistik']),
  S: new Set(['s', 'sosial']),
  E: new Set(['e', 'enterprising']),
  K: new Set(['k', 'konvensional']),
}

const REQUIRED_HEADERS = [
  'student_name',
  'class_name',
  'grade_label',
  ...HOLLAND_DIMENSIONS.map((dimension) => dimension.key),
]

const normalizeLoose = (value) =>
  String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('ms-MY')
    .replace(/[_\-\s./]+/g, '')

export const normalizeMatchText = (value) =>
  String(value || '')
    .trim()
    .toLocaleUpperCase('ms-MY')
    .replace(/\s+/g, ' ')

export const normalizeIcNumber = (value) => {
  const normalized = String(value || '').trim().replace(/^'/, '')
  const digits = normalized.replace(/[\s-]/g, '')

  if (/^\d+$/.test(digits)) return digits.padStart(12, '0')

  if (/^\+?\d+(?:\.\d+)?e[+-]?\d+$/i.test(normalized)) {
    const number = Number(normalized)
    if (Number.isSafeInteger(number) && number >= 0) {
      return number.toFixed(0).padStart(12, '0')
    }
  }

  return normalizeMatchText(normalized)
}

export const getGradeNumber = (value) => {
  const normalized = normalizeMatchText(value)
  const match =
    normalized.match(/^(?:TINGKATAN|TAHUN|FORM|TING|F|T)?\s*(\d+)$/) ||
    normalized.match(/\b(?:TINGKATAN|TAHUN|FORM|TING|F|T)\s*(\d+)\b/)

  return match?.[1] || ''
}

export const normalizeGradeKey = (value) => {
  const gradeNumber = getGradeNumber(value)
  return gradeNumber ? `GRADE_${Number(gradeNumber)}` : normalizeMatchText(value)
}

export const normalizeClassKey = (value, gradeLabel = '') => {
  let normalized = normalizeMatchText(value)
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const gradeNumber = getGradeNumber(gradeLabel)
  const aliases = [
    normalizeMatchText(gradeLabel),
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

const normalizeHeader = (value) => {
  const normalized = normalizeLoose(value)

  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.has(normalized)) return key
  }

  return ''
}

const getHeaderIndexes = (headerRow) => {
  const indexes = {}
  const duplicates = []

  headerRow.forEach((header, index) => {
    const canonical = normalizeHeader(header)
    if (!canonical) return
    if (indexes[canonical] !== undefined) duplicates.push(canonical)
    indexes[canonical] = index
  })

  return { indexes, duplicates: [...new Set(duplicates)] }
}

const toScore = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(String(value).trim().replace(',', '.'))
  return Number.isFinite(number) && number >= 0 ? number : null
}

export const calculateDominantHolland = (scores) => {
  const sorted = HOLLAND_DIMENSIONS.map((dimension, index) => ({
    ...dimension,
    index,
    score: Number(scores?.[dimension.key]),
  }))
    .filter((dimension) => Number.isFinite(dimension.score))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)

  return {
    dominantCode: sorted.map((dimension) => dimension.key).join(''),
    primaryDimension: sorted[0]?.label || null,
    secondaryDimension: sorted[1]?.label || null,
    tertiaryDimension: sorted[2]?.label || null,
  }
}

export const getInstrumentGradeWarning = (assessmentName, gradeLabel) => {
  const instrument = PSYCHOMETRIC_INSTRUMENTS.find(
    (item) => item.assessmentName === assessmentName
  )
  const gradeNumber = Number(getGradeNumber(gradeLabel))

  if (!instrument || !gradeNumber || instrument.recommendedGrades.includes(gradeNumber)) {
    return ''
  }

  return `${instrument.label} lazimnya dilaksanakan untuk ${instrument.recommendedGrades
    .map((grade) => `Tingkatan ${grade}`)
    .join(', ')}. Pilihan ini masih dibenarkan tetapi sila semak keperluan sekolah.`
}

export const readPsychometricFile = async (file) => {
  const extension = String(file?.name || '').split('.').pop()?.toLocaleLowerCase('en') || ''

  if (extension === 'csv') {
    return parseCsvText(await file.text())
  }

  if (extension === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser')
    return readSheet(file)
  }

  throw new Error('Format fail tidak disokong. Gunakan fail CSV atau XLSX.')
}

const buildClassLookupKey = (gradeLabel, className) =>
  `${normalizeGradeKey(gradeLabel)}__${normalizeClassKey(className, gradeLabel)}`

const getClassLabel = (classRow) =>
  `${String(classRow?.tingkatan || '').trim()} ${String(classRow?.class_name || '').trim()}`.trim()

export const prepareImkPreview = ({
  tableRows,
  classes,
  enrollments,
  selectedGrade,
  selectedClassId,
}) => {
  if (!Array.isArray(tableRows) || tableRows.length < 2) {
    throw new Error('Fail tidak mempunyai data murid untuk dipratonton.')
  }

  const { indexes, duplicates } = getHeaderIndexes(tableRows[0])
  const missingHeaders = REQUIRED_HEADERS.filter((header) => indexes[header] === undefined)

  if (missingHeaders.length > 0) {
    throw new Error(`Header wajib tiada: ${missingHeaders.join(', ')}.`)
  }

  if (duplicates.length > 0) {
    throw new Error(`Header berulang atau mempunyai alias sama: ${duplicates.join(', ')}.`)
  }

  const classById = new Map((classes || []).map((classRow) => [String(classRow.id), classRow]))
  const classLookup = new Map()

  ;(classes || []).forEach((classRow) => {
    const key = buildClassLookupKey(classRow.tingkatan, classRow.class_name)
    const current = classLookup.get(key) || []
    current.push(classRow)
    classLookup.set(key, current)
  })

  const enrollmentByIc = new Map()
  const enrollmentByNameClass = new Map()

  ;(enrollments || []).forEach((enrollment) => {
    const classRow = classById.get(String(enrollment.class_id))
    if (!classRow) return

    const icNumber = normalizeIcNumber(enrollment.student_profiles?.ic_number)
    const name = normalizeMatchText(enrollment.student_profiles?.full_name)

    if (icNumber) {
      const current = enrollmentByIc.get(icNumber) || []
      current.push(enrollment)
      enrollmentByIc.set(icNumber, current)
    }

    if (name) {
      const key = `${name}__${classRow.id}`
      const current = enrollmentByNameClass.get(key) || []
      current.push(enrollment)
      enrollmentByNameClass.set(key, current)
    }
  })

  const previewRows = tableRows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 2
      const valueFor = (header) => String(row[indexes[header]] ?? '').trim()
      const sourceIcNumber =
        indexes.ic_number === undefined ? '' : normalizeIcNumber(valueFor('ic_number'))
      const sourceStudentName = valueFor('student_name')
      const sourceClassName = valueFor('class_name')
      const sourceGradeLabel = valueFor('grade_label')
      const errors = []
      const scores = {}

      if (!sourceStudentName) errors.push('Nama murid wajib diisi.')
      if (!sourceClassName) errors.push('Kelas wajib diisi.')
      if (!sourceGradeLabel) errors.push('Tingkatan wajib diisi.')
      if (
        sourceGradeLabel &&
        selectedGrade &&
        normalizeGradeKey(sourceGradeLabel) !== normalizeGradeKey(selectedGrade)
      ) {
        errors.push(`Tingkatan row tidak sepadan dengan pilihan ${selectedGrade}.`)
      }

      HOLLAND_DIMENSIONS.forEach((dimension) => {
        const score = toScore(valueFor(dimension.key))
        if (score === null) {
          errors.push(`Skor ${dimension.key} mesti nombor sifar atau lebih.`)
        } else {
          scores[dimension.key] = score
        }
      })

      const classMatches =
        sourceGradeLabel && sourceClassName
          ? classLookup.get(buildClassLookupKey(sourceGradeLabel, sourceClassName)) || []
          : []
      let sourceClassRow = classMatches.length === 1 ? classMatches[0] : null

      if (sourceGradeLabel && sourceClassName && classMatches.length === 0) {
        errors.push('Tingkatan dan kelas tidak sepadan dengan kelas aktif sekolah.')
      } else if (classMatches.length > 1) {
        errors.push('Tingkatan dan kelas sepadan dengan lebih daripada satu kelas.')
      }

      if (
        sourceClassRow &&
        selectedClassId &&
        String(sourceClassRow.id) !== String(selectedClassId)
      ) {
        errors.push('Kelas row tidak sepadan dengan kelas yang dipilih.')
      }

      let matchedEnrollment = null
      let matchStatus = 'unmatched'
      let matchNote = 'Murid tidak ditemui berdasarkan No KP atau nama dan kelas.'

      if (sourceIcNumber) {
        const icMatches = enrollmentByIc.get(sourceIcNumber) || []
        const sameClassMatches = sourceClassRow
          ? icMatches.filter(
              (enrollment) => String(enrollment.class_id) === String(sourceClassRow.id)
            )
          : []

        if (sameClassMatches.length === 1) {
          matchedEnrollment = sameClassMatches[0]
          const savedName = matchedEnrollment.student_profiles?.full_name || ''
          if (normalizeMatchText(savedName) === normalizeMatchText(sourceStudentName)) {
            matchStatus = 'matched'
            matchNote = 'Padanan tepat melalui No KP, kelas dan nama.'
          } else {
            matchStatus = 'review'
            matchNote = `No KP dan kelas sepadan tetapi nama sistem ialah "${savedName}".`
          }
        } else if (sameClassMatches.length > 1) {
          matchStatus = 'review'
          matchNote = 'Lebih daripada satu enrollment ditemui untuk No KP dan kelas ini.'
        } else if (icMatches.length === 1) {
          matchedEnrollment = icMatches[0]
          sourceClassRow = classById.get(String(matchedEnrollment.class_id)) || sourceClassRow
          matchStatus = 'review'
          matchNote = `No KP ditemui tetapi kelas aktif murid ialah "${getClassLabel(sourceClassRow)}".`
        } else if (icMatches.length > 1) {
          matchStatus = 'review'
          matchNote = 'Lebih daripada satu enrollment aktif ditemui untuk No KP ini.'
        }
      }

      if (!matchedEnrollment && matchStatus === 'unmatched' && sourceClassRow && sourceStudentName) {
        const nameMatches =
          enrollmentByNameClass.get(
            `${normalizeMatchText(sourceStudentName)}__${sourceClassRow.id}`
          ) || []

        if (nameMatches.length === 1) {
          matchedEnrollment = nameMatches[0]
          matchStatus = 'review'
          matchNote = 'Padanan dibuat melalui nama dan kelas. No KP perlu disemak.'
        } else if (nameMatches.length > 1) {
          matchStatus = 'review'
          matchNote = 'Lebih daripada satu murid mempunyai nama yang sama dalam kelas ini.'
        }
      }

      const matchedClassRow = matchedEnrollment
        ? classById.get(String(matchedEnrollment.class_id)) || sourceClassRow
        : sourceClassRow

      if (
        matchedClassRow &&
        selectedGrade &&
        normalizeGradeKey(matchedClassRow.tingkatan) !== normalizeGradeKey(selectedGrade)
      ) {
        errors.push('Enrollment aktif murid tidak sepadan dengan tingkatan yang dipilih.')
      }

      if (
        matchedClassRow &&
        selectedClassId &&
        String(matchedClassRow.id) !== String(selectedClassId)
      ) {
        errors.push('Enrollment aktif murid tidak sepadan dengan kelas yang dipilih.')
      }

      const dominant = calculateDominantHolland(scores)

      return {
        id: `psychometric-preview-${rowNumber}`,
        row_number: rowNumber,
        source_ic_number: sourceIcNumber,
        source_student_name: sourceStudentName,
        source_grade_label: sourceGradeLabel,
        source_class_name: sourceClassName,
        student_profile_id: matchedEnrollment?.student_profile_id || null,
        student_enrollment_id: matchedEnrollment?.id || null,
        class_id: matchedClassRow?.id || null,
        grade_label: matchedClassRow?.tingkatan || sourceGradeLabel || selectedGrade,
        class_name: matchedClassRow?.class_name || sourceClassName || null,
        raw_data: scores,
        dominant_code: dominant.dominantCode,
        primary_dimension: dominant.primaryDimension,
        secondary_dimension: dominant.secondaryDimension,
        tertiary_dimension: dominant.tertiaryDimension,
        match_status: errors.length > 0 ? 'error' : matchStatus,
        match_note: errors.length > 0 ? errors.join(' ') : matchNote,
        errors,
      }
    })

  const rowsByEnrollment = new Map()

  previewRows.forEach((row) => {
    if (!row.student_enrollment_id || row.match_status === 'error') return
    const current = rowsByEnrollment.get(row.student_enrollment_id) || []
    current.push(row)
    rowsByEnrollment.set(row.student_enrollment_id, current)
  })

  rowsByEnrollment.forEach((rows) => {
    if (rows.length < 2) return
    rows.forEach((row) => {
      row.match_status = 'error'
      row.errors = [...row.errors, 'Murid yang sama muncul lebih daripada sekali dalam fail.']
      row.match_note = row.errors.join(' ')
    })
  })

  return previewRows
}

export const summarizePreviewRows = (rows = []) => ({
  total: rows.length,
  matched: rows.filter((row) => row.match_status === 'matched').length,
  review: rows.filter((row) => row.match_status === 'review').length,
  unmatched: rows.filter((row) => row.match_status === 'unmatched').length,
  error: rows.filter((row) => row.match_status === 'error').length,
})
