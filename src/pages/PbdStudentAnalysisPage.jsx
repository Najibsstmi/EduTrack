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
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import { TP_LEVELS, formatPercent } from '../lib/pbdAnalysis.js'
import { buildPbdYearOptions, usePbdAnalysisData } from '../lib/usePbdAnalysisData.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

export default function PbdStudentAnalysisPage() {
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
    teachers,
    pbdScores,
  } = usePbdAnalysisData({ checkingAuth })

  const [selectedTingkatan, setSelectedTingkatan] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedStudentEnrollmentId, setSelectedStudentEnrollmentId] = useState('')
  const [teacherFilter, setTeacherFilter] = useState('')
  const [tpFilter, setTpFilter] = useState('')

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

  const studentRows = useMemo(() => {
    return enrollments
      .filter((enrollment) => !selectedClassId || String(enrollment.class_id) === String(selectedClassId))
      .filter((enrollment) => {
        if (!selectedTingkatan) return true
        const classRow = classes.find((item) => String(item.id) === String(enrollment.class_id))
        return classRow?.tingkatan === selectedTingkatan
      })
      .map((enrollment) => {
        const classRow = classes.find((item) => String(item.id) === String(enrollment.class_id))
        return {
          enrollment_id: enrollment.id,
          student_profile_id: enrollment.student_profile_id,
          class_id: enrollment.class_id,
          full_name: enrollment.student_profiles?.full_name || '-',
          ic_number: enrollment.student_profiles?.ic_number || '-',
          tingkatan: classRow?.tingkatan || '',
          class_name: classRow?.class_name || '',
        }
      })
      .sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [classes, enrollments, selectedClassId, selectedTingkatan])

  const selectedStudent = useMemo(() => {
    return studentRows.find(
      (student) => String(student.enrollment_id) === String(selectedStudentEnrollmentId)
    ) || null
  }, [selectedStudentEnrollmentId, studentRows])

  const subjectRows = useMemo(() => {
    if (!selectedStudent) return []

    return subjects
      .filter((subject) => subject.tingkatan === selectedStudent.tingkatan)
      .map((subject) => {
        const score = pbdScores.find(
          (row) =>
            String(row.student_enrollment_id) === String(selectedStudent.enrollment_id) &&
            String(row.subject_id) === String(subject.id)
        )

        return {
          subject_id: subject.id,
          subject_name: subject.subject_name,
          subject_code: subject.subject_code || '',
          tp_level: score?.tp_level || null,
          evidence_note: score?.evidence_note || '',
          assessment_date: score?.assessment_date || '',
          teacher_id: score?.updated_by || score?.created_by || '',
        }
      })
      .filter((row) => !teacherFilter || row.teacher_id === teacherFilter)
      .filter((row) => !tpFilter || String(row.tp_level || '') === String(tpFilter))
      .sort((a, b) =>
        String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [pbdScores, selectedStudent, subjects, teacherFilter, tpFilter])

  const summary = useMemo(() => {
    const rowsWithTp = subjectRows.filter((row) => TP_LEVELS.includes(Number(row.tp_level)))
    const minimumCount = rowsWithTp.filter((row) => Number(row.tp_level) >= 3).length
    const dominantTp =
      TP_LEVELS.map((level) => ({
        level,
        count: rowsWithTp.filter((row) => Number(row.tp_level) === level).length,
      })).sort((a, b) => b.count - a.count)[0] || null

    return {
      totalSubjects: subjectRows.length,
      recordedSubjects: rowsWithTp.length,
      minimumCount,
      minimumPercent: subjectRows.length ? (minimumCount / subjectRows.length) * 100 : 0,
      dominantTp: dominantTp?.count > 0 ? dominantTp.level : null,
    }
  }, [subjectRows])

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Analisis Murid PBD...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Analisis PBD Murid"
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
              onClick={() => navigate('/analisis-pbd')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Laporan PBD
            </button>
          }
        />

        <PbdTabs active="student" />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Penapis Murid PBD</h2>
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
                setSelectedStudentEnrollmentId('')
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
              onChange={(event) => {
                setSelectedClassId(event.target.value)
                setSelectedStudentEnrollmentId('')
              }}
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
              value={selectedStudentEnrollmentId}
              onChange={(event) => setSelectedStudentEnrollmentId(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Pilih Murid</option>
              {studentRows.map((student) => (
                <option key={student.enrollment_id} value={student.enrollment_id}>
                  {student.full_name}
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

        {selectedStudent ? (
          <>
            <section className="grid gap-4 md:grid-cols-5">
              <SummaryCard title="Subjek" value={summary.totalSubjects} />
              <SummaryCard title="Ada TP" value={summary.recordedSubjects} />
              <SummaryCard title="Capai TP3-TP6" value={summary.minimumCount} />
              <SummaryCard title="% Minimum" value={formatPercent(summary.minimumPercent)} />
              <SummaryCard title="TP Dominan" value={summary.dominantTp ? `TP${summary.dominantTp}` : '-'} />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedStudent.full_name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {getDisplayClassLabel(selectedStudent.tingkatan, selectedStudent.class_name, levelMappings)}
                </p>
              </div>
              <div className="mt-4 h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subjectRows} margin={{ top: 8, right: 16, left: 0, bottom: 64 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="subject_name"
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      height={96}
                      tick={{ fill: '#475569', fontSize: 12 }}
                    />
                    <YAxis domain={[0, 6]} allowDecimals={false} tick={{ fill: '#475569', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="tp_level" name="Tahap Penguasaan" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
              <h2 className="text-lg font-semibold text-slate-900">Senarai TP Mengikut Subjek</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">Subjek</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-center font-semibold text-slate-700">TP</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">Tarikh</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700">Eviden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectRows.map((row) => (
                      <tr key={row.subject_id} className="border-b border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-900">{row.subject_name}</td>
                        <td className="px-4 py-3 text-center">{row.tp_level ? `TP${row.tp_level}` : '-'}</td>
                        <td className="px-4 py-3">{row.assessment_date || '-'}</td>
                        <td className="px-4 py-3 text-slate-600">{row.evidence_note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            Sila pilih murid untuk melihat analisis PBD individu.
          </div>
        )}
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
