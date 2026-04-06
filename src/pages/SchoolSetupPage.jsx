import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import {
  buildDefaultOtrPercentagesByGrade,
  getOtrSettings,
} from '../lib/otrGeneration'

export default function SchoolSetupPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [school, setSchool] = useState(null)
  const [existingSetupConfig, setExistingSetupConfig] = useState(null)

  const [activeGradeLabels, setActiveGradeLabels] = useState([])
  const [classCountByGrade, setClassCountByGrade] = useState({})
  const [arCountByGrade, setArCountByGrade] = useState({})
  const [otrCountByGrade, setOtrCountByGrade] = useState({})
  const [setupStatus, setSetupStatus] = useState({
    exams: false,
    grades: false,
    subjects: false,
    classes: false,
    students: false,
  })

  const menengahOptions = [
    'Tingkatan 1',
    'Tingkatan 2',
    'Tingkatan 3',
    'Tingkatan 4',
    'Tingkatan 5',
  ]

  const rendahOptions = [
    'Tahun 1',
    'Tahun 2',
    'Tahun 3',
    'Tahun 4',
    'Tahun 5',
    'Tahun 6',
  ]

  useEffect(() => {
    initPage()
  }, [])

  const ensureOtrConfigDefaults = async (schoolId, setupData) => {
    if (!setupData?.id) return setupData

    const normalizedSettings = getOtrSettings(
      setupData,
      setupData.active_grade_labels || []
    )

    const needsBackfill =
      !setupData.otr_generation_mode ||
      !setupData.otr_percentages_default ||
      !setupData.otr_percentages_by_grade ||
      setupData.auto_recalculate_otr_on_etr_change === null ||
      setupData.auto_recalculate_otr_on_etr_change === undefined

    if (!needsBackfill) {
      return {
        ...setupData,
        ...normalizedSettings,
      }
    }

    const nextSetupData = {
      ...setupData,
      ...normalizedSettings,
    }

    const { error } = await supabase
      .from('school_setup_configs')
      .update({
        otr_generation_mode: nextSetupData.otr_generation_mode,
        otr_percentages_default: nextSetupData.otr_percentages_default,
        otr_percentages_by_grade: nextSetupData.otr_percentages_by_grade,
        auto_recalculate_otr_on_etr_change:
          nextSetupData.auto_recalculate_otr_on_etr_change,
      })
      .eq('school_id', schoolId)

    if (error) {
      console.error(error)
      return nextSetupData
    }

    return nextSetupData
  }

  const initPage = async () => {
    setLoading(true)

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
      .select('id, full_name, email, role, school_id, is_master_admin, is_school_admin, approval_status')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profileData) {
      navigate('/login', { replace: true })
      return
    }

    if (
      !profileData.is_master_admin &&
      !(profileData.is_school_admin && profileData.approval_status === 'approved')
    ) {
      navigate('/dashboard', { replace: true })
      return
    }

    setProfile(profileData)

    if (!profileData.school_id) {
      alert('Tiada school_id pada akaun ini.')
      navigate('/dashboard', { replace: true })
      return
    }

    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .select('id, school_name, school_code, level, school_type, state, district')
      .eq('id', profileData.school_id)
      .maybeSingle()

    if (schoolError || !schoolData) {
      alert('Maklumat sekolah tidak ditemui.')
      navigate('/dashboard', { replace: true })
      return
    }

    setSchool(schoolData)

    const { data: setupData, error: setupError } = await supabase
      .from('school_setup_configs')
      .select(`
        id,
        school_id,
        current_academic_year,
        active_grade_labels,
        class_count_by_grade,
        ar_count_by_grade,
        otr_count_by_grade,
        otr_generation_mode,
        otr_percentages_default,
        otr_percentages_by_grade,
        auto_recalculate_otr_on_etr_change,
        setup_step
      `)
      .eq('school_id', profileData.school_id)
      .maybeSingle()

    if (setupError) {
      console.error(setupError)
      alert('Gagal membaca setup sekolah.')
      setLoading(false)
      return
    }

    let normalizedSetupData = setupData

    if (setupData) {
      normalizedSetupData = await ensureOtrConfigDefaults(profileData.school_id, setupData)
      setExistingSetupConfig(normalizedSetupData)
      setActiveGradeLabels(normalizedSetupData.active_grade_labels || [])
      setClassCountByGrade(normalizedSetupData.class_count_by_grade || {})
      setArCountByGrade(normalizedSetupData.ar_count_by_grade || {})
      setOtrCountByGrade(normalizedSetupData.otr_count_by_grade || {})
    }

    await loadSetupStatus(profileData.school_id, normalizedSetupData)

    setLoading(false)
  }

  const loadSetupStatus = async (schoolId, setupData) => {
    const setupStep = setupData?.setup_step || 0
    const academicYear = setupData?.current_academic_year || new Date().getFullYear()

    const [{ count: examCount }, { count: gradeCount }, { count: subjectCount }, { count: classCount }, { count: studentCount }] = await Promise.all([
      supabase
        .from('exam_configs')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear),
      supabase
        .from('grade_scales')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear),
      supabase
        .from('subjects')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId),
      supabase
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .eq('academic_year', academicYear),
      supabase
        .from('student_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .eq('academic_year', academicYear),
    ])

    setSetupStatus({
      exams: setupStep >= 2 || (examCount || 0) > 0,
      grades: setupStep >= 3 || (gradeCount || 0) > 0,
      subjects: setupStep >= 4 || (subjectCount || 0) > 0,
      classes: (classCount || 0) > 0,
      students: (studentCount || 0) > 0,
    })
  }

  const gradeOptions = useMemo(() => {
    if (school?.level?.toLowerCase() === 'rendah') return rendahOptions
    return menengahOptions
  }, [school])

  const toggleGradeLabel = (label) => {
    setActiveGradeLabels((prev) => {
      const exists = prev.includes(label)

      if (exists) {
        const next = prev.filter((x) => x !== label)

        setClassCountByGrade((old) => {
          const copy = { ...old }
          delete copy[label]
          return copy
        })

        setArCountByGrade((old) => {
          const copy = { ...old }
          delete copy[label]
          return copy
        })

        setOtrCountByGrade((old) => {
          const copy = { ...old }
          delete copy[label]
          return copy
        })

        return next
      }

      return [...prev, label]
    })
  }

  const handleNumberChange = (setter, label, value) => {
    const numericValue = value === '' ? '' : Math.max(0, Number(value))
    setter((prev) => ({
      ...prev,
      [label]: numericValue,
    }))
  }

  const validateForm = () => {
    if (activeGradeLabels.length === 0) {
      alert('Sila pilih sekurang-kurangnya satu tingkatan / tahun.')
      return false
    }

    for (const label of activeGradeLabels) {
      const classCount = Number(classCountByGrade[label] || 0)
      const arCount = Number(arCountByGrade[label] || 0)
      const otrCount = Number(otrCountByGrade[label] || 0)

      if (!classCount || classCount < 1) {
        alert(`Sila isi bilangan kelas untuk ${label}.`)
        return false
      }

      if (!arCount || arCount < 1) {
        alert(`Sila isi bilangan AR untuk ${label}.`)
        return false
      }

      if (!otrCount || otrCount < 1) {
        alert(`Sila isi bilangan OTR untuk ${label}.`)
        return false
      }
    }

    return true
  }

  const handleSave = async () => {
    if (!validateForm()) return
    if (!profile?.school_id) return

    setSaving(true)

    const otrSettings = getOtrSettings(existingSetupConfig, activeGradeLabels)

    const payload = {
      school_id: profile.school_id,
      current_academic_year: new Date().getFullYear(),
      active_grade_labels: activeGradeLabels,
      class_count_by_grade: classCountByGrade,
      ar_count_by_grade: arCountByGrade,
      otr_count_by_grade: otrCountByGrade,
      otr_generation_mode: otrSettings.otr_generation_mode,
      otr_percentages_default: otrSettings.otr_percentages_default,
      otr_percentages_by_grade: buildDefaultOtrPercentagesByGrade(
        activeGradeLabels,
        otrSettings.otr_percentages_by_grade,
        otrSettings.otr_percentages_default
      ),
      auto_recalculate_otr_on_etr_change:
        otrSettings.auto_recalculate_otr_on_etr_change,
      setup_step: 1,
      updated_by: profile.id,
      created_by: profile.id,
    }

    const { error } = await supabase
      .from('school_setup_configs')
      .upsert(payload, { onConflict: 'school_id' })

    if (error) {
      console.error(error)
      alert(`Gagal simpan setup: ${error.message}`)
      setSaving(false)
      return
    }

    alert('Tetapan akademik sekolah berjaya disimpan.')
    setSaving(false)
    navigate('/school-setup/exams')
  }

  if (loading) {
    return <div className="p-6">Loading School Setup...</div>
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">EduTrack</p>
              <p className="text-lg font-bold text-slate-900">Tetapan Akademik Sekolah</p>
            </div>
            <div className="flex w-full gap-2 overflow-x-auto md:w-auto md:flex-wrap">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => navigate('/school-setup/exams')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Tetapan Peperiksaan →
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            Tetapan Sekolah — Langkah 1
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            Profil Akademik Sekolah
          </h1>
          <p className="mt-2 text-slate-600">
            Tetapkan tingkatan / tahun aktif, bilangan kelas, bilangan AR, dan bilangan OTR.
          </p>

          <div className="mt-4 space-y-1 text-sm text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">Sekolah:</span>{' '}
              {school?.school_name || '-'}
              {school?.school_code ? ` (${school.school_code})` : ''}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Level:</span>{' '}
              {school?.level || '-'}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Jenis:</span>{' '}
              {school?.school_type || '-'}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold text-slate-900">Status Tetapan Akademik</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 font-semibold text-slate-800">Status Tetapan</h3>
              <div className="space-y-1 text-sm text-slate-700">
                <p>{setupStatus.exams ? '✅' : '⬜'} Tetapan peperiksaan</p>
                <p>{setupStatus.grades ? '✅' : '⬜'} Tetapan grade</p>
                <p>{setupStatus.subjects ? '✅' : '⬜'} Tetapan subjek</p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-800">Status Data Akademik</h3>
              <div className="space-y-1 text-sm text-slate-700">
                <p>{setupStatus.classes ? '✅' : '⬜'} Tetapan kelas</p>
                <p>{setupStatus.students ? '✅' : '⬜'} Input murid</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Pilih Tingkatan / Tahun Aktif
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pilih semua tingkatan atau tahun yang digunakan oleh sekolah ini.
            </p>
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            {gradeOptions.map((label) => {
              const selected = activeGradeLabels.includes(label)

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleGradeLabel(label)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    selected
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {activeGradeLabels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
              Belum ada tingkatan / tahun dipilih.
            </div>
          ) : (
            <div className="space-y-4">
              {activeGradeLabels.map((label) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">{label}</h3>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Bilangan Kelas
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={classCountByGrade[label] ?? ''}
                        onChange={(e) =>
                          handleNumberChange(setClassCountByGrade, label, e.target.value)
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        placeholder="Contoh: 3"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Bilangan AR
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={arCountByGrade[label] ?? ''}
                        onChange={(e) =>
                          handleNumberChange(setArCountByGrade, label, e.target.value)
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        placeholder="Contoh: 2"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Bilangan OTR
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={otrCountByGrade[label] ?? ''}
                        onChange={(e) =>
                          handleNumberChange(setOtrCountByGrade, label, e.target.value)
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        placeholder="Contoh: 2"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Step 1'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-100"
            >
              Kembali
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
