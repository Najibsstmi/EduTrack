import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  getExamStructureForGrade,
  normalizeSetupConfigWithExamConfigs,
} from '../lib/examConfig'

const DEFAULT_GRADE_KEYS = ['A+', 'A', 'A-', 'B+', 'B', 'C+', 'C', 'D', 'E', 'TH', 'G']

function normaliseText(value) {
  return String(value || '').trim().toUpperCase()
}

function normaliseExamKey(value) {
  return normaliseText(value)
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

const findGradeFromMark = (mark, gradeScales = []) => {
  const numericMark = Number(mark)
  if (Number.isNaN(numericMark)) return { grade_name: null, grade_point: null }

  const matched = (gradeScales || []).find((grade) => {
    const min = Number(grade.min_mark ?? grade.min_score ?? 0)
    const max = Number(grade.max_mark ?? grade.max_score ?? 100)
    return numericMark >= min && numericMark <= max
  })

  if (!matched) return { grade_name: null, grade_point: null }

  return {
    grade_name: matched.grade_name ?? matched.grade ?? null,
    grade_point:
      matched.grade_point ??
      matched.point_value ??
      matched.grade_value ??
      null,
  }
}

const getDefaultExamOrder = (examKey) => {
  const key = normaliseExamKey(examKey)

  if (key === 'TOV') return 0
  if (key === 'ETR') return 999

  const otrMatch = key.match(/^OTR(\d+)$/)
  if (otrMatch) return Number(otrMatch[1]) * 10

  const arMatch = key.match(/^AR(\d+)$/)
  if (arMatch) return Number(arMatch[1]) * 10 + 1

  return 500
}

const buildExamList = ({ setupConfig, examConfigs, currentTingkatan, scores, targets }) => {
  const normalizedSetupConfig = normalizeSetupConfigWithExamConfigs(
    setupConfig || {},
    examConfigs || []
  )
  const configuredExams = getExamStructureForGrade(normalizedSetupConfig, currentTingkatan)
  const examMap = new Map()

  const addExam = ({ key, label, order }) => {
    const normalizedKey = normaliseExamKey(key)
    if (!normalizedKey) return

    const current = examMap.get(normalizedKey)
    examMap.set(normalizedKey, {
      value: normalizedKey,
      label: label || current?.label || normalizedKey,
      order: Number.isFinite(Number(order))
        ? Number(order)
        : current?.order ?? getDefaultExamOrder(normalizedKey),
    })
  }

  addExam({ key: 'TOV', label: 'TOV', order: 0 })

  ;(configuredExams || []).forEach((exam) => {
    addExam({
      key: exam.key,
      label: exam.name || exam.key,
      order: getDefaultExamOrder(exam.key),
    })
  })

  ;(examConfigs || []).forEach((exam) => {
    addExam({
      key: exam.exam_key,
      label: exam.exam_name || exam.exam_key,
      order: exam.exam_order,
    })
  })

  ;(scores || []).forEach((score) => {
    addExam({ key: score.exam_key, label: score.exam_key })
  })

  ;(targets || []).forEach((target) => {
    addExam({ key: target.target_key, label: target.target_key })
  })

  return Array.from(examMap.values()).sort((a, b) => {
    const orderDiff = a.order - b.order
    if (orderDiff !== 0) return orderDiff

    return a.label.localeCompare(b.label, 'ms', { sensitivity: 'base' })
  })
}

export default function ClassSubjectAnalysisPanel({
  schoolId,
  classId,
  subjectId,
  refreshKey = 0,
}) {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [actualTingkatan, setActualTingkatan] = useState('')

  useEffect(() => {
    const loadAnalysis = async () => {
      if (!schoolId || !classId || !subjectId) {
        setRows([])
        setActualTingkatan('')
        return
      }

      setLoading(true)
      setError('')

      try {
        // 1. Ambil class semasa dulu untuk tahu tingkatan sebenar
        const { data: currentClass, error: currentClassError } = await supabase
          .from('classes')
          .select('id, class_name, tingkatan')
          .eq('school_id', schoolId)
          .eq('id', classId)
          .single()

        if (currentClassError) throw currentClassError

        const currentTingkatan = currentClass?.tingkatan || ''
        setActualTingkatan(currentTingkatan)

        if (!currentTingkatan) {
          setRows([])
          setLoading(false)
          return
        }

        const { data: setupConfigRows, error: setupConfigError } = await supabase
          .from('school_setup_configs')
          .select('*')
          .eq('school_id', schoolId)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)

        if (setupConfigError) throw setupConfigError

        const setupConfig = setupConfigRows?.[0] || {}
        const currentAcademicYear =
          setupConfig?.current_academic_year || new Date().getFullYear()

        // 2. Ambil exam dari DB sebenar
        const { data: examConfigs, error: examError } = await supabase
          .from('exam_configs')
          .select('exam_key, exam_name, exam_order, grade_label, academic_year, is_active')
          .eq('school_id', schoolId)
          .eq('grade_label', currentTingkatan)
          .eq('academic_year', currentAcademicYear)
          .order('exam_order', { ascending: true })

        if (examError) throw examError

        // 3. Ambil semua kelas dalam tingkatan yang sama
        const { data: allClasses, error: classesError } = await supabase
          .from('classes')
          .select('id, class_name, tingkatan')
          .eq('school_id', schoolId)
          .eq('tingkatan', currentTingkatan)

        if (classesError) throw classesError

        const classIds = (allClasses || []).map((cls) => cls.id)

        if (!classIds.length) {
          setRows([])
          setLoading(false)
          return
        }

        // 3. Ambil semua enrollment dalam semua kelas tingkatan itu
        const { data: enrollments, error: enrollmentsError } = await supabase
          .from('student_enrollments')
          .select('id, class_id, student_profile_id')
          .eq('school_id', schoolId)
          .eq('academic_year', currentAcademicYear)
          .eq('is_active', true)
          .in('class_id', classIds)

        if (enrollmentsError) throw enrollmentsError

        const enrollmentRows = enrollments || []
        const enrollmentIds = enrollmentRows.map((item) => item.id)

        if (!enrollmentIds.length) {
          setRows([])
          setLoading(false)
          return
        }

        // 4. Tentukan sama ada subjek ini selective atau core.
        const { data: subjectRow, error: subjectError } = await supabase
          .from('subjects')
          .select('id, subject_type, is_core')
          .eq('school_id', schoolId)
          .eq('id', subjectId)
          .single()

        if (subjectError) throw subjectError

        const isSelective =
          String(subjectRow?.subject_type || '').trim().toLowerCase() === 'selective'

        let filteredEnrollmentRows = enrollmentRows

        if (isSelective) {
          const { data: subjectEnrollments, error: subjectEnrollmentsError } = await supabase
            .from('student_subject_enrollments')
            .select('student_enrollment_id')
            .eq('school_id', schoolId)
            .eq('subject_id', subjectId)
            .eq('is_active', true)
            .in('student_enrollment_id', enrollmentIds)

          if (subjectEnrollmentsError) throw subjectEnrollmentsError

          const allowedEnrollmentIdSet = new Set(
            (subjectEnrollments || []).map((item) => item.student_enrollment_id)
          )

          filteredEnrollmentRows = enrollmentRows.filter((item) =>
            allowedEnrollmentIdSet.has(item.id)
          )
        }

        const totalStudents = filteredEnrollmentRows.length

        if (!totalStudents) {
          setRows([])
          setLoading(false)
          return
        }

        const validEnrollmentIds = new Set(filteredEnrollmentRows.map((item) => item.id))

        // 5. Ambil semua score subjek semasa untuk semua kelas tingkatan itu
        const { data: scores, error: scoresError } = await supabase
          .from('student_scores')
          .select('student_enrollment_id, exam_key, mark, grade_name, grade_point, is_absent, class_id')
          .eq('school_id', schoolId)
          .eq('subject_id', subjectId)
          .eq('academic_year', currentAcademicYear)
          .in('class_id', classIds)

        if (scoresError) throw scoresError

        const { data: targets, error: targetsError } = await supabase
          .from('student_targets')
          .select('student_enrollment_id, target_key, target_mark, grade_name, grade_point, class_id')
          .eq('school_id', schoolId)
          .eq('subject_id', subjectId)
          .eq('academic_year', currentAcademicYear)
          .in('class_id', classIds)

        if (targetsError) throw targetsError

        const { data: gradeScales, error: gradeScalesError } = await supabase
          .from('grade_scales')
          .select('*')
          .eq('school_id', schoolId)

        if (gradeScalesError) throw gradeScalesError

        const gradeScalesForTingkatan = (gradeScales || []).filter((grade) => {
          const label =
            grade.tingkatan ??
            grade.grade_label ??
            grade.form_level ??
            grade.level ??
            ''

          return normaliseText(label) === normaliseText(currentTingkatan)
        })

        const examList = buildExamList({
          setupConfig,
          examConfigs: examConfigs || [],
          currentTingkatan,
          scores: scores || [],
          targets: targets || [],
        })

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

        ;(targets || []).forEach((row) => {
          if (!validEnrollmentIds.has(row.student_enrollment_id)) return

          const examKey = normaliseExamKey(row.target_key)
          if (!examKey) return

          if (!scoreMap[row.student_enrollment_id]) {
            scoreMap[row.student_enrollment_id] = {}
          }

          scoreMap[row.student_enrollment_id][examKey] = {
            ...row,
            exam_key: examKey,
            mark: row.target_mark,
            is_absent: false,
          }
        })

        const summaryRows = examList.map((exam) => {
          const examKey = normaliseExamKey(exam.value)
          const gradeCounts = createEmptyGradeCounts()

          let hadir = 0
          let takHadir = 0
          let lulus = 0
          let gagal = 0
          let gpmpTotal = 0
          let gpmpCount = 0

          filteredEnrollmentRows.forEach((enrollment) => {
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

            const computedGrade = scoreEntry.grade_name
              ? {
                  grade_name: scoreEntry.grade_name,
                  grade_point: scoreEntry.grade_point,
                }
              : findGradeFromMark(markValue, gradeScalesForTingkatan)
            const rawGrade = normaliseText(computedGrade.grade_name)
            const gradeKey = DEFAULT_GRADE_KEYS.includes(rawGrade) ? rawGrade : 'G'

            gradeCounts[gradeKey] += 1

            if (gradeKey === 'G') {
              gagal += 1
            } else if (gradeKey !== 'TH') {
              lulus += 1
            }

            const point = computedGrade.grade_point
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
        console.error('ClassSubjectAnalysisPanel error:', err)
        setError(err.message || 'Gagal memuatkan analisis.')
        setRows([])
      } finally {
        setLoading(false)
      }
    }

    loadAnalysis()
  }, [schoolId, classId, subjectId, refreshKey])

  if (!schoolId || !classId || !subjectId) return null

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <div>
          <h3 style={styles.title}>Analisis Subjek Semasa</h3>
          <p style={styles.subtitle}>
            Ringkasan analisis bagi semua kelas dalam {actualTingkatan || '-'} untuk subjek yang sedang dipilih.
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
    minWidth: '1200px',
    borderCollapse: 'collapse',
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

