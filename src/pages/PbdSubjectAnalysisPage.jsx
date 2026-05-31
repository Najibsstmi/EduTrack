import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PbdTabs from '../components/PbdTabs.jsx'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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

const normalizeText = (value) => String(value || '').trim().toLowerCase()

const getSubjectNames = (subjects) =>
  [...new Set((subjects || []).map((subject) => subject.subject_name).filter(Boolean))].sort(
    (a, b) => String(a).localeCompare(String(b), 'ms', { sensitivity: 'base' })
  )

export default function PbdSubjectAnalysisPage() {
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
    subjects,
    enrollments,
    studentSubjectEnrollments,
    teachers,
    pbdScores,
  } = usePbdAnalysisData({ checkingAuth })

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [teacherFilter, setTeacherFilter] = useState('')
  const [tpFilter, setTpFilter] = useState('')

  const availableTingkatan = useMemo(() => {
    const fromClasses = classes.map((item) => item.tingkatan).filter(Boolean)
    const fallback = setupConfig?.active_grade_labels || []
    return sortLevelsByDisplayOrder(fromClasses.length ? fromClasses : fallback, levelMappings)
  }, [classes, levelMappings, setupConfig])

  const filteredClasses = useMemo(() => {
    return classes
      .filter((item) => !selectedTingkatan || item.tingkatan === selectedTingkatan)
      .filter((item) => !selectedClassId || String(item.id) === String(selectedClassId))
  }, [classes, selectedClassId, selectedTingkatan])

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
      if (teacherFilter) {
        const teacherId = score.updated_by || score.created_by || ''
        if (teacherId !== teacherFilter) return false
      }
      if (tpFilter && String(score.tp_level) !== String(tpFilter)) return false
      return true
    })
  }, [pbdScores, teacherFilter, tpFilter])

  const subjectRows = useMemo(() => {
    return getSubjectNames(subjects).map((subjectName) => {
      const summary = calculatePbdSubjectSummary({
        classes: filteredClasses,
        subjects,
        subjectName,
        enrollments,
        studentSubjectEnrollments,
        scoreRows: filteredScores.filter((score) => {
          const subject = subjects.find((item) => String(item.id) === String(score.subject_id))
          return normalizeText(subject?.subject_name) === normalizeText(subjectName)
        }),
      }).overallSummary

      return {
        subjectName,
        ...summary,
      }
    })
  }, [enrollments, filteredClasses, filteredScores, studentSubjectEnrollments, subjects])

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Analisis Subjek PBD...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Analisis PBD Mengikut Subjek"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate('/pbs/pbd/input')}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              Input PBD
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/pbs/pbd/analysis')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Laporan PBD
            </button>
          }
        />

        <PbdTabs active="subject" />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Penapis Subjek PBD</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
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

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">% Minimum TP3-TP6 Mengikut Subjek</h2>
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectRows} margin={{ top: 8, right: 16, left: 0, bottom: 64 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="subjectName"
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                  height={96}
                  tick={{ fill: '#475569', fontSize: 12 }}
                />
                <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 12 }} />
                <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                <Bar dataKey="minimumPercent" name="% Minimum" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Rumusan Subjek</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">Subjek</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-700">Jumlah Murid</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-700">Capai TP3-TP6</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-700">% Minimum</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-700">TP Dominan</th>
                </tr>
              </thead>
              <tbody>
                {subjectRows.map((row) => (
                  <tr key={row.subjectName} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.subjectName}</td>
                    <td className="px-4 py-3 text-center">{row.totalStudents}</td>
                    <td className="px-4 py-3 text-center">{row.minimumCount}</td>
                    <td className="px-4 py-3 text-center">{formatPercent(row.minimumPercent)}</td>
                    <td className="px-4 py-3 text-center">{row.dominantLevel ? `TP${row.dominantLevel}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
