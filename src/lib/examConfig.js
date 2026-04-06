const normalizeGradeLabel = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const extractGradeNumber = (value) => {
  const match = String(value || '').match(/(\d+)/)
  return match ? Number(match[1]) : null
}

export const findMatchingConfigEntry = (source, gradeLabel) => {
  const entries = Object.entries(source || {})
  if (!entries.length) return null

  const normalizedLabel = normalizeGradeLabel(gradeLabel)
  const gradeNumber = extractGradeNumber(gradeLabel)

  const exactMatch = entries.find(
    ([label]) => normalizeGradeLabel(label) === normalizedLabel
  )

  if (exactMatch) return exactMatch

  if (gradeNumber !== null) {
    const numericMatch = entries.find(
      ([label]) => extractGradeNumber(label) === gradeNumber
    )

    if (numericMatch) return numericMatch
  }

  return null
}

const getDefaultExamOrder = (examKey) => {
  const key = String(examKey || '').trim().toUpperCase()

  if (key === 'TOV') return 0
  if (key === 'ETR') return 999

  const otrMatch = key.match(/^OTR(\d+)$/)
  if (otrMatch) return Number(otrMatch[1]) * 10

  const arMatch = key.match(/^AR(\d+)$/)
  if (arMatch) return Number(arMatch[1]) * 10 + 1

  return 500
}

const normalizeExamItems = (exams = []) => {
  return exams
    .filter(Boolean)
    .map((exam) => ({
      key: String(exam.key || exam.exam_key || '').trim().toUpperCase(),
      name: String(exam.name || exam.exam_name || exam.key || exam.exam_key || '').trim(),
      exam_order: Number.isFinite(Number(exam.exam_order))
        ? Number(exam.exam_order)
        : getDefaultExamOrder(exam.key || exam.exam_key),
    }))
    .filter((exam) => exam.key)
    .sort((a, b) => a.exam_order - b.exam_order)
    .map(({ key, name }) => ({ key, name: name || key }))
}

export const buildGeneratedExamStructureFromCounts = (setupConfig = {}) => {
  const activeGradeLabels = setupConfig?.active_grade_labels || []
  const arCountByGrade = setupConfig?.ar_count_by_grade || {}
  const otrCountByGrade = setupConfig?.otr_count_by_grade || {}

  return activeGradeLabels.reduce((result, label) => {
    const matchedArCountEntry = findMatchingConfigEntry(arCountByGrade, label)
    const matchedOtrCountEntry = findMatchingConfigEntry(otrCountByGrade, label)
    const arCount = Number(matchedArCountEntry?.[1] || 0)
    const otrCount = Number(matchedOtrCountEntry?.[1] || 0)
    const stageCount = Math.max(arCount, otrCount)
    const exams = [{ key: 'TOV', name: 'TOV' }]

    for (let i = 1; i <= stageCount; i++) {
      if (i <= otrCount) {
        exams.push({ key: `OTR${i}`, name: `OTR${i}` })
      }

      if (i <= arCount) {
        exams.push({ key: `AR${i}`, name: `AR${i}` })
      }
    }

    exams.push({ key: 'ETR', name: 'ETR' })
    result[label] = exams
    return result
  }, {})
}

const mergeExamStructures = (baseStructure = {}, overlayStructure = {}) => {
  const next = { ...baseStructure }

  Object.entries(overlayStructure || {}).forEach(([label, exams]) => {
    const normalizedExams = normalizeExamItems(exams)

    if (normalizedExams.length > 0) {
      next[label] = normalizedExams
    }
  })

  return next
}

export const buildExamStructureFromExamConfigs = (
  examConfigs = [],
  fallbackStructure = {}
) => {
  const grouped = (examConfigs || [])
    .filter((row) => row && row.is_active !== false)
    .reduce((acc, row) => {
      const gradeLabel = String(row.grade_label || '').trim()
      const examKey = String(row.exam_key || '').trim().toUpperCase()

      if (!gradeLabel || !examKey) {
        return acc
      }

      if (!acc[gradeLabel]) {
        acc[gradeLabel] = []
      }

      acc[gradeLabel].push({
        key: examKey,
        name: String(row.exam_name || examKey).trim() || examKey,
        exam_order: row.exam_order,
      })

      return acc
    }, {})

  return mergeExamStructures(fallbackStructure, grouped)
}

export const normalizeSetupConfigWithExamConfigs = (setupConfig, examConfigs = []) => {
  const baseSetupConfig = setupConfig || {}
  const generatedStructure = buildGeneratedExamStructureFromCounts(baseSetupConfig)
  const mergedWithExisting = mergeExamStructures(
    generatedStructure,
    baseSetupConfig.exam_structure || {}
  )
  const normalizedStructure = buildExamStructureFromExamConfigs(
    examConfigs,
    mergedWithExisting
  )

  return {
    ...baseSetupConfig,
    exam_structure: normalizedStructure,
  }
}

export const getExamStructureForGrade = (setupConfig, gradeLabel) => {
  const examStructure = setupConfig?.exam_structure || {}
  const directMatch = examStructure?.[gradeLabel]

  if (Array.isArray(directMatch) && directMatch.length > 0) {
    return normalizeExamItems(directMatch)
  }

  const matchedEntry = findMatchingConfigEntry(examStructure, gradeLabel)

  if (matchedEntry && Array.isArray(matchedEntry[1]) && matchedEntry[1].length > 0) {
    return normalizeExamItems(matchedEntry[1])
  }

  return []
}