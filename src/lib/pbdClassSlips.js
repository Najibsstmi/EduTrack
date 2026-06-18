import { getRelevantEnrollmentIds } from './completionMatrix.js'

export const PBD_DESCRIPTOR_FALLBACK =
  'Pernyataan TP belum tersedia untuk subjek ini.'

const PBD_NOT_RECORDED_STATEMENT = 'Tahap Penguasaan belum direkodkan.'

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('ms-MY')

const getSubjectIdentity = (subject) =>
  `${normalizeText(subject?.subject_name)}__${normalizeText(subject?.subject_code)}`

export const parsePbdTpLevel = (value) => {
  const match = String(value ?? '').match(/[1-6]/)
  const tp = match ? Number(match[0]) : Number.NaN
  return tp >= 1 && tp <= 6 ? tp : null
}

export const resolvePbdTpStatement = ({
  descriptors,
  schoolId,
  subjectName,
  tingkatan,
  tp,
}) => {
  if (!tp) return PBD_NOT_RECORDED_STATEMENT

  const normalizedSubject = normalizeText(subjectName)
  const normalizedTingkatan = normalizeText(tingkatan)
  const candidates = (descriptors || [])
    .filter(
      (row) =>
        normalizeText(row.subject_name) === normalizedSubject &&
        parsePbdTpLevel(row.tp_level) === tp &&
        (!row.school_id || String(row.school_id) === String(schoolId)) &&
        (!row.tingkatan || normalizeText(row.tingkatan) === normalizedTingkatan)
    )
    .sort((a, b) => {
      const schoolPriority = Number(Boolean(b.school_id)) - Number(Boolean(a.school_id))
      if (schoolPriority !== 0) return schoolPriority
      return Number(Boolean(b.tingkatan)) - Number(Boolean(a.tingkatan))
    })

  return String(candidates[0]?.statement || '').trim() || PBD_DESCRIPTOR_FALLBACK
}

const getSubjectsForClass = (subjects, tingkatan) => {
  const normalizedTingkatan = normalizeText(tingkatan)
  const candidates = (subjects || []).filter(
    (subject) =>
      !subject.tingkatan || normalizeText(subject.tingkatan) === normalizedTingkatan
  )
  const subjectByIdentity = new Map()

  candidates.forEach((subject) => {
    const key = getSubjectIdentity(subject)
    const existing = subjectByIdentity.get(key)
    const isExact = normalizeText(subject.tingkatan) === normalizedTingkatan
    const existingIsExact = normalizeText(existing?.tingkatan) === normalizedTingkatan

    if (!existing || (isExact && !existingIsExact)) subjectByIdentity.set(key, subject)
  })

  return [...subjectByIdentity.values()]
}

export const buildPbdClassSlips = ({
  schoolId,
  classRow,
  classLabel,
  levelLabel,
  enrollments,
  subjects,
  studentSubjectEnrollments,
  sourceRows,
  descriptors,
}) => {
  if (!schoolId || !classRow?.id) return []

  const classStudents = (enrollments || [])
    .filter((row) => String(row.class_id) === String(classRow.id))
    .sort((a, b) =>
      String(a.student_profiles?.full_name || '').localeCompare(
        String(b.student_profiles?.full_name || ''),
        'ms',
        { sensitivity: 'base' }
      )
    )
  const classEnrollmentIds = new Set(classStudents.map((row) => String(row.id)))
  const classSubjects = getSubjectsForClass(subjects, classRow.tingkatan)
  const subjectById = new Map((subjects || []).map((subject) => [String(subject.id), subject]))
  const scopedPbdRows = (sourceRows || []).filter(
    (row) =>
      String(row.class_id) === String(classRow.id) &&
      classEnrollmentIds.has(String(row.student_enrollment_id))
  )
  const pbdByStudentSubject = new Map(
    scopedPbdRows.map((row) => [
      `${row.student_enrollment_id}__${row.subject_id}`,
      row,
    ])
  )

  return classStudents.map((student) => {
    const studentId = String(student.id)
    const mappedSubjectIds = new Set(
      (studentSubjectEnrollments || [])
        .filter((row) => String(row.student_enrollment_id) === studentId)
        .map((row) => String(row.subject_id))
    )
    const takenSubjects = new Map()

    classSubjects.forEach((subject) => {
      const effectiveSubject =
        subject.is_core === false && String(subject.subject_type || '').toLowerCase() !== 'selective'
          ? { ...subject, subject_type: 'selective' }
          : subject
      const relevantIds = getRelevantEnrollmentIds({
        classId: classRow.id,
        subject: effectiveSubject,
        enrollments: classStudents,
        studentSubjectEnrollments,
      })

      if (relevantIds.some((id) => String(id) === studentId)) {
        takenSubjects.set(getSubjectIdentity(subject), subject)
      }
    })

    mappedSubjectIds.forEach((subjectId) => {
      const subject = subjectById.get(subjectId)
      if (
        subject &&
        (!subject.tingkatan || normalizeText(subject.tingkatan) === normalizeText(classRow.tingkatan))
      ) {
        takenSubjects.set(getSubjectIdentity(subject), subject)
      }
    })

    if (mappedSubjectIds.size === 0) {
      scopedPbdRows
        .filter((row) => String(row.student_enrollment_id) === studentId)
        .forEach((row) => {
          const subject = subjectById.get(String(row.subject_id))
          if (subject) takenSubjects.set(getSubjectIdentity(subject), subject)
        })
    }

    const subjectRows = [...takenSubjects.values()]
      .map((subject) => {
        const pbdRow = pbdByStudentSubject.get(`${student.id}__${subject.id}`)
        const tp = parsePbdTpLevel(pbdRow?.tp)

        return {
          subjectId: subject.id,
          subjectName: String(subject.subject_name || '-').trim(),
          tp,
          tpLabel: tp ? `TP${tp}` : 'TD',
          statement: resolvePbdTpStatement({
            descriptors,
            schoolId,
            subjectName: subject.subject_name,
            tingkatan: classRow.tingkatan,
            tp,
          }),
        }
      })
      .sort((a, b) =>
        a.subjectName.localeCompare(b.subjectName, 'ms', { sensitivity: 'base' })
      )

    return {
      id: student.id,
      studentName: student.student_profiles?.full_name || '-',
      icNumber: student.student_profiles?.ic_number || '-',
      className: classLabel || classRow.class_name || '-',
      levelName: levelLabel || classRow.tingkatan || '-',
      subjectRows,
    }
  })
}
