const MANDATORY_HEADER_MAP = {
  no_ic: new Set([
    'noic',
    'nokadpengenalan',
    'nokp',
    'kadpengenalan',
    'ic',
    'nric',
  ]),
  nama_murid: new Set(['namamurid', 'nama']),
  kelas: new Set(['kelas']),
  tingkatan: new Set(['tingkatan', 'tahun']),
}

const normalizeLoose = (value) =>
  String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('ms-MY')
    .replace(/[_\-\s./]+/g, '')

export const normalizeCsvHeader = (value) => {
  const normalized = normalizeLoose(value)

  for (const [key, aliases] of Object.entries(MANDATORY_HEADER_MAP)) {
    if (aliases.has(normalized)) return key
  }

  return String(value || '').replace(/^\uFEFF/, '').trim()
}

export const normalizeSubjectMatchKey = (value) =>
  String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleUpperCase('ms-MY')
    .replace(/\s+/g, ' ')

const getGradeNumber = (value) => {
  const normalized = normalizeSubjectMatchKey(value)
  const match =
    normalized.match(/^(?:TINGKATAN|TAHUN|FORM|F|T)?\s*(\d+)$/) ||
    normalized.match(/\b(?:TINGKATAN|TAHUN|FORM|F|T)\s*(\d+)\b/)

  return match?.[1] || ''
}

const normalizeGradeMatchKey = (value) => {
  const gradeNumber = getGradeNumber(value)
  return gradeNumber ? `TINGKATAN ${gradeNumber}` : normalizeSubjectMatchKey(value)
}

const normalizeClassMatchKey = (className, tingkatan = '') => {
  let normalized = normalizeSubjectMatchKey(className)
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const gradeNumber = getGradeNumber(tingkatan)
  const aliases = [
    normalizeSubjectMatchKey(tingkatan),
    gradeNumber,
    gradeNumber ? `TINGKATAN ${gradeNumber}` : '',
    gradeNumber ? `TAHUN ${gradeNumber}` : '',
    gradeNumber ? `FORM ${gradeNumber}` : '',
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

export const parseCsvText = (text) => {
  const rows = []
  let currentRow = []
  let currentCell = ''
  let inQuotes = false
  const source = String(text || '').replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const nextChar = source[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      continue
    }

    currentCell += char
  }

  currentRow.push(currentCell)
  rows.push(currentRow)

  return rows.filter((row) => row.some((cell) => String(cell || '').trim() !== ''))
}

export const escapeCsvValue = (value) => {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export const downloadCsv = (filename, rows) => {
  const csv = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const normalizeTpValue = (value) => {
  const normalized = String(value || '').trim().toLocaleUpperCase('ms-MY').replace(/\s+/g, '')
  const match = normalized.match(/^(?:TP)?([1-6])$/)
  return match ? Number(match[1]) : null
}

export const buildSubjectHeader = (subject) =>
  String(subject?.subject_name || subject?.subject_code || '').trim().toLocaleUpperCase('ms-MY')

export const buildSubjectLookup = (subjects = []) => {
  const lookup = new Map()

  ;(subjects || []).forEach((subject) => {
    const nameKey = normalizeSubjectMatchKey(subject.subject_name)
    const codeKey = normalizeSubjectMatchKey(subject.subject_code)
    if (nameKey && !lookup.has(nameKey)) lookup.set(nameKey, subject)
    if (codeKey && !lookup.has(codeKey)) lookup.set(codeKey, subject)
  })

  return lookup
}

const buildEnrollmentKey = ({ icNumber, className, tingkatan }) =>
  [
    normalizeSubjectMatchKey(icNumber),
    normalizeClassMatchKey(className, tingkatan),
    normalizeGradeMatchKey(tingkatan),
  ].join('__')

export const buildEnrollmentLookup = (enrollments = [], classes = []) => {
  const classById = new Map((classes || []).map((classRow) => [String(classRow.id), classRow]))
  const lookup = new Map()

  ;(enrollments || []).forEach((enrollment) => {
    const classRow = classById.get(String(enrollment.class_id))
    if (!classRow) return

    const icNumber = enrollment.student_profiles?.ic_number || ''
    const tingkatan = classRow.tingkatan || ''
    const classAliases = [
      classRow.class_name || '',
      `${classRow.tingkatan || ''} ${classRow.class_name || ''}`.trim(),
    ].filter(Boolean)
    const payload = { enrollment, classRow }

    classAliases.forEach((className) => {
      lookup.set(buildEnrollmentKey({ icNumber, className, tingkatan }), payload)
    })
  })

  return lookup
}

export const findEnrollmentFromLookup = ({ lookup, icNumber, className, tingkatan }) =>
  lookup.get(buildEnrollmentKey({ icNumber, className, tingkatan })) || null

export const generatePbdTemplateRows = ({
  subjects = [],
}) => {
  const header = [
    'NO KAD PENGENALAN',
    'NAMA MURID',
    'KELAS',
    'TINGKATAN',
    ...subjects.map((subject) => buildSubjectHeader(subject)),
  ]

  return [header]
}
