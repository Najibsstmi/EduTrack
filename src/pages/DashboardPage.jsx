import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

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

  const [userFilter, setUserFilter] = useState('pending')
  const [searchTerm, setSearchTerm] = useState('')

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

  if (loading) {
    return <div className="p-6">Loading dashboard...</div>
  }

  const isSchoolAdmin = profile?.role === 'school_admin' || profile?.role === 'admin' || profile?.is_school_admin

  const isAcademicSetupComplete =
    setupStatus.exams &&
    setupStatus.grades &&
    setupStatus.subjects &&
    setupStatus.classes &&
    setupStatus.students

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Dashboard EduTrack</h1>
          <p className="mt-2 text-slate-600">
            Selamat datang, {profile?.full_name || profile?.email}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Role: {profile?.role || '-'}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold text-slate-900">Status Setup Sistem</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 font-semibold text-slate-800">Status Struktur Akademik</h3>
              <div className="space-y-2 text-sm text-slate-700">
                <div>{setupStatus.exams ? '✅' : '⬜'} Setup peperiksaan</div>
                <div>{setupStatus.grades ? '✅' : '⬜'} Setup grade</div>
                <div>{setupStatus.subjects ? '✅' : '⬜'} Setup subjek</div>
              </div>

              <p className="mt-3 text-sm text-slate-600">
                {setupStatus.exams && setupStatus.grades && setupStatus.subjects
                  ? 'Semua step telah lengkap.'
                  : 'Masih ada step yang belum lengkap.'}
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-800">Status Data Akademik</h3>
              <div className="space-y-2 text-sm text-slate-700">
                <div>{setupStatus.classes ? '✅' : '⬜'} Setup kelas</div>
                <div>{setupStatus.students ? '✅' : '⬜'} Setup murid</div>
              </div>

              <p className="mt-3 text-sm text-slate-600">
                {setupStatus.classes && setupStatus.students
                  ? 'Data akademik asas telah lengkap.'
                  : 'Masih ada data asas yang perlu disiapkan.'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Input Data</h2>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/scores')}
                disabled={!isAcademicSetupComplete}
                className={`w-full rounded-xl border px-4 py-3 text-left ${
                  isAcademicSetupComplete
                    ? 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                <div className="font-semibold text-slate-900">Input Markah</div>
                <div className="text-sm text-slate-600">
                  Masukkan markah peperiksaan murid
                </div>
              </button>

              <button
                onClick={() => navigate('/students/import')}
                className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left hover:bg-blue-100"
              >
                <div className="font-semibold text-slate-900">Import Murid CSV</div>
                <div className="text-sm text-slate-600">
                  Import senarai murid secara pukal
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Setup Akademik</h2>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/school-setup')}
                className="w-full rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-left hover:bg-yellow-100"
              >
                <div className="font-semibold text-slate-900">Urus Struktur Akademik</div>
                <div className="text-sm text-slate-600">
                  Tetapan asas tingkatan, peperiksaan dan aliran
                </div>
              </button>

              <button
                onClick={() => navigate('/school-setup/exams')}
                className="w-full rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-left hover:bg-yellow-100"
              >
                <div className="font-semibold text-slate-900">Urus Peperiksaan</div>
              </button>

              <button
                onClick={() => navigate('/school-setup/grades')}
                className="w-full rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-left hover:bg-yellow-100"
              >
                <div className="font-semibold text-slate-900">Urus Grade</div>
              </button>

              <button
                onClick={() => navigate('/school-setup/subjects')}
                className="w-full rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-left hover:bg-yellow-100"
              >
                <div className="font-semibold text-slate-900">Urus Subjek</div>
              </button>

              <button
                onClick={() => navigate('/classes')}
                className="w-full rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-left hover:bg-yellow-100"
              >
                <div className="font-semibold text-slate-900">Urus Kelas</div>
              </button>

              <button
                onClick={() => navigate('/students')}
                className="w-full rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-left hover:bg-yellow-100"
              >
                <div className="font-semibold text-slate-900">Urus Murid</div>
              </button>
            </div>
          </div>

          {isSchoolAdmin && (
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Pengurusan Pengguna</h2>

              <div className="mb-4 flex flex-wrap gap-2">
                {['pending', 'approved', 'rejected', 'semua'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setUserFilter(filter)}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      userFilter === filter
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-slate-300 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {filter === 'pending'
                      ? 'Pending'
                      : filter === 'approved'
                        ? 'Approved'
                        : filter === 'rejected'
                          ? 'Rejected'
                          : 'Semua'}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama, email, role..."
                className="mb-4 w-full rounded-xl border px-4 py-3"
              />

              <button
                onClick={() => navigate('/dashboard')}
                className="mb-4 w-full rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-left hover:bg-green-100"
              >
                <div className="font-semibold text-slate-900">Buka Modul Urus Pengguna</div>
                <div className="text-sm text-slate-600">Semak, lulus atau tolak pengguna sekolah</div>
              </button>

              <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">
                Pengurusan terperinci pengguna tersedia dalam modul School Admin.
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleLogout}
            className="rounded-xl bg-slate-900 px-4 py-3 text-white hover:bg-slate-800"
          >
            Logout
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-700 hover:bg-slate-50"
          >
            Buka Dashboard Admin
          </button>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
