const normalizeSubjectType = (value) => String(value || '').trim().toLowerCase()

export const getRelevantEnrollmentIds = ({
  classId,
  subject,
  academicYear,
  enrollments,
  studentSubjectEnrollments,
}) => {
  if (!subject) return []

  const isSelective =
    normalizeSubjectType(subject.subject_type) === 'selective' || subject.is_core === false

  if (!isSelective) {
    return (enrollments || [])
      .filter(
        (enrollment) =>
          enrollment.class_id === classId &&
          enrollment.academic_year === academicYear &&
          enrollment.is_active === true
      )
      .map((enrollment) => enrollment.id)
  }

  return (studentSubjectEnrollments || [])
    .filter(
      (row) =>
        row.subject_id === subject.id &&
        row.academic_year === academicYear &&
        row.is_active === true
    )
    .map((row) => row.student_enrollment_id)
}

export const getRelevantEnrollmentIdsForSubject = getRelevantEnrollmentIds