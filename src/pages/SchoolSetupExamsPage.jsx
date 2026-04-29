import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function SchoolSetupExamsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState(null)
  const [settings, setSettings] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [examStructure, setExamStructure] = useState({})
  const [dragItem, setDragItem] = useState(null)
  const [dragOverItem, setDragOverItem] = useState(null)

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
      .select('id, school_name, school_code')
      .eq('id', profileData.school_id)
      .maybeSingle()

    if (schoolError) {
      console.error('School error:', schoolError)
    }

    setSchoolInfo(schoolData || null)

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

    if (config.exam_structure && Object.keys(config.exam_structure).length > 0) {
      setExamStructure(config.exam_structure)
    } else {
      const generated = generateStructure(config)
      setExamStructure(generated)
    }

    setLoading(false)
  }

  const generateStructure = (config) => {
    const result = {}

    config.active_grade_labels.forEach((label) => {
      const arCount = config.ar_count_by_grade?.[label] || 0
      const otrCount = config.otr_count_by_grade?.[label] || 0
      const exams = []

      exams.push({ key: 'TOV', name: 'TOV' })

      const maxCount = Math.max(arCount, otrCount)

      for (let i = 1; i <= maxCount; i++) {
        if (i <= otrCount) {
          exams.push({ key: `OTR${i}`, name: `OTR${i}` })
        }

        if (i <= arCount) {
          exams.push({ key: `AR${i}`, name: `AR${i}` })
        }
      }

      exams.push({ key: 'ETR', name: 'ETR' })

      result[label] = exams
    })

    return result
  }

  const handleChange = (label, index, value) => {
    setExamStructure((prev) => {
      const copy = structuredClone(prev)
      copy[label][index].name = value
      return copy
    })
  }

  const moveExam = (label, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return

    setExamStructure((prev) => {
      const copy = structuredClone(prev)
      const items = [...copy[label]]
      const [moved] = items.splice(fromIndex, 1)
      items.splice(toIndex, 0, moved)
      copy[label] = items
      return copy
    })
  }

  const moveUp = (label, index) => {
    if (index === 0) return
    moveExam(label, index, index - 1)
  }

  const moveDown = (label, index) => {
    const total = examStructure[label]?.length || 0
    if (index >= total - 1) return
    moveExam(label, index, index + 1)
  }

  const handleResetDefault = () => {
    if (!settings) return

    const confirmReset = window.confirm(
      'Reset semua susunan peperiksaan kepada default?'
    )

    if (!confirmReset) return

    const generated = generateStructure(settings)
    setExamStructure(generated)
  }

  const handleDragStart = (label, index) => {
    setDragItem({ label, index })
  }

  const handleDragOver = (e, label, index) => {
    e.preventDefault()
    if (!dragItem) return
    if (dragItem.label !== label) return

    setDragOverItem({ label, index })
  }

  const handleDrop = (label, index) => {
    if (!dragItem) return
    if (dragItem.label !== label) return

    moveExam(label, dragItem.index, index)
    setDragItem(null)
    setDragOverItem(null)
  }

  const handleDragEnd = () => {
    setDragItem(null)
    setDragOverItem(null)
  }

  const validateStructure = () => {
    const labels = Object.keys(examStructure)

    if (labels.length === 0) {
      alert('Tiada struktur peperiksaan untuk disimpan.')
      return false
    }

    for (const label of labels) {
      const exams = examStructure[label] || []

      for (const exam of exams) {
        if (!exam.name || !String(exam.name).trim()) {
          alert(`Sila isi semua nama peperiksaan untuk ${label}.`)
          return false
        }
      }
    }

    return true
  }

  const handleSave = async () => {
    if (!validateStructure()) return

    if (!profile?.school_id) {
      alert('school_id tidak ditemui.')
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('school_setup_configs')
      .update({
        exam_structure: examStructure,
        setup_step: 2,
        updated_by: profile.id,
      })
      .eq('school_id', profile.school_id)
      .select()

    if (error) {
      alert(`Gagal simpan Step 2: ${error.message}`)
      setSaving(false)
      return
    }

    if (!data || data.length === 0) {
      alert('Update tidak berlaku. Semak school_id atau page yang sedang digunakan.')
      setSaving(false)
      return
    }

    const academicYear =
      settings?.current_academic_year || new Date().getFullYear()

    const examRows = Object.entries(examStructure).flatMap(([gradeLabel, exams]) =>
      exams.map((exam, index) => ({
        school_id: profile.school_id,
        academic_year: academicYear,
        level: gradeLabel,
        grade_label: gradeLabel,
        exam_key: String(exam.key || '').trim().toUpperCase(),
        exam_name: String(exam.name || exam.key || '').trim(),
        exam_order: index + 1,
        is_active: false,
      }))
    )

    const { error: examConfigError } = await supabase
      .from('exam_configs')
      .upsert(examRows, {
        onConflict: 'school_id,academic_year,grade_label,exam_key',
      })

    if (examConfigError) {
      alert(`Gagal sync exam_configs: ${examConfigError.message}`)
      setSaving(false)
      return
    }

    alert('Tetapan peperiksaan berjaya disimpan.')
    setSaving(false)
    navigate('/school-setup/grades')
  }

  if (loading) {
    return <div className="p-6">Loading Exam Setup...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
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
                onClick={() => navigate('/school-setup')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                ← Tetapan Akademik Sekolah
              </button>
              <button
                type="button"
                onClick={() => navigate('/school-setup/grades')}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Tetapan Grade →
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Tetapan Sekolah - Langkah 2</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Struktur Peperiksaan & Sasaran
          </h1>
          <p className="mt-3 text-slate-600">
            Tetapkan nama paparan bagi TOV, AR, OTR, dan ETR untuk setiap tingkatan / tahun.
            Anda juga boleh drag and drop untuk ubah susunan.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Susunan default ialah TOV &rarr; OTR1 &rarr; AR1 &rarr; OTR2 &rarr; AR2 &rarr; ETR. Anda boleh ubah dengan drag and drop.
          </p>

          <div className="mt-4 text-sm text-slate-700">
            <div>
              <span className="font-semibold">Sekolah:</span>{' '}
              {schoolInfo?.school_name || '-'}
              {schoolInfo?.school_code ? ` (${schoolInfo.school_code})` : ''}
            </div>
            <div className="mt-1">
              <span className="font-semibold">Tahun Semasa:</span> {settings?.current_year || new Date().getFullYear()}
            </div>
          </div>
        </div>

        {Object.keys(examStructure).length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            Tiada struktur peperiksaan dijana.
          </div>
        ) : (
          Object.keys(examStructure).map((label) => (
            <div
              key={label}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="text-2xl font-bold text-slate-900">{label}</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Susun
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Key Sistem
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Nama Paparan
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                        Susunan
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {examStructure[label].map((exam, i) => {
                      const isDragging =
                        dragItem?.label === label && dragItem?.index === i

                      const isDragOver =
                        dragOverItem?.label === label && dragOverItem?.index === i

                      return (
                        <tr
                          key={`${label}-${exam.key}-${i}`}
                          draggable
                          onDragStart={() => handleDragStart(label, i)}
                          onDragOver={(e) => handleDragOver(e, label, i)}
                          onDrop={() => handleDrop(label, i)}
                          onDragEnd={handleDragEnd}
                          className="border-t border-slate-200 transition"
                          style={{
                            backgroundColor: isDragOver ? '#dbeafe' : isDragging ? '#f8fafc' : '',
                            opacity: isDragging ? 0.45 : 1,
                            transform: isDragging ? 'scale(0.995)' : 'scale(1)',
                          }}
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-flex h-9 w-9 cursor-move items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm"
                                title="Drag untuk ubah susunan"
                              >
                                ⋮⋮
                              </span>

                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveUp(label, i)}
                                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveDown(label, i)}
                                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                                >
                                  ↓
                                </button>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4 font-medium text-slate-800">
                            {exam.key}
                          </td>

                          <td className="px-4 py-4">
                            <input
                              value={exam.name}
                              onChange={(e) => handleChange(label, i, e.target.value)}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                              placeholder={`Contoh nama untuk ${exam.key}`}
                            />
                          </td>

                          <td className="px-4 py-4">
                            <span className="inline-flex min-w-[40px] justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                              {i + 1}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Step 2'}
          </button>

          <button
            onClick={handleResetDefault}
            type="button"
            className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 font-medium text-amber-800 hover:bg-amber-100"
          >
            Reset Susunan Default
          </button>

          <button
            onClick={() => navigate('/school-setup')}
            className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-100"
          >
            ← Tetapan Akademik Sekolah
          </button>
        </div>
      </div>
    </div>
  )
}
