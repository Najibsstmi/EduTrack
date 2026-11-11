import { LoaderCircle } from 'lucide-react'

export function LoadingScreen({ label = 'Memuatkan PAJSK Entry...' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <LoaderCircle className="h-5 w-5 animate-spin text-brand-700" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  )
}
