import { useMemo, useState } from 'react'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import {
  SegakBmiCategoryBarChart,
  SegakGradeBarChart,
  SegakTermComparisonChart,
} from '../components/SegakCharts.jsx'
import SegakTabs from '../components/SegakTabs.jsx'
import {
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import {
  BMI_CATEGORIES,
  calculateSegakSummary,
  SEGAK_GRADES,
  SEGAK_STAR_LEVELS,
  SEGAK_TERMS,
} from '../lib/pajskSegak.js'
import { buildSegakYearOptions, usePajskSegakData } from '../lib/usePajskSegakData.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const termLabel = (term) => (term === 'PENGGAL_2' ? 'Penggal 2' : 'Penggal 1')
const formatNumber = (value, digits = 2) =>
  value === null || value === undefined || value === '' ? '-' : Number(value).toFixed(digits)
const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`
const starLabel = (stars) => (Number(stars) === 0 ? 'Tiada bintang' : `${stars} bintang`)

export default function PajskSegakAnalysisPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()
  const {
    loading,
    errorMessage,
    setupConfig,
    academicYear,
    setAcademicYear,
    levelMappings,
    classes,
    enrollments,
    segakRows,
  } = usePajskSegakData({ checkingAuth })

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('PENGGAL_1')

  const availableTingkatan = useMemo(() => {
    const fromClasses = classes.map((item) => item.tingkatan).filter(Boolean)
    const fallback = setupConfig?.active_grade_labels || []
    return sortLevelsByDisplayOrder(fromClasses.length ? fromClasses : fallback, levelMappings)
  }, [classes, levelMappings, setupConfig])

  const availableClasses = useMemo(() => {
    return classes
      .filter((item) => !selectedTingkatan || item.tingkatan === selectedTingkatan)
      .sort((a, b) =>
        getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
          getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
          'ms',
          { sensitivity: 'base', numeric: true }
        )
      )
  }, [classes, levelMappings, selectedTingkatan])

  const filteredClasses = useMemo(() => {
    return classes
      .filter((item) => !selectedTingkatan || item.tingkatan === selectedTingkatan)
      .filter((item) => !selectedClassId || String(item.id) === String(selectedClassId))
      .sort((a, b) => {
        const levelOrder = sortLevelsByDisplayOrder([a.tingkatan, b.tingkatan], levelMappings)
        if (levelOrder[0] !== levelOrder[1]) {
          return levelOrder.indexOf(a.tingkatan) - levelOrder.indexOf(b.tingkatan)
        }

        return getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
          getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
          'ms',
          { sensitivity: 'base', numeric: true }
        )
      })
  }, [classes, levelMappings, selectedClassId, selectedTingkatan])

  const classById = useMemo(
    () => new Map(classes.map((classRow) => [String(classRow.id), classRow])),
    [classes]
  )

  const filteredClassIds = useMemo(
    () => new Set(filteredClasses.map((classRow) => String(classRow.id))),
    [filteredClasses]
  )

  const recordByTermAndEnrollment = useMemo(() => {
    const map = new Map()
    segakRows.forEach((row) => {
      map.set(`${row.term}::${row.student_enrollment_id}`, row)
    })
    return map
  }, [segakRows])

  const rowsByTerm = useMemo(() => {
    const next = {}

    SEGAK_TERMS.forEach((term) => {
      next[term] = enrollments
        .filter((enrollment) => filteredClassIds.has(String(enrollment.class_id)))
        .map((enrollment) => {
          const classRow = classById.get(String(enrollment.class_id)) || {}
          const record = recordByTermAndEnrollment.get(`${term}::${enrollment.id}`) || {}

          return {
            ...record,
            school_id: record.school_id,
            term,
            class_id: enrollment.class_id,
            tingkatan: classRow.tingkatan || '',
            class_name: classRow.class_name || '',
            student_enrollment_id: enrollment.id,
            student_name: enrollment.student_profiles?.full_name || '-',
          }
        })
    })

    return next
  }, [classById, enrollments, filteredClassIds, recordByTermAndEnrollment])

  const currentRows = useMemo(
    () => rowsByTerm[selectedTerm] || [],
    [rowsByTerm, selectedTerm]
  )
  const overallSummary = useMemo(() => calculateSegakSummary(currentRows), [currentRows])

  const classSummaries = useMemo(() => {
    return filteredClasses.map((classRow) => {
      const rows = currentRows.filter((row) => String(row.class_id) === String(classRow.id))
      const summary = calculateSegakSummary(rows)

      return {
        id: classRow.id,
        tingkatan: classRow.tingkatan,
        class_name: classRow.class_name,
        label: getDisplayClassLabel(classRow.tingkatan, classRow.class_name, levelMappings),
        ...summary,
      }
    })
  }, [currentRows, filteredClasses, levelMappings])

  const comparisonRows = useMemo(() => {
    return SEGAK_TERMS.map((term) => {
      const summary = calculateSegakSummary(rowsByTerm[term] || [])
      return {
        term,
        label: termLabel(term),
        averageSegakScore: summary.averageSegakScore || 0,
        averageBmi: summary.averageBmi || 0,
      }
    })
  }, [rowsByTerm])

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Analisis PAJSK & SEGAK...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Analisis PAJSK & SEGAK"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate('/pbs/pajsk/segak')}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>SEGAK</span>
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/pbs/pajsk/segak/input')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              <span>Input</span>
            </button>
          }
        />

        <SegakTabs active="analysis" />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="font-semibold text-slate-900">Ringkasan PAJSK</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Data belum tersedia.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="font-semibold text-slate-900">Ringkasan SEGAK</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Analisis SEGAK menggunakan rekod sedia ada di bawah.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="font-semibold text-slate-900">BMI / kecergasan</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Paparan BMI dan skor kecergasan kekal menggunakan data SEGAK.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Penapis Analisis SEGAK</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {buildSegakYearOptions(academicYear).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={selectedTingkatan}
              onChange={(event) => {
                setSelectedTingkatan(event.target.value)
                setSelectedClassId('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua Tingkatan</option>
              {availableTingkatan.map((item) => (
                <option key={item} value={item}>
                  {getDisplayLevel(item, levelMappings)}
                </option>
              ))}
            </select>

            <select
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua Kelas</option>
              {availableClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {getDisplayClassLabel(item.tingkatan, item.class_name, levelMappings)}
                </option>
              ))}
            </select>

            <select
              value={selectedTerm}
              onChange={(event) => setSelectedTerm(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {SEGAK_TERMS.map((term) => (
                <option key={term} value={term}>
                  {termLabel(term)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard title="Jumlah Murid" value={overallSummary.totalStudents} />
          <SummaryCard title="Purata BMI" value={formatNumber(overallSummary.averageBmi)} />
          <SummaryCard title="Purata Skor SEGAK" value={formatNumber(overallSummary.averageSegakScore)} />
          <SummaryCard title="Tidak Melengkapkan" value={overallSummary.incompleteCount} />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <BreakdownCard
            title="Kategori BMI"
            rows={BMI_CATEGORIES.map((category) => [
              category,
              overallSummary.bmiCategoryCounts[category] || 0,
            ])}
          />
          <BreakdownCard
            title="Gred SEGAK"
            rows={SEGAK_GRADES.map((grade) => [
              `Gred ${grade}`,
              overallSummary.gradeCounts[grade] || 0,
            ])}
          />
          <BreakdownCard
            title="Bintang SEGAK"
            rows={SEGAK_STAR_LEVELS.map((stars) => [
              starLabel(stars),
              overallSummary.starCounts[stars] || 0,
            ])}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <ChartSection title="Taburan Gred SEGAK">
            <SegakGradeBarChart summary={overallSummary} />
          </ChartSection>
          <ChartSection title="Kategori BMI">
            <SegakBmiCategoryBarChart summary={overallSummary} />
          </ChartSection>
          <ChartSection title="Perbandingan Skor SEGAK Penggal 1 vs Penggal 2">
            <SegakTermComparisonChart
              data={comparisonRows}
              metricKey="averageSegakScore"
              valueLabel="Purata Skor"
            />
          </ChartSection>
          <ChartSection title="Perbandingan BMI Penggal 1 vs Penggal 2">
            <SegakTermComparisonChart
              data={comparisonRows}
              metricKey="averageBmi"
              valueLabel="Purata BMI"
            />
          </ChartSection>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Jadual Prestasi Kelas</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1180px] border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-700">
                    Tingkatan
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-700">
                    Kelas
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
                    Jumlah Murid
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
                    Purata BMI
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
                    Purata Skor
                  </th>
                  {SEGAK_GRADES.map((grade) => (
                    <th key={grade} className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
                      Gred {grade}
                    </th>
                  ))}
                  <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
                    % Cergas
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
                    % Perlu Perhatian
                  </th>
                </tr>
              </thead>
              <tbody>
                {classSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="border border-slate-300 px-3 py-6 text-center text-slate-500">
                      Tiada kelas untuk analisis SEGAK.
                    </td>
                  </tr>
                ) : (
                  classSummaries.map((row) => (
                    <tr key={row.id}>
                      <td className="border border-slate-300 px-3 py-2 text-slate-800">
                        {getDisplayLevel(row.tingkatan, levelMappings)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-slate-800">
                        {row.label}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-center">
                        {row.totalStudents}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-center">
                        {formatNumber(row.averageBmi)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-center">
                        {formatNumber(row.averageSegakScore)}
                      </td>
                      {SEGAK_GRADES.map((grade) => (
                        <td key={grade} className="border border-slate-300 px-3 py-2 text-center">
                          {row.gradeCounts[grade] || 0}
                        </td>
                      ))}
                      <td className="border border-slate-300 px-3 py-2 text-center">
                        {formatPercent(row.fitPercent)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-center">
                        {formatPercent(row.attentionPercent)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  )
}

function BreakdownCard({ title, rows = [] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-2">
        {rows.map(([label, count]) => (
          <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-600">{label}</span>
            <span className="font-bold text-slate-900">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChartSection({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  )
}
