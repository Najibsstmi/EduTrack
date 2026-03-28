import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function SchoolSetupExamsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [settings, setSettings] = useState(null)
  const [examStructure, setExamStructure] = useState({})

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
    console.log('STEP 2 PROFILE:', profileData)

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
    console.log('STEP 2 CONFIG:', config)

    // Jika exam_structure dah pernah disimpan, guna yang itu
    if (config.exam_structure && Object.keys(config.exam_structure).length > 0) {
      setExamStructure(config.exam_structure)
    } else {
      const generated = generateStructure(config)
      console.log('GENERATED EXAM STRUCTURE:', generated)
    }

    setLoading(false)
  }

  const generateStructure = (config) => {
    const result = {}

    config.active_grade_labels.forEach(label => {
      const arCount = config.ar_count_by_grade[label] || 0
      const otrCount = config.otr_count_by_grade[label] || 0

      const exams = []

      exams.push({ key: 'TOV', name: 'TOV' })

      for (let i = 1; i <= arCount; i++) {
        exams.push({ key: `AR${i}`, name: `AR${i}` })
      }

      for (let i = 1; i <= otrCount; i++) {
        exams.push({ key: `OTR${i}`, name: `OTR${i}` })
      }

      exams.push({ key: 'ETR', name: 'ETR' })

      result[label] = exams
    })

    console.log('GENERATED EXAM STRUCTURE:', result)
    setExamStructure(result)
    return result
  }

  const handleChange = (label, index, value) => {
    setExamStructure((prev) => {
      const copy = structuredClone(prev)
      copy[label][index].name = value
      return copy
    })
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

    console.log('SAVE STEP 2 RESULT:', data, error)
    console.log('EXAM STRUCTURE TO SAVE:', examStructure)
    console.log('PROFILE SCHOOL ID:', profile.school_id)

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

    alert('Step 2 berjaya disimpan.')
    setSaving(false)
    navigate('/school-setup/grades')
  }

  if (loading) {
    return <div className="p-6">Loading Exam Setup...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-500">
            School Setup Wizard — Step 2
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            Struktur Peperiksaan
          </h1>
          <p className="mt-2 text-slate-600">
            Sistem auto jana TOV, AR, OTR dan ETR berdasarkan Step 1.
            Tukar nama paparan peperiksaan ikut sekolah anda.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          {Object.keys(examStructure).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
              Tiada struktur peperiksaan dijana.
            </div>
          ) : (
            <div className="space-y-6">
              {Object.keys(examStructure).map((label) => (
                <div key={label} className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">
                    {label}
                  </h3>

                  <div className="grid gap-4 md:grid-cols-2">
                    {examStructure[label].map((exam, i) => (
                      <div key={exam.key}>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          {exam.key}
                        </label>
                        <input
                          type="text"
                          value={exam.name}
                          onChange={(e) => handleChange(label, i, e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                          placeholder={`Contoh nama untuk ${exam.key}`}
                        />
                      </div>
                    ))}
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
              {saving ? 'Menyimpan...' : 'Simpan Step 2'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/school-setup')}
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