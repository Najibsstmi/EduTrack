import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyBulkValue,
  CONTRIBUTIONS,
  contributionScore,
  suggestParticipation,
  calculateAchievementScore,
  calculateParticipationScore,
  setParticipantAchievement,
  setParticipantParticipation,
} from './pajskScoring'

describe('PAJSK participation and achievement scoring', () => {
  it('uses the verified participation matrix independently', () => {
    expect(calculateParticipationScore('ANTARABANGSA', 'PENGLIBATAN_I')).toBe(20)
    expect(calculateParticipationScore('KEBANGSAAN', 'PENGLIBATAN_II')).toBe(12)
    expect(calculateParticipationScore('NEGERI', 'PENGLIBATAN_III')).toBe(6)
    expect(calculateParticipationScore('DAERAH_ZON', 'PENGLIBATAN_I')).toBe(11)
    expect(calculateParticipationScore('SEKOLAH', 'PENGLIBATAN_III')).toBe(0)
  })

  it('uses the verified achievement matrix independently', () => {
    expect(calculateAchievementScore('ANTARABANGSA', 'JOHAN')).toBe(20)
    expect(calculateAchievementScore('KEBANGSAAN', 'NAIB_JOHAN')).toBe(16)
    expect(calculateAchievementScore('NEGERI', 'KETIGA')).toBe(12)
    expect(calculateAchievementScore('DAERAH_ZON', 'KEEMPAT')).toBe(8)
    expect(calculateAchievementScore('SEKOLAH', 'KELIMA')).toBe(4)
    expect(calculateAchievementScore('ANTARABANGSA', 'TIADA')).toBe(0)
  })

  it('never changes participation when achievement changes', () => {
    const participant = {
      participation_type: 'PENGLIBATAN_III',
      achievement_result: 'TIADA',
    }

    const changed = setParticipantAchievement(participant, 'NAIB_JOHAN')

    expect(changed.achievement_result).toBe('NAIB_JOHAN')
    expect(changed.participation_type).toBe('PENGLIBATAN_III')
  })

  it('never changes achievement when participation changes', () => {
    const participant = {
      participation_type: 'PENGLIBATAN_I',
      achievement_result: 'KETIGA',
    }

    const changed = setParticipantParticipation(participant, 'PENGLIBATAN_II')

    expect(changed.participation_type).toBe('PENGLIBATAN_II')
    expect(changed.achievement_result).toBe('KETIGA')
  })
})

describe('Tables 5, 6 and 8', () => {
  const levels = ['ANTARABANGSA', 'KEBANGSAAN', 'NEGERI', 'BAHAGIAN', 'DAERAH_ZON']
  const kinds = ['PENGLIBATAN_I', 'PENGLIBATAN_II', 'PENGLIBATAN_III']
  const matrix = [[20,15,10], [17,12,8], [14,10,6], [12,9,5], [11,8,4]]
  it('covers every type and level in Table 6', () => {
    levels.forEach((level, row) => kinds.forEach((kind, col) => expect(calculateParticipationScore(level, kind)).toBe(matrix[row][col])))
  })
  it('scores only the four eligible school contributions with proof', () => {
    expect(Object.fromEntries(Object.entries(CONTRIBUTIONS).map(([key, item]) => [key, item.score]))).toEqual({ ATLET_PESERTA: 10, KEMAHIRAN_KHUSUS: 10, JAWATANKUASA: 8, SOKONGAN: 5 })
    for (const value of Object.keys(CONTRIBUTIONS)) {
      expect(contributionScore('SEKOLAH', 'KOKURIKULUM', 'UTAMA', 'Sijil', value)).toBe(CONTRIBUTIONS[value].score)
      expect(contributionScore('NEGERI', 'KOKURIKULUM', 'UTAMA', 'Sijil', value)).toBeNull()
      expect(contributionScore('SEKOLAH', 'KOKURIKULUM', 'TAMBAHAN', 'Sijil', value)).toBeNull()
      expect(contributionScore('SEKOLAH', 'KOKURIKULUM', 'UTAMA', '  ', value)).toBeNull()
    }
    expect(contributionScore('SEKOLAH', 'KOKURIKULUM', 'UTAMA', 'Sijil', 'PERSEMBAHAN')).toBeNull()
  })
  it.each([
    ['BERSEMUKA','YA','','PESERTA','PERTANDINGAN','PENGLIBATAN_I'],
    ['DALAM_TALIAN','YA','YA','PESERTA','KURSUS','PENGLIBATAN_I'],
    ['DALAM_TALIAN','TIDAK','YA','PESERTA','KARNIVAL','PENGLIBATAN_II'],
    ['BERSEMUKA','TIDAK','','PESERTA','KEJOHANAN','PENGLIBATAN_II'],
    ['DALAM_TALIAN','YA','TIDAK','PESERTA','LAIN','PENGLIBATAN_III'],
    ['','','','PELAKSANA','','PENGLIBATAN_II'],
    ['','','','LAWATAN','','PENGLIBATAN_II'],
    ['','','','PENONTON','','PENGLIBATAN_III'],
    ['BERSEMUKA','YA','','PESERTA','KARNIVAL',null],
    ['DALAM_TALIAN','YA','','PESERTA','KURSUS',null],
  ])('offers an advisory without changing manual choice', (mode, ranked, live, role, type, expected) => {
    expect(suggestParticipation(mode, ranked, live, role, type)).toBe(expected)
  })
  it('applies bulk participation without changing individual achievements', () => {
    const original = { a: { participation_type: 'PENGLIBATAN_I', achievement_result: 'JOHAN' }, b: { participation_type: 'PENGLIBATAN_II', achievement_result: 'TIADA' } }
    const result = applyBulkValue(original, row => setParticipantParticipation(row, 'PENGLIBATAN_III'))
    expect(result.a).toEqual({ participation_type: 'PENGLIBATAN_III', achievement_result: 'JOHAN' })
    expect(result.b).toEqual({ participation_type: 'PENGLIBATAN_III', achievement_result: 'TIADA' })
    expect(original.a.participation_type).toBe('PENGLIBATAN_I')
  })
  it('keeps frontend matrices consistent with the SQL migration', () => {
    const sql = readFileSync(resolve(process.cwd(), '../supabase/migrations/20261121000100_pajsk_entry_guideline.sql'), 'utf8')
    const section = sql.split('create or replace function public.pajsk_participation_score(')[1].split('create or replace function public.pajsk_achievement_score(')[0]
    levels.forEach(level => {
      const block = section.split(`when '${level}' then case p_participation_type`)[1].split('end')[0]
      kinds.forEach(kind => expect(Number(block.match(new RegExp(`when '${kind}' then (\\d+)`))?.[1])).toBe(calculateParticipationScore(level, kind)))
    })
    for (const [key, item] of Object.entries(CONTRIBUTIONS)) expect(sql).toContain(`when '${key}' then ${item.score}`)
  })
})
