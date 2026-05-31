export const SEGAK_TERMS = ['PENGGAL_1', 'PENGGAL_2']
export const SEGAK_GRADES = ['A', 'B', 'C', 'D', 'E', 'F']
export const SEGAK_STAR_LEVELS = [5, 4, 3, 2, 1, 0]

export const BMI_CATEGORIES = [
  'Kurang Berat Badan',
  'Normal',
  'Berlebihan Berat Badan',
  'Obes',
]

const SEGAK_BANDS = [
  {
    min: 18,
    max: 20,
    grade: 'A',
    stars: 5,
    fitnessLevel: 'Cemerlang',
    statement: 'Cemerlang',
  },
  {
    min: 15,
    max: 17,
    grade: 'B',
    stars: 4,
    fitnessLevel: 'Baik',
    statement: 'Baik',
  },
  {
    min: 12,
    max: 14,
    grade: 'C',
    stars: 3,
    fitnessLevel: 'Memuaskan',
    statement: 'Memuaskan',
  },
  {
    min: 8,
    max: 11,
    grade: 'D',
    stars: 2,
    fitnessLevel: 'Kurang Cergas',
    statement: 'Kurang Cergas',
  },
  {
    min: 4,
    max: 7,
    grade: 'E',
    stars: 1,
    fitnessLevel: 'Perlu Tingkatkan Kecergasan',
    statement: 'Perlu Tingkatkan Kecergasan',
  },
  {
    min: 0,
    max: 3,
    grade: 'F',
    stars: 0,
    fitnessLevel: 'Tidak Melengkapkan Ujian',
    statement: 'Tidak Melengkapkan Ujian',
  },
]

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const roundTo = (value, digits = 2) => {
  const multiplier = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * multiplier) / multiplier
}

const getSegakBand = (score, isAbsent = false) => {
  if (isAbsent) return SEGAK_BANDS[SEGAK_BANDS.length - 1]

  const normalizedScore = normalizeSegakScore(score)
  if (normalizedScore === null) return null

  return (
    SEGAK_BANDS.find(
      (band) => normalizedScore >= band.min && normalizedScore <= band.max
    ) || SEGAK_BANDS[SEGAK_BANDS.length - 1]
  )
}

export function calculateBmi(weightKg, heightCm) {
  const weight = toFiniteNumber(weightKg)
  const height = toFiniteNumber(heightCm)

  if (!weight || !height || weight <= 0 || height <= 0) return null

  const heightM = height / 100
  return roundTo(weight / (heightM * heightM), 2)
}

export function getBmiCategory(bmi) {
  const value = toFiniteNumber(bmi)
  if (value === null) return ''

  // TODO: Semak semula kategori BMI rasmi SEGAK/KPM jika sekolah mahu ikut jadual umur dan jantina.
  if (value < 18.5) return 'Kurang Berat Badan'
  if (value < 25) return 'Normal'
  if (value < 30) return 'Berlebihan Berat Badan'
  return 'Obes'
}

export function normalizeSegakScore(score) {
  const value = toFiniteNumber(score)
  if (value === null) return null

  return Math.min(20, Math.max(0, Math.round(value)))
}

export function getSegakGrade(score, isAbsent = false) {
  return getSegakBand(score, isAbsent)?.grade || ''
}

export function getSegakStars(score, isAbsent = false) {
  const band = getSegakBand(score, isAbsent)
  return band ? band.stars : null
}

export function getSegakFitnessLevel(score, isAbsent = false) {
  return getSegakBand(score, isAbsent)?.fitnessLevel || ''
}

export function getSegakFitnessStatement(score, isAbsent = false) {
  return getSegakBand(score, isAbsent)?.statement || ''
}

const createCounts = (keys) =>
  keys.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {})

const getRowScore = (row) =>
  row?.segak_total_score ?? row?.score ?? row?.skor_segak ?? row?.total_score

const getRowGrade = (row, score) =>
  row?.segak_grade || row?.grade || getSegakGrade(score, row?.is_absent)

const getRowStars = (row, score) => {
  const value = row?.segak_stars ?? row?.stars
  const number = toFiniteNumber(value)
  return number === null ? getSegakStars(score, row?.is_absent) : number
}

export function calculateSegakSummary(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : []
  const bmiCategoryCounts = createCounts(BMI_CATEGORIES)
  const gradeCounts = createCounts(SEGAK_GRADES)
  const starCounts = createCounts(SEGAK_STAR_LEVELS)

  let bmiTotal = 0
  let bmiCount = 0
  let segakScoreTotal = 0
  let segakScoreCount = 0
  let incompleteCount = 0
  let missingBmiCount = 0

  safeRows.forEach((row) => {
    const bmi = toFiniteNumber(row?.bmi)
    const bmiCategory = row?.bmi_category || row?.kategori_bmi || getBmiCategory(bmi)

    if (bmi !== null) {
      bmiTotal += bmi
      bmiCount += 1
    }

    if (bmiCategory && bmiCategoryCounts[bmiCategory] !== undefined) {
      bmiCategoryCounts[bmiCategory] += 1
    } else {
      missingBmiCount += 1
    }

    const score = getRowScore(row)
    const normalizedScore = row?.is_absent ? 0 : normalizeSegakScore(score)
    const grade = getRowGrade(row, normalizedScore)
    const stars = getRowStars(row, normalizedScore)

    if (normalizedScore !== null) {
      segakScoreTotal += normalizedScore
      segakScoreCount += 1
    }

    if (gradeCounts[grade] !== undefined) {
      gradeCounts[grade] += 1
    } else {
      gradeCounts.F += 1
    }

    if (starCounts[stars] !== undefined) {
      starCounts[stars] += 1
    } else {
      starCounts[0] += 1
    }

    if (grade === 'F' || normalizedScore === null || row?.is_absent) {
      incompleteCount += 1
    }
  })

  const fitCount = ['A', 'B', 'C'].reduce((sum, grade) => sum + gradeCounts[grade], 0)
  const attentionCount = ['D', 'E', 'F'].reduce(
    (sum, grade) => sum + gradeCounts[grade],
    0
  )
  const totalStudents = safeRows.length

  return {
    totalStudents,
    averageBmi: bmiCount > 0 ? roundTo(bmiTotal / bmiCount, 2) : null,
    bmiCount,
    bmiCategoryCounts,
    missingBmiCount,
    averageSegakScore: segakScoreCount > 0 ? roundTo(segakScoreTotal / segakScoreCount, 2) : null,
    segakScoreCount,
    gradeCounts,
    starCounts,
    incompleteCount,
    fitCount,
    fitPercent: totalStudents > 0 ? roundTo((fitCount / totalStudents) * 100, 1) : 0,
    attentionCount,
    attentionPercent: totalStudents > 0 ? roundTo((attentionCount / totalStudents) * 100, 1) : 0,
  }
}
