import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export default function PajskBarChart({ data = [], color = '#2563eb', horizontal = false }) {
  const rows = data.slice(0, 12)
  const height = Math.max(260, horizontal ? rows.length * 42 : 280)

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {horizontal ? (
          <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, left: 36, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} />
            <YAxis type="category" dataKey="label" width={120} tick={{ fill: '#475569', fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" name="Bilangan" fill={color} radius={[0, 6, 6, 0]} />
          </BarChart>
        ) : (
          <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 54 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" angle={-22} height={64} interval={0} textAnchor="end" tick={{ fill: '#475569', fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="value" name="Bilangan" fill={color} radius={[6, 6, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
