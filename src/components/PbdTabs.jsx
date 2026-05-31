import { useNavigate } from 'react-router-dom'

export default function PbdTabs({ active }) {
  const navigate = useNavigate()
  const tabs = [
    { key: 'input', label: 'Input PBD', path: '/input-pbd' },
    { key: 'analysis', label: 'Analisis', path: '/analisis-pbd' },
  ]

  return (
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => navigate(tab.path)}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${
            active === tab.key
              ? 'bg-slate-900 text-white'
              : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
