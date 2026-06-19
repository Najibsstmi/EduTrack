export const PBD_TP_DESCRIPTOR_WORKBOOK_URL =
  '/PENERANGAN%20TAHAP%20PENGUASAAN.xlsx'

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('ms-MY')

const parseTpLevel = (value) => {
  const match = String(value ?? '').match(/[1-6]/)
  return match ? Number(match[0]) : null
}

const getDescriptorKey = (row) =>
  [
    row?.school_id || '',
    normalizeText(row?.tingkatan),
    normalizeText(row?.subject_name),
    parseTpLevel(row?.tp_level) || '',
  ].join('__')

export const parsePbdTpDescriptorWorkbookRows = (rows = []) => {
  if (!Array.isArray(rows) || rows.length < 2) return []

  const subjectHeaders = (rows[0] || []).map((header) => normalizeText(header))
  const descriptors = []

  rows.slice(1).forEach((row) => {
    const tpLevel = parseTpLevel(row?.[0])
    if (!tpLevel) return

    subjectHeaders.slice(1).forEach((subjectName, subjectIndex) => {
      const statement = String(row?.[subjectIndex + 1] || '').trim()
      if (!subjectName || !statement) return

      descriptors.push({
        id: `workbook-${subjectName}-${tpLevel}`,
        school_id: null,
        tingkatan: null,
        subject_name: subjectName,
        tp_level: tpLevel,
        statement,
      })
    })
  })

  return descriptors
}

export const loadPbdTpDescriptorsFromWorkbook = async ({
  fetchImpl = globalThis.fetch,
  readSheetImpl,
  url = PBD_TP_DESCRIPTOR_WORKBOOK_URL,
} = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fungsi fetch tidak tersedia untuk membaca penerangan TP.')
  }

  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`Fail penerangan TP tidak dapat dibaca (${response.status}).`)
  }

  const reader = readSheetImpl || (await import('read-excel-file/browser')).readSheet
  const rows = await reader(await response.blob())
  return parsePbdTpDescriptorWorkbookRows(rows)
}

export const mergePbdTpDescriptors = ({
  databaseDescriptors = [],
  workbookDescriptors = [],
} = {}) => {
  const merged = new Map()

  ;(databaseDescriptors || []).forEach((row) => {
    merged.set(getDescriptorKey(row), row)
  })

  ;(workbookDescriptors || []).forEach((row) => {
    merged.set(getDescriptorKey(row), row)
  })

  return [...merged.values()]
}
