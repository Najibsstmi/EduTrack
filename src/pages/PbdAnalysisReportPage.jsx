import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { PbdClassStackedBarChart, PbdTpBarChart } from '../components/PbdCharts.jsx'
import PbdTabs from '../components/PbdTabs.jsx'
import {
  calculatePbdSubjectSummary,
  formatPercent,
  TP_LEVELS,
} from '../lib/pbdAnalysis.js'
import {
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import { buildPbdYearOptions, usePbdAnalysisData } from '../lib/usePbdAnalysisData.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'
import { getDashboardPath } from '../lib/dashboardPath.js'

const normalizeText = (value) => String(value || '').trim().toLowerCase()
const formatSubjectName = (value) => String(value || '').trim().toUpperCase()

const uniqueSubjectNames = (subjects) =>
  [
    ...new Set(
      (subjects || [])
        .map((subject) => formatSubjectName(subject.subject_name))
        .filter(Boolean)
    ),
  ].sort((a, b) => String(a).localeCompare(String(b), 'ms', { sensitivity: 'base' }))

export default function PbdAnalysisReportPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()
  const {
    loading,
    errorMessage,
    profile,
    setupConfig,
    academicYear,
    setAcademicYear,
    levelMappings,
    classes,
    subjects,
    enrollments,
    studentSubjectEnrollments,
    teachers,
    pbdScores,
  } = usePbdAnalysisData({ checkingAuth })

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSubjectName, setSelectedSubjectName] = useState('')
  const [teacherFilter, setTeacherFilter] = useState('')
  const [tpFilter, setTpFilter] = useState('')

  const subjectNames = useMemo(() => uniqueSubjectNames(subjects), [subjects])

  const effectiveSubjectName = selectedSubjectName || subjectNames[0] || ''
  const dashboardPath = getDashboardPath(profile)

  const availableTingkatan = useMemo(() => {
    const fromClasses = classes.map((item) => item.tingkatan).filter(Boolean)
    const fallback = setupConfig?.active_grade_labels || []
    return sortLevelsByDisplayOrder(fromClasses.length ? fromClasses : fallback, levelMappings)
  }, [classes, levelMappings, setupConfig])

  const filteredClasses = useMemo(() => {
    return classes
      .filter((item) => !selectedTingkatan || item.tingkatan === selectedTingkatan)
      .filter((item) => !selectedClassId || String(item.id) === String(selectedClassId))
      .sort((a, b) => {
        const gradeOrder = sortLevelsByDisplayOrder([a.tingkatan, b.tingkatan], levelMappings)
        if (gradeOrder[0] !== gradeOrder[1]) {
          return gradeOrder.indexOf(a.tingkatan) - gradeOrder.indexOf(b.tingkatan)
        }
        return getDisplayClassLabel(a.tingkatan, a.class_name, levelMappings).localeCompare(
          getDisplayClassLabel(b.tingkatan, b.class_name, levelMappings),
          'ms',
          { sensitivity: 'base', numeric: true }
        )
      })
  }, [classes, levelMappings, selectedClassId, selectedTingkatan])

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

  const filteredScores = useMemo(() => {
    return pbdScores.filter((score) => {
      if (effectiveSubjectName) {
        const subject = subjects.find((item) => String(item.id) === String(score.subject_id))
        if (normalizeText(subject?.subject_name) !== normalizeText(effectiveSubjectName)) return false
      }

      if (teacherFilter) {
        const teacherId = score.updated_by || score.created_by || ''
        if (teacherId !== teacherFilter) return false
      }

      if (tpFilter && String(score.tp_level) !== String(tpFilter)) return false

      return true
    })
  }, [effectiveSubjectName, pbdScores, subjects, teacherFilter, tpFilter])

  const subjectSummary = useMemo(() => {
    return calculatePbdSubjectSummary({
      classes: filteredClasses,
      subjects,
      subjectName: effectiveSubjectName,
      enrollments,
      studentSubjectEnrollments,
      scoreRows: filteredScores,
    })
  }, [
    enrollments,
    effectiveSubjectName,
    filteredClasses,
    filteredScores,
    studentSubjectEnrollments,
    subjects,
  ])

  const groupedReport = useMemo(() => {
    const groups = new Map()
    const gradeSummaryByName = new Map(
      subjectSummary.gradeSummaries.map((summary) => [summary.tingkatan, summary])
    )

    subjectSummary.classSummaries.forEach((summary) => {
      const grade = summary.tingkatan || '-'
      if (!groups.has(grade)) groups.set(grade, [])
      groups.get(grade).push(summary)
    })

    return sortLevelsByDisplayOrder(Array.from(groups.keys()), levelMappings).map((grade) => ({
      grade,
      rows: groups.get(grade) || [],
      total: gradeSummaryByName.get(grade),
    }))
  }, [levelMappings, subjectSummary])

  const weakestClass = useMemo(() => {
    return [...subjectSummary.classSummaries]
      .filter((row) => row.totalStudents > 0)
      .sort((a, b) => {
        if (b.belowMinimumCount !== a.belowMinimumCount) {
          return b.belowMinimumCount - a.belowMinimumCount
        }
        return b.belowMinimumPercent - a.belowMinimumPercent
      })[0]
  }, [subjectSummary.classSummaries])

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Analisis PBD...</div>
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto min-w-0 max-w-7xl space-y-4">
        <AppHeader
          title="Analisis PBD"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate('/input-pbd')}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              Input PBD
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Kembali ke Dashboard
            </button>
          }
        />

        <PbdTabs active="analysis" />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Penapis Laporan PBD</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <select
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {buildPbdYearOptions(academicYear).map((year) => (
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
              value={effectiveSubjectName}
              onChange={(event) => setSelectedSubjectName(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Pilih Subjek</option>
              {subjectNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={teacherFilter}
              onChange={(event) => setTeacherFilter(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua Guru</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name || teacher.email}
                </option>
              ))}
            </select>

            <select
              value={tpFilter}
              onChange={(event) => setTpFilter(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua TP</option>
              {TP_LEVELS.map((level) => (
                <option key={level} value={level}>
                  TP{level}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-5">
          <SummaryCard title="Jumlah Murid" value={subjectSummary.overallSummary.totalStudents} />
          <SummaryCard title="Capai TP3-TP6" value={subjectSummary.overallSummary.minimumCount} />
          <SummaryCard title="% Minimum" value={formatPercent(subjectSummary.overallSummary.minimumPercent)} />
          <SummaryCard title="TP Dominan" value={subjectSummary.overallSummary.dominantLevel ? `TP${subjectSummary.overallSummary.dominantLevel}` : '-'} />
          <SummaryCard
            title="Belum Minimum"
            value={weakestClass ? `${weakestClass.label}: ${weakestClass.belowMinimumCount}` : '-'}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Bilangan Murid TP1 Hingga TP6</h2>
            <PbdTpBarChart distribution={subjectSummary.overallSummary} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Taburan TP Mengikut Kelas</h2>
            <PbdClassStackedBarChart
              rows={subjectSummary.classSummaries.filter((row) => row.totalStudents > 0)}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="text-center">
            <h2 className="text-xl font-bold uppercase tracking-wide text-slate-900">
              ANALISIS PENCAPAIAN PBD (PAT) MURID TAHUN {academicYear}
            </h2>
            <p className="mt-2 text-sm font-semibold uppercase text-slate-700">
              Subjek: {effectiveSubjectName || '-'}
            </p>
          </div>

          <div className="mt-6 space-y-8">
            {groupedReport.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                Tiada data untuk laporan PBD.
              </div>
            ) : (
              groupedReport.map((group) => (
                <div key={group.grade}>
                  <h3 className="mb-3 text-base font-bold text-slate-900">
                    {getDisplayLevel(group.grade, levelMappings)}
                  </h3>
                  <PbdReportTable
                    rows={group.rows}
                    totalRow={{
                      ...group.total,
                      label: `Jumlah ${getDisplayLevel(group.grade, levelMappings)}`,
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            Rumusan Keseluruhan Mengikut Tingkatan
          </h2>
          <div className="mt-4">
            <PbdReportTable
              rows={subjectSummary.gradeSummaries.map((row) => ({
                ...row,
                label: getDisplayLevel(row.tingkatan, levelMappings),
              }))}
            />
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

function PbdReportTable({ rows = [], totalRow = null }) {
  const allRows = totalRow ? [...rows, totalRow] : rows

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1180px] border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-700">
              Tahap Penguasaan / Kelas
            </th>
            {TP_LEVELS.map((level) => (
              <FragmentHeader key={level} level={level} />
            ))}
            <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
              Jumlah Murid
            </th>
            <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
              Tahap Minimum (TP3-TP6)
            </th>
            <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
              % Minimum (TP3-TP6)
            </th>
          </tr>
        </thead>
        <tbody>
          {allRows.map((row, index) => {
            const isTotal = totalRow && index === allRows.length - 1
            return (
              <tr key={`${row.id || row.label}-${index}`} className={isTotal ? 'bg-slate-50 font-bold' : ''}>
                <td className="border border-slate-300 px-3 py-2 text-left text-slate-800">
                  {row.label || row.class_name || '-'}
                </td>
                {TP_LEVELS.map((level) => (
                  <FragmentCells key={level} level={level} row={row} />
                ))}
                <td className="border border-slate-300 px-3 py-2 text-center">
                  {row.totalStudents || 0}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-center">
                  {row.minimumCount || 0}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-center">
                  {formatPercent(row.minimumPercent || 0)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FragmentHeader({ level }) {
  return (
    <>
      <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
        TP{level} Bil
      </th>
      <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">
        TP{level} %
      </th>
    </>
  )
}

function FragmentCells({ level, row }) {
  return (
    <>
      <td className="border border-slate-300 px-3 py-2 text-center">
        {row.counts?.[level] || 0}
      </td>
      <td className="border border-slate-300 px-3 py-2 text-center">
        {formatPercent(row.percentages?.[level] || 0)}
      </td>
    </>
  )
}
