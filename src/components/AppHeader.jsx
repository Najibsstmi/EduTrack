/**
 * AppHeader — Global page header with EduTrack branding.
 *
 * Props:
 *   title       {string}      — Main page title (required)
 *   actionLeft  {ReactNode}   — Optional left-side action button
 *   actionRight {ReactNode}   — Optional right-side action button
 *
 * Usage:
 *   <AppHeader
 *     title="Tetapan Akademik Sekolah"
 *     actionLeft={<button onClick={() => navigate('/dashboard')}>Dashboard</button>}
 *     actionRight={<button onClick={() => navigate('/school-setup/exams')}>Tetapan Peperiksaan →</button>}
 *   />
 */
export default function AppHeader({ title, actionLeft, actionRight }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 flex items-center justify-between">

      {/* LEFT */}
      <div className="flex items-center gap-3">
        <img
          src="/edutrack-logo.png"
          alt="EduTrack"
          className="w-10 h-10 object-contain rounded-lg bg-slate-50 p-1"
        />

        <div>
          <div className="text-xs tracking-[0.2em] text-slate-500">
            EDUTRACK
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {title}
          </h1>
        </div>
      </div>

      {/* RIGHT */}
      {(actionLeft || actionRight) && (
        <div className="flex gap-3">
          {actionLeft}
          {actionRight}
        </div>
      )}
    </div>
  )
}
