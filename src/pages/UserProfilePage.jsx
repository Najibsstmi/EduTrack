import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { getDashboardPath } from '../lib/dashboardPath.js'
import { supabase } from '../lib/supabaseClient.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

export default function UserProfilePage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [fullName, setFullName] = useState('')
  const [designation, setDesignation] = useState('')
  const [phone, setPhone] = useState('')

  const loadProfile = useCallback(async () => {
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

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, designation, phone, role, is_school_admin, is_master_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        setErrorMessage('Profil pengguna tidak ditemui.')
        return
      }

      setProfile(data)
      setFullName(data.full_name || '')
      setDesignation(data.designation || '')
      setPhone(data.phone || '')
    } catch (error) {
      console.error('loadProfile error:', error)
      setErrorMessage(
        error.message?.includes('phone')
          ? 'Column phone belum tersedia. Sila jalankan SQL migration profil pengguna.'
          : error.message || 'Gagal memuatkan profil pengguna.'
      )
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    if (checkingAuth) return

    loadProfile()
  }, [checkingAuth, loadProfile])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setErrorMessage('')
    setSuccessMessage('')

    const trimmedFullName = fullName.trim()
    const trimmedDesignation = designation.trim()
    const trimmedPhone = phone.trim()

    if (!trimmedFullName) {
      setErrorMessage('Nama penuh diperlukan.')
      setSaving(false)
      return
    }

    try {
      const { data, error } = await supabase.rpc('update_my_profile', {
        profile_full_name: trimmedFullName,
        profile_designation: trimmedDesignation,
        profile_phone: trimmedPhone || null,
      })

      if (error) throw error

      const updatedProfile = Array.isArray(data) ? data[0] : data

      setProfile((prev) => ({
        ...prev,
        ...updatedProfile,
        full_name: trimmedFullName,
        designation: trimmedDesignation,
        phone: trimmedPhone || null,
      }))
      setSuccessMessage('Profil berjaya dikemaskini.')
    } catch (error) {
      console.error('update profile error:', error)
      setErrorMessage(
        error.message?.includes('update_my_profile')
          ? 'Fungsi update_my_profile belum tersedia. Sila jalankan SQL migration profil pengguna.'
          : error.message || 'Gagal menyimpan profil.'
      )
    } finally {
      setSaving(false)
    }
  }

  const dashboardPath = getDashboardPath(profile)

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Profil Saya...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <AppHeader
          title="Profil Saya"
          actionRight={
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Kembali ke Dashboard
            </button>
          }
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          {errorMessage ? (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Email login Supabase Auth tidak diubah dari halaman ini.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Nama penuh
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Designation / Jawatan
              </label>
              <input
                type="text"
                value={designation}
                onChange={(event) => setDesignation(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                placeholder="Contoh: Guru, Ketua Panitia, GKMP"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                No. Telefon / WhatsApp
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                placeholder="Contoh: 0123456789"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Profil'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
