import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateSegakSummary } from '../src/lib/pajskSegak.js'

test('SEGAK reconciles missing BMI separately and uses valid BMI denominator', () => {
  const summary = calculateSegakSummary([
    { bmi: 20, bmi_category: 'Normal', segak_total_score: 14, segak_grade: 'C', segak_stars: 3 },
    { bmi: null, segak_total_score: null, is_absent: false },
    { bmi: 0, segak_total_score: 0, segak_grade: 'F', segak_stars: 0 },
  ])

  assert.equal(summary.totalStudents, 3)
  assert.equal(summary.bmiCount, 1)
  assert.equal(summary.averageBmi, 20)
  assert.equal(summary.bmiCategoryCounts['Tiada Data BMI'], 2)
  assert.equal(summary.missingBmiCount, 2)
})

test('SEGAK keeps genuine grade F separate from incomplete records', () => {
  const summary = calculateSegakSummary([
    { segak_total_score: 0, segak_grade: 'F', segak_stars: 0, is_absent: false },
    { segak_total_score: null, segak_grade: '', segak_stars: null, is_absent: false },
    { segak_total_score: 0, segak_grade: 'F', segak_stars: 0, is_absent: true },
  ])

  assert.equal(summary.gradeCounts.F, 1)
  assert.equal(summary.starCounts[0], 1)
  assert.equal(summary.incompleteCount, 2)
  assert.equal(summary.segakScoreCount, 1)
})
