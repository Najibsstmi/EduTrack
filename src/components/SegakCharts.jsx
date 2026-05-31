import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BMI_CATEGORIES, SEGAK_GRADES } from '../lib/pajskSegak.js'

const GRADE_COLORS = {
  A: '#16a34a',
  B: '#0ea5e9',
  C: '#eab308',
  D: '#f97316',
  E: '#ef4444',
  F: '#64748b',
}

const BMI_COLORS = {
  'Kurang Berat Badan': '#38bdf8',
  Normal: '#22c55e',
  'Berlebihan Berat Badan': '#f59e0b',
  Obes: '#ef4444',
}

export function SegakGradeBarChart({ summary }) {
  const data = SEGAK_GRADES.map((grade) => ({
    grade,
    bilangan: summary?.gradeCounts?.[grade] || 0,
    fill: GRADE_COLORS[grade],
  }))

  return (
    <ChartFrame>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="grade" tick={{ fill: '#475569', fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="bilangan" name="Bilangan Murid" radius={[6, 6, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.grade} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}

export function SegakBmiCategoryBarChart({ summary }) {
  const data = BMI_CATEGORIES.map((category) => ({
    category,
    bilangan: summary?.bmiCategoryCounts?.[category] || 0,
    fill: BMI_COLORS[category],
  }))

  return (
    <ChartFrame>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 56 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="category"
          angle={-18}
          height={70}
          interval={0}
          textAnchor="end"
          tick={{ fill: '#475569', fontSize: 12 }}
        />
        <YAxis allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="bilangan" name="Bilangan Murid" radius={[6, 6, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.category} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}

export function SegakTermComparisonChart({ data = [], metricKey, valueLabel }) {
  return (
    <ChartFrame>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 12 }} />
        <YAxis tick={{ fill: '#475569', fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar
          dataKey={metricKey}
          name={valueLabel}
          fill={metricKey === 'averageSegakScore' ? '#2563eb' : '#14b8a6'}
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ChartFrame>
  )
}

function ChartFrame({ children }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  )
}
