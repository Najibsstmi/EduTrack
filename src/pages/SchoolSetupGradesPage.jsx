import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

const SPM_TEMPLATE = [
  { grade_name: 'A+', min_mark: 90, max_mark: 100, grade_point: 1, is_pass: true, description: 'Cemerlang Tertinggi' },
  { grade_name: 'A', min_mark: 80, max_mark: 89, grade_point: 2, is_pass: true, description: 'Cemerlang Tinggi' },
  { grade_name: 'A-', min_mark: 70, max_mark: 79, grade_point: 3, is_pass: true, description: 'Cemerlang' },
  { grade_name: 'B+', min_mark: 65, max_mark: 69, grade_point: 4, is_pass: true, description: 'Kepujian Tinggi' },
  { grade_name: 'B', min_mark: 60, max_mark: 64, grade_point: 5, is_pass: true, description: 'Kepujian Atas' },
  { grade_name: 'C+', min_mark: 55, max_mark: 59, grade_point: 6, is_pass: true, description: 'Kepujian Atas' },
  { grade_name: 'C', min_mark: 50, max_mark: 54, grade_point: 7, is_pass: true, description: 'Kepujian' },
  { grade_name: 'D', min_mark: 45, max_mark: 49, grade_point: 8, is_pass: true, description: 'Lulus Atas' },
  { grade_name: 'E', min_mark: 40, max_mark: 44, grade_point: 9, is_pass: true, description: 'Lulus' },
  { grade_name: 'G', min_mark: 0, max_mark: 39, grade_point: 10, is_pass: false, description: 'Gagal' },
  { grade_name: 'TH', min_mark: 0, max_mark: 0, grade_point: null, is_pass: false, description: 'Tidak Hadir' },
]

const UASA_TEMPLATE = [
  { grade_name: 'A', min_mark: 80, max_mark: 100, grade_point: 1, is_pass: true, description: 'Cemerlang' },
  { grade_name: 'B', min_mark: 65, max_mark: 79, grade_point: 2, is_pass: true, description: 'Kepujian' },
  { grade_name: 'C', min_mark: 50, max_mark: 64, grade_point: 3, is_pass: true, description: 'Baik' },
  { grade_name: 'D', min_mark: 35, max_mark: 49, grade_point: 4, is_pass: true, description: 'Memuaskan' },
  { grade_name: 'E', min_mark: 20, max_mark: 34, grade_point: 5, is_pass: false, description: 'Mencapai Tahap Minimum' },
  { grade_name: 'F', min_mark: 0, max_mark: 19, grade_point: 6, is_pass: false, description: 'Belum Mencapai Tahap Minimum' },
]

function cloneTemplate(template) {
  return template.map((item) => ({ ...item }))
}

function getTingkatanRank(label) {
  const match = String(label || '').match(/\d+/)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[0])
}

function getDefaultTemplateByGradeLabel(label) {
  if (
    label === 'Tingkatan 4' ||
    label === 'Tingkatan 5'
  ) {
    return cloneTemplate(SPM_TEMPLATE)
  }

  if (
    label === 'Tingkatan 1' ||
    label === 'Tingkatan 2' ||
    label === 'Tingkatan 3'
  ) {
    return cloneTemplate(UASA_TEMPLATE)
  }

  return cloneTemplate(UASA_TEMPLATE)
}

export default function SchoolSetupGradesPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [school, setSchool] = useState(null)
  const [settings, setSettings] = useState(null)
  const [gradeScalesByLabel, setGradeScalesByLabel] = useState({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
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
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      alert('Profil pengguna tidak ditemui.')
      navigate('/login', { replace: true })
      return
    }

    setProfile(profileData)

    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .select('id, school_name, level')
      .eq('id', profileData.school_id)
      .single()

    if (schoolError || !schoolData) {
      alert('Maklumat sekolah tidak ditemui.')
      navigate('/dashboard', { replace: true })
      return
    }

    setSchool(schoolData)

    const { data: config, error: configError } = await supabase
      .from('school_setup_configs')
      .select('*')
      .eq('school_id', profileData.school_id)
      .single()

    if (configError || !config) {
      alert('Konfigurasi setup sekolah tidak ditemui.')
      navigate('/school-setup', { replace: true })
      return
    }

    setSettings(config)

    const { data: existingScales, error: scalesError } = await supabase
      .from('grade_scales')
      .select('*')
      .eq('school_id', profileData.school_id)
      .eq('academic_year', config.current_academic_year)
      .order('min_mark', { ascending: false })

    if (scalesError) {
      console.error(scalesError)
      alert('Gagal membaca grade scales.')
      setLoading(false)
      return
    }

    const grouped = {}

    if (existingScales && existingScales.length > 0) {
      for (const row of existingScales) {
        if (!grouped[row.grade_label]) grouped[row.grade_label] = []
        grouped[row.grade_label].push({
          id: row.id,
          grade_name: row.grade_name,
          min_mark: row.min_mark,
          max_mark: row.max_mark,
          grade_point: row.grade_point,
          is_pass: row.is_pass,
          description: row.description || '',
        })
      }
    }

    for (const label of config.active_grade_labels || []) {
      if (!grouped[label]) {
        grouped[label] = getDefaultTemplateByGradeLabel(label)
      }
    }

    setGradeScalesByLabel(grouped)
    setLoading(false)
  }

  const handleFieldChange = (gradeLabel, index, field, value) => {
    setGradeScalesByLabel((prev) => {
      const copy = structuredClone(prev)
      copy[gradeLabel][index][field] = value
      return copy
    })
  }

  const validateScales = () => {
    const labels = Object.keys(gradeScalesByLabel)

    if (labels.length === 0) {
      alert('Tiada grade scale untuk disimpan.')
      return false
    }

    for (const label of labels) {
      const rows = gradeScalesByLabel[label]

      for (const row of rows) {
        if (!row.grade_name || !String(row.grade_name).trim()) {
          alert(`Nama gred kosong pada ${label}.`)
          return false
        }

        if (row.grade_name !== 'TH') {
          const min = Number(row.min_mark)
          const max = Number(row.max_mark)

          if (Number.isNaN(min) || Number.isNaN(max)) {
            alert(`Markah minimum / maksimum tidak sah pada ${label}.`)
            return false
          }

          if (min > max) {
            alert(`Markah minimum lebih besar daripada maksimum pada ${label}.`)
            return false
          }
        }
      }
    }

    return true
  }

  const handleSave = async () => {
    if (!profile?.school_id || !settings?.current_academic_year) {
      alert('Maklumat sekolah atau tahun semasa tidak lengkap.')
      return
    }

    if (!school?.level) {
      alert('Level sekolah tidak ditemui.')
      return
    }

    if (!validateScales()) return

    setSaving(true)

    const activeLabels = settings.active_grade_labels || []

    const { error: deleteError } = await supabase
      .from('grade_scales')
      .delete()
      .eq('school_id', profile.school_id)
      .eq('academic_year', settings.current_academic_year)
      .in('grade_label', activeLabels)

    if (deleteError) {
      console.error(deleteError)
      alert(`Gagal kosongkan grade scales lama: ${deleteError.message}`)
      setSaving(false)
      return
    }

    const inserts = []

    for (const gradeLabel of activeLabels) {
      const rows = gradeScalesByLabel[gradeLabel] || []

      for (const row of rows) {
        inserts.push({
          school_id: profile.school_id,
          academic_year: settings.current_academic_year,
          level: school?.level,
          grade_label: gradeLabel,
          grade_name: row.grade_name,
          min_mark: row.grade_name === 'TH' ? 0 : Number(row.min_mark),
          max_mark: row.grade_name === 'TH' ? 0 : Number(row.max_mark),
          grade_point:
            row.grade_point === null || row.grade_point === ''
              ? null
              : Number(row.grade_point),
          is_pass: !!row.is_pass,
          description: row.description || null,
        })
      }
    }

    const { data, error } = await supabase
      .from('grade_scales')
      .insert(inserts)
      .select()

    console.log('SAVE STEP 3 RESULT:', data, error)

    if (error) {
      alert(`Gagal simpan Step 3: ${error.message}`)
      setSaving(false)
      return
    }

    const { error: configError } = await supabase
      .from('school_setup_configs')
      .update({
        setup_step: 3,
        updated_by: profile.id,
      })
      .eq('school_id', profile.school_id)

    if (configError) {
      alert(`Grade scales tersimpan, tetapi setup_step gagal dikemaskini: ${configError.message}`)
      setSaving(false)
      return
    }

    alert('Tetapan grade berjaya disimpan.')
    setSaving(false)
    navigate('/school-setup/subjects')
  }

  if (loading) {
    return <div className="p-6">Loading Grade Setup...</div>
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
                ← Tetapan Peperiksaan
              </button>
              <button
                type="button"
                onClick={() => navigate('/school-setup/subjects')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Tetapan Subjek →
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            Tetapan Sekolah — Langkah 3
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            Julat Gred Sekolah
          </h1>
          <p className="mt-2 text-slate-600">
            Template default dimuatkan automatik mengikut tingkatan. Admin sekolah boleh ubah ikut keperluan sekolah.
          </p>
        </div>

        <div className="space-y-6">
          {Object.keys(gradeScalesByLabel)
            .sort((a, b) => {
              const rankDiff = getTingkatanRank(a) - getTingkatanRank(b)
              if (rankDiff !== 0) return rankDiff
              return String(a).localeCompare(String(b), 'ms', { sensitivity: 'base' })
            })
            .map((gradeLabel) => (
            <div key={gradeLabel} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">
                {gradeLabel}
              </h2>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left">
                      <th className="px-3 py-3 text-sm font-semibold text-slate-700">Gred</th>
                      <th className="px-3 py-3 text-sm font-semibold text-slate-700">Min</th>
                      <th className="px-3 py-3 text-sm font-semibold text-slate-700">Max</th>
                      <th className="px-3 py-3 text-sm font-semibold text-slate-700">Grade Point</th>
                      <th className="px-3 py-3 text-sm font-semibold text-slate-700">Lulus</th>
                      <th className="px-3 py-3 text-sm font-semibold text-slate-700">Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(gradeScalesByLabel[gradeLabel] || []).map((row, index) => (
                      <tr key={`${gradeLabel}-${index}`} className="border-b">
                        <td className="px-3 py-3">
                          <input
                            type="text"
                            value={row.grade_name}
                            onChange={(e) =>
                              handleFieldChange(gradeLabel, index, 'grade_name', e.target.value)
                            }
                            className="w-24 rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </td>

                        <td className="px-3 py-3">
                          <input
                            type="number"
                            value={row.min_mark}
                            onChange={(e) =>
                              handleFieldChange(gradeLabel, index, 'min_mark', e.target.value)
                            }
                            className="w-24 rounded-lg border border-slate-300 px-3 py-2"
                            disabled={row.grade_name === 'TH'}
                          />
                        </td>

                        <td className="px-3 py-3">
                          <input
                            type="number"
                            value={row.max_mark}
                            onChange={(e) =>
                              handleFieldChange(gradeLabel, index, 'max_mark', e.target.value)
                            }
                            className="w-24 rounded-lg border border-slate-300 px-3 py-2"
                            disabled={row.grade_name === 'TH'}
                          />
                        </td>

                        <td className="px-3 py-3">
                          <input
                            type="number"
                            value={row.grade_point ?? ''}
                            onChange={(e) =>
                              handleFieldChange(gradeLabel, index, 'grade_point', e.target.value)
                            }
                            className="w-28 rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </td>

                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={!!row.is_pass}
                            onChange={(e) =>
                              handleFieldChange(gradeLabel, index, 'is_pass', e.target.checked)
                            }
                          />
                        </td>

                        <td className="px-3 py-3">
                          <input
                            type="text"
                            value={row.description || ''}
                            onChange={(e) =>
                              handleFieldChange(gradeLabel, index, 'description', e.target.value)
                            }
                            className="w-full min-w-[180px] rounded-lg border border-slate-300 px-3 py-2"
                          />
                        </td>
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
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Step 3'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/school-setup/exams')}
            className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-100"
          >
            ← Tetapan Peperiksaan
          </button>
        </div>
      </div>
    </div>
  )
}
