export const TP_LEVELS = [1, 2, 3, 4, 5, 6]

const toNumber = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export const roundPercent = (value) => {
  const number = toNumber(value)
  return Number(number.toFixed(1))
}

export const formatPercent = (value) => `${roundPercent(value).toFixed(1)}%`

export const createEmptyTpCounts = () =>
  TP_LEVELS.reduce((acc, level) => {
    acc[level] = 0
    return acc
  }, {})

export const calculatePbdDistribution = (scoreRows = [], totalStudents = scoreRows.length) => {
  const counts = createEmptyTpCounts()

  ;(scoreRows || []).forEach((row) => {
    const level = Number(row?.tp_level)
    if (!TP_LEVELS.includes(level)) return
    counts[level] += 1
  })

  const safeTotal = Math.max(0, toNumber(totalStudents))
  const percentages = TP_LEVELS.reduce((acc, level) => {
    acc[level] = safeTotal > 0 ? roundPercent((counts[level] / safeTotal) * 100) : 0
    return acc
  }, {})
  const assessedCount = TP_LEVELS.reduce((sum, level) => sum + counts[level], 0)
  const dominantLevel =
    TP_LEVELS.reduce((best, level) => {
      if (!best) return level
      return counts[level] > counts[best] ? level : best
    }, null) || null

  return {
    counts,
    percentages,
    assessedCount,
    totalStudents: safeTotal,
    dominantLevel: counts[dominantLevel] > 0 ? dominantLevel : null,
  }
}

export const calculatePbdMinimumAchievement = (distributionOrScores, totalStudents) => {
  const distribution = Array.isArray(distributionOrScores)
    ? calculatePbdDistribution(distributionOrScores, totalStudents)
    : distributionOrScores

  const counts = distribution?.counts || createEmptyTpCounts()
  const safeTotal = Math.max(0, toNumber(distribution?.totalStudents ?? totalStudents))
  const minimumCount = [3, 4, 5, 6].reduce((sum, level) => sum + toNumber(counts[level]), 0)
  const belowMinimumCount = Math.max(0, safeTotal - minimumCount)

  return {
    minimumCount,
    minimumPercent: safeTotal > 0 ? roundPercent((minimumCount / safeTotal) * 100) : 0,
    belowMinimumCount,
    belowMinimumPercent: safeTotal > 0 ? roundPercent((belowMinimumCount / safeTotal) * 100) : 0,
  }
}

export const calculatePbdClassSummary = ({
  classRow,
  enrollmentIds = [],
  scoreRows = [],
  label,
}) => {
  const enrollmentIdSet = new Set((enrollmentIds || []).map((id) => String(id)))
  const relevantScores = (scoreRows || []).filter((row) =>
    enrollmentIdSet.has(String(row.student_enrollment_id))
  )
  const distribution = calculatePbdDistribution(relevantScores, enrollmentIdSet.size)
  const minimum = calculatePbdMinimumAchievement(distribution)

  return {
    id: classRow?.id || label,
    class_id: classRow?.id || null,
    tingkatan: classRow?.tingkatan || '',
    class_name: classRow?.class_name || label || '',
    label: label || classRow?.class_name || '-',
    ...distribution,
    ...minimum,
  }
}

export const calculatePbdGradeSummary = (classSummaries = [], label = '') => {
  const counts = createEmptyTpCounts()
  let totalStudents = 0

  ;(classSummaries || []).forEach((row) => {
    totalStudents += toNumber(row.totalStudents)
    TP_LEVELS.forEach((level) => {
      counts[level] += toNumber(row.counts?.[level])
    })
  })

  const distribution = calculatePbdDistribution([], totalStudents)
  distribution.counts = counts
  distribution.percentages = TP_LEVELS.reduce((acc, level) => {
    acc[level] = totalStudents > 0 ? roundPercent((counts[level] / totalStudents) * 100) : 0
    return acc
  }, {})
  distribution.assessedCount = TP_LEVELS.reduce((sum, level) => sum + counts[level], 0)
  distribution.dominantLevel =
    TP_LEVELS.reduce((best, level) => {
      if (!best) return level
      return counts[level] > counts[best] ? level : best
    }, null) || null

  return {
    id: `grade-${label}`,
    tingkatan: label,
    class_name: 'JUMLAH',
    label: `Jumlah ${label}`,
    ...distribution,
    ...calculatePbdMinimumAchievement(distribution),
  }
}

export const calculatePbdSubjectSummary = ({
  classes = [],
  subject = null,
  subjects = [],
  subjectName = '',
  enrollments = [],
  studentSubjectEnrollments = [],
  scoreRows = [],
}) => {
  const normalizedSubjectName = String(subjectName || subject?.subject_name || '').trim().toLowerCase()

  if (!subject && !normalizedSubjectName) {
    return {
      classSummaries: [],
      gradeSummaries: [],
      overallSummary: calculatePbdGradeSummary([], 'Keseluruhan'),
    }
  }

  const classSummaries = (classes || []).map((classRow) => {
    const resolvedSubject =
      subject ||
      (subjects || []).find(
        (item) =>
          String(item.subject_name || '').trim().toLowerCase() === normalizedSubjectName &&
          String(item.tingkatan || '').trim().toLowerCase() ===
            String(classRow.tingkatan || '').trim().toLowerCase()
      )

    if (!resolvedSubject) {
      return calculatePbdClassSummary({
        classRow,
        enrollmentIds: [],
        scoreRows: [],
      })
    }

    const isSelective =
      String(resolvedSubject.subject_type || '').trim().toLowerCase() === 'selective'
    const selectedSubjectEnrollmentIds = new Set(
      (studentSubjectEnrollments || [])
        .filter(
          (row) =>
            String(row.subject_id) === String(resolvedSubject.id) &&
            row.is_active !== false
        )
        .map((row) => String(row.student_enrollment_id))
    )
    const enrollmentIds = (enrollments || [])
      .filter((enrollment) => String(enrollment.class_id) === String(classRow.id))
      .filter((enrollment) => !isSelective || selectedSubjectEnrollmentIds.has(String(enrollment.id)))
      .map((enrollment) => enrollment.id)
    const relevantScoreRows = (scoreRows || []).filter(
      (row) => String(row.subject_id) === String(resolvedSubject.id)
    )

    return calculatePbdClassSummary({
      classRow,
      enrollmentIds,
      scoreRows: relevantScoreRows,
    })
  })

  const gradeMap = new Map()

  classSummaries.forEach((summary) => {
    const grade = summary.tingkatan || '-'
    if (!gradeMap.has(grade)) gradeMap.set(grade, [])
    gradeMap.get(grade).push(summary)
  })

  const gradeSummaries = Array.from(gradeMap.entries()).map(([grade, summaries]) =>
    calculatePbdGradeSummary(summaries, grade)
  )

  return {
    classSummaries,
    gradeSummaries,
    overallSummary: calculatePbdGradeSummary(classSummaries, 'Keseluruhan'),
  }
}
