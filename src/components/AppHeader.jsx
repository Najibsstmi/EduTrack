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
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:mb-6 md:flex md:items-center md:justify-between md:gap-4 md:p-6">
      <div className="flex min-w-0 items-center gap-3">
        <img
          src="/edutrack-logo.png"
          alt="EduTrack"
          className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 p-1 object-contain ring-1 ring-slate-100"
        />

        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-[0.18em] text-slate-500">
            EDUTRACK
          </div>
          <h1 className="mt-1 text-xl font-bold leading-tight text-slate-900 md:text-2xl">
            {title}
          </h1>
        </div>
      </div>

      {(actionLeft || actionRight) && (
        <div className="mt-4 grid grid-cols-2 gap-2 md:mt-0 md:flex md:shrink-0 md:gap-3 [&>button]:flex [&>button]:min-h-11 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-xl [&>button]:px-3 [&>button]:py-2 [&>button]:text-center [&>button]:text-xs [&>button]:leading-snug md:[&>button]:text-sm">
          {actionLeft}
          {actionRight}
        </div>
      )}
    </div>
  )
}
