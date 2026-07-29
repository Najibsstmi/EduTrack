import { parseCsvText } from './pbdBulkImport.js'

export const HOLLAND_DIMENSIONS = [
  { key: 'R', label: 'Realistik' },
  { key: 'I', label: 'Investigatif' },
  { key: 'A', label: 'Artistik' },
  { key: 'S', label: 'Sosial' },
  { key: 'E', label: 'Enterprising' },
  { key: 'K', label: 'Konvensional' },
]

export const ITP_DIMENSIONS = [
  { key: 'AUT', label: 'AUT' },
  { key: 'KTF', label: 'KTF' },
  { key: 'AGF', label: 'AGF' },
  { key: 'EKT', label: 'EKT' },
  { key: 'PCP', label: 'PCP' },
  { key: 'KPG', label: 'KPG' },
  { key: 'ITL', label: 'ITL' },
  { key: 'KPN', label: 'KPN' },
  { key: 'STR', label: 'STR' },
  { key: 'RSL', label: 'RSL' },
  { key: 'MLG', label: 'MLG' },
  { key: 'ATL', label: 'ATL' },
  { key: 'KD', label: 'KD' },
  { key: 'WSN', label: 'WSN' },
  { key: 'KTN', label: 'KTN' },
]

export const PSYCHOMETRIC_INSTRUMENTS = [
  {
    assessmentType: 'career_interest',
    assessmentName: 'IMK',
    label: 'Inventori Minat Kerjaya (IMK)',
    recommendedGrades: [1, 3, 5],
    dimensions: HOLLAND_DIMENSIONS,
    resultLabel: 'Kod Holland',
    resultDescription:
      'Sistem akan menyemak skor, mengira tiga kod Holland tertinggi, dan memaparkan status padanan murid terlebih dahulu.',
  },
  {
    assessmentType: 'personality',
    assessmentName: 'ITP',
    label: 'Inventori Tret Personaliti (ITP)',
    recommendedGrades: [2, 4],
    dimensions: ITP_DIMENSIONS,
    resultLabel: 'Tret Utama',
    resultDescription:
      'Sistem akan menyemak skor, mengenal pasti tiga tret tertinggi, dan memaparkan status padanan murid terlebih dahulu.',
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
    'idpengenalan',
    'idpengenalanmurid',
  ]),
  student_name: new Set(['nama', 'namamurid', 'fullname', 'namapelajar']),
  class_name: new Set(['kelas', 'classname', 'namakelas']),
  grade_label: new Set(['tingkatan', 'tahun', 'grade', 'gradelabel', 'tahap', 'tingkatantahun']),
}

const BASE_REQUIRED_HEADERS = ['student_name', 'class_name']

const GRADE_WORDS = {
  SATU: '1',
  DUA: '2',
  TIGA: '3',
  EMPAT: '4',
  LIMA: '5',
  ENAM: '6',
}

const getInstrument = (assessmentName) =>
  PSYCHOMETRIC_INSTRUMENTS.find((item) => item.assessmentName === assessmentName)

export const getInstrumentDimensions = (assessmentName) =>
  getInstrument(assessmentName)?.dimensions || []

const normalizeLoose = (value) =>
  String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('ms-MY')
    .replace(/[^a-z0-9]+/g, '')

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

  if (match?.[1]) return match[1]

  const gradeWords = Object.keys(GRADE_WORDS).join('|')
  const wordMatch =
    normalized.match(new RegExp(`^(?:TINGKATAN|TAHUN|FORM|TING)?\\s*(${gradeWords})$`)) ||
    normalized.match(new RegExp(`\\b(?:TINGKATAN|TAHUN|FORM|TING)\\s*(${gradeWords})\\b`))

  return wordMatch?.[1] ? GRADE_WORDS[wordMatch[1]] : ''
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

const normalizeHeader = (value, instrument) => {
  const normalized = normalizeLoose(value)

  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.has(normalized)) return key
  }

  const assessmentName = normalizeLoose(instrument?.assessmentName)
  const assessmentType = normalizeLoose(instrument?.assessmentType)

  for (const dimension of instrument?.dimensions || []) {
    const key = normalizeLoose(dimension.key)
    const label = normalizeLoose(dimension.label)
    const aliases = new Set(
      [key, label, `${assessmentName}${key}`, `${assessmentName}${label}`, `${assessmentType}${key}`]
        .filter(Boolean)
    )

    if (aliases.has(normalized)) return dimension.key
  }

  return ''
}

const getHeaderIndexes = (headerRow, instrument) => {
  const indexes = {}
  const duplicates = []

  headerRow.forEach((header, index) => {
    const canonical = normalizeHeader(header, instrument)
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

export const calculateDominantDimensions = (scores, dimensions = HOLLAND_DIMENSIONS) => {
  const sorted = dimensions.map((dimension, index) => ({
    ...dimension,
    index,
    score: Number(scores?.[dimension.key]),
  }))
    .filter((dimension) => Number.isFinite(dimension.score))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)

  const separator = sorted.every((dimension) => String(dimension.key).length === 1) ? '' : '-'

  return {
    dominantCode: sorted.map((dimension) => dimension.key).join(separator),
    primaryDimension: sorted[0]?.label || null,
    secondaryDimension: sorted[1]?.label || null,
    tertiaryDimension: sorted[2]?.label || null,
  }
}

export const calculateDominantHolland = (scores) =>
  calculateDominantDimensions(scores, HOLLAND_DIMENSIONS)

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

const decodeHtmlEntities = (value) =>
  String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))

const textFromHtmlCell = (html) =>
  decodeHtmlEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const parsePsychometricHtmlTable = (html) => {
  const rows = []
  const source = String(html || '')
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch = rowRegex.exec(source)

  while (rowMatch) {
    const cells = []
    const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
    let cellMatch = cellRegex.exec(rowMatch[1])

    while (cellMatch) {
      cells.push(textFromHtmlCell(cellMatch[1]))
      cellMatch = cellRegex.exec(rowMatch[1])
    }

    if (cells.some((cell) => cell)) rows.push(cells)
    rowMatch = rowRegex.exec(source)
  }

  return rows
}

const looksLikeHtmlTable = (text) => /<table\b/i.test(String(text || '')) && /<tr\b/i.test(text)

export const readPsychometricFile = async (file) => {
  const extension = String(file?.name || '').split('.').pop()?.toLocaleLowerCase('en') || ''

  if (extension === 'csv') {
    return parseCsvText(await file.text())
  }

  if (extension === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser')
    return readSheet(file)
  }

  if (extension === 'xls') {
    const text = await file.text()
    if (looksLikeHtmlTable(text)) return parsePsychometricHtmlTable(text)
    throw new Error(
      'Fail .xls lama hanya disokong jika ia export HTML daripada sistem psikometrik. Jika tidak, simpan semula sebagai CSV atau XLSX.'
    )
  }

  throw new Error('Format fail tidak disokong. Gunakan fail CSV, XLSX atau XLS export psikometrik.')
}

const buildClassLookupKey = (gradeLabel, className) =>
  `${normalizeGradeKey(gradeLabel)}__${normalizeClassKey(className, gradeLabel)}`

const getClassLabel = (classRow) =>
  `${String(classRow?.tingkatan || '').trim()} ${String(classRow?.class_name || '').trim()}`.trim()

const findHeaderContext = (tableRows, instrument, selectedGrade) => {
  let bestContext = null

  tableRows.forEach((row, rowIndex) => {
    const { indexes, duplicates } = getHeaderIndexes(row, instrument)
    const dimensionMatches = (instrument.dimensions || []).filter(
      (dimension) => indexes[dimension.key] !== undefined
    ).length
    const baseMatches = BASE_REQUIRED_HEADERS.filter((header) => indexes[header] !== undefined)
      .length
    const score = dimensionMatches * 2 + baseMatches

    if (!bestContext || score > bestContext.score) {
      bestContext = { rowIndex, indexes, duplicates, score }
    }
  })

  const titleRows = tableRows.slice(0, bestContext?.rowIndex || 0)
  const inferredGradeLabel =
    titleRows
      .flat()
      .map((cell) => {
        const gradeNumber = getGradeNumber(cell)
        return gradeNumber ? `Tingkatan ${Number(gradeNumber)}` : ''
      })
      .find(Boolean) || selectedGrade

  return {
    rowIndex: bestContext?.rowIndex ?? 0,
    indexes: bestContext?.indexes || {},
    duplicates: bestContext?.duplicates || [],
    inferredGradeLabel,
  }
}

const getMissingHeaderLabels = (headers) =>
  headers.map((header) => {
    if (header === 'student_name') return 'nama'
    if (header === 'class_name') return 'kelas'
    if (header === 'grade_label') return 'tingkatan'
    return header
  })

export const preparePsychometricPreview = ({
  tableRows,
  classes,
  enrollments,
  selectedGrade,
  selectedClassId,
  assessmentName = 'IMK',
}) => {
  const instrument = getInstrument(assessmentName)
  const dimensions = instrument?.dimensions || []

  if (!instrument || dimensions.length === 0) {
    throw new Error('Import pukal belum disediakan untuk instrumen ini.')
  }

  if (!Array.isArray(tableRows) || tableRows.length < 2) {
    throw new Error('Fail tidak mempunyai data murid untuk dipratonton.')
  }

  const { rowIndex: headerRowIndex, indexes, duplicates, inferredGradeLabel } = findHeaderContext(
    tableRows,
    instrument,
    selectedGrade
  )
  const missingHeaders = [
    ...BASE_REQUIRED_HEADERS,
    ...dimensions.map((dimension) => dimension.key),
    indexes.grade_label === undefined && !inferredGradeLabel ? 'grade_label' : '',
  ].filter((header) => header && indexes[header] === undefined)

  if (missingHeaders.length > 0) {
    throw new Error(`Header wajib tiada: ${getMissingHeaderLabels(missingHeaders).join(', ')}.`)
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
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row, rowIndex) => {
      const rowNumber = headerRowIndex + rowIndex + 2
      const valueFor = (header) => String(row[indexes[header]] ?? '').trim()
      const sourceIcNumber =
        indexes.ic_number === undefined ? '' : normalizeIcNumber(valueFor('ic_number'))
      const sourceStudentName = valueFor('student_name')
      const sourceClassName = valueFor('class_name')
      const sourceGradeLabel =
        indexes.grade_label === undefined ? inferredGradeLabel : valueFor('grade_label')
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

      dimensions.forEach((dimension) => {
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

      const dominant = calculateDominantDimensions(scores, dimensions)

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

export const prepareImkPreview = (args) =>
  preparePsychometricPreview({ ...args, assessmentName: 'IMK' })

export const summarizePreviewRows = (rows = []) => ({
  total: rows.length,
  matched: rows.filter((row) => row.match_status === 'matched').length,
  review: rows.filter((row) => row.match_status === 'review').length,
  unmatched: rows.filter((row) => row.match_status === 'unmatched').length,
  error: rows.filter((row) => row.match_status === 'error').length,
})
