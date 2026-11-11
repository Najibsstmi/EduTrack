import type { ArtFieldImportRow } from '../types'

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }

    if (character === '"') quoted = true
    else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ''
    } else field += character
  }

  row.push(field.replace(/\r$/, ''))
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

export function parseArtFieldImport(text: string): ArtFieldImportRow[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  if (rows.length < 2) throw new Error('Fail CSV tidak mengandungi data murid.')

  const headers = rows[0].map((value) => value.trim().toLowerCase())
  const required = ['document_class', 'document_row', 'student_name', 'normalized_ic', 'art_field']
  const indexes = Object.fromEntries(required.map((header) => [header, headers.indexOf(header)]))
  if (required.some((header) => indexes[header] < 0)) {
    throw new Error('Format CSV tidak sah. Gunakan fail import bidang seni yang disediakan.')
  }

  return rows.slice(1).map((values, index) => ({
    document_class: String(values[indexes.document_class] || '').trim(),
    document_row: Number(values[indexes.document_row]) || index + 2,
    student_name: String(values[indexes.student_name] || '').trim(),
    normalized_ic: String(values[indexes.normalized_ic] || '').replace(/\D/g, ''),
    art_field: String(values[indexes.art_field] || '').trim(),
  }))
}
