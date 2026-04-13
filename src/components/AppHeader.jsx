import { Link } from 'react-router-dom'

/**
 * AppHeader — Global page header with EduTrack branding.
 *
 * Props:
 *   title    {string}        — Main page title (required)
 *   subtitle {string}        — Optional subtitle below the title
 *   actions  {ReactNode}     — Right-side slot: pass <Link> / <button> elements
 *
 * Usage:
 *   <AppHeader
 *     title="Tetapan Akademik Sekolah"
 *     subtitle="Langkah 1 daripada 5"
 *     actions={
 *       <>
 *         <Link to="/school-dashboard" className="btn-secondary">Dashboard</Link>
 *         <Link to="/school-setup/exams" className="btn-secondary">Tetapan Peperiksaan →</Link>
 *       </>
 *     }
 *   />
 */
export default function AppHeader({ title, subtitle, actions }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex items-center justify-between gap-3">

      {/* LEFT — logo + text */}
      <div className="flex items-center gap-3 min-w-0">

        {/* Logo */}
        <img
          src="/edutrack-logo.png"
          alt="EduTrack"
          className="w-10 h-10 object-contain rounded-xl bg-blue-50 p-1 shrink-0"
        />

        {/* Text */}
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            EduTrack
          </div>
          <div className="text-lg font-semibold text-gray-800 leading-tight truncate">
            {title}
          </div>
          {subtitle && (
            <div className="text-sm text-gray-500 truncate">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — action buttons slot */}
      {actions && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {actions}
        </div>
      )}
    </div>
  )
}
