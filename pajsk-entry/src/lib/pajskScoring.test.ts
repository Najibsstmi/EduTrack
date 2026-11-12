import { describe, expect, it } from 'vitest'
import {
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
