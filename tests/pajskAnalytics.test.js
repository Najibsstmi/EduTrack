import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePajskAnalytics, filterPajskRows, fetchPajskHistory } from '../src/lib/pajskAnalytics.js'

const rows = [
  {
    activity_id: 'a1', student_profile_id: 's1', student_name_snapshot: 'Ali',
    activity_date: '2026-03-01', form_snapshot: 'Tingkatan 1', class_name_snapshot: 'Balada',
    art_field_snapshot: 'Seni Tari', component: 'SUKAN_PERMAINAN', level: 'KEBANGSAAN',
    participation_type: 'PENGLIBATAN_I', participation_score: 17,
    achievement_result: 'NAIB_JOHAN', achievement_score: 16,
  },
  {
    activity_id: 'a1', student_profile_id: 's2', student_name_snapshot: 'Bakar',
    activity_date: '2026-03-01', form_snapshot: 'Tingkatan 1', class_name_snapshot: 'Balada',
    art_field_snapshot: 'Seni Muzik', component: 'SUKAN_PERMAINAN', level: 'KEBANGSAAN',
    participation_type: 'PENGLIBATAN_II', participation_score: 12,
    achievement_result: 'TIADA', achievement_score: 0,
  },
]

test('PAJSK analytics separates activity, participant, achievement and score counts', () => {
  const summary = calculatePajskAnalytics(rows, 3)
  assert.equal(summary.activityCount, 1)
  assert.equal(summary.participationRecordCount, 2)
  assert.equal(summary.studentsWithRecords, 2)
  assert.equal(summary.studentsWithoutRecords, 1)
  assert.equal(summary.achievementCount, 1)
  assert.equal(summary.totalRecordedScore, 45)
  assert.deepEqual(summary.byParticipation, { 'Penglibatan I': 1, 'Penglibatan II': 1 })
})

test('PAJSK filters do not infer participation from achievement', () => {
  const filtered = filterPajskRows(rows, { artField: 'Seni Tari', level: 'KEBANGSAAN' })
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].participation_type, 'PENGLIBATAN_I')
  assert.equal(filtered[0].achievement_result, 'NAIB_JOHAN')
})


test('fetches all history when the server caps each page below the requested size', async () => {
  const all = Array.from({ length: 5 }, (_, i) => ({ activity_id: String(i), student_profile_id: String(i) }))
  const client = { from: () => {
    const query = { select: () => query, eq: () => query, order: () => query, range: async (start) => ({ data: all.slice(start, start + 2), count: all.length, error: null }) }
    return query
  } }
  assert.deepEqual((await fetchPajskHistory(client, 'school', 2026)).data, all)
})

test('counts Bahagian in state-or-higher totals', () => {
  const summary = calculatePajskAnalytics([{ ...rows[0], level: 'BAHAGIAN' }], 1)
  assert.equal(summary.studentRows[0].state_or_higher_count, 1)
})
