export const PARTICIPATION_DESCRIPTIONS: Record<string, string> = {
  PENGLIBATAN_I:
    'Pertandingan, kejohanan, perkhemahan atau kursus berpemeringkatan secara bersemuka; atau dalam talian dengan pemeringkatan dan interaksi langsung.',
  PENGLIBATAN_II:
    'Pertandingan, kejohanan, perkhemahan, kursus atau karnival tanpa pemeringkatan secara bersemuka atau dalam talian; AJK pelaksana, petugas teknikal, persembahan selingan atau peserta lawatan luar negara.',
  PENGLIBATAN_III:
    'Peserta program dalam talian berbentuk pertandingan atau bukan pertandingan tanpa interaksi langsung; penyokong atau penonton.',
}

const PARTICIPATION_SCORES: Record<string, Record<string, number>> = {
  ANTARABANGSA: { PENGLIBATAN_I: 20, PENGLIBATAN_II: 15, PENGLIBATAN_III: 10 },
  KEBANGSAAN: { PENGLIBATAN_I: 17, PENGLIBATAN_II: 12, PENGLIBATAN_III: 8 },
  NEGERI: { PENGLIBATAN_I: 14, PENGLIBATAN_II: 10, PENGLIBATAN_III: 6 },
  BAHAGIAN: { PENGLIBATAN_I: 12, PENGLIBATAN_II: 9, PENGLIBATAN_III: 5 },
  DAERAH_ZON: { PENGLIBATAN_I: 11, PENGLIBATAN_II: 8, PENGLIBATAN_III: 4 },
  SEKOLAH: { PENGLIBATAN_I: 0, PENGLIBATAN_II: 0, PENGLIBATAN_III: 0 },
}

const ACHIEVEMENT_SCORES: Record<string, Record<string, number>> = {
  ANTARABANGSA: { JOHAN: 20, NAIB_JOHAN: 19, KETIGA: 18, KEEMPAT: 17, KELIMA: 16 },
  KEBANGSAAN: { JOHAN: 17, NAIB_JOHAN: 16, KETIGA: 15, KEEMPAT: 14, KELIMA: 13 },
  NEGERI: { JOHAN: 14, NAIB_JOHAN: 13, KETIGA: 12, KEEMPAT: 11, KELIMA: 10 },
  BAHAGIAN: { JOHAN: 14, NAIB_JOHAN: 13, KETIGA: 12, KEEMPAT: 11, KELIMA: 10 },
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

export const CONTRIBUTIONS: Record<string, { label: string; score: number; description: string }> = {
  ATLET_PESERTA: { label: 'Atlet/Peserta', score: 10, description: 'Murid didaftarkan sebagai atlet atau peserta program, pertandingan, karnival atau kursus.' },
  KEMAHIRAN_KHUSUS: { label: 'Kemahiran Khusus', score: 10, description: 'Aspek teknikal seperti pengadil, jurulatih pasukan dan lain-lain.' },
  JAWATANKUASA: { label: 'Jawatankuasa', score: 8, description: 'Ahli jawatankuasa program, pertandingan, karnival atau kursus.' },
  SOKONGAN: { label: 'Sokongan', score: 5, description: 'Pelibatan yang bersifat meramaikan program, pertandingan, karnival atau kursus.' },
}

export function contributionScore(level: string, category: string, kind: string, evidence: string, value: string): number | null {
  if (level !== 'SEKOLAH' || category !== 'KOKURIKULUM' || kind !== 'UTAMA' || !evidence.trim()) return null
  return CONTRIBUTIONS[value]?.score ?? null
}

// Advisory only: the teacher retains the manual decision when facts are incomplete or overlap.
export function suggestParticipation(mode: string, ranked: string, live: string, role: string, programType = ''): string | null {
  if (role === 'PENONTON') return 'PENGLIBATAN_III'
  if (role === 'PELAKSANA' || role === 'LAWATAN') return 'PENGLIBATAN_II'
  if (role !== 'PESERTA' || !['BERSEMUKA', 'DALAM_TALIAN'].includes(mode) || !['YA', 'TIDAK'].includes(ranked)) return null
  if (mode === 'DALAM_TALIAN' && !['YA', 'TIDAK'].includes(live)) return null
  if (mode === 'DALAM_TALIAN' && live === 'TIDAK') return 'PENGLIBATAN_III'
  if (ranked === 'TIDAK' && ['PERTANDINGAN', 'KEJOHANAN', 'PERKHEMAHAN', 'KURSUS', 'KARNIVAL'].includes(programType)) return 'PENGLIBATAN_II'
  if (ranked === 'YA' && ['PERTANDINGAN', 'KEJOHANAN', 'PERKHEMAHAN', 'KURSUS'].includes(programType)) return 'PENGLIBATAN_I'
  return null
}

export function applyBulkValue<T>(rows: Record<string, T>, update: (row: T) => T): Record<string, T> {
  return Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, update(row)]))
}
