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
  summarizeRpmSubjects,
  getRpmSubjectKey,
  normalizeMetric,
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

const scales = [
  ['A', 80, 100, 1], ['B', 65, 79, 2], ['C', 50, 64, 3],
  ['D', 40, 49, 4], ['E', 30, 39, 5], ['G', 0, 29, 6],
].map(([grade_name, min_mark, max_mark, grade_point]) => ({ grade_label: 'Tingkatan 5', grade_name, min_mark, max_mark, grade_point }))
const marks = { A: 85, B: 70, C: 55, D: 45, E: 35, G: 10 }

const analyze = (grades) => {
  const rows = Object.entries(grades).map(([subjectId, grade], index) => ({
    id: String(index),
    student_enrollment_id: 's1',
    subject_id: subjectId,
    exam_key: 'PAT',
    grade_name: grade,
    mark: marks[grade],
  }))
  return analyzeFourSubjects({
    students,
    subjectMap: buildRpmSubjectMap(subjects),
    assessmentIndex: buildAssessmentIndex(rows),
    examKey: 'PAT',
    gradeScales: scales,
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

test('gred bawah C dengan keputusan lain tidak lengkap kekal dalam kategori Tidak Lengkap', () => {
  const result = analyze({ bm: 'A', bi: 'B', math: 'D' })
  assert.equal(result.status, 'Tidak Lengkap')
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


test('gabungan kanonik menyatukan kod subjek dan nama berbeza huruf, tetapi menolak kod subjek lain', () => {
  const map = buildRpmSubjectMap([
    { id: 'm1', subject_code: '1449', subject_name: 'MATEMATIK', tingkatan: 'Tingkatan 5' },
    { id: 'm2', subject_code: '1449', subject_name: 'matematik', tingkatan: 'Tingkatan 4' },
    { id: 'wrong', subject_code: '1511', subject_name: 'Matematik' },
    { id: 'pjpk', subject_name: 'PJPK' },
  ])
  assert.deepEqual(map.matematik.map((subject) => subject.id), ['m1', 'm2'])
  assert.equal(getRpmSubjectKey({ subject_code: '1511', subject_name: 'Matematik' }), null)
})

test('rekod subjek pendua dan tingkatan lain hanya menghasilkan satu keputusan murid', () => {
  const map = buildRpmSubjectMap([...subjects, { id: 'math2', subject_code: '1449', subject_name: 'matematik', tingkatan: 'Tingkatan 5' }, { id: 'math4', subject_code: '1449', subject_name: 'Matematik', tingkatan: 'Tingkatan 4' }])
  const rows = [
    { id: 'old', student_enrollment_id: 's1', subject_id: 'math', exam_key: 'PAT', mark: 45, updated_at: '2026-01-01' },
    { id: 'new', student_enrollment_id: 's1', subject_id: 'math2', exam_key: 'PAT', mark: 55, updated_at: '2026-02-01' },
    { id: 'wrong-level', student_enrollment_id: 's1', subject_id: 'math4', exam_key: 'PAT', mark: 10, updated_at: '2026-03-01' },
  ]
  const [row] = analyzeFourSubjects({ students, subjectMap: map, assessmentIndex: buildAssessmentIndex(rows), examKey: 'PAT', gradeScales: scales })
  assert.equal(row.subjects.matematik.grade, 'C')
  assert.equal(row.subjects.matematik.state, 'achieved')
  const summaries = summarizeRpmSubjects([row])
  assert.deepEqual(summaries.map((item) => item.subject.subject_name), ['Bahasa Inggeris', 'Bahasa Melayu', 'Matematik', 'Sejarah'])
  assert.equal(summaries[2].evaluatedCount, 1)
})

test('markah menggunakan skala sebenar dan tiada skala atau markah menghasilkan data tidak lengkap', () => {
  assert.equal(normalizeMetric({ mark: 45, grade_name: 'A' }, { gradeScales: scales, level: 'Tingkatan 5' }).grade, 'D')
  assert.equal(normalizeMetric({ mark: 55 }, { gradeScales: [], level: 'Tingkatan 5' }).state, 'missing')
  assert.equal(normalizeMetric({ grade_name: 'A', mark: null }, { gradeScales: scales, level: 'Tingkatan 5' }).state, 'missing')
  assert.equal(normalizeMetric({ mark: 55, is_absent: true }, { gradeScales: scales, level: 'Tingkatan 5' }).state, 'absent')
})

test('kategori lengkap dan tidak lengkap tidak bertindih, termasuk tiada Matematik', () => {
  const rows = [analyze({ bm: 'A', bi: 'C', math: 'C', history: 'A' }), analyze({ bm: 'D', bi: 'D', math: 'C', history: 'A' }), analyze({ bm: 'D', bi: 'C', history: 'A' })]
  const summary = summarizeFourSubjectResults(rows)
  assert.equal(rows[2].status, 'Tidak Lengkap')
  assert.equal(summary.totalStudents, 3)
  assert.equal(summary.completeCount, 2)
  assert.equal(summary.incompleteCount, 1)
  assert.equal(summary.belowCount, 1)
  assert.equal(summary.belowByCount[2], 1)
  assert.equal(summary.belowByCount[1], 0)
  assert.equal(summary.achievementRate, 50)
})

test('peperiksaan tiada data, semua capai dan tiada capai mempunyai kadar yang betul', () => {
  assert.equal(summarizeFourSubjectResults([analyze({})]).achievementRate, null)
  assert.equal(summarizeFourSubjectResults([analyze({ bm: 'A', bi: 'B', math: 'C', history: 'C' })]).achievementRate, 100)
  assert.equal(summarizeFourSubjectResults([analyze({ bm: 'D', bi: 'B', math: 'C', history: 'C' })]).achievementRate, 0)
})

test('kelas berbeza dan peperiksaan berbeza mengekalkan identiti murid dan rekod', () => {
  const cohort = [{ enrollment_id: 's1', class_id: 'a', tingkatan: 'Tingkatan 5' }, { enrollment_id: 's2', class_id: 'b', tingkatan: 'Tingkatan 5' }]
  const records = cohort.flatMap((student) => subjects.flatMap((subject) => ['TOV', 'PAT'].map((exam) => ({ id: `${student.enrollment_id}-${subject.id}-${exam}`, student_enrollment_id: student.enrollment_id, subject_id: subject.id, exam_key: exam, mark: exam === 'TOV' ? 45 : 55 }))))
  const analyzeExam = (examKey, selectedStudents) => summarizeFourSubjectResults(analyzeFourSubjects({ students: selectedStudents, subjectMap: buildRpmSubjectMap(subjects), assessmentIndex: buildAssessmentIndex(records), examKey, gradeScales: scales }))
  assert.equal(analyzeExam('TOV', cohort).achievementRate, 0)
  assert.equal(analyzeExam('PAT', cohort).achievementRate, 100)
  assert.equal(analyzeExam('PAT', cohort.filter((row) => row.class_id === 'a')).totalStudents, 1)
})
