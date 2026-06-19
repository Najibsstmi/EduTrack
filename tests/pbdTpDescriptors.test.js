import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mergePbdTpDescriptors,
  parsePbdTpDescriptorWorkbookRows,
} from '../src/lib/pbdTpDescriptors.js'

test('menukar jadual workbook kepada descriptor mengikut subjek dan TP', () => {
  const descriptors = parsePbdTpDescriptorWorkbookRows([
    ['TAHAP PENGUASAAN', 'bahasa melayu', 'matematik'],
    [1, 'Penerangan BM TP1', 'Penerangan Matematik TP1'],
    ['TP2', 'Penerangan BM TP2', 'Penerangan Matematik TP2'],
  ])

  assert.equal(descriptors.length, 4)
  assert.deepEqual(descriptors[0], {
    id: 'workbook-BAHASA MELAYU-1',
    school_id: null,
    tingkatan: null,
    subject_name: 'BAHASA MELAYU',
    tp_level: 1,
    statement: 'Penerangan BM TP1',
  })
  assert.equal(descriptors[3].subject_name, 'MATEMATIK')
  assert.equal(descriptors[3].tp_level, 2)
})

test('mengabaikan sel penerangan yang kosong', () => {
  const descriptors = parsePbdTpDescriptorWorkbookRows([
    ['TAHAP PENGUASAAN', 'SAINS', 'SEJARAH'],
    [4, 'Penerangan Sains TP4', ''],
  ])

  assert.equal(descriptors.length, 1)
  assert.equal(descriptors[0].subject_name, 'SAINS')
})

test('workbook mengemas kini descriptor umum tanpa menimpa override sekolah', () => {
  const merged = mergePbdTpDescriptors({
    databaseDescriptors: [
      {
        id: 'db-general',
        school_id: null,
        tingkatan: null,
        subject_name: 'SAINS',
        tp_level: 4,
        statement: 'Penerangan umum lama',
      },
      {
        id: 'db-school',
        school_id: 'school-1',
        tingkatan: null,
        subject_name: 'SAINS',
        tp_level: 4,
        statement: 'Penerangan khusus sekolah',
      },
    ],
    workbookDescriptors: [
      {
        id: 'workbook-sains-4',
        school_id: null,
        tingkatan: null,
        subject_name: 'SAINS',
        tp_level: 4,
        statement: 'Penerangan daripada workbook',
      },
    ],
  })

  assert.equal(merged.length, 2)
  assert.equal(
    merged.find((row) => !row.school_id).statement,
    'Penerangan daripada workbook'
  )
  assert.equal(
    merged.find((row) => row.school_id === 'school-1').statement,
    'Penerangan khusus sekolah'
  )
})
