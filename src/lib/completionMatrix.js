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
    normalizeSubjectType(subject?.subject_type) === 'selective'

  if (!isSelective) {
    return (enrollments || [])
      .filter(
        (enrollment) =>
          enrollment.class_id === classId &&
          Number(enrollment.academic_year) === Number(academicYear) &&
          enrollment.is_active === true
      )
      .map((enrollment) => enrollment.id)
  }

  return (studentSubjectEnrollments || [])
    .filter(
      (row) =>
        row.subject_id === subject.id &&
        Number(row.academic_year) === Number(academicYear) &&
        row.is_active === true
    )
    .map((row) => row.student_enrollment_id)
}

export const getRelevantEnrollmentIdsForSubject = getRelevantEnrollmentIds