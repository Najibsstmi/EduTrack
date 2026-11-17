import test from 'node:test'
import assert from 'node:assert/strict'
import { latestPbdBySubject, latestRecord, scoreMatchesExam } from '../src/lib/pbsIntegrated.js'

test('markah mengikut ID peperiksaan dipilih dan tidak bercampur walaupun kod sama', () => {
  const selected = { id: 'pat-form-1', exam_key: 'AR2' }
  assert.equal(scoreMatchesExam({ exam_config_id: 'pat-form-1', exam_key: 'AR2' }, selected), true)
  assert.equal(scoreMatchesExam({ exam_config_id: 'pat-form-2', exam_key: 'AR2' }, selected), false)
  assert.equal(scoreMatchesExam({ exam_key: 'ar2' }, selected), true)
  assert.equal(scoreMatchesExam({ exam_key: 'AR1' }, selected), false)
  assert.equal(scoreMatchesExam({ exam_key: 'AR1' }, null), false)
})

test('rekod terkini dipilih mengikut tarikh pentaksiran dan susunan kemas kini sebagai pemutus seri', () => {
  const old = { id: 'old', assessment_date: '2026-03-01', updated_at: '2026-10-01' }
  const latest = { id: 'latest', assessment_date: '2026-09-01', updated_at: '2026-09-01' }
  assert.equal(latestRecord([old, latest]).id, 'latest')
  assert.equal(latestRecord([{ id: 'a', updated_at: '2026-01-01' }, { id: 'b', updated_at: '2026-02-01' }]).id, 'b')
  assert.equal(latestRecord([]), null)
})

test('PBD semasa diutamakan bagi setiap subjek dan rekod lama mengisi subjek yang belum dipindah', () => {
  const current = [{ subject_id: 'bm', tp: 4, updated_at: '2026-01-01' }]
  const legacy = [{ subject_id: 'bm', tp_level: 3, updated_at: '2026-02-01' }, { subject_id: 'bi', tp_level: 2, updated_at: '2026-01-01' }, { subject_id: 'bi', tp_level: 5, updated_at: '2026-03-01' }]
  const result = latestPbdBySubject(current, legacy)
  assert.equal(result.length, 2)
  assert.equal(result.find((row) => row.subject_id === 'bm').tp, 4)
  assert.equal(result.find((row) => row.subject_id === 'bi').tp_level, 5)
})
