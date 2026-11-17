const normalize = (value) => String(value || '').trim().toUpperCase()

export function scoreMatchesExam(score, exam) {
  if (!exam) return false
  if (score.exam_config_id) return String(score.exam_config_id) === String(exam.id)
  const key = normalize(score.exam_key)
  return Boolean(key && key === normalize(exam.exam_key))
}

export function latestRecord(rows = []) {
  return [...rows].sort((a, b) => {
    const dateA = Date.parse(a.assessment_date || a.updated_at || a.created_at || '') || 0
    const dateB = Date.parse(b.assessment_date || b.updated_at || b.created_at || '') || 0
    if (dateA !== dateB) return dateB - dateA
    const updateA = Date.parse(a.updated_at || a.created_at || '') || 0
    const updateB = Date.parse(b.updated_at || b.created_at || '') || 0
    return updateB - updateA || String(b.term || '').localeCompare(String(a.term || '')) || String(b.id || '').localeCompare(String(a.id || ''))
  })[0] || null
}

export function latestPbdBySubject(currentRows = [], legacyRows = []) {
  const latestById = (rows) => {
    const groups = new Map()
    rows.forEach((row) => {
      if (!row.subject_id) return
      const id = String(row.subject_id)
      groups.set(id, [...(groups.get(id) || []), row])
    })
    return new Map([...groups].map(([id, values]) => [id, latestRecord(values)]))
  }
  const legacy = latestById(legacyRows)
  const current = latestById(currentRows)
  current.forEach((row, id) => legacy.set(id, row))
  return [...legacy.values()]
}
