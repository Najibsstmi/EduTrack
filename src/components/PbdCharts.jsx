import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TP_LEVELS } from '../lib/pbdAnalysis.js'

const TP_COLORS = {
  TP1: '#ef4444',
  TP2: '#f97316',
  TP3: '#eab308',
  TP4: '#22c55e',
  TP5: '#0ea5e9',
  TP6: '#8b5cf6',
}

export function PbdTpBarChart({ distribution }) {
  const data = TP_LEVELS.map((level) => ({
    tp: `TP${level}`,
    bilangan: distribution?.counts?.[level] || 0,
  }))

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="tp" tick={{ fill: '#475569', fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="bilangan" name="Bilangan Murid" fill="#2563eb" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PbdClassStackedBarChart({ rows = [] }) {
  const data = rows.map((row) => ({
    kelas: row.label || row.class_name || '-',
    TP1: row.counts?.[1] || 0,
    TP2: row.counts?.[2] || 0,
    TP3: row.counts?.[3] || 0,
    TP4: row.counts?.[4] || 0,
    TP5: row.counts?.[5] || 0,
    TP6: row.counts?.[6] || 0,
  }))

  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="kelas"
            angle={-25}
            textAnchor="end"
            interval={0}
            height={72}
            tick={{ fill: '#475569', fontSize: 12 }}
          />
          <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {Object.entries(TP_COLORS).map(([key, color]) => (
            <Bar key={key} dataKey={key} stackId="tp" fill={color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
