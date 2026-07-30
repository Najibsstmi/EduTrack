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
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 md:mt-0 md:flex-1 md:justify-end md:gap-3 lg:flex-none [&_button]:inline-flex [&_button]:min-h-11 [&_button]:max-w-full [&_button]:items-center [&_button]:justify-center [&_button]:rounded-xl [&_button]:px-3 [&_button]:py-2 [&_button]:text-center [&_button]:text-xs [&_button]:leading-snug [&_button]:whitespace-nowrap md:[&_button]:text-sm [&>div]:flex [&>div]:min-w-0 [&>div]:flex-wrap [&>div]:gap-2">
          {actionLeft}
          {actionRight}
        </div>
      )}
    </div>
  )
}
