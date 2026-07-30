import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import SegakTabs from '../components/SegakTabs.jsx'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const scaleRows = [
  ['18-20', 'A', '5 Bintang', 'Cemerlang'],
  ['15-17', 'B', '4 Bintang', 'Baik'],
  ['12-14', 'C', '3 Bintang', 'Memuaskan'],
  ['8-11', 'D', '2 Bintang', 'Kurang Cergas'],
  ['4-7', 'E', '1 Bintang', 'Perlu Tingkatkan Kecergasan'],
  ['0-3 / Tidak Hadir', 'F', 'Tiada Bintang', 'Tidak Melengkapkan Ujian'],
]

export default function PajskSegakPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  if (checkingAuth) {
    return <div className="p-6 text-slate-600">Loading SEGAK...</div>
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto min-w-0 max-w-7xl space-y-4">
        <AppHeader
          title="SEGAK / BMI"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate('/pbs/pajsk')}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>PAJSK</span>
            </button>
          }
        />

        <SegakTabs active="overview" />

        <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Kitaran Rekod</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {['Penggal 1', 'Penggal 2'].map((term) => (
                <div key={term} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">{term}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    BMI dan jumlah skor SEGAK direkodkan untuk setiap murid.
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Skala SEGAK</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Skor
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Gred
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Bintang
                    </th>
                    <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                      Tahap
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scaleRows.map(([score, grade, stars, level]) => (
                    <tr key={grade} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{score}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{grade}</td>
                      <td className="px-3 py-2 text-slate-700">{stars}</td>
                      <td className="px-3 py-2 text-slate-700">{level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
