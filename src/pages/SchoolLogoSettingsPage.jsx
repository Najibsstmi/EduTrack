import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    padding: '32px 20px',
  },
  container: {
    maxWidth: '1240px',
    margin: '0 auto',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '28px',
    padding: '36px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
  },
  title: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#0f172a',
    margin: 0,
    lineHeight: 1.1,
  },
  subtitle: {
    marginTop: '18px',
    fontSize: '15px',
    lineHeight: 1.8,
    color: '#64748b',
    maxWidth: '980px',
  },
  previewCard: {
    marginTop: '28px',
    border: '1px solid #dbe4ee',
    borderRadius: '24px',
    background: '#f8fafc',
    padding: '24px',
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  previewBox: {
    width: '120px',
    height: '120px',
    borderRadius: '20px',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  previewFallback: {
    fontSize: '13px',
    color: '#94a3b8',
    textAlign: 'center',
    padding: '12px',
    lineHeight: 1.4,
  },
  previewTextWrap: {
    flex: 1,
    minWidth: '260px',
  },
  previewTitle: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#0f172a',
    margin: 0,
  },
  previewDesc: {
    marginTop: '10px',
    fontSize: '15px',
    lineHeight: 1.7,
    color: '#64748b',
  },
  formCard: {
    marginTop: '24px',
    border: '1px solid #dbe4ee',
    borderRadius: '24px',
    background: '#ffffff',
    padding: '24px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: '10px',
  },
  fileInput: {
    display: 'block',
    width: '100%',
    fontSize: '14px',
    color: '#334155',
    marginBottom: '14px',
  },
  helper: {
    fontSize: '13px',
    color: '#64748b',
    lineHeight: 1.6,
  },
  statusSuccess: {
    marginTop: '14px',
    fontSize: '14px',
    color: '#15803d',
    fontWeight: 600,
  },
  statusError: {
    marginTop: '14px',
    fontSize: '14px',
    color: '#dc2626',
    fontWeight: 600,
  },
  buttonRow: {
    display: 'flex',
    gap: '14px',
    flexWrap: 'wrap',
    marginTop: '28px',
  },
  primaryButton: {
    border: 'none',
    borderRadius: '16px',
    background: '#0f172a',
    color: '#ffffff',
    padding: '16px 24px',
    fontSize: '15px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryButton: {
    border: '1px solid #cbd5e1',
    borderRadius: '16px',
    background: '#ffffff',
    color: '#0f172a',
    padding: '16px 24px',
    fontSize: '15px',
    fontWeight: 800,
    cursor: 'pointer',
  },
}

export default function SchoolLogoSettingsPage() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [schoolInfo, setSchoolInfo] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let objectUrl = ''

    if (selectedFile) {
      objectUrl = URL.createObjectURL(selectedFile)
      setPreviewUrl(objectUrl)
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [selectedFile])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setErrorMessage('')

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError) throw authError
        if (!user) throw new Error('Pengguna tidak ditemui.')

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, role, school_id')
          .eq('id', user.id)
          .single()

        if (profileError) throw profileError
        if (!profileData?.school_id) {
          throw new Error('school_id tidak ditemui pada profil pengguna.')
        }

        setProfile(profileData)

        const { data: schoolData, error: schoolError } = await supabase
          .from('schools')
          .select('id, school_name, school_code, logo_url')
          .eq('id', profileData.school_id)
          .single()

        if (schoolError) throw schoolError

        setSchoolInfo(schoolData)
        setPreviewUrl(schoolData?.logo_url || '')
      } catch (error) {
        console.error('loadData error:', error)
        setErrorMessage(error.message || 'Gagal memuatkan maklumat logo sekolah.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const isSchoolAdmin = useMemo(() => {
    return String(profile?.role || '').trim().toLowerCase() === 'school_admin'
  }, [profile])

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setSuccessMessage('')
    setErrorMessage('')

    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
    ]

    if (!allowedTypes.includes(file.type)) {
      setErrorMessage('Format fail tidak disokong. Gunakan PNG, JPG, WEBP atau SVG.')
      return
    }

    const maxSizeInBytes = 2 * 1024 * 1024
    if (file.size > maxSizeInBytes) {
      setErrorMessage('Saiz fail terlalu besar. Maksimum 2MB.')
      return
    }

    setSelectedFile(file)
  }

  const handleSave = async () => {
    try {
      if (!isSchoolAdmin) {
        throw new Error('Hanya admin sekolah dibenarkan mengubah logo sekolah.')
      }

      if (!selectedFile) {
        throw new Error('Sila pilih fail logo sekolah terlebih dahulu.')
      }

      if (!profile?.school_id) {
        throw new Error('Maklumat sekolah tidak ditemui.')
      }

      setSaving(true)
      setSuccessMessage('')
      setErrorMessage('')

      const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'png'
      const filePath = `school-logos/${profile.school_id}/logo.${extension}`

      const { error: uploadError } = await supabase.storage
        .from('school-assets')
        .upload(filePath, selectedFile, {
          upsert: true,
          cacheControl: '3600',
        })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('school-assets')
        .getPublicUrl(filePath)

      const publicUrl = publicUrlData?.publicUrl
      if (!publicUrl) {
        throw new Error('Public URL logo gagal dijana.')
      }

      const { error: updateError } = await supabase
        .from('schools')
        .update({
          logo_url: publicUrl,
        })
        .eq('id', profile.school_id)

      if (updateError) throw updateError

      setSchoolInfo((prev) => ({
        ...prev,
        logo_url: publicUrl,
      }))
      setPreviewUrl(publicUrl)
      setSelectedFile(null)
      setSuccessMessage('Logo sekolah berjaya disimpan.')
    } catch (error) {
      console.error('handleSave error:', error)
      setErrorMessage(error.message || 'Gagal menyimpan logo sekolah.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.card}>Memuatkan tetapan logo sekolah...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Tetapan Logo Sekolah</h1>

          <div style={styles.subtitle}>
            Halaman ini membolehkan admin sekolah memuat naik logo rasmi sekolah
            untuk dipaparkan pada dashboard dan modul utama. Sekolah semasa:{' '}
            <strong>{schoolInfo?.school_name || '-'}</strong>
            {schoolInfo?.school_code ? ` (${schoolInfo.school_code})` : ''}.
          </div>

          <div style={styles.previewCard}>
            <div style={styles.previewBox}>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Logo Sekolah"
                  style={styles.previewImage}
                />
              ) : (
                <div style={styles.previewFallback}>Belum ada logo</div>
              )}
            </div>

            <div style={styles.previewTextWrap}>
              <h2 style={styles.previewTitle}>Pratonton Logo Semasa</h2>
              <div style={styles.previewDesc}>
                Pilih fail logo sekolah dan simpan. Selepas berjaya, logo ini
                boleh dipaparkan pada dashboard utama sekolah.
              </div>
            </div>
          </div>

          <div style={styles.formCard}>
            <label htmlFor="school-logo-file" style={styles.label}>
              Muat Naik Logo Sekolah
            </label>

            <input
              id="school-logo-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFileChange}
              style={styles.fileInput}
            />

            <div style={styles.helper}>
              Gunakan fail PNG, JPG, WEBP atau SVG. Saiz disyorkan 512 x 512 px,
              nisbah 1:1, latar telus jika ada. Maksimum 2MB.
            </div>

            {successMessage ? (
              <div style={styles.statusSuccess}>{successMessage}</div>
            ) : null}

            {errorMessage ? (
              <div style={styles.statusError}>{errorMessage}</div>
            ) : null}
          </div>

          <div style={styles.buttonRow}>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Menyimpan...' : 'Simpan Logo Sekolah'}
            </button>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => navigate('/school-admin')}
            >
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
