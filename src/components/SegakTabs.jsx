import { Activity, BarChart3, ClipboardList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const tabs = [
  {
    key: 'overview',
    label: 'Ringkasan',
    path: '/pbs/pajsk/segak',
    icon: Activity,
  },
  {
    key: 'input',
    label: 'Input',
    path: '/pbs/pajsk/segak/input',
    icon: ClipboardList,
  },
  {
    key: 'analysis',
    label: 'Analisis',
    path: '/pbs/pajsk/segak/analysis',
    icon: BarChart3,
  },
]

export default function SegakTabs({ active }) {
  const navigate = useNavigate()

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = active === tab.key

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.path)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
