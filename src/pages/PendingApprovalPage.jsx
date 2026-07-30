import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const MASTER_ADMIN_CONTACT = {
  full_name: 'Cikgu Najib',
  email: 'najibnoor87@gmail.com',
  phone: '0197909548',
  isFallback: true,
}

const normalizeWhatsappPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')

  if (!digits) return ''
  if (digits.startsWith('60')) return digits
  if (digits.startsWith('0')) return `6${digits}`
  return `60${digits}`
}

function PendingApprovalPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [adminContact, setAdminContact] = useState(MASTER_ADMIN_CONTACT)
  const [usesFallbackAdmin, setUsesFallbackAdmin] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadPendingContext = async () => {
      setLoading(true)

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          if (isMounted) {
            setAdminContact(MASTER_ADMIN_CONTACT)
            setUsesFallbackAdmin(true)
          }
          return
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email, school_id')
          .eq('id', user.id)
          .maybeSingle()

        if (profileError) throw profileError

        if (isMounted) setProfile(profileData || { email: user.email })

        if (!profileData?.school_id) {
          if (isMounted) {
            setAdminContact(MASTER_ADMIN_CONTACT)
            setUsesFallbackAdmin(true)
          }
          return
        }

        const { data: adminRows, error: adminError } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone')
          .eq('school_id', profileData.school_id)
          .in('role', ['admin', 'school_admin'])
          .eq('approval_status', 'approved')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)

        if (adminError) throw adminError

        const admin = adminRows?.[0]

        if (isMounted) {
          setAdminContact(admin || MASTER_ADMIN_CONTACT)
          setUsesFallbackAdmin(!admin)
        }
      } catch (error) {
        console.error('load pending approval context error:', error)
        if (isMounted) {
          setAdminContact(MASTER_ADMIN_CONTACT)
          setUsesFallbackAdmin(true)
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadPendingContext()

    return () => {
      isMounted = false
    }
  }, [])

  const pendingName =
    profile?.full_name ||
    profile?.email?.split('@')[0] ||
    'Pengguna EduTrack'
  const pendingEmail = profile?.email || '-'
  const whatsappPhone = normalizeWhatsappPhone(adminContact?.phone)

  const whatsappMessage = useMemo(() => {
    return encodeURIComponent(
      `Assalamualaikum cikgu, saya telah mendaftar akaun EduTrack dan memohon kelulusan. Nama: ${pendingName}. Email: ${pendingEmail}. Mohon semakan. Terima kasih.`
    )
  }, [pendingEmail, pendingName])

  const whatsappLink = whatsappPhone
    ? `https://wa.me/${whatsappPhone}?text=${whatsappMessage}`
    : ''
  const emailLink = adminContact?.email ? `mailto:${adminContact.email}` : ''

  const handleCheckStatus = () => {
    navigate('/register')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-slate-100 px-3 py-6 sm:px-4">
      <div className="pointer-events-none fixed inset-0 bg-black/30" />

      <div className="relative z-10 w-full min-w-0 max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:rounded-3xl sm:p-6 md:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <div className="mt-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            EduTrack
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-900 md:text-3xl">
            Akaun Menunggu Kelulusan
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base">
            Akaun anda telah berjaya didaftarkan, tetapi akses sistem masih belum dibuka.
            Sila tunggu semakan daripada admin sekolah atau master admin.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-2.5 w-2.5 rounded-full bg-amber-500" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">Status semasa: Pending approval</p>
              <p className="mt-1 text-sm text-amber-800">
                Anda akan boleh log masuk ke modul sekolah selepas akaun diluluskan.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-emerald-950">
                Hubungi Admin Untuk Kelulusan
              </p>
              <p className="mt-2 text-sm text-emerald-900">
                {loading ? 'Memuatkan maklumat admin...' : adminContact?.full_name || '-'}
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                {adminContact?.email || '-'}
              </p>
              {adminContact?.phone ? (
                <p className="mt-1 text-sm text-emerald-800">
                  WhatsApp: {adminContact.phone}
                </p>
              ) : null}
              {usesFallbackAdmin ? (
                <p className="mt-3 text-xs leading-5 text-emerald-800">
                  Admin sekolah belum ditetapkan. Permohonan akan dirujuk kepada Master Admin EduTrack.
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a
              href={whatsappLink || undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!whatsappLink}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold ${
                whatsappLink
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'pointer-events-none bg-emerald-100 text-emerald-400'
              }`}
            >
              WhatsApp Admin
            </a>
            <a
              href={emailLink || undefined}
              aria-disabled={!emailLink}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold ${
                emailLink
                  ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                  : 'pointer-events-none border-slate-200 bg-slate-100 text-slate-400'
              }`}
            >
              Email Admin
            </a>
          </div>
        </div>

        <div className="mt-6 min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Apa yang perlu dibuat sekarang?</p>
          <p>Pastikan anda mendaftar menggunakan sekolah yang betul.</p>
          <p>Hubungi admin sekolah jika kelulusan mengambil masa terlalu lama.</p>
          <p>Selepas diluluskan, anda boleh log masuk semula seperti biasa.</p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="flex-1 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Kembali ke Login
          </button>
          <button
            type="button"
            onClick={handleCheckStatus}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Semak Pendaftaran
          </button>
        </div>
      </div>
    </div>
  )
}

export default PendingApprovalPage
