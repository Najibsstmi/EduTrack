const normalizeSubjectType = (value) =>
  String(value || '').trim().toLowerCase()

export const getRelevantEnrollmentIds = ({
  classId,
  subject,
  enrollments,
  studentSubjectEnrollments,
}) => {
  if (!subject) return []

  const isSelective = normalizeSubjectType(subject?.subject_type) === 'selective'

  // Untuk subjek core, guna semua murid aktif yang query page dah ambil.
  // Jangan tapis lagi academic_year / is_active di sini sebab page dah tapis siap-siap.
  if (!isSelective) {
    return (enrollments || [])
      .filter((enrollment) => enrollment.class_id === classId)
      .map((enrollment) => enrollment.id)
  }

  const classEnrollmentIds = new Set(
    (enrollments || [])
      .filter((enrollment) => enrollment.class_id === classId)
      .map((enrollment) => enrollment.id)
  )

  // Untuk subjek selective, guna enrollment murid-subjek dalam kelas yang sama sahaja.
  return (studentSubjectEnrollments || [])
    .filter(
      (row) =>
        row.subject_id === subject.id &&
        classEnrollmentIds.has(row.student_enrollment_id)
    )
    .map((row) => row.student_enrollment_id)
}

export const getRelevantEnrollmentIdsForSubject = getRelevantEnrollmentIds

export const buildStudentExamMap = (scoreRows = []) => {
  const map = new Map()

  scoreRows.forEach((row) => {
    const enrollmentId = row.student_enrollment_id
    const subjectId = row.subject_id
    const examKey = String(row.exam_key || '').trim().toUpperCase()

    if (!enrollmentId || !subjectId || !examKey) return

    const key = `${enrollmentId}__${subjectId}`

    if (!map.has(key)) {
      map.set(key, new Set())
    }

    map.get(key).add(examKey)
  })

  return map
}
