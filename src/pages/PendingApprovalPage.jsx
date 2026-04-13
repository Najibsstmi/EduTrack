import { useNavigate } from 'react-router-dom'

function PendingApprovalPage() {
  const navigate = useNavigate()

  const handleCheckStatus = () => {
    navigate('/register')
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-6 relative">
      <div className="fixed inset-0 bg-black/30 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
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
            <h1 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">
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
              <div>
                <p className="text-sm font-semibold text-amber-900">Status semasa: Pending approval</p>
                <p className="mt-1 text-sm text-amber-800">
                  Anda akan boleh log masuk ke modul sekolah selepas akaun diluluskan.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div>
              <p className="font-semibold text-slate-800">Apa yang perlu dibuat sekarang?</p>
            </div>
            <p>Pastikan anda mendaftar menggunakan sekolah yang betul.</p>
            <p>Hubungi admin sekolah jika kelulusan mengambil masa terlalu lama.</p>
            <p>Selepas diluluskan, anda boleh log masuk semula seperti biasa.</p>
          </div>

          <div className="mt-6 flex gap-3">
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