const DEFAULT_OTR_GENERATION_MODE = 'percentage_to_etr'

const DEFAULT_OTR_PERCENTAGES_DEFAULT = {
  OTR1: 0.4,
  OTR2: 0.75,
}

const DEFAULT_OTR_PERCENTAGES_BY_GRADE = {
  'Tingkatan 1': { OTR1: 0.4, OTR2: 0.75 },
  'Tingkatan 2': { OTR1: 0.4, OTR2: 0.75 },
  'Tingkatan 3': { OTR1: 0.35, OTR2: 0.7 },
  'Tingkatan 4': { OTR1: 0.4, OTR2: 0.75 },
  'Tingkatan 5': { OTR1: 0.5, OTR2: 0.8 },
}

const clampMark = (value) => {
  const numericValue = Number(value)

  if (Number.isNaN(numericValue)) return null
  if (numericValue < 0) return 0
  if (numericValue > 100) return 100

  return numericValue
}

export const buildDefaultOtrPercentagesByGrade = (
  activeGradeLabels = [],
  existingPercentages = {},
  defaultPercentages = DEFAULT_OTR_PERCENTAGES_DEFAULT
) => {
  const next = { ...(existingPercentages || {}) }

  activeGradeLabels.forEach((gradeLabel) => {
    next[gradeLabel] = {
      ...(defaultPercentages || {}),
      ...(DEFAULT_OTR_PERCENTAGES_BY_GRADE[gradeLabel] || {}),
      ...(existingPercentages?.[gradeLabel] || {}),
    }
  })

  return next
}

export const getDefaultOtrPercentages = (setupConfig) => {
  return {
    ...DEFAULT_OTR_PERCENTAGES_DEFAULT,
    ...(setupConfig?.otr_percentages_default || {}),
  }
}

export const getOtrSettings = (setupConfig, activeGradeLabels = []) => {
  const otrPercentagesDefault = getDefaultOtrPercentages(setupConfig)

  return {
    otr_generation_mode:
      setupConfig?.otr_generation_mode || DEFAULT_OTR_GENERATION_MODE,
    otr_percentages_default: otrPercentagesDefault,
    otr_percentages_by_grade: buildDefaultOtrPercentagesByGrade(
      activeGradeLabels,
      setupConfig?.otr_percentages_by_grade || {},
      otrPercentagesDefault
    ),
    auto_recalculate_otr_on_etr_change:
      setupConfig?.auto_recalculate_otr_on_etr_change ?? true,
  }
}

export const shouldAutoRecalculateOtrs = (setupConfig) => {
  return getOtrSettings(setupConfig).auto_recalculate_otr_on_etr_change
}

export const getOtrKeysForTingkatan = (tingkatan, setupConfig) => {
  const exams = setupConfig?.exam_structure?.[tingkatan] || []

  return exams
    .filter((item) => String(item.key || '').toUpperCase().startsWith('OTR'))
    .map((item) => String(item.key || '').toUpperCase())
}

const generateLinearOtrMarks = (start, end, keys) => {
  const gap = end - start
  const result = {}

  keys.forEach((key, index) => {
    const position = index + 1
    const value = start + (gap * position) / (keys.length + 1)
    const clampedValue = clampMark(Number(value.toFixed(1)))

    if (clampedValue !== null) {
      result[key] = clampedValue
    }
  })

  return result
}

export const generateOtrMarks = ({
  tingkatan,
  tovMark,
  etrMark,
  setupConfig,
  otrKeys,
}) => {
  const keys = (otrKeys || []).length ? otrKeys : getOtrKeysForTingkatan(tingkatan, setupConfig)

  if (!keys.length) return {}

  const start = Number(tovMark)
  const end = Number(etrMark)

  if (Number.isNaN(start) || Number.isNaN(end)) return {}

  const settings = getOtrSettings(setupConfig, [tingkatan].filter(Boolean))

  if (settings.otr_generation_mode !== DEFAULT_OTR_GENERATION_MODE) {
    return generateLinearOtrMarks(start, end, keys)
  }

  const percentagesByKey = settings.otr_percentages_by_grade?.[tingkatan] || {}
  const defaultPercentagesByKey = settings.otr_percentages_default || {}
  const result = {}

  keys.forEach((key, index) => {
    const configuredRatio = Number(percentagesByKey[key])
    const defaultRatio = Number(defaultPercentagesByKey[key])
    const ratio =
      Number.isFinite(configuredRatio) && configuredRatio >= 0 && configuredRatio <= 1
        ? configuredRatio
        : Number.isFinite(defaultRatio) && defaultRatio >= 0 && defaultRatio <= 1
          ? defaultRatio
        : (index + 1) / (keys.length + 1)

    const value = start + (end - start) * ratio
    const clampedValue = clampMark(Number(value.toFixed(1)))

    if (clampedValue !== null) {
      result[key] = clampedValue
    }
  })

  return result
}