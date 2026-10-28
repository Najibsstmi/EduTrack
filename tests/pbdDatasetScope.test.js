import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPbdDatasetEnrollmentIds,
  getPbdDatasetEnrollments,
} from '../src/lib/pbdDatasetScope.js'

const enrollments = [
  { id: 'active-1', class_id: 'class-a', is_active: true },
  { id: 'left-1', class_id: 'class-a', is_active: false },
]

const penggal1Rows = [
  { student_enrollment_id: 'active-1', class_id: 'class-a', subject_id: 'subject-a' },
  { student_enrollment_id: 'left-1', class_id: 'class-a', subject_id: 'subject-a' },
]

const penggal2Rows = [
  { student_enrollment_id: 'active-1', class_id: 'class-a', subject_id: 'subject-a' },
]

test('snapshot Penggal 1 kekalkan murid yang sudah disingkirkan', () => {
  assert.deepEqual(
    getPbdDatasetEnrollmentIds({
      datasetKey: 'PENGGAL_1',
      classId: 'class-a',
      subjectId: 'subject-a',
      sourceRows: penggal1Rows,
    }),
    ['active-1', 'left-1']
  )

  assert.deepEqual(
    getPbdDatasetEnrollments({
      datasetKey: 'PENGGAL_1',
      classId: 'class-a',
      enrollments,
      sourceRows: penggal1Rows,
    }).map((row) => row.id),
    ['active-1', 'left-1']
  )
})

test('snapshot Penggal 2 tidak masukkan murid yang sudah disingkirkan', () => {
  assert.deepEqual(
    getPbdDatasetEnrollmentIds({
      datasetKey: 'PENGGAL_2',
      classId: 'class-a',
      subjectId: 'subject-a',
      sourceRows: penggal2Rows,
    }),
    ['active-1']
  )

  assert.deepEqual(
    getPbdDatasetEnrollments({
      datasetKey: 'PENGGAL_2',
      classId: 'class-a',
      enrollments,
      sourceRows: penggal2Rows,
    }).map((row) => row.id),
    ['active-1']
  )
})

test('PBD semasa hanya guna enrollment aktif', () => {
  assert.deepEqual(
    getPbdDatasetEnrollments({
      datasetKey: 'CURRENT',
      classId: 'class-a',
      enrollments,
    }).map((row) => row.id),
    ['active-1']
  )
})
