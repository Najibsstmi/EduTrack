import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { getDashboardPath } from '../lib/dashboardPath.js'
import {
  getDisplayClassLabel,
  getDisplayLevel,
  sortLevelsByDisplayOrder,
} from '../lib/levelLabels.js'
import { getGradeNumber, HOLLAND_DIMENSIONS } from '../lib/psychometricImport.js'
import { supabase } from '../lib/supabaseClient.js'
import { useRequireAuth } from '../lib/useRequireAuth.js'

const getCurrentYear = () => new Date().getFullYear()

const buildYearOptions = (year) => {
  const baseYear = Number(year) || getCurrentYear()
  return [baseYear - 2, baseYear - 1, baseYear, baseYear + 1]
}

const STATUS_LABELS = {
  matched: 'Padanan dijumpai',
  review: 'Perlu semakan',
  unmatched: 'Tidak dijumpai',
}

const STATUS_STYLES = {
  matched: 'bg-emerald-100 text-emerald-800',
  review: 'bg-amber-100 text-amber-800',
  unmatched: 'bg-slate-200 text-slate-700',
}

export default function PsychometricAnalysisPage() {
  const navigate = useNavigate()
  const checkingAuth = useRequireAuth()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [classes, setClasses] = useState([])
  const [results, setResults] = useState([])
  const [selectedGrade, setSelectedGrade] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')

  const initPage = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        navigate('/login', { replace: true })
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, school_id, role, is_school_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || !profileData) {
        navigate('/login', { replace: true })
        return
      }

      const { data: setupRows, error: setupError } = await supabase
        .from('school_setup_configs')
        .select('current_academic_year')
        .eq('school_id', profileData.school_id)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (setupError) throw setupError

      setProfile(profileData)
      setAcademicYear(setupRows?.[0]?.current_academic_year || getCurrentYear())
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan Analisis Psikometrik.')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const loadData = useCallback(async () => {
    if (!profile?.school_id || !academicYear) return
    setLoading(true)
    setErrorMessage('')

    try {
      let resultQuery = supabase
        .from('psychometric_results')
        .select(`
          id,
          grade_label,
          class_id,
          class_name,
          source_student_name,
          source_ic_number,
          match_status,
          raw_data,
          dominant_code,
          primary_dimension,
          secondary_dimension,
          tertiary_dimension,
          updated_at,
          student_profiles (
            id,
            full_name,
            ic_number
          )
        `)
        .eq('school_id', profile.school_id)
        .eq('academic_year', Number(academicYear))
        .eq('assessment_type', 'career_interest')
        .eq('assessment_name', 'IMK')
        .order('updated_at', { ascending: false })
        .limit(500)

      if (selectedGrade) resultQuery = resultQuery.eq('grade_label', selectedGrade)
      if (selectedClassId) resultQuery = resultQuery.eq('class_id', selectedClassId)

      const [
        { data: classData, error: classError },
        { data: resultData, error: resultError },
      ] = await Promise.all([
        supabase
          .from('classes')
          .select('id, tingkatan, class_name')
          .eq('school_id', profile.school_id)
          .eq('academic_year', Number(academicYear))
          .eq('is_active', true)
          .order('tingkatan', { ascending: true })
          .order('class_name', { ascending: true }),
        resultQuery,
      ])

      if (classError) throw classError
      if (resultError) throw resultError

      setClasses(classData || [])
      setResults(resultData || [])
    } catch (error) {
      console.error(error)
      setResults([])
      setErrorMessage(
        error.message?.includes('psychometric_results')
          ? 'Jadual psikometrik belum tersedia. Jalankan migration psikometrik terkini di Supabase.'
          : error.message || 'Gagal memuatkan analisis IMK.'
      )
    } finally {
      setLoading(false)
    }
  }, [academicYear, profile?.school_id, selectedClassId, selectedGrade])

  useEffect(() => {
    if (checkingAuth) return
    initPage()
  }, [checkingAuth, initPage])

  useEffect(() => {
    loadData()
  }, [loadData])

  const availableGrades = useMemo(
    () =>
      sortLevelsByDisplayOrder(
        classes
          .map((classRow) => classRow.tingkatan)
          .filter((grade) => {
            const gradeNumber = Number(getGradeNumber(grade))
            return gradeNumber >= 1 && gradeNumber <= 5
          })
      ),
    [classes]
  )

  const availableClasses = useMemo(
    () =>
      classes
        .filter((classRow) => !selectedGrade || classRow.tingkatan === selectedGrade)
        .sort((a, b) =>
          getDisplayClassLabel(a.tingkatan, a.class_name).localeCompare(
            getDisplayClassLabel(b.tingkatan, b.class_name),
            'ms',
            { sensitivity: 'base', numeric: true }
          )
        ),
    [classes, selectedGrade]
  )

  const dimensionSummary = useMemo(() => {
    const counts = Object.fromEntries(HOLLAND_DIMENSIONS.map((dimension) => [dimension.key, 0]))

    results.forEach((row) => {
      const primaryCode = String(row.dominant_code || '').charAt(0)
      if (counts[primaryCode] !== undefined) counts[primaryCode] += 1
    })

    return HOLLAND_DIMENSIONS.map((dimension) => ({
      ...dimension,
      count: counts[dimension.key],
      percent: results.length ? (counts[dimension.key] / results.length) * 100 : 0,
    }))
  }, [results])

  const topCodes = useMemo(() => {
    const counts = new Map()
    results.forEach((row) => {
      if (!row.dominant_code) return
      counts.set(row.dominant_code, (counts.get(row.dominant_code) || 0) + 1)
    })

    return [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      .slice(0, 8)
  }, [results])

  const matchedCount = results.filter((row) => row.match_status === 'matched').length
  const reviewCount = results.filter((row) => row.match_status === 'review').length
  const topDimension = [...dimensionSummary].sort((a, b) => b.count - a.count)[0]
  const dashboardPath = getDashboardPath(profile)

  if (checkingAuth || loading) {
    return <div className="p-6 text-slate-600">Loading Analisis Psikometrik...</div>
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <AppHeader
          title="Analisis Psikometrik"
          actionLeft={
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            >
              Kembali ke Dashboard
            </button>
          }
          actionRight={
            <button
              type="button"
              onClick={() => navigate('/psikometrik/input')}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              Input Data Psikometrik
            </button>
          }
        />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Analisis Inventori Minat Kerjaya</h2>
              <p className="mt-1 text-sm text-slate-500">
                Taburan kecenderungan utama Holland RIASEK daripada keputusan IMK yang disimpan.
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              IMK - {academicYear}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <select
              value={academicYear}
              onChange={(event) => {
                setAcademicYear(event.target.value)
                setSelectedGrade('')
                setSelectedClassId('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              {buildYearOptions(academicYear).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={selectedGrade}
              onChange={(event) => {
                setSelectedGrade(event.target.value)
                setSelectedClassId('')
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua Tingkatan</option>
              {availableGrades.map((grade) => (
                <option key={grade} value={grade}>
                  {getDisplayLevel(grade)}
                </option>
              ))}
            </select>

            <select
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="">Semua Kelas</option>
              {availableClasses.map((classRow) => (
                <option key={classRow.id} value={classRow.id}>
                  {getDisplayClassLabel(classRow.tingkatan, classRow.class_name)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard title="Jumlah Keputusan" value={results.length} />
          <SummaryCard title="Padanan Tepat" value={matchedCount} tone="emerald" />
          <SummaryCard title="Perlu Semakan" value={reviewCount} tone="amber" />
          <SummaryCard
            title="Kecenderungan Utama"
            value={topDimension?.count ? `${topDimension.key} - ${topDimension.label}` : '-'}
            tone="indigo"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Taburan Dimensi Dominan</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dimensionSummary.map((dimension) => (
                <div key={dimension.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-700 text-lg font-bold text-white">
                      {dimension.key}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-slate-900">{dimension.count}</div>
                      <div className="text-xs font-semibold text-slate-500">
                        {dimension.percent.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-slate-800">{dimension.label}</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-indigo-600"
                      style={{ width: `${Math.min(dimension.percent, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Kod Holland Popular</h2>
            {topCodes.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                Belum ada kod Holland untuk pilihan semasa.
              </div>
            ) : (
              <div className="mt-4 grid gap-2">
                {topCodes.map((item, index) => (
                  <div
                    key={item.code}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400">{index + 1}</span>
                      <span className="font-bold tracking-widest text-indigo-700">{item.code}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{item.count} murid</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Senarai Keputusan IMK</h2>
          {results.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Belum ada keputusan IMK untuk pilihan semasa.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[980px] border-collapse text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Murid', 'Tingkatan / Kelas', 'Kod Holland', 'Dimensi 1', 'Dimensi 2', 'Dimensi 3', 'Status'].map(
                      (header) => (
                        <th
                          key={header}
                          className="border-b border-slate-200 px-4 py-3 text-left font-semibold text-slate-700"
                        >
                          {header}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.student_profiles?.full_name || row.source_student_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {`${row.grade_label || ''} ${row.class_name || ''}`.trim() || '-'}
                      </td>
                      <td className="px-4 py-3 font-bold tracking-widest text-indigo-700">
                        {row.dominant_code || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.primary_dimension || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{row.secondary_dimension || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{row.tertiary_dimension || '-'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            STATUS_STYLES[row.match_status] || STATUS_STYLES.unmatched
                          }`}
                        >
                          {STATUS_LABELS[row.match_status] || row.match_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-white text-slate-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950',
  }[tone]

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  )
}
