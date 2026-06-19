import assert from 'node:assert/strict'
import test from 'node:test'

import { generatePbdTemplateRows, normalizeTpValue } from '../src/lib/pbdBulkImport.js'

test('normalizeTpValue menerima nombor atau awalan TP', () => {
  assert.equal(normalizeTpValue(5), 5)
  assert.equal(normalizeTpValue('5'), 5)
  assert.equal(normalizeTpValue('TP5'), 5)
  assert.equal(normalizeTpValue('tp 5'), 5)
})

test('normalizeTpValue menolak nilai di luar TP1 hingga TP6', () => {
  assert.equal(normalizeTpValue('0'), null)
  assert.equal(normalizeTpValue('7'), null)
  assert.equal(normalizeTpValue('TP7'), null)
  assert.equal(normalizeTpValue('markah 5'), null)
})

test('template PBD kosong hanya mengandungi tajuk kolum', () => {
  const rows = generatePbdTemplateRows({
    subjects: [
      { subject_name: 'Bahasa Melayu' },
      { subject_name: 'Matematik' },
    ],
  })

  assert.deepEqual(rows, [
    [
      'NO KAD PENGENALAN',
      'NAMA MURID',
      'KELAS',
      'TINGKATAN',
      'BAHASA MELAYU',
      'MATEMATIK',
    ],
  ])
})
