import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function SchoolSetupExamsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [school, setSchool] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)

  const [gradeConfigs, setGradeConfigs] = useState({})

  useEffect(() => {
    initPage()
  }, [])

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
      .select('id, school_id, is_master_admin, is_school_admin, approval_status')
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

    const { data: schoolData } = await supabase
      .from('schools')
      .select('id, school_name, school_code, level, school_type, state, district')
      .eq('id', profileData.school_id)
      .maybeSingle()

    setSchool(schoolData || null)

    const { data: setupData, error: setupError } = await supabase
      .from('school_setup_configs')
      .select(`
        id,
        school_id,
        current_academic_year,
        active_grade_labels,
        ar_count_by_grade,
        otr_count_by_grade,
        setup_step
      `)
      .eq('school_id', profileData.school_id)
      .maybeSingle()

    if (setupError || !setupData) {
      alert('Step 1 belum lengkap. Sila lengkapkan Step 1 dahulu.')
      navigate('/school-setup', { replace: true })
      return
    }

    setSetupConfig(setupData)

    const { data: existingExamConfigs, error: examError } = await supabase
      .from('exam_configs')
      .select('id, grade_label, exam_key, exam_name, exam_order, level, academic_year')
      .eq('school_id', profileData.school_id)
      .eq('academic_year', setupData.current_academic_year)
      .order('exam_order', { ascending: true })

    if (examError) {
      console.error(examError)
      alert('Gagal membaca konfigurasi peperiksaan.')
      setLoading(false)
      return
    }

    const generated = generateDefaultConfigs(
      schoolData?.level || 'Menengah',
      setupData.active_grade_labels || [],
      setupData.ar_count_by_grade || {},
      setupData.otr_count_by_grade || {},
      existingExamConfigs || [],
      setupData.current_academic_year
    )

    setGradeConfigs(generated)
    setLoading(false)
  }

  const generateDefaultConfigs = (
    schoolLevel,
    activeGradeLabels,
    arCountByGrade,
    otrCountByGrade,
    existingConfigs,
    academicYear
  ) => {
    const result = {}

    for (const gradeLabel of activeGradeLabels) {
      const arCount = Number(arCountByGrade?.[gradeLabel] || 0)
      const otrCount = Number(otrCountByGrade?.[gradeLabel] || 0)

      const defaultRows = []

      defaultRows.push({
        grade_label: gradeLabel,
        exam_key: 'TOV',
        exam_name: 'TOV',
        exam_order: 1,
        level: schoolLevel,
        academic_year: academicYear,
      })

      for (let i = 1; i <= arCount; i++) {
        let defaultName = `AR${i}`

        if (schoolLevel?.toLowerCase() === 'menengah') {
          if (gradeLabel === 'Tingkatan 5') {
            defaultName = i === 1 ? 'PPT' : i === 2 ? 'PPC' : `AR${i}`
          } else {
            defaultName = i === 1 ? 'PPT' : i === 2 ? 'PAT' : `AR${i}`
          }
        }

        defaultRows.push({
          grade_label: gradeLabel,
          exam_key: `AR${i}`,
          exam_name: defaultName,
          exam_order: defaultRows.length + 1,
          level: schoolLevel,
          academic_year: academicYear,
        })
      }

      for (let i = 1; i <= otrCount; i++) {
        defaultRows.push({
          grade_label: gradeLabel,
          exam_key: `OTR${i}`,
          exam_name: `OTR${i}`,
          exam_order: defaultRows.length + 1,
          level: schoolLevel,
          academic_year: academicYear,
        })
      }

      defaultRows.push({
        grade_label: gradeLabel,
        exam_key: 'ETR',
        exam_name: 'ETR',
        exam_order: defaultRows.length + 1,
        level: schoolLevel,
        academic_year: academicYear,
      })

      const mergedRows = defaultRows.map((row) => {
        const existing = existingConfigs.find(
          (item) =>
            item.grade_label === row.grade_label &&
            item.exam_key === row.exam_key
        )

        return existing
          ? {
              ...row,
              id: existing.id,
              exam_name: existing.exam_name,
              exam_order: existing.exam_order,
            }
          : row
      })

      result[gradeLabel] = mergedRows
    }

    return result
  }

  const gradeLabels = useMemo(() => {
    return Object.keys(gradeConfigs)
  }, [gradeConfigs])

  const handleExamNameChange = (gradeLabel, examKey, value) => {
    setGradeConfigs((prev) => ({
      ...prev,
      [gradeLabel]: prev[gradeLabel].map((row) =>
        row.exam_key === examKey ? { ...row, exam_name: value } : row
      ),
    }))
  }

  const handleSave = async () => {
    if (!profile?.school_id || !setupConfig) return

    setSaving(true)

    const payload = []

    for (const gradeLabel of Object.keys(gradeConfigs)) {
      for (const row of gradeConfigs[gradeLabel]) {
        payload.push({
          school_id: profile.school_id,
          academic_year: setupConfig.current_academic_year,
          level: row.level,
          grade_label: row.grade_label,
          exam_key: row.exam_key,
          exam_name: row.exam_name?.trim() || row.exam_key,
          exam_order: row.exam_order,
        })
      }
    }

    const { error } = await supabase
      .from('exam_configs')
      .upsert(payload, {
        onConflict: 'school_id,academic_year,level,grade_label,exam_key',
      })

    if (error) {
      console.error(error)
      alert(`Gagal simpan exam configs: ${error.message}`)
      setSaving(false)
      return
    }

    const { error: setupUpdateError } = await supabase
      .from('school_setup_configs')
      .update({
        setup_step: 2,
        updated_by: profile.id,
      })
      .eq('school_id', profile.school_id)

    if (setupUpdateError) {
      console.error(setupUpdateError)
    }

    alert('Step 2 berjaya disimpan.')
    setSaving(false)

    // Step seterusnya nanti
    // navigate('/school-setup/grade-scales')
  }

  if (loading) {
    return <div className="p-6">Loading Step 2...</div>
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
                onClick={() => navigate('/school-admin')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => navigate('/school-setup')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Step 1
              </button>
              <button
                type="button"
                onClick={() => navigate('/school-setup/grades')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Step 3
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            School Setup Wizard - Step 2
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            Struktur Peperiksaan & Sasaran
          </h1>
          <p className="mt-2 text-slate-600">
            Tetapkan nama paparan bagi TOV, AR, OTR, dan ETR untuk setiap tingkatan / tahun.
          </p>

          <div className="mt-4 space-y-1 text-sm text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">Sekolah:</span>{' '}
              {school?.school_name || '-'}
              {school?.school_code ? ` (${school.school_code})` : ''}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Tahun Semasa:</span>{' '}
              {setupConfig?.current_academic_year || '-'}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {gradeLabels.map((gradeLabel) => (
            <div key={gradeLabel} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">
                {gradeLabel}
              </h2>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-3 py-3 font-semibold text-slate-700">Key Sistem</th>
                      <th className="px-3 py-3 font-semibold text-slate-700">Nama Paparan</th>
                      <th className="px-3 py-3 font-semibold text-slate-700">Susunan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradeConfigs[gradeLabel].map((row) => (
                      <tr key={`${gradeLabel}-${row.exam_key}`} className="border-b">
                        <td className="px-3 py-3 font-medium text-slate-900">
                          {row.exam_key}
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="text"
                            value={row.exam_name || ''}
                            onChange={(e) =>
                              handleExamNameChange(gradeLabel, row.exam_key, e.target.value)
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                          />
                        </td>
                        <td className="px-3 py-3 text-slate-700">{row.exam_order}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => navigate('/school-setup')}
            className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-100"
          >
            Kembali Step 1
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Step 2'}
          </button>
        </div>
      </div>
    </div>
  )
}
