// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActivityWizardPage } from './ActivityWizardPage'

const state = vi.hoisted(() => ({ id: '', api: vi.fn(), navigate: vi.fn() }))
vi.mock('react-router-dom', () => ({ useParams: () => ({ activityId: state.id || undefined }), useNavigate: () => state.navigate }))
vi.mock('../lib/api', () => ({ apiRequest: state.api, ApiError: class extends Error { status = 0 } }))
vi.mock('../session/useSession', () => ({ useSession: () => ({ data: { access: { display_name: 'Guru' }, current_academic_year: 2026, academic_years: [2026], classifications: [
  { option_type: 'activity_category', value: 'KOKURIKULUM', label: 'Kokurikulum', sort_order: 1 },
  { option_type: 'component', value: 'KELAB_PERSATUAN', label: 'Kelab', sort_order: 1 },
  { option_type: 'level', value: 'SEKOLAH', label: 'Sekolah', sort_order: 1 },
  { option_type: 'level', value: 'KEBANGSAAN', label: 'Kebangsaan', sort_order: 2 },
  ...['I', 'II', 'III'].map((value, index) => ({ option_type: 'participation_type', value: `PENGLIBATAN_${value}`, label: `Pelibatan ${value}`, sort_order: index })),
  { option_type: 'achievement_result', value: 'TIADA', label: 'Tiada', sort_order: 1 },
  { option_type: 'achievement_result', value: 'JOHAN', label: 'Johan', sort_order: 2 },
] } }) }))
vi.mock('../components/StudentSelector', () => ({ StudentSelector: ({ onChange }: { onChange: (value: object) => void }) => <button onClick={() => onChange(Object.fromEntries(['A', 'B'].map((name) => [name, { student_profile_id: name, student_enrollment_id: `enrol-${name}`, full_name: `Murid ${name}`, academic_year: 2026, class_id: '1', form: '1', class_name: 'A', art_field: null, participation_type: '', participation_role: '', contribution_type: '', achievement_result: 'TIADA', remarks: '' }])))}>Pilih dua murid</button> }))

describe('activity entry form', () => {
  beforeEach(() => { state.id = ''; state.api.mockReset(); state.navigate.mockReset(); state.api.mockResolvedValue({ activity_id: 'new' }) })
  afterEach(() => cleanup())
  const next = () => fireEvent.click(screen.getByRole('button', { name: /Seterusnya/ }))

  it('saves a new activity for two pupils with independent bulk choices', async () => {
    render(<ActivityWizardPage />)
    fireEvent.change(screen.getByLabelText(/Nama Aktiviti/), { target: { value: 'Karnival' } })
    fireEvent.change(screen.getByLabelText(/Aktiviti utama atau tambahan/), { target: { value: 'UTAMA' } })
    fireEvent.change(screen.getByLabelText(/Butiran bukti/), { target: { value: 'Sijil A dan B' } })
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Pilih dua murid' }))
    next()
    fireEvent.change(screen.getByLabelText('Penglibatan pukal'), { target: { value: 'PENGLIBATAN_II' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Gunakan kepada semua' })[0])
    fireEvent.click(screen.getByLabelText('Rekodkan Khidmat Sumbangan'))
    fireEvent.change(screen.getByLabelText('Khidmat sumbangan pukal'), { target: { value: 'JAWATANKUASA' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Gunakan kepada semua' })[1])
    fireEvent.change(screen.getByLabelText('Pencapaian pukal'), { target: { value: 'JOHAN' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Gunakan kepada semua' })[2])
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Hantar rekod' }))
    await waitFor(() => expect(state.api).toHaveBeenCalledWith('save_activity', expect.objectContaining({ participants: expect.arrayContaining([
      expect.objectContaining({ student_profile_id: 'A', participation_type: 'PENGLIBATAN_II', contribution_type: 'JAWATANKUASA', achievement_result: 'JOHAN' }),
      expect.objectContaining({ student_profile_id: 'B', participation_type: 'PENGLIBATAN_II', contribution_type: 'JAWATANKUASA', achievement_result: 'JOHAN' }),
    ]) })))
  })

  it('shows only the simple registration fields and uses level-dependent scores', () => {
    render(<ActivityWizardPage />)
    expect(screen.queryByLabelText('Kategori *')).toBeNull()
    expect(screen.queryByLabelText('Jenis program (panduan pelibatan)')).toBeNull()
    fireEvent.change(screen.getByLabelText(/Nama Aktiviti/), { target: { value: 'Aktiviti' } })
    fireEvent.change(screen.getByLabelText(/Peringkat/), { target: { value: 'KEBANGSAAN' } })
    next(); fireEvent.click(screen.getByRole('button', { name: 'Pilih dua murid' })); next()
    expect(screen.getAllByRole('option', { name: /Pelibatan I \(17 markah\)/ }).length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Rekodkan Khidmat Sumbangan')).toBeNull()
  })

  it('asks for confirmation before bulk changes overwrite existing choices', () => {
    render(<ActivityWizardPage />)
    fireEvent.change(screen.getByLabelText(/Nama Aktiviti/), { target: { value: 'Aktiviti' } })
    next(); fireEvent.click(screen.getByRole('button', { name: 'Pilih dua murid' })); next()
    fireEvent.change(screen.getByLabelText('Penglibatan pukal'), { target: { value: 'PENGLIBATAN_I' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Gunakan kepada semua' })[0])
    fireEvent.change(screen.getByLabelText('Penglibatan pukal'), { target: { value: 'PENGLIBATAN_II' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Gunakan kepada semua' })[0])
    expect(screen.getByRole('alert').textContent).toContain('menggantikan nilai individu')
    fireEvent.click(screen.getByRole('button', { name: 'Ya, gantikan' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('requests main activity and evidence before school contribution can be selected', () => {
    render(<ActivityWizardPage />)
    fireEvent.change(screen.getByLabelText(/Nama Aktiviti/), { target: { value: 'Aktiviti sekolah' } })
    next(); fireEvent.click(screen.getByRole('button', { name: 'Pilih dua murid' })); next()
    fireEvent.click(screen.getByLabelText('Rekodkan Khidmat Sumbangan'))
    expect(screen.queryByLabelText('Khidmat sumbangan pukal')).toBeNull()
    fireEvent.change(screen.getByLabelText('Jenis aktiviti'), { target: { value: 'UTAMA' } })
    fireEvent.change(screen.getByLabelText('Butiran bukti'), { target: { value: 'Sijil' } })
    expect(screen.getByLabelText('Khidmat sumbangan pukal')).toBeTruthy()
  })

  it('opens and saves a legacy activity without replacing its contribution', async () => {
    state.id = 'legacy'
    state.api.mockImplementation(async (action: string) => action === 'activity_detail' ? {
      activity: { id: 'legacy', activity_name: 'Aktiviti lama', activity_date: '2026-01-01', academic_year: 2026, category: 'KOKURIKULUM', component: 'KELAB_PERSATUAN', level: 'SEKOLAH', teacher_in_charge: 'Guru' },
      participants: [{ student_profile_id: 'A', student_enrollment_id: 'enrol-A', student_name_snapshot: 'Murid A', participation_type: 'PENGLIBATAN_II', contribution_type: 'PERSEMBAHAN', achievement_result: 'TIADA' }],
    } : { activity_id: 'legacy' })
    render(<ActivityWizardPage />)
    await screen.findByDisplayValue('Aktiviti lama')
    next(); next()
    expect(screen.getByText(/Rekod lama: PERSEMBAHAN/)).toBeTruthy()
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }))
    await waitFor(() => expect(state.api).toHaveBeenCalledWith('save_activity', expect.objectContaining({ participants: [expect.objectContaining({ participation_type: 'PENGLIBATAN_II', contribution_type: 'PERSEMBAHAN' })] })))
  })
})
