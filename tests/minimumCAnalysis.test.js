import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeFourSubjects,
  buildAssessmentIndex,
  buildRpmSubjectMap,
  dedupeAssessmentRows,
  isGradeAtLeastMinimum,
  summarizeFourSubjectResults,
  summarizeSubject,
} from '../src/lib/minimumCAnalysis.js'

const subjects = [
  { id: 'bm', subject_name: 'Bahasa Melayu' },
  { id: 'bi', subject_name: 'Bahasa Inggeris' },
  { id: 'math', subject_name: 'Matematik' },
  { id: 'history', subject_name: 'Sejarah' },
]

const students = [
  { enrollment_id: 's1', full_name: 'Murid 1', tingkatan: 'Tingkatan 5' },
]

const analyze = (grades) => {
  const rows = Object.entries(grades).map(([subjectId, grade], index) => ({
    id: String(index),
    student_enrollment_id: 's1',
    subject_id: subjectId,
    exam_key: 'PAT',
    grade_name: grade,
  }))
  return analyzeFourSubjects({
    students,
    subjectMap: buildRpmSubjectMap(subjects),
    assessmentIndex: buildAssessmentIndex(rows),
    examKey: 'PAT',
  })[0]
}

test('C dan C+ mencapai Minimum C', () => {
  assert.equal(isGradeAtLeastMinimum('C'), true)
  assert.equal(isGradeAtLeastMinimum('C+'), true)
  assert.equal(isGradeAtLeastMinimum('D'), false)
})

test('C dalam semua empat subjek menghasilkan status Capai', () => {
  assert.equal(analyze({ bm: 'C', bi: 'C', math: 'C', history: 'C' }).status, 'Capai')
})

test('D dalam satu subjek menghasilkan status Belum Capai', () => {
  const result = analyze({ bm: 'B', bi: 'C', math: 'D', history: 'A' })
  assert.equal(result.status, 'Belum Capai')
  assert.equal(result.belowCount, 1)
})

test('G dalam semua empat subjek dikira empat subjek di bawah C', () => {
  const result = analyze({ bm: 'G', bi: 'G', math: 'G', history: 'G' })
  assert.equal(result.status, 'Belum Capai')
  assert.equal(result.belowCount, 4)
})

test('keputusan Sejarah kosong menghasilkan status Tidak Lengkap', () => {
  const result = analyze({ bm: 'A', bi: 'B', math: 'C' })
  assert.equal(result.status, 'Tidak Lengkap')
  assert.equal(result.incompleteCount, 1)
})

test('gred bawah C kekal Belum Capai walaupun keputusan lain tidak lengkap', () => {
  const result = analyze({ bm: 'A', bi: 'B', math: 'D' })
  assert.equal(result.status, 'Belum Capai')
  assert.equal(result.belowCount, 1)
  assert.equal(result.incompleteCount, 1)
  assert.equal(result.isComplete, false)
})

test('semua murid tanpa markah menghasilkan kadar Tiada Data, bukan sifar', () => {
  const summary = summarizeFourSubjectResults([analyze({})])
  assert.equal(summary.achievementRate, null)
  assert.equal(summary.coverageRate, 0)

  const subjectSummary = summarizeSubject({
    students,
    subject: subjects[0],
    assessmentIndex: new Map(),
    examKey: 'PAT',
  })
  assert.equal(subjectSummary.minimumCRate, null)
  assert.equal(subjectSummary.missingCount, 1)
})

test('rekod pendua memilih rekod paling baharu dan tidak dikira dua kali', () => {
  const rows = [
    {
      id: 'old',
      student_enrollment_id: 's1',
      subject_id: 'math',
      exam_key: 'PAT',
      grade_name: 'D',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'new',
      student_enrollment_id: 's1',
      subject_id: 'math',
      exam_key: 'PAT',
      grade_name: 'C',
      updated_at: '2026-02-01T00:00:00Z',
    },
  ]
  const deduped = dedupeAssessmentRows(rows)
  assert.equal(deduped.length, 1)
  assert.equal(deduped[0].grade_name, 'C')
})
