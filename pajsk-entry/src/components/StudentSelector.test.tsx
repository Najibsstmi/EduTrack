// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ParticipantDraft } from '../types'
import { StudentSelector } from './StudentSelector'

const api = vi.hoisted(() => vi.fn())
vi.mock('../lib/api', () => ({ apiRequest: api }))
vi.mock('../session/useSession', () => ({ useSession: () => ({ data: { classes: [{ id: 'class-a', academic_year: 2026, form: '1', class_name: 'A' }] } }) }))

function Harness() {
  const [selected, setSelected] = useState<Record<string, ParticipantDraft>>({})
  return <StudentSelector academicYear={2026} selected={selected} onChange={setSelected} />
}

describe('bulk student selection', () => {
  afterEach(() => { cleanup(); api.mockReset() })
  it('loads more than 100, selects all, then deselects all', async () => {
    const students = Array.from({ length: 101 }, (_, index) => ({ student_profile_id: String(index), student_enrollment_id: `e${index}`, full_name: `Murid ${index}`, academic_year: 2026, class_id: 'class-a', form: '1', class_name: 'A', art_field: null }))
    api.mockImplementation(async (_action, payload) => ({ students: students.slice(payload.offset, payload.offset + 100) }))
    render(<Harness />)
    const selectAll = await screen.findByRole('button', { name: 'Pilih semua murid (101)' }, { timeout: 5000 })
    fireEvent.click(selectAll)
    expect(screen.getByText('101 murid dipilih')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nyahpilih semua' }))
    expect(screen.getByText('0 murid dipilih')).toBeTruthy()
    fireEvent.click(screen.getByText('Murid 0').closest('button')!)
    expect(screen.getByText('1 murid dipilih')).toBeTruthy()
    expect(api).toHaveBeenCalledWith('search_students', expect.objectContaining({ offset: 100 }))
    fireEvent.change(screen.getByLabelText('Kelas'), { target: { value: 'class-a' } })
    await waitFor(() => expect(api).toHaveBeenCalledWith('search_students', expect.objectContaining({ class_id: 'class-a', offset: 0 })))
  }, 10000)
})
