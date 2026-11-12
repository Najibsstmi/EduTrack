export const PARTICIPATION_DESCRIPTIONS: Record<string, string> = {
  PENGLIBATAN_I:
    'Peserta berdaftar, atlet atau peserta pertandingan/program.',
  PENGLIBATAN_II:
    'AJK pelaksana, petugas teknikal atau persembahan selingan.',
  PENGLIBATAN_III:
    'Penyokong, kumpulan sorak atau penglibatan untuk memeriahkan program.',
}

const PARTICIPATION_SCORES: Record<string, Record<string, number>> = {
  ANTARABANGSA: { PENGLIBATAN_I: 20, PENGLIBATAN_II: 15, PENGLIBATAN_III: 10 },
  KEBANGSAAN: { PENGLIBATAN_I: 17, PENGLIBATAN_II: 12, PENGLIBATAN_III: 8 },
  NEGERI: { PENGLIBATAN_I: 14, PENGLIBATAN_II: 10, PENGLIBATAN_III: 6 },
  DAERAH_ZON: { PENGLIBATAN_I: 11, PENGLIBATAN_II: 8, PENGLIBATAN_III: 4 },
  SEKOLAH: { PENGLIBATAN_I: 0, PENGLIBATAN_II: 0, PENGLIBATAN_III: 0 },
}

const ACHIEVEMENT_SCORES: Record<string, Record<string, number>> = {
  ANTARABANGSA: { JOHAN: 20, NAIB_JOHAN: 19, KETIGA: 18, KEEMPAT: 17, KELIMA: 16 },
  KEBANGSAAN: { JOHAN: 17, NAIB_JOHAN: 16, KETIGA: 15, KEEMPAT: 14, KELIMA: 13 },
  NEGERI: { JOHAN: 14, NAIB_JOHAN: 13, KETIGA: 12, KEEMPAT: 11, KELIMA: 10 },
  DAERAH_ZON: { JOHAN: 11, NAIB_JOHAN: 10, KETIGA: 9, KEEMPAT: 8, KELIMA: 7 },
  SEKOLAH: { JOHAN: 8, NAIB_JOHAN: 7, KETIGA: 6, KEEMPAT: 5, KELIMA: 4 },
}

export const calculateParticipationScore = (
  level: string,
  participationType: string
): number | null => PARTICIPATION_SCORES[level]?.[participationType] ?? null

export const calculateAchievementScore = (
  level: string,
  achievementResult: string
): number | null => {
  if (achievementResult === 'TIADA') return 0
  return ACHIEVEMENT_SCORES[level]?.[achievementResult] ?? null
}

export const setParticipantParticipation = <
  T extends { participation_type: string }
>(participant: T, participationType: string): T => ({
  ...participant,
  participation_type: participationType,
})

export const setParticipantAchievement = <
  T extends { achievement_result: string }
>(participant: T, achievementResult: string): T => ({
  ...participant,
  achievement_result: achievementResult,
})
