const uniqueStrings = (values) => [...new Set((values || []).map((value) => String(value)))]

export const getPbdDatasetEnrollmentIds = ({
  datasetKey,
  classId,
  subjectId,
  currentEnrollmentIds = [],
  sourceRows = [],
}) => {
  if (datasetKey === 'CURRENT') return uniqueStrings(currentEnrollmentIds)

  return uniqueStrings(
    sourceRows
      .filter(
        (row) =>
          String(row.class_id) === String(classId) &&
          String(row.subject_id) === String(subjectId)
      )
      .map((row) => row.student_enrollment_id)
  )
}

export const getPbdDatasetEnrollments = ({
  datasetKey,
  classId,
  enrollments = [],
  sourceRows = [],
}) => {
  if (datasetKey === 'CURRENT') {
    return enrollments.filter(
      (row) => row.is_active === true && String(row.class_id) === String(classId)
    )
  }

  const snapshotEnrollmentIds = new Set(
    sourceRows
      .filter((row) => String(row.class_id) === String(classId))
      .map((row) => String(row.student_enrollment_id))
  )

  return enrollments.filter((row) => snapshotEnrollmentIds.has(String(row.id)))
}
