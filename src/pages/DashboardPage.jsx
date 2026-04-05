import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

const ChevronRightIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

const CheckIcon = ({ done }) => (
  <span
    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
      done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
    }`}
  >
    {done ? '✓' : '•'}
  </span>
)

function DashboardPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)

  const [setupStatus, setSetupStatus] = useState({
    exams: false,
    grades: false,
    subjects: false,
    classes: false,
    students: false,
  })

  useEffect(() => {
    loadProfile()
  }, [navigate])

  const loadProfile = async () => {
    setLoading(true)

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
      .select('id, full_name, email, role, approval_status, is_master_admin, is_school_admin, school_id')
      .eq('id', user.id)
      .maybeSingle()

    if (error || !data) {
      alert('Profil pengguna tidak ditemui')
      navigate('/login', { replace: true })
      return
    }

    if (data.is_master_admin) {
      navigate('/master-admin', { replace: true })
      return
    }

    if (data.is_school_admin || data.role === 'school_admin' || data.role === 'admin') {
      navigate('/dashboard', { replace: true })
      return
    }

    if (data.approval_status === 'pending') {
      navigate('/pending', { replace: true })
      return
    }

    setProfile(data)
    await loadSetupStatus(data.school_id)
    setLoading(false)
  }

  const loadSetupStatus = async (schoolId) => {
    if (!schoolId) return

    const [{ data: setupData }, { count: classTotal }, { count: studentTotal }] = await Promise.all([
      supabase
        .from('school_setup_configs')
        .select('setup_step, is_setup_complete, current_academic_year')
        .eq('school_id', schoolId)
        .maybeSingle(),
      supabase
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('is_active', true),
      supabase
        .from('student_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('is_active', true),
    ])

    const setupStep = setupData?.setup_step || 0
    const setupComplete = !!setupData?.is_setup_complete || setupStep >= 4

    setSetupStatus({
      exams: setupStep >= 2 || setupComplete,
      grades: setupStep >= 3 || setupComplete,
      subjects: setupStep >= 4 || setupComplete,
      classes: (classTotal || 0) > 0,
      students: (studentTotal || 0) > 0,
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const setupCards = useMemo(
    () => [
      {
        title: 'Peperiksaan',
        done: setupStatus.exams,
        note: setupStatus.exams ? 'Struktur peperiksaan telah disediakan.' : 'Tetapan peperiksaan belum lengkap.',
      },
      {
        title: 'Grade',
        done: setupStatus.grades,
        note: setupStatus.grades ? 'Skala gred telah tersedia.' : 'Skala gred masih perlu disiapkan.',
      },
      {
        title: 'Subjek',
        done: setupStatus.subjects,
        note: setupStatus.subjects ? 'Senarai subjek telah lengkap.' : 'Subjek sekolah masih belum lengkap.',
      },
      {
        title: 'Kelas',
        done: setupStatus.classes,
        note: setupStatus.classes ? 'Kelas aktif telah didaftarkan.' : 'Tiada kelas aktif ditemui.',
      },
      {
        title: 'Murid',
        done: setupStatus.students,
        note: setupStatus.students ? 'Data murid sudah dimasukkan.' : 'Data murid belum dimasukkan.',
      },
    ],
    [setupStatus]
  )

  const quickActions = [
    {
      title: 'Input Markah',
      description: 'Masukkan markah peperiksaan murid dengan lebih cepat.',
      onClick: () => navigate('/scores'),
      enabled: isAcademicSetupComplete,
      tone: 'blue',
    },
    {
      title: 'Analisis Prestasi',
      description: 'Lihat analisis kelas, individu dan trend subjek.',
      onClick: () => navigate('/analysis'),
      enabled: isAcademicSetupComplete,
      tone: 'emerald',
    },
    {
      title: 'Sasaran Murid',
      description: 'Tetapkan TOV, OTR dan ETR untuk murid.',
      onClick: () => navigate('/targets'),
      enabled: isAcademicSetupComplete,
      tone: 'amber',
    },
    {
      title: 'Import Murid CSV',
      description: 'Import senarai murid secara pukal ke dalam sistem.',
      onClick: () => navigate('/students/import'),
      enabled: true,
      tone: 'rose',
    },
  ]

  const supportActions = [
    {
      title: 'Semak Murid',
      description: 'Lihat dan semak rekod murid sekolah.',
      onClick: () => navigate('/students'),
    },
    {
      title: 'Lihat Kelas',
      description: 'Semak senarai kelas aktif untuk tahun semasa.',
      onClick: () => navigate('/classes'),
    },
  ]

  if (loading) {
    return <div className="p-6">Loading dashboard...</div>
  }

  const isAcademicSetupComplete =
    setupStatus.exams &&
    setupStatus.grades &&
    setupStatus.subjects &&
    setupStatus.classes &&
    setupStatus.students

  const displayName =
    profile?.full_name ||
    profile?.email?.split('@')[0] ||
    profile?.email ||
    '-'

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.14),_transparent_32%),linear-gradient(135deg,#ffffff,#f8fafc)] p-5 md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">EduTrack</p>
                <h1 className="mt-2 text-2xl font-bold text-slate-900 md:text-4xl">Dashboard Guru</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                  Selamat datang, {displayName}. Gunakan paparan ini untuk terus ke modul markah,
                  sasaran dan analisis tanpa perlu mencari menu satu per satu.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">Peranan</div>
                  <div className="mt-2 text-lg font-bold text-blue-900">{profile?.role || '-'}</div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Status Sistem</div>
                  <div className="mt-2 text-lg font-bold text-emerald-900">
                    {isAcademicSetupComplete ? 'Sedia Digunakan' : 'Perlu Lengkapkan Setup'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            title="Peperiksaan"
            value={setupStatus.exams ? 'Lengkap' : 'Belum'}
            tone="blue"
          />
          <SummaryCard
            title="Grade"
            value={setupStatus.grades ? 'Lengkap' : 'Belum'}
            tone="amber"
          />
          <SummaryCard
            title="Subjek"
            value={setupStatus.subjects ? 'Lengkap' : 'Belum'}
            tone="emerald"
          />
          <SummaryCard
            title="Kelas"
            value={setupStatus.classes ? 'Ada Data' : 'Kosong'}
            tone="rose"
          />
          <SummaryCard
            title="Murid"
            value={setupStatus.students ? 'Ada Data' : 'Kosong'}
            tone="slate"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 md:text-2xl">Akses Pantas</h2>
                <p className="text-sm text-slate-500">
                  Modul paling kerap digunakan untuk kerja harian guru.
                </p>
              </div>
              <div className="text-sm text-slate-500">
                {isAcademicSetupComplete ? 'Semua modul utama sedia digunakan.' : 'Sesetengah modul akan dihadkan sehingga setup lengkap.'}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {quickActions.map((item) => (
                <ActionCard key={item.title} {...item} />
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <ChecklistCard
              title="Status Setup Sistem"
              description={isAcademicSetupComplete
                ? 'Komponen asas sekolah telah lengkap dan anda boleh teruskan kerja harian.'
                : 'Masih ada komponen yang belum lengkap. Selesaikan setup untuk buka semua modul utama.'}
              items={setupCards}
            />

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <h2 className="text-xl font-semibold text-slate-900">Akses Sokongan</h2>
              <p className="mt-1 text-sm text-slate-500">
                Pautan tambahan untuk semakan data dan navigasi pantas.
              </p>

              <div className="mt-5 space-y-3">
                {supportActions.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={item.onClick}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{item.title}</div>
                      <div className="mt-1 text-sm text-slate-600">{item.description}</div>
                    </div>
                    <ChevronRightIcon />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleLogout}
            className="rounded-xl bg-slate-900 px-4 py-3 text-white hover:bg-slate-800"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, tone = 'slate' }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    slate: 'border-slate-200 bg-white text-slate-900',
  }

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-xl font-bold">{value}</div>
    </div>
  )
}

function ActionCard({ title, description, onClick, enabled, tone }) {
  const tones = {
    blue: enabled ? 'border-blue-200 bg-blue-50 hover:bg-blue-100' : 'border-slate-200 bg-slate-100',
    emerald: enabled ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-200 bg-slate-100',
    amber: enabled ? 'border-amber-200 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 bg-slate-100',
    rose: enabled ? 'border-rose-200 bg-rose-50 hover:bg-rose-100' : 'border-slate-200 bg-slate-100',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={`rounded-2xl border p-4 text-left transition ${tones[tone]} ${
        enabled ? 'text-slate-900' : 'cursor-not-allowed text-slate-400'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-sm leading-6 text-slate-600">{description}</div>
        </div>
        <ChevronRightIcon />
      </div>
      {!enabled ? <div className="mt-3 text-xs font-medium text-slate-500">Menunggu setup lengkap</div> : null}
    </button>
  )
}

function ChecklistCard({ title, description, items }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
          >
            <CheckIcon done={item.done} />
            <div>
              <div className="font-semibold text-slate-900">{item.title}</div>
              <div className="mt-1 text-sm text-slate-600">{item.note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DashboardPage
