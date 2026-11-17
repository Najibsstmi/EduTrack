// Preserve the original first-match behaviour for duplicate records.
export function indexFirstAssessmentRows(rows, examField) {
  const index = new Map()
  for (const row of rows || []) {
    const enrollment = String(row.student_enrollment_id || '')
    const subject = String(row.subject_id || '')
    const exam = String(row[examField] || '').toUpperCase()
    if (!enrollment || !subject || !exam) continue
    const key = `${enrollment}__${subject}__${exam}`
    if (!index.has(key)) index.set(key, row)
  }
  return index
}
