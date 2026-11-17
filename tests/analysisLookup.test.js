import test from 'node:test'
import assert from 'node:assert/strict'
import { indexFirstAssessmentRows } from '../src/lib/analysisLookup.js'

test('carian indeks menghasilkan rekod pertama yang sama seperti carian senarai bagi setiap murid dan peperiksaan', () => {
  const rows = [
    { id: 'first', student_enrollment_id: '1', subject_id: 's', exam_key: 'ar1' },
    { id: 'duplicate', student_enrollment_id: '1', subject_id: 's', exam_key: 'AR1' },
    { id: 'other-exam', student_enrollment_id: '1', subject_id: 's', exam_key: 'TOV' },
    { id: 'other-student', student_enrollment_id: '2', subject_id: 's', exam_key: 'AR1' },
  ]
  const index = indexFirstAssessmentRows(rows, 'exam_key')
  assert.equal(index.get('1__s__AR1').id, 'first')
  assert.equal(index.get('1__s__TOV').id, 'other-exam')
  assert.equal(index.get('2__s__AR1').id, 'other-student')
  assert.equal(index.get('2__s__TOV'), undefined)
})
