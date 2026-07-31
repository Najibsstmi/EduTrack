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

export const buildStudentExamMap = (scoreRows = [], options = {}) => {
  const map = new Map()
  const examConfigKeyById = options.examConfigKeyById || new Map()

  const addExamKey = ({ enrollmentId, subjectId, examKey }) => {
    const normalizedExamKey = String(examKey || '').trim().toUpperCase()

    if (!enrollmentId || !subjectId || !normalizedExamKey) return

    const key = `${enrollmentId}__${subjectId}`

    if (!map.has(key)) {
      map.set(key, new Set())
    }

    map.get(key).add(normalizedExamKey)
  }

  scoreRows.forEach((row) => {
    const enrollmentId = row.student_enrollment_id
    const subjectId = row.subject_id
    const configuredExamKey = row.exam_config_id
      ? examConfigKeyById.get(String(row.exam_config_id))
      : ''

    addExamKey({ enrollmentId, subjectId, examKey: row.exam_key })
    addExamKey({ enrollmentId, subjectId, examKey: configuredExamKey })
  })

  return map
}
