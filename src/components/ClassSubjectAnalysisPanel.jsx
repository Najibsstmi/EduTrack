import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const DEFAULT_GRADE_KEYS = ['A+', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'E', 'TH', 'G']

function getExamOptionsForGrade(setupConfig, gradeLabel) {
  if (!setupConfig || !gradeLabel) return []

  const examStructure = setupConfig.exam_structure || {}
  const rawOptions = examStructure[gradeLabel] || []

  if (!Array.isArray(rawOptions)) return []

  return rawOptions
    .map((item) => {
      if (typeof item === 'string') {
        return {
          value: String(item).trim().toUpperCase(),
          label: item,
        }
      }

      const value = String(item?.value || item?.code || item?.exam_key || item?.label || '')
        .trim()
        .toUpperCase()

      const label = item?.label || item?.value || item?.code || item?.exam_key || value

      return value
        ? {
            value,
            label,
          }
        : null
    })
    .filter(Boolean)
}

function normaliseExamKey(value) {
  return String(value || '').trim().toUpperCase()
}

function createEmptyGradeCounts() {
  return {
    'A+': 0,
    'A': 0,
    'A-': 0,
    'B+': 0,
    'B': 0,
    'C+': 0,
    'C': 0,
    'D': 0,
    'E': 0,
    'TH': 0,
    'G': 0,
  }
}

export default function ClassSubjectAnalysisPanel({
  schoolId,
  classId,
  subjectId,
  gradeLabel,
  setupConfig,
}) {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  const examOptions = useMemo(() => {
    return getExamOptionsForGrade(setupConfig, gradeLabel)
  }, [setupConfig, gradeLabel])

  useEffect(() => {
    const loadAnalysis = async () => {
      if (!schoolId || !classId || !subjectId || !gradeLabel) {
        setRows([])
        return
      }

      setLoading(true)
      setError('')

      try {
        const [{ data: enrollments, error: enrollmentsError }, { data: scores, error: scoresError }] =
          await Promise.all([
            supabase
              .from('student_enrollments')
              .select('id')
              .eq('school_id', schoolId)
              .eq('class_id', classId),

            supabase
              .from('student_scores')
              .select(
                'student_enrollment_id, exam_key, mark, grade_name, grade_point, is_absent, school_id, class_id, subject_id'
              )
              .eq('school_id', schoolId)
              .eq('class_id', classId)
              .eq('subject_id', subjectId),
          ])

        if (enrollmentsError) throw enrollmentsError
        if (scoresError) throw scoresError

        const enrollmentRows = enrollments || []
        const totalStudents = enrollmentRows.length

        const validEnrollmentIds = new Set(enrollmentRows.map((item) => item.id))

        const scoreMap = {}
        ;(scores || []).forEach((row) => {
          if (!validEnrollmentIds.has(row.student_enrollment_id)) return

          const examKey = normaliseExamKey(row.exam_key)
          if (!examKey) return

          if (!scoreMap[row.student_enrollment_id]) {
            scoreMap[row.student_enrollment_id] = {}
          }

          scoreMap[row.student_enrollment_id][examKey] = row
        })

        const summaryRows = examOptions.map((exam) => {
          const examKey = normaliseExamKey(exam.value)
          const gradeCounts = createEmptyGradeCounts()

          let hadir = 0
          let takHadir = 0
          let lulus = 0
          let gagal = 0
          let gpmpTotal = 0
          let gpmpCount = 0

          enrollmentRows.forEach((enrollment) => {
            const scoreEntry = scoreMap[enrollment.id]?.[examKey]

            if (!scoreEntry) return

            if (scoreEntry.is_absent === true) {
              takHadir += 1
              gradeCounts.TH += 1
              return
            }

            const markValue = scoreEntry.mark

            if (markValue === null || markValue === '' || Number.isNaN(Number(markValue))) {
              return
            }

            hadir += 1

            const rawGrade = String(scoreEntry.grade_name || '').trim().toUpperCase()
            const gradeKey = DEFAULT_GRADE_KEYS.includes(rawGrade) ? rawGrade : 'G'

            gradeCounts[gradeKey] += 1

            if (gradeKey === 'G') {
              gagal += 1
            } else if (gradeKey !== 'TH') {
              lulus += 1
            }

            const point = scoreEntry.grade_point
            if (point !== null && point !== '' && !Number.isNaN(Number(point))) {
              gpmpTotal += Number(point)
              gpmpCount += 1
            }
          })

          return {
            examKey,
            examLabel: exam.label,
            jumlahMurid: totalStudents,
            hadir,
            takHadir,
            ...gradeCounts,
            lulus,
            peratusLulus: totalStudents > 0 ? (lulus / totalStudents) * 100 : 0,
            gagal,
            peratusGagal: totalStudents > 0 ? (gagal / totalStudents) * 100 : 0,
            gpmp: gpmpCount > 0 ? gpmpTotal / gpmpCount : null,
          }
        })

        setRows(summaryRows)
      } catch (err) {
        setError(err.message || 'Gagal memuatkan analisis.')
        setRows([])
      } finally {
        setLoading(false)
      }
    }

    loadAnalysis()
  }, [schoolId, classId, subjectId, gradeLabel, setupConfig, examOptions])

  if (!schoolId || !classId || !subjectId) return null

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <div>
          <h3 style={styles.title}>Analisis Subjek Semasa</h3>
          <p style={styles.subtitle}>
            Ringkasan analisis bagi subjek yang sedang dipilih sahaja.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={styles.infoText}>Sedang memuat analisis...</div>
      ) : error ? (
        <div style={styles.errorText}>{error}</div>
      ) : rows.length === 0 ? (
        <div style={styles.infoText}>Tiada data analisis untuk dipaparkan.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Jenis Peperiksaan</th>
                <th style={styles.th}>Jumlah Murid</th>
                <th style={styles.th}>Hadir</th>
                <th style={styles.th}>Tak Hadir</th>
                <th style={styles.th}>A+</th>
                <th style={styles.th}>A</th>
                <th style={styles.th}>A-</th>
                <th style={styles.th}>B+</th>
                <th style={styles.th}>B</th>
                <th style={styles.th}>C+</th>
                <th style={styles.th}>C</th>
                <th style={styles.th}>D</th>
                <th style={styles.th}>E</th>
                <th style={styles.th}>TH</th>
                <th style={styles.th}>G</th>
                <th style={styles.th}>Lulus</th>
                <th style={styles.th}>% Lulus</th>
                <th style={styles.th}>Gagal</th>
                <th style={styles.th}>% Gagal</th>
                <th style={styles.th}>GPMP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.examKey}>
                  <td style={styles.tdStrong}>{row.examLabel}</td>
                  <td style={styles.td}>{row.jumlahMurid}</td>
                  <td style={styles.td}>{row.hadir}</td>
                  <td style={styles.td}>{row.takHadir}</td>
                  <td style={styles.td}>{row['A+']}</td>
                  <td style={styles.td}>{row['A']}</td>
                  <td style={styles.td}>{row['A-']}</td>
                  <td style={styles.td}>{row['B+']}</td>
                  <td style={styles.td}>{row['B']}</td>
                  <td style={styles.td}>{row['C+']}</td>
                  <td style={styles.td}>{row['C']}</td>
                  <td style={styles.td}>{row['D']}</td>
                  <td style={styles.td}>{row['E']}</td>
                  <td style={styles.td}>{row['TH']}</td>
                  <td style={styles.td}>{row['G']}</td>
                  <td style={styles.td}>{row.lulus}</td>
                  <td style={styles.td}>{row.peratusLulus.toFixed(1)}%</td>
                  <td style={styles.td}>{row.gagal}</td>
                  <td style={styles.td}>{row.peratusGagal.toFixed(1)}%</td>
                  <td style={styles.td}>{row.gpmp !== null ? row.gpmp.toFixed(2) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const styles = {
  card: {
    marginTop: '24px',
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '20px',
    padding: '20px',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 800,
    color: '#0f172a',
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: '13px',
    color: '#64748b',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '1200px',
  },
  th: {
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 700,
    color: '#475569',
    background: '#f8fafc',
    padding: '12px 10px',
    borderBottom: '1px solid #e2e8f0',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '12px 10px',
    fontSize: '13px',
    color: '#0f172a',
    borderBottom: '1px solid #f1f5f9',
    whiteSpace: 'nowrap',
  },
  tdStrong: {
    padding: '12px 10px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#0f172a',
    borderBottom: '1px solid #f1f5f9',
    whiteSpace: 'nowrap',
  },
  infoText: {
    fontSize: '14px',
    color: '#64748b',
  },
  errorText: {
    fontSize: '14px',
    color: '#dc2626',
  },
}
