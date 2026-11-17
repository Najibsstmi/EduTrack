import test from 'node:test'
import assert from 'node:assert/strict'
import { buildExamStructureFromExamConfigs, formatExamDisplayName } from '../src/lib/examConfig.js'

test('nama USASA dipaparkan sebagai UASA tanpa mengubah kod peperiksaan', () => {
  const structure = buildExamStructureFromExamConfigs([
    { grade_label: 'Tingkatan 1', exam_key: 'AR2', exam_name: 'usasa', is_active: true },
    { grade_label: 'Tingkatan 1', exam_key: 'AR1', exam_name: 'PPT', is_active: true },
  ])
  assert.equal(structure['Tingkatan 1'].find((exam) => exam.key === 'AR2').name, 'UASA')
  assert.equal(structure['Tingkatan 1'].find((exam) => exam.key === 'AR1').name, 'PPT')
  assert.equal(formatExamDisplayName('Ujian USASA'), 'Ujian USASA')
})
