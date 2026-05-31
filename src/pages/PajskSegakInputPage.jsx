import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import SegakTabs from '../components/SegakTabs.jsx'
import { supabase } from '../lib/supabaseClient'
import {
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import {
  calculateSegakSummary,
  getBmiCategory,
  getSegakFitnessLevel,
  getSegakFitnessStatement,
  getSegakGrade,
  getSegakStars,
  normalizeSegakScore,
  SEGAK_TERMS,
} from '../lib/pajskSegak.js'
import { buildSegakYearOptions, usePajskSegakData } from '../lib/usePajskSegakData.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const todayIsoDate = () => new Date().toISOString().slice(0, 10)

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const formatNumber = (value, digits = 2) =>
  value === null || value === undefined || value === '' ? '-' : Number(value).toFixed(digits)

const formatStars = (stars) => {
  if (stars === null || stars === undefined || stars === '') return '-'
  return Number(stars) === 0 ? 'Tiada' : `${stars} Bintang`
}

const termLabel = (term) => (term === 'PENGGAL_2' ? 'Penggal 2' : 'Penggal 1')

export default function PajskSegakInputPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()
  const {
    loading,
    errorMessage,
    setErrorMessage,
    profile,
    setupConfig,
    academicYear,
    setAcademicYear,
    levelMappings,
    classes,
    enrollments,
    segakRows,
    reload,
  } = usePajskSegakData({ checkingAuth })

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('PENGGAL_1')
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState(false)

  const availableTingkatan = useMemo(() => {
    const fromClasses = classes.map((item) => item.tingkatan).filter(Boolean)
    const fallback = setupConfig?.active_grade_labels || []
    return sortLevelsByDisplayOrder(fromClasses.length ? fromClasses : fallback, levelMappings)
  }, [classes, levelMappings, setupConfig])

  const availableClasses = useMemo(() => {
    if (!selectedTingkatan) return []

    return classes
      .filter((item) => item.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
          getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
          'ms',
          { sensitivity: 'base', numeric: true }
        )
      )
  }, [classes, levelMappings, selectedTingkatan])

  const selectedClass = useMemo(
    () => classes.find((item) => String(item.id) === String(selectedClassId)) || null,
    [classes, selectedClassId]
  )

  const studentRows = useMemo(() => {
    if (!selectedClassId) return []

    return enrollments
      .filter((enrollment) => String(enrollment.class_id) === String(selectedClassId))
      .map((enrollment) => ({
        enrollment_id: enrollment.id,
        student_profile_id: enrollment.student_profile_id,
        full_name: enrollment.student_profiles?.full_name || '-',
        ic_number: enrollment.student_profiles?.ic_number || '-',
        gender: enrollment.student_profiles?.gender || '',
      }))
      .sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [enrollments, selectedClassId])

  useEffect(() => {
    if (!selectedClassId) {
      setDrafts({})
      return
    }

    const enrollmentIdSet = new Set(studentRows.map((student) => String(student.enrollment_id)))
    const nextDrafts = {}

    segakRows
      .filter((row) => row.term === selectedTerm)
      .filter((row) => enrollmentIdSet.has(String(row.student_enrollment_id)))
      .forEach((row) => {
        nextDrafts[row.student_enrollment_id] = {
          id: row.id,
          bmi: row.bmi ?? '',
          segak_total_score: row.segak_total_score ?? '',
          is_absent: row.is_absent === true,
          assessment_date: row.assessment_date || '',
          note: row.note || '',
          created_by: row.created_by || '',
          updated_by: row.updated_by || '',
        }
      })

    setDrafts(nextDrafts)
  }, [segakRows, selectedClassId, selectedTerm, studentRows])

  const updateDraft = (enrollmentId, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || {}),
        [field]: value,
      },
    }))
  }

  const toggleAbsent = (enrollmentId, checked) => {
    setDrafts((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || {}),
        is_absent: checked,
        segak_total_score: checked ? '' : prev[enrollmentId]?.segak_total_score ?? '',
      },
    }))
  }

  const summaryRows = useMemo(
    () =>
      studentRows.map((student) => {
        const draft = drafts[student.enrollment_id] || {}
        const bmi = toNumberOrNull(draft.bmi)
        const isAbsent = draft.is_absent === true
        const score = isAbsent ? 0 : normalizeSegakScore(draft.segak_total_score)

        return {
          student_enrollment_id: student.enrollment_id,
          bmi,
          bmi_category: getBmiCategory(bmi),
          segak_total_score: score,
          segak_grade: getSegakGrade(score, isAbsent),
          segak_stars: getSegakStars(score, isAbsent),
          is_absent: isAbsent,
        }
      }),
    [drafts, studentRows]
  )

  const currentSummary = useMemo(() => calculateSegakSummary(summaryRows), [summaryRows])

  const saveSegak = async () => {
    if (!profile?.school_id || !academicYear || !selectedClassId || !selectedTerm) {
      alert('Sila pilih tahun, tingkatan, kelas dan penggal dahulu.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      const rowsToUpsert = []
      const deleteIds = []

      studentRows.forEach((student) => {
        const draft = drafts[student.enrollment_id]
        if (!draft) return

        const hasBmi = String(draft.bmi ?? '').trim() !== ''
        const hasScore = String(draft.segak_total_score ?? '').trim() !== ''
        const isAbsent = draft.is_absent === true
        const hasAnyInput = hasBmi || hasScore || isAbsent

        if (!hasAnyInput) {
          if (draft.id) deleteIds.push(draft.id)
          return
        }

        const bmi = toNumberOrNull(draft.bmi)
        const score = isAbsent ? 0 : normalizeSegakScore(draft.segak_total_score)
        const grade = getSegakGrade(score, isAbsent)
        const stars = getSegakStars(score, isAbsent)
        const fitnessLevel = getSegakFitnessLevel(score, isAbsent)

        rowsToUpsert.push({
          school_id: profile.school_id,
          student_enrollment_id: student.enrollment_id,
          academic_year: Number(academicYear),
          term: selectedTerm,
          height_cm: null,
          weight_kg: null,
          bmi,
          bmi_category: getBmiCategory(bmi) || null,
          segak_total_score: score,
          segak_grade: grade || null,
          segak_stars: stars,
          fitness_level: fitnessLevel || null,
          fitness_statement: getSegakFitnessStatement(score, isAbsent) || null,
          is_absent: isAbsent,
          assessment_date: draft.assessment_date || todayIsoDate(),
          note: String(draft.note || '').trim() || null,
          created_by: draft.created_by || profile.id,
          updated_by: profile.id,
        })
      })

      if (rowsToUpsert.length === 0 && deleteIds.length === 0) {
        alert('Tiada perubahan SEGAK untuk disimpan.')
        setSaving(false)
        return
      }

      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('student_pajsk_segak')
          .delete()
          .in('id', deleteIds)

        if (deleteError) throw deleteError
      }

      if (rowsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('student_pajsk_segak')
          .upsert(rowsToUpsert, {
            onConflict: 'school_id,student_enrollment_id,academic_year,term',
          })

        if (upsertError) throw upsertError
      }

      await reload()
      alert('Rekod SEGAK dan BMI berjaya disimpan.')
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error.message?.includes('student_pajsk_segak')
          ? 'Simpan gagal kerana jadual student_pajsk_segak belum wujud atau constraint/RLS belum dikemaskini. Jalankan SQL migration PBS terkini dahulu.'
          : error.message || 'Gagal menyimpan rekod SEGAK.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Input SEGAK...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Input SEGAK / BMI"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate('/pbs/pajsk/segak')}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>SEGAK</span>
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/pbs/pajsk/segak/analysis')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              <span>Analisis</span>
            </button>
          }
        />

        <SegakTabs active="input" />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Penapis Input SEGAK</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {buildSegakYearOptions(academicYear).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={selectedTingkatan}
              onChange={(event) => {
                setSelectedTingkatan(event.target.value)
                setSelectedClassId('')
                setDrafts({})
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Pilih Tingkatan</option>
              {availableTingkatan.map((item) => (
                <option key={item} value={item}>
                  {getDisplayLevel(item, levelMappings)}
                </option>
              ))}
            </select>

            <select
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
              disabled={!selectedTingkatan}
            >
              <option value="">{selectedTingkatan ? 'Pilih Kelas' : 'Pilih Tingkatan dahulu'}</option>
              {availableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {getDisplayClassLabel(item.tingkatan, item.class_name, levelMappings)}
                </option>
              ))}
            </select>

            <select
              value={selectedTerm}
              onChange={(event) => setSelectedTerm(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {SEGAK_TERMS.map((term) => (
                <option key={term} value={term}>
                  {termLabel(term)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard title="Jumlah Murid" value={studentRows.length} />
          <SummaryCard title="Purata BMI" value={formatNumber(currentSummary.averageBmi)} />
          <SummaryCard title="Purata Skor SEGAK" value={formatNumber(currentSummary.averageSegakScore)} />
          <SummaryCard title="Tidak Lengkap" value={currentSummary.incompleteCount} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Senarai Murid {selectedClass ? getDisplayClassLabel(selectedClass.tingkatan, selectedClass.class_name, levelMappings) : ''}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedClass ? `${termLabel(selectedTerm)} - ${academicYear}` : 'Pilih tingkatan dan kelas untuk mula input SEGAK.'}
              </p>
            </div>

            <button
              type="button"
              onClick={saveSegak}
              disabled={saving || !studentRows.length}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Semua'}</span>
            </button>
          </div>

          {!selectedClassId ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Sila pilih kelas.
            </div>
          ) : studentRows.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Tiada murid aktif dalam kelas ini.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[1080px] border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Murid
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      No IC
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      BMI
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Kategori BMI
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Tidak Hadir
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Skor SEGAK
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Gred
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Bintang
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Tahap Kecergasan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map((student) => {
                    const draft = drafts[student.enrollment_id] || {}
                    const bmi = toNumberOrNull(draft.bmi)
                    const isAbsent = draft.is_absent === true
                    const score = isAbsent ? 0 : normalizeSegakScore(draft.segak_total_score)
                    const grade = getSegakGrade(score, isAbsent)
                    const stars = getSegakStars(score, isAbsent)
                    const fitnessLevel = getSegakFitnessLevel(score, isAbsent)

                    return (
                      <tr key={student.enrollment_id} className="border-b border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {student.full_name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{student.ic_number}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.bmi ?? ''}
                            onChange={(event) =>
                              updateDraft(student.enrollment_id, 'bmi', event.target.value)
                            }
                            className="w-28 rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="BMI"
                          />
                        </td>
                        <td className="px-4 py-3 text-slate-700">{getBmiCategory(bmi) || '-'}</td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={isAbsent}
                              onChange={(event) =>
                                toggleAbsent(student.enrollment_id, event.target.checked)
                              }
                              className="h-4 w-4 rounded border-slate-300 text-slate-900"
                            />
                            <span>Tidak Hadir</span>
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="1"
                            value={isAbsent ? '' : draft.segak_total_score ?? ''}
                            onChange={(event) =>
                              updateDraft(
                                student.enrollment_id,
                                'segak_total_score',
                                event.target.value
                              )
                            }
                            className="w-28 rounded-lg border border-slate-300 px-3 py-2"
                            disabled={isAbsent}
                            placeholder="0-20"
                          />
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">{grade || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{formatStars(stars)}</td>
                        <td className="px-4 py-3 text-slate-700">{fitnessLevel || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  )
}
