import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildStudentExamMap,
  getRelevantEnrollmentIds,
} from '../src/lib/completionMatrix.js'

test('buildStudentExamMap memasukkan exam key daripada exam_config_id', () => {
  const map = buildStudentExamMap(
    [
      {
        student_enrollment_id: 'enrollment-1',
        subject_id: 'subject-sains',
        exam_key: 'AR1',
        exam_config_id: 'exam-config-ppt',
      },
      {
        student_enrollment_id: 'enrollment-2',
        subject_id: 'subject-sains',
        exam_key: null,
        exam_config_id: 'exam-config-ppt',
      },
    ],
    {
      examConfigKeyById: new Map([['exam-config-ppt', 'PPT']]),
    }
  )

  assert.equal(map.get('enrollment-1__subject-sains').has('AR1'), true)
  assert.equal(map.get('enrollment-1__subject-sains').has('PPT'), true)
  assert.equal(map.get('enrollment-2__subject-sains').has('PPT'), true)
})

test('getRelevantEnrollmentIds guna semua murid kelas untuk subjek core', () => {
  const enrollmentIds = getRelevantEnrollmentIds({
    classId: 'class-zapin',
    subject: { id: 'subject-sains', subject_type: 'core' },
    enrollments: [
      { id: 'enrollment-1', class_id: 'class-zapin' },
      { id: 'enrollment-2', class_id: 'class-zapin' },
      { id: 'enrollment-3', class_id: 'class-inang' },
    ],
    studentSubjectEnrollments: [],
  })

  assert.deepEqual(enrollmentIds, ['enrollment-1', 'enrollment-2'])
})
