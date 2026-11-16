import { isGradeAtLeastMinimum, normalizeGrade } from './minimumCAnalysis.js'

export function configuredGrades(scales, level, year) {
  return (scales || []).filter((row) => {
    const label = String(row.grade_label ?? row.tingkatan ?? row.form_level ?? '').trim().toLowerCase()
    return label === String(level || '').trim().toLowerCase() &&
      (!row.academic_year || String(row.academic_year) === String(year)) &&
      normalizeGrade(row.grade_name ?? row.grade) !== 'TH'
  }).sort((a, b) => Number(b.min_mark ?? b.min_score) - Number(a.min_mark ?? a.min_score))
}

export function buildClassAnalysis({ students, subjects, enrollmentSet, gradeScales, academicYear, examKey, getMetric, isPassGrade }) {
  const rows = []
  for (const subject of subjects) {
    const eligible = students.filter((student) => String(subject.subject_type || '').toLowerCase() !== 'selective' || enrollmentSet.has(`${student.enrollment_id}__${subject.id}`))
    const results = eligible.map((student) => {
      const metric = getMetric(student, subject, examKey)
      const scale = configuredGrades(gradeScales, student.tingkatan, academicYear)
      const mark = metric?.mark
      const hasMark = mark !== null && mark !== undefined && mark !== '' && Number.isFinite(Number(mark))
      const markGrade = hasMark ? scale.find((item) => Math.round(Number(mark)) >= Number(item.min_mark ?? item.min_score) && Math.round(Number(mark)) <= Number(item.max_mark ?? item.max_score)) : null
      const grade = normalizeGrade(markGrade?.grade_name ?? markGrade?.grade ?? metric?.grade_name)
      const configured = scale.find((item) => normalizeGrade(item.grade_name ?? item.grade) === grade)
      const point = configured?.grade_point ?? configured?.point_value ?? configured?.grade_value
      const valid = hasMark && !metric?.is_absent && grade !== 'TH' && Boolean(markGrade && configured) && point !== null && point !== undefined && point !== '' && Number.isFinite(Number(point))
      const cScale = scale.find((item) => normalizeGrade(item.grade_name ?? item.grade) === 'C')
      const minimumC = valid && cScale ? isGradeAtLeastMinimum(grade, 'C', scale, student.tingkatan) : null
      const threshold = cScale ? Number(cScale.min_mark ?? cScale.min_score) : NaN
      const passes = typeof configured?.is_pass === 'boolean' ? configured.is_pass : isPassGrade(grade)
      return { student, metric, grade, point: valid ? Number(point) : null, valid, minimumC, threshold: Number.isFinite(threshold) ? threshold : null, passed: valid && passes }
    })
    const valid = results.filter((item) => item.valid)
    const minimumValid = valid.filter((item) => item.minimumC !== null)
    const totalPoint = valid.reduce((sum, item) => sum + item.point, 0)
    const passCount = valid.filter((item) => item.passed).length
    const minimumCount = minimumValid.filter((item) => item.minimumC).length
    const gradeCounts = Object.fromEntries(configuredGrades(gradeScales, students[0]?.tingkatan, academicYear).map((item) => [normalizeGrade(item.grade_name ?? item.grade), 0]))
    valid.forEach((item) => { gradeCounts[item.grade] = (gradeCounts[item.grade] || 0) + 1 })
    rows.push({ subject, results, valid, gradeCounts, scoredCount: valid.length, passCount, failCount: valid.length - passCount, gp: valid.length ? totalPoint / valid.length : null, passRate: valid.length ? passCount / valid.length * 100 : null, minimumCount, belowCount: minimumValid.length - minimumCount, minimumValidCount: minimumValid.length, minimumRate: minimumValid.length ? minimumCount / minimumValid.length * 100 : null })
  }
  return rows
}

export function buildClassInterventions(rows, previous, getMetric) {
  return rows.flatMap((row) => row.valid.flatMap((item) => {
    const target = getMetric(item.student, row.subject, 'ETR')
    const prior = previous?.rows.find((entry) => entry.subject.id === row.subject.id)?.valid.find((entry) => entry.student.enrollment_id === item.student.enrollment_id)
    const flags = []
    if (item.minimumC === false) flags.push('Bawah C')
    if (!item.passed) flags.push('Tidak lulus')
    if (prior && item.point > prior.point) flags.push('Gred merosot')
    if (target?.mark !== null && target?.mark !== undefined && target?.mark !== '' && Number(item.metric.mark) < Number(target.mark)) flags.push('Belum capai ETR')
    return flags.length ? [{ ...item, subject: row.subject, target, flags }] : []
  }))
}

export function comparisonSignature(rows) {
  return rows.flatMap((row) => row.valid.map((item) => `${item.student.enrollment_id}:${row.subject.id}`)).sort().join('|')
}

export function rankClasses(rows) {
  const sorted = [...rows].filter((row) => row.gps !== null).sort((a, b) => a.gps - b.gps || String(a.class_name).localeCompare(String(b.class_name), 'ms'))
  return sorted.map((row, index) => ({ ...row, rank: sorted.findIndex((item) => item.gps === row.gps) + 1 || index + 1 }))
}
