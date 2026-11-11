import { describe, expect, it } from 'vitest'
import { matchesStudentName, normalizeSearchText } from './normalization'

describe('student search normalization', () => {
  it('matches partial names without requiring exact case', () => {
    expect(matchesStudentName('NUR ALYA BINTI AHMAD', 'alya')).toBe(true)
  })

  it('collapses repeated whitespace', () => {
    expect(normalizeSearchText('  Nur   Alya  ')).toBe('nur alya')
  })
})
