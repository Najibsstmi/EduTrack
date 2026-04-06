import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const TARGET_PROFILES = {
  konservatif: {
    key: 'konservatif',
    title: 'Konservatif',
    description:
      'Sasaran naik secara berhati-hati. Sesuai jika murid masih perlukan pengukuhan asas.',
    otr1: 0.3,
    otr2: 0.6,
    badge: 'Kenaikan rendah',
  },
  sederhana: {
    key: 'sederhana',
    title: 'Sederhana',
    description:
      'Sasaran seimbang dan realistik. Sesuai untuk kebanyakan sekolah sebagai tetapan standard.',
    otr1: 0.4,
    otr2: 0.75,
    badge: 'Cadangan standard',
  },
  agresif: {
    key: 'agresif',
    title: 'Agresif',
    description:
      'Sasaran lebih mencabar dan pantas. Sesuai untuk kelas atau murid berpotensi tinggi.',
    otr1: 0.5,
    otr2: 0.85,
    badge: 'Cabaran tinggi',
  },
}

function getProfileFromPercentages(otr1, otr2) {
  const n1 = Number(otr1)
  const n2 = Number(otr2)

  const found = Object.values(TARGET_PROFILES).find(
    (item) => item.otr1 === n1 && item.otr2 === n2
  )

  return found?.key || 'sederhana'
}

export default function TargetsPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState('sederhana')

  useEffect(() => {
    loadPage()
  }, [])

  const loadPage = async () => {
    setLoading(true)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
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

      const { data: setupData, error: setupError } = await supabase
        .from('school_setup_configs')
        .select('*')
        .eq('school_id', profileData.school_id)
        .maybeSingle()

      if (setupError) {
        console.error(setupError)
        alert('Gagal ambil tetapan sasaran sekolah.')
        setLoading(false)
        return
      }

      setSetupConfig(setupData || null)

      const existingProfile =
        setupData?.otr_target_profile ||
        getProfileFromPercentages(setupData?.otr1_percentage, setupData?.otr2_percentage)

      setSelectedProfile(existingProfile)
    } catch (error) {
      console.error(error)
      alert(error.message || 'Gagal memuatkan page sasaran akademik.')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return
    }

    const preset = TARGET_PROFILES[selectedProfile]
    if (!preset) {
      alert('Sila pilih mode sasaran dahulu.')
      return
    }

    setSaving(true)

    try {
      const payload = {
        school_id: profile.school_id,
        current_academic_year:
          setupConfig?.current_academic_year || new Date().getFullYear(),
        otr_calculation_method: 'percentage_to_etr',
        otr_target_profile: preset.key,
        otr1_percentage: preset.otr1,
        otr2_percentage: preset.otr2,
        auto_recalculate_otr_on_etr_change: true,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }

      if (!setupConfig?.id) {
        payload.created_by = profile.id
        payload.created_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('school_setup_configs')
        .upsert(payload, {
          onConflict: 'school_id',
        })

      if (error) throw error

      alert('Tetapan sasaran akademik berjaya disimpan.')
      await loadPage()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Gagal menyimpan tetapan sasaran.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-slate-600">Loading Tetapan Sasaran Akademik...</div>
  }

  const activePreset = TARGET_PROFILES[selectedProfile]

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                EduTrack
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">
                Tetapan Sasaran Akademik
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Pilih gaya sasaran OTR untuk sekolah. Tetapan ini akan digunakan oleh
                sistem semasa menjana OTR1 dan OTR2 daripada ETR.
              </p>
            </div>

            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100"
            >
              Kembali Dashboard
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">Pilih Mode Sasaran</h2>
            <p className="mt-1 text-sm text-slate-600">
              School admin hanya perlu pilih satu mode. Sistem akan set peratus OTR
              secara automatik.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {Object.values(TARGET_PROFILES).map((item) => {
              const active = selectedProfile === item.key

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedProfile(item.key)}
                  className={`rounded-2xl border p-5 text-left transition ${
                    active
                      ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {item.description}
                  </p>

                  <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <div>
                      <span className="font-semibold">OTR1:</span> {item.otr1 * 100}%
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">OTR2:</span> {item.otr2 * 100}%
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-700">
            <div>
              <span className="font-semibold">Mode semasa:</span> {activePreset?.title || '-'}
            </div>
            <div className="mt-1">
              <span className="font-semibold">OTR1:</span>{' '}
              {activePreset ? `${activePreset.otr1 * 100}%` : '-'}
              {' · '}
              <span className="font-semibold">OTR2:</span>{' '}
              {activePreset ? `${activePreset.otr2 * 100}%` : '-'}
            </div>
            <div className="mt-1">
              <span className="font-semibold">Auto jana semula bila ETR berubah:</span>{' '}
              Ya
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Tetapan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
