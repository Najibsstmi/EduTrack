import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClassExamOptions } from '../src/lib/examConfig.js'

test('analisis kelas menyenaraikan peperiksaan tertutup serta aktif mengikut tingkatan', () => {
  const exams = [
    { grade_label: 'Tingkatan 5', exam_key: 'TOV', exam_name: 'TOV', exam_order: 1, is_active: false },
    { grade_label: 'Tingkatan 5', exam_key: 'OTR1', exam_name: 'OTR1', exam_order: 2, is_active: true },
    { grade_label: 'Tingkatan 5', exam_key: 'AR1', exam_name: 'PPT', exam_order: 3, is_active: false },
    { grade_label: 'Tingkatan 5', exam_key: 'ETR', exam_name: 'ETR', exam_order: 4, is_active: false },
    { grade_label: 'Tingkatan 3', exam_key: 'OTHER', exam_order: 1, is_active: true },
  ]
  assert.deepEqual(buildClassExamOptions(exams, 'Tingkatan 5').map((exam) => exam.name), ['TOV', 'OTR1', 'PPT', 'ETR'])
  assert.deepEqual(buildClassExamOptions(exams, '').map((exam) => exam.key), [])
})
