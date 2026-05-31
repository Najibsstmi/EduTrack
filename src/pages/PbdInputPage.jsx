import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PbdTabs from '../components/PbdTabs.jsx'
import { supabase } from '../lib/supabaseClient'
import { getRelevantEnrollmentIds } from '../lib/completionMatrix.js'
import {
  fetchSchoolLevelLabels,
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import {
  calculatePbdDistribution,
  calculatePbdMinimumAchievement,
  TP_LEVELS,
} from '../lib/pbdAnalysis.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const todayIsoDate = () => new Date().toISOString().slice(0, 10)

const buildYearOptions = (currentYear) => {
  const baseYear = Number(currentYear) || new Date().getFullYear()
  return [baseYear - 1, baseYear, baseYear + 1, baseYear + 2]
}

export default function PbdInputPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  const [loading, setLoading] = useState(true)
  const [loadingScores, setLoadingScores] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [levelMappings, setLevelMappings] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [studentSubjectEnrollments, setStudentSubjectEnrollments] = useState([])
  const [scoreDrafts, setScoreDrafts] = useState({})
  const [bulkTp, setBulkTp] = useState('')

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [tpFilter, setTpFilter] = useState('')

  const initPage = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        navigate('/login', { replace: true })
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, school_id, role, is_school_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || !profileData) {
        navigate('/login', { replace: true })
        return
      }

      const { data: setupRows, error: setupError } = await supabase
        .from('school_setup_configs')
        .select('current_academic_year, active_grade_labels')
        .eq('school_id', profileData.school_id)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (setupError) throw setupError

      const setupData = setupRows?.[0] || null
      const currentYear = setupData?.current_academic_year || new Date().getFullYear()

      setProfile(profileData)
      setSetupConfig(setupData)
      setAcademicYear(currentYear)
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan halaman PBD.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const loadAcademicData = useCallback(async (schoolId, year) => {
    setLoading(true)
    setErrorMessage('')

    try {
      const [
        loadedLevelMappings,
        { data: classData, error: classError },
        { data: subjectData, error: subjectError },
        { data: enrollmentData, error: enrollmentError },
        { data: studentSubjectData, error: studentSubjectError },
      ] = await Promise.all([
        fetchSchoolLevelLabels({ schoolId, academicYear: year }),
        supabase
          .from('classes')
          .select('id, tingkatan, class_name, academic_year, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true)
          .order('tingkatan', { ascending: true })
          .order('class_name', { ascending: true }),
        supabase
          .from('subjects')
          .select('id, subject_name, subject_code, tingkatan, subject_type, is_core, is_active')
          .eq('school_id', schoolId)
          .eq('is_active', true)
          .order('subject_name', { ascending: true }),
        supabase
          .from('student_enrollments')
          .select(`
            id,
            class_id,
            student_profile_id,
            academic_year,
            is_active,
            student_profiles (
              id,
              full_name,
              ic_number,
              gender
            )
          `)
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true),
        supabase
          .from('student_subject_enrollments')
          .select('id, student_enrollment_id, subject_id, academic_year, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true),
      ])

      if (classError) throw classError
      if (subjectError) throw subjectError
      if (enrollmentError) throw enrollmentError
      if (studentSubjectError) throw studentSubjectError

      setLevelMappings(loadedLevelMappings || [])
      setClasses(classData || [])
      setSubjects(subjectData || [])
      setEnrollments(enrollmentData || [])
      setStudentSubjectEnrollments(studentSubjectData || [])
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan data akademik PBD.')
    } finally {
      setLoading(false)
    }
  }, [])

  const availableTingkatan = useMemo(() => {
    const fromClasses = classes.map((item) => item.tingkatan).filter(Boolean)
    const fallback = setupConfig?.active_grade_labels || []
    return sortLevelsByDisplayOrder(fromClasses.length ? fromClasses : fallback, levelMappings)
  }, [classes, levelMappings, setupConfig])

  const availableClasses = useMemo(() => {
    return classes
      .filter((item) => !selectedTingkatan || item.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
          getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
          'ms',
          { sensitivity: 'base', numeric: true }
        )
      )
  }, [classes, levelMappings, selectedTingkatan])

  const availableSubjects = useMemo(() => {
    return subjects
      .filter((subject) => !selectedTingkatan || subject.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [subjects, selectedTingkatan])

  const selectedSubject = useMemo(() => {
    return subjects.find((subject) => String(subject.id) === String(selectedSubjectId)) || null
  }, [subjects, selectedSubjectId])

  const selectedClass = useMemo(() => {
    return classes.find((item) => String(item.id) === String(selectedClassId)) || null
  }, [classes, selectedClassId])

  const studentRows = useMemo(() => {
    if (!selectedClassId || !selectedSubject) return []

    const relevantEnrollmentIds = getRelevantEnrollmentIds({
      classId: selectedClassId,
      subject: selectedSubject,
      enrollments,
      studentSubjectEnrollments,
    })
    const relevantEnrollmentIdSet = new Set(relevantEnrollmentIds.map((id) => String(id)))

    return enrollments
      .filter((enrollment) => relevantEnrollmentIdSet.has(String(enrollment.id)))
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
  }, [selectedClassId, selectedSubject, enrollments, studentSubjectEnrollments])

  const loadPbdScores = useCallback(async () => {
    if (!profile?.school_id || !academicYear || !selectedClassId || !selectedSubjectId) return

    const enrollmentIds = studentRows.map((student) => student.enrollment_id)
    if (enrollmentIds.length === 0) {
      setScoreDrafts({})
      return
    }

    setLoadingScores(true)
    setErrorMessage('')

    try {
      const { data, error } = await supabase
        .from('student_pbd_scores')
        .select('id, student_enrollment_id, subject_id, tp_level, evidence_note, assessment_date, created_by, updated_by')
        .eq('school_id', profile.school_id)
        .eq('academic_year', academicYear)
        .eq('subject_id', selectedSubjectId)
        .in('student_enrollment_id', enrollmentIds)

      if (error) throw error

      const nextDrafts = {}
      ;(data || []).forEach((row) => {
        nextDrafts[row.student_enrollment_id] = {
          id: row.id,
          tp_level: row.tp_level ? String(row.tp_level) : '',
          evidence_note: row.evidence_note || '',
          assessment_date: row.assessment_date || '',
          created_by: row.created_by || '',
          updated_by: row.updated_by || '',
        }
      })

      setScoreDrafts(nextDrafts)
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error.message?.includes('student_pbd_scores')
          ? 'Jadual student_pbd_scores belum tersedia. Sila jalankan SQL migration PBS di Supabase.'
          : error.message || 'Gagal memuatkan skor PBD.'
      )
    } finally {
      setLoadingScores(false)
    }
  }, [academicYear, profile?.school_id, selectedClassId, selectedSubjectId, studentRows])

  useEffect(() => {
    if (checkingAuth) return
    initPage()
  }, [checkingAuth, initPage])

  useEffect(() => {
    if (!profile?.school_id || !academicYear) return
    loadAcademicData(profile.school_id, academicYear)
  }, [profile?.school_id, academicYear, loadAcademicData])

  useEffect(() => {
    setScoreDrafts({})
    loadPbdScores()
  }, [loadPbdScores])

  const updateDraft = (enrollmentId, field, value) => {
    setScoreDrafts((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || {}),
        [field]: value,
      },
    }))
  }

  const applyBulkTp = () => {
    if (!bulkTp) {
      alert('Pilih TP pukal dahulu.')
      return
    }

    setScoreDrafts((prev) => {
      const next = { ...prev }
      visibleStudents.forEach((student) => {
        next[student.enrollment_id] = {
          ...(next[student.enrollment_id] || {}),
          tp_level: bulkTp,
          assessment_date: next[student.enrollment_id]?.assessment_date || todayIsoDate(),
        }
      })
      return next
    })
  }

  const visibleStudents = useMemo(() => {
    return studentRows.filter((student) => {
      const draft = scoreDrafts[student.enrollment_id] || {}
      const tp = draft.tp_level ? String(draft.tp_level) : ''

      if (tpFilter === 'empty' && tp) return false
      if (tpFilter && tpFilter !== 'empty' && tp !== tpFilter) return false

      return true
    })
  }, [scoreDrafts, studentRows, tpFilter])

  const currentDistribution = useMemo(() => {
    const scoreRows = studentRows
      .map((student) => ({
        student_enrollment_id: student.enrollment_id,
        tp_level: Number(scoreDrafts[student.enrollment_id]?.tp_level),
      }))
      .filter((row) => TP_LEVELS.includes(row.tp_level))

    return calculatePbdDistribution(scoreRows, studentRows.length)
  }, [scoreDrafts, studentRows])

  const minimumAchievement = useMemo(
    () => calculatePbdMinimumAchievement(currentDistribution),
    [currentDistribution]
  )

  const savePbdScores = async () => {
    if (!profile?.school_id || !academicYear || !selectedClassId || !selectedSubjectId) {
      alert('Sila pilih tahun, kelas dan subjek dahulu.')
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      const rowsToUpsert = []
      const deleteIds = []

      studentRows.forEach((student) => {
        const draft = scoreDrafts[student.enrollment_id]
        if (!draft) return

        const tpLevel = Number(draft.tp_level)
        const hasTp = TP_LEVELS.includes(tpLevel)

        if (!hasTp) {
          if (draft.id) deleteIds.push(draft.id)
          return
        }

        rowsToUpsert.push({
          school_id: profile.school_id,
          student_enrollment_id: student.enrollment_id,
          academic_year: Number(academicYear),
          subject_id: selectedSubjectId,
          tp_level: tpLevel,
          evidence_note: String(draft.evidence_note || '').trim() || null,
          assessment_date: draft.assessment_date || null,
          created_by: draft.created_by || profile.id,
          updated_by: profile.id,
        })
      })

      if (rowsToUpsert.length === 0 && deleteIds.length === 0) {
        alert('Tiada perubahan PBD untuk disimpan.')
        setSaving(false)
        return
      }

      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('student_pbd_scores')
          .delete()
          .in('id', deleteIds)

        if (deleteError) throw deleteError
      }

      if (rowsToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('student_pbd_scores')
          .upsert(rowsToUpsert, {
            onConflict: 'student_enrollment_id,subject_id,academic_year',
          })

        if (upsertError) throw upsertError
      }

      await loadPbdScores()
      alert('Rekod PBD berjaya disimpan.')
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error.message?.includes('student_pbd_scores')
          ? 'Simpan gagal kerana jadual student_pbd_scores belum wujud atau RLS belum dikemaskini. Jalankan SQL migration PBS dahulu.'
          : error.message || 'Gagal menyimpan PBD.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading PBD...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Input PBD"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate('/pbs')}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              PBS
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/pbs/pbd/analysis')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Analisis PBD
            </button>
          }
        />

        <PbdTabs active="input" />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Penapis Input PBD</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            <select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {buildYearOptions(academicYear).map((year) => (
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
                setSelectedSubjectId('')
                setScoreDrafts({})
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
            >
              <option value="">Pilih Kelas</option>
              {availableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {getDisplayClassLabel(item.tingkatan, item.class_name, levelMappings)}
                </option>
              ))}
            </select>

            <select
              value={selectedSubjectId}
              onChange={(event) => setSelectedSubjectId(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Pilih Subjek</option>
              {availableSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.subject_name}
                </option>
              ))}
            </select>

            <select
              value={tpFilter}
              onChange={(event) => setTpFilter(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua TP</option>
              <option value="empty">Belum diisi</option>
              {TP_LEVELS.map((level) => (
                <option key={level} value={level}>
                  TP{level}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard title="Jumlah Murid" value={studentRows.length} />
          <SummaryCard title="Telah Diisi" value={currentDistribution.assessedCount} />
          <SummaryCard title="Capai TP3-TP6" value={minimumAchievement.minimumCount} />
          <SummaryCard title="% Minimum" value={`${minimumAchievement.minimumPercent.toFixed(1)}%`} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Senarai Murid {selectedClass ? getDisplayClassLabel(selectedClass.tingkatan, selectedClass.class_name, levelMappings) : ''}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedSubject ? selectedSubject.subject_name : 'Pilih kelas dan subjek untuk mula input PBD.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={bulkTp}
                onChange={(event) => setBulkTp(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">TP Pukal</option>
                {TP_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    TP{level}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyBulkTp}
                disabled={!visibleStudents.length}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Tetapkan
              </button>
              <button
                type="button"
                onClick={savePbdScores}
                disabled={saving || !studentRows.length}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan PBD'}
              </button>
            </div>
          </div>

          {loadingScores ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              Memuatkan skor PBD...
            </div>
          ) : !selectedClassId || !selectedSubjectId ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Sila pilih kelas dan subjek.
            </div>
          ) : visibleStudents.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Tiada murid sepadan dengan penapis.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Murid
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      No IC
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      TP
                    </th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Tarikh
                    </th>
                    <th className="min-w-80 border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">
                      Eviden / Catatan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStudents.map((student) => {
                    const draft = scoreDrafts[student.enrollment_id] || {}

                    return (
                      <tr key={student.enrollment_id} className="border-b border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {student.full_name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{student.ic_number}</td>
                        <td className="px-4 py-3">
                          <select
                            value={draft.tp_level || ''}
                            onChange={(event) =>
                              updateDraft(student.enrollment_id, 'tp_level', event.target.value)
                            }
                            className="w-28 rounded-lg border border-slate-300 px-3 py-2"
                          >
                            <option value="">-</option>
                            {TP_LEVELS.map((level) => (
                              <option key={level} value={level}>
                                TP{level}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="date"
                            value={draft.assessment_date || ''}
                            onChange={(event) =>
                              updateDraft(student.enrollment_id, 'assessment_date', event.target.value)
                            }
                            className="rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <textarea
                            value={draft.evidence_note || ''}
                            onChange={(event) =>
                              updateDraft(student.enrollment_id, 'evidence_note', event.target.value)
                            }
                            rows={2}
                            className="w-full min-w-72 resize-y rounded-lg border border-slate-300 px-3 py-2"
                            placeholder="Catatan eviden PBD"
                          />
                        </td>
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
