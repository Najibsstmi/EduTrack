import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'
import {
  getExamStructureForGrade,
  normalizeSetupConfigWithExamConfigs,
} from '../lib/examConfig'
import {
  buildStudentExamMap,
  getRelevantEnrollmentIds,
} from '../lib/completionMatrix'

const normalizeText = (value) => String(value || '').trim().toLowerCase()

const extractGradeNumber = (value) => {
  const match = String(value || '').match(/(\d+)/)
  return match ? Number(match[1]) : 999
}

const ChevronRightIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

function DashboardPage() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [schoolName, setSchoolName] = useState('')
  const [setupConfig, setSetupConfig] = useState(null)
  const [completionLoading, setCompletionLoading] = useState(false)
  const [completionRows, setCompletionRows] = useState([])
  const [completionSubjects, setCompletionSubjects] = useState([])
  const [selectedExamKey, setSelectedExamKey] = useState('TOV')
  const [examOptions, setExamOptions] = useState([])

  const [setupStatus, setSetupStatus] = useState({
    exams: false,
    grades: false,
    subjects: false,
    classes: false,
    students: false,
    examNames: [],
    subjectNames: [],
    classItems: [],
    studentCount: 0,
  })

  useEffect(() => {
    loadProfile()
  }, [navigate])

  useEffect(() => {
    if (!profile?.school_id || !setupConfig) return

    fetchScoreCompletionMatrix(profile.school_id, setupConfig)
  }, [selectedExamKey, profile?.school_id, setupConfig])

  const loadProfile = async () => {
    setLoading(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      navigate('/login', { replace: true })
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, approval_status, is_master_admin, is_school_admin, school_id')
      .eq('id', user.id)
      .maybeSingle()

    if (error || !data) {
      alert('Profil pengguna tidak ditemui')
      navigate('/login', { replace: true })
      return
    }

    if (data.is_master_admin) {
      navigate('/master-admin', { replace: true })
      return
    }

    if (data.is_school_admin || data.role === 'school_admin' || data.role === 'admin') {
      navigate('/dashboard', { replace: true })
      return
    }

    if (data.approval_status === 'pending') {
      navigate('/pending', { replace: true })
      return
    }

    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .select('school_name')
      .eq('id', data.school_id)
      .maybeSingle()

    if (schoolError) {
      console.error('School info error:', schoolError)
    }

    setProfile(data)
    setSchoolName(schoolData?.school_name || '')
    const loadedSetupConfig = await loadSetupStatus(data.school_id)
    setSetupConfig(loadedSetupConfig || null)
    setLoading(false)
  }

  const loadSetupStatus = async (schoolId) => {
    if (!schoolId) return null

    const { data: setupData } = await supabase
      .from('school_setup_configs')
      .select('setup_step, is_setup_complete, current_academic_year, exam_structure')
      .eq('school_id', schoolId)
      .maybeSingle()

    let classQuery = supabase
      .from('classes')
      .select('id, tingkatan, class_name', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('is_active', true)

    let enrollmentQuery = supabase
      .from('student_enrollments')
      .select('id, class_id', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('is_active', true)

    if (setupData?.current_academic_year) {
      classQuery = classQuery.eq('academic_year', setupData.current_academic_year)
      enrollmentQuery = enrollmentQuery.eq('academic_year', setupData.current_academic_year)
    }

    const [
      { data: classesData, count: classTotal },
      { data: enrollmentsData, count: studentTotal },
      { data: subjectsData },
    ] = await Promise.all([
      classQuery,
      enrollmentQuery,
      supabase
        .from('subjects')
        .select('id, subject_name')
        .eq('school_id', schoolId),
    ])

    const setupStep = setupData?.setup_step || 0
    const setupComplete = !!setupData?.is_setup_complete || setupStep >= 5
    const examNames = [...new Set(
      Object.values(setupData?.exam_structure || {})
        .flat()
        .map((item) => item?.name)
        .filter(Boolean)
    )]
    const subjectNames = [...new Set(
      (subjectsData || [])
        .map((item) => item.subject_name)
        .filter(Boolean)
    )]
      .sort((a, b) => String(a).localeCompare(String(b), 'ms', { sensitivity: 'base' }))
    const studentCountByClassId = (enrollmentsData || []).reduce((acc, enrollment) => {
      const classId = enrollment.class_id
      if (!classId) return acc
      acc[classId] = (acc[classId] || 0) + 1
      return acc
    }, {})
    const classItems = (classesData || [])
      .map((item) => ({
        id: item.id,
        name: `${item.tingkatan || ''} ${item.class_name || ''}`.trim(),
        studentCount: studentCountByClassId[item.id] || 0,
      }))
      .filter((item) => item.name)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ms', { sensitivity: 'base' }))

    setSetupStatus({
      exams: examNames.length > 0 || setupStep >= 2 || setupComplete,
      grades: setupStep >= 3 || setupComplete,
      subjects: subjectNames.length > 0 || setupStep >= 4 || setupComplete,
      classes: (classTotal || 0) > 0,
      students: (studentTotal || 0) > 0,
      examNames,
      subjectNames,
      classItems,
      studentCount: studentTotal || 0,
    })

    return setupData || null
  }

  const fetchScoreCompletionMatrix = async (schoolId, rawSetupConfig) => {
    if (!schoolId) {
      setCompletionRows([])
      setCompletionSubjects([])
      setExamOptions([])
      return
    }

    setCompletionLoading(true)

    const academicYear =
      rawSetupConfig?.current_academic_year || new Date().getFullYear()

    const [
      { data: classRows, error: classError },
      { data: subjectRows, error: subjectError },
      { data: enrollmentRows, error: enrollmentError },
      { data: scoreRows, error: scoreError },
      { data: examConfigRows, error: examConfigError },
      { data: studentSubjectEnrollmentRows, error: studentSubjectEnrollmentError },
    ] = await Promise.all([
      supabase
        .from('classes')
        .select('id, class_name, tingkatan')
        .eq('school_id', schoolId)
        .order('tingkatan', { ascending: true })
        .order('class_name', { ascending: true }),

      supabase
        .from('subjects')
        .select('id, subject_name, tingkatan, subject_type, is_active')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('tingkatan', { ascending: true })
        .order('subject_name', { ascending: true }),

      supabase
        .from('student_enrollments')
        .select('id, class_id, academic_year, is_active')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear)
        .eq('is_active', true),

      supabase
        .from('student_scores')
        .select('class_id, subject_id, student_enrollment_id, exam_key')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear),

      supabase
        .from('exam_configs')
        .select('grade_label, exam_key, exam_name, exam_order, is_active')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear),

      supabase
        .from('student_subject_enrollments')
        .select('student_enrollment_id, subject_id, academic_year, is_active')
        .eq('school_id', schoolId)
        .eq('academic_year', academicYear)
        .eq('is_active', true),
    ])

    if (classError) console.error('Class matrix error:', classError)
    if (subjectError) console.error('Subject matrix error:', subjectError)
    if (enrollmentError) console.error('Enrollment matrix error:', enrollmentError)
    if (scoreError) console.error('Score matrix error:', scoreError)
    if (studentSubjectEnrollmentError) console.error('Student subject enrollment matrix error:', studentSubjectEnrollmentError)
    if (examConfigError) console.error('Exam config matrix error:', examConfigError)

    const normalizedSetupConfig = normalizeSetupConfigWithExamConfigs(
      rawSetupConfig || {},
      examConfigRows || []
    )

    const fallbackGradeLabel =
      normalizedSetupConfig?.active_grade_labels?.[0] ||
      Object.keys(normalizedSetupConfig?.exam_structure || {})[0] ||
      'Tingkatan 1'

    const allExamKeys = getExamStructureForGrade(
      normalizedSetupConfig,
      fallbackGradeLabel
    )

    const options = allExamKeys
      .map((exam) => ({
        value: String(exam?.key || '').toUpperCase(),
        label: exam?.name || exam?.key,
      }))
      .filter((exam) => exam.value && !exam.value.startsWith('OTR'))

    setExamOptions(options)

    const effectiveExamKey = options.some((exam) => exam.value === selectedExamKey)
      ? selectedExamKey
      : options[0]?.value || ''

    if (effectiveExamKey && effectiveExamKey !== selectedExamKey) {
      setSelectedExamKey(effectiveExamKey)
    }

    const activeSubjects = (subjectRows || []).filter(
      (item) => item && item.is_active !== false
    )

    const subjectNames = Array.from(
      new Set(
        activeSubjects
          .map((item) => String(item.subject_name || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ms', { sensitivity: 'base' }))

    const studentExamMap = buildStudentExamMap(scoreRows || [])

    const enrollmentsByClass = new Map()
    ;(enrollmentRows || []).forEach((row) => {
      if (!enrollmentsByClass.has(row.class_id)) {
        enrollmentsByClass.set(row.class_id, [])
      }
      enrollmentsByClass.get(row.class_id).push(row.id)
    })

    const rows = (classRows || [])
      .slice()
      .sort((a, b) => {
        const gradeDiff =
          extractGradeNumber(a.tingkatan) - extractGradeNumber(b.tingkatan)

        if (gradeDiff !== 0) return gradeDiff

        return String(a.class_name || '').localeCompare(
          String(b.class_name || ''),
          'ms',
          { sensitivity: 'base' }
        )
      })
      .map((classItem) => {
        const offeredSubjectsForClass = activeSubjects
          .filter(
            (subject) =>
              normalizeText(subject.tingkatan) === normalizeText(classItem.tingkatan)
          )
          .filter(
            (subject, index, arr) =>
              index ===
              arr.findIndex(
                (item) =>
                  normalizeText(item.subject_name) ===
                  normalizeText(subject.subject_name)
              )
          )

        const cells = {}

        subjectNames.forEach((subjectName) => {
          const subject = offeredSubjectsForClass.find(
            (item) => normalizeText(item.subject_name) === normalizeText(subjectName)
          )

          if (!subject) {
            cells[subjectName] = {
              status: 'na',
              label: '-',
              completedStudents: 0,
              totalStudents: 0,
            }
            return
          }

          const relevantEnrollmentIds = getRelevantEnrollmentIds({
            classId: classItem.id,
            subject,
            enrollments: enrollmentRows || [],
            studentSubjectEnrollments: studentSubjectEnrollmentRows || [],
          })

          const totalStudents = relevantEnrollmentIds.length

          if (totalStudents === 0) {
            cells[subjectName] = {
              status: 'na',
              label: 'N/A',
              completedStudents: 0,
              totalStudents: 0,
            }
            return
          }

          let completedStudents = 0
          const normalizedSelectedExamKey = String(selectedExamKey || '')
            .trim()
            .toUpperCase()

          relevantEnrollmentIds.forEach((enrollmentId) => {
            const mapKey = `${enrollmentId}__${subject.id}`
            const examSet = studentExamMap.get(mapKey) || new Set()

            if (examSet.has(normalizedSelectedExamKey)) {
              completedStudents += 1
            }
          })

          const isComplete = completedStudents === totalStudents
          const isPartial = completedStudents > 0 && completedStudents < totalStudents

          cells[subjectName] = {
            status: isComplete ? 'complete' : isPartial ? 'partial' : 'incomplete',
            label: isComplete ? 'Lengkap' : `${completedStudents}/${totalStudents}`,
            completedStudents,
            totalStudents,
          }
        })

        return {
          id: classItem.id,
          tingkatan: classItem.tingkatan,
          class_name: classItem.class_name,
          label: `${classItem.tingkatan} ${classItem.class_name}`,
          cells,
        }
      })

    setCompletionSubjects(subjectNames)
    setCompletionRows(rows)
    setCompletionLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const isAcademicSetupComplete =
    setupStatus.exams &&
    setupStatus.grades &&
    setupStatus.subjects &&
    setupStatus.classes &&
    setupStatus.students

  if (loading) {
    return <div className="p-6">Loading dashboard...</div>
  }

  const displayName =
    profile?.full_name ||
    profile?.email?.split('@')[0] ||
    profile?.email ||
    '-'

  const hasCompletionMatrix = completionRows.length > 0 && completionSubjects.length > 0
  const matrixColumns = completionSubjects

  return (
    <div style={styles.page}>
      <header style={styles.topbar}>
        <div style={styles.brandWrap}>
          <img
            src="/edutrack-logo.png"
            alt="EduTrack"
            style={styles.brandLogo}
          />
          <div style={styles.brandTextWrap}>
            <div style={styles.brandTitle}>EduTrack</div>
            <div style={styles.brandSub}>
              {schoolName || 'Sistem Pemantauan Akademik Sekolah'}
            </div>
          </div>
        </div>

        <nav style={styles.nav}>
          <button style={styles.navButtonPrimary} onClick={() => navigate('/scores')}>
            Input Markah
          </button>
          <button style={styles.navButton} onClick={() => navigate('/manage-subject-students')}>
            Urus Murid Subjek
          </button>
          <button style={styles.navButton} onClick={() => navigate('/analysis')}>
            Analisis
          </button>
        </nav>

        <div style={styles.topbarRight}>
          <button style={styles.darkButton} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main style={styles.container}>
        <section style={styles.hero}>
          <h1 style={styles.heroTitle}>Dashboard Guru</h1>
          <p style={styles.heroText}>
            Selamat datang, {displayName}. Gunakan dashboard ini untuk masukkan markah murid dan
            melihat analisis prestasi sekolah anda.
          </p>
          <div style={styles.heroInfo}>
            <span><strong>Peranan:</strong> {profile?.role || '-'}</span>
            <span><strong>Status Sistem:</strong> {isAcademicSetupComplete ? 'Sedia Digunakan' : 'Perlu Lengkapkan Setup'}</span>
            <span><strong>Jumlah Murid:</strong> {setupStatus.studentCount}</span>
          </div>
        </section>

        <section style={styles.statsGrid}>
          <StatCard title="Subjek" value={setupStatus.subjectNames.length} />
          <StatCard title="Kelas" value={setupStatus.classItems.length} />
          <StatCard title="Peperiksaan" value={setupStatus.examNames.length} />
          <StatCard title="Murid" value={setupStatus.studentCount} />
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Akses Pantas</h2>
          <p style={styles.helperText}>
            Modul paling kerap digunakan untuk kerja harian guru.
          </p>

          <div style={styles.quickActionGrid}>
            <div
              onClick={() => navigate('/scores')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardBlue,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={styles.quickActionTitle}>Input Markah</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Masukkan markah peperiksaan murid dengan lebih cepat dan tersusun.
              </p>
            </div>

            <div
              onClick={() => navigate('/analysis')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardGreen,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={styles.quickActionTitle}>Analisis Prestasi</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Lihat analisis kelas, individu dan prestasi subjek dengan lebih jelas.
              </p>
            </div>

            <div
              onClick={() => navigate('/manage-subject-students')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
              style={{
                ...styles.quickActionCard,
                ...styles.quickActionCardPurple,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={styles.quickActionTitle}>Urus Murid Subjek</h3>
                <span style={styles.quickActionArrow}>›</span>
              </div>
              <p style={styles.quickActionDesc}>
                Tetapkan murid yang mengambil subjek selective seperti Pendidikan Islam,
                Pendidikan Moral atau subjek elektif lain.
              </p>
            </div>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.cardHeaderColumn}>
            <h2 style={styles.cardTitle}>Status Pengisian Markah ({selectedExamKey || '-'})</h2>
            <p style={styles.helperText}>
              Hijau = semua murid dalam kelas itu sudah lengkap markah untuk subjek tersebut.
              Merah = masih ada murid yang belum lengkap. Paparan ini hanya kira peperiksaan
              manual seperti TOV, AR1, AR2 dan ETR. OTR tidak dikira kerana dijana automatik.
            </p>
          </div>

          <div style={styles.examFilterRow}>
            <label htmlFor="teacher-dashboard-exam" style={styles.examFilterLabel}>Jenis Peperiksaan:</label>
            <select
              id="teacher-dashboard-exam"
              value={selectedExamKey}
              onChange={(e) => setSelectedExamKey(e.target.value)}
              style={styles.examFilterSelect}
              disabled={examOptions.length === 0}
            >
              {examOptions.length === 0 ? (
                <option value="">Tiada peperiksaan</option>
              ) : (
                examOptions.map((exam) => (
                  <option key={exam.value} value={exam.value}>
                    {exam.label}
                  </option>
                ))
              )}
            </select>
          </div>

          {completionLoading ? (
            <div style={styles.emptyState}>Loading status pengisian markah...</div>
          ) : !hasCompletionMatrix ? (
            <div style={styles.emptyState}>
              Belum ada data kelas, subjek atau murid aktif untuk dipaparkan.
            </div>
          ) : (
            <div style={{ width: '100%', overflow: 'hidden' }}>
              <div style={styles.matrixWrap}>
                <table style={styles.matrixTable}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.matrixTh, ...styles.matrixStickyCol }}>
                        Tingkatan / Kelas
                      </th>
                      {matrixColumns.map((subjectName) => (
                        <th key={subjectName} style={styles.matrixTh}>
                          {subjectName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {completionRows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ ...styles.matrixTd, ...styles.matrixStickyCol, ...styles.matrixClassCell }}>
                          {row.label}
                        </td>

                        {matrixColumns.map((subjectName) => {
                          const cell = row.cells?.[subjectName]
                          const isClickable = cell?.status !== 'na'

                          let buttonStyle = styles.matrixStatusButton
                          if (cell?.status === 'complete') {
                            buttonStyle = {
                              ...styles.matrixStatusButton,
                              ...styles.matrixStatusButtonComplete,
                            }
                          } else if (cell?.status === 'partial') {
                            buttonStyle = {
                              ...styles.matrixStatusButton,
                              ...styles.matrixStatusButtonPartial,
                            }
                          } else if (cell?.status === 'incomplete') {
                            buttonStyle = {
                              ...styles.matrixStatusButton,
                              ...styles.matrixStatusButtonIncomplete,
                            }
                          } else {
                            buttonStyle = {
                              ...styles.matrixStatusButton,
                              ...styles.matrixStatusButtonNA,
                            }
                          }

                          return (
                            <td key={`${row.id}-${subjectName}`} style={styles.matrixTd}>
                              <button
                                type="button"
                                style={{
                                  ...buttonStyle,
                                  cursor: isClickable ? 'pointer' : 'default',
                                }}
                                onClick={() => {
                                  if (cell?.status === 'na') return

                                  const params = new URLSearchParams({
                                    class_id: row.id,
                                    subject_name: subjectName,
                                    exam_key: selectedExamKey,
                                    show: 'incomplete',
                                  })

                                  navigate(`/scores?${params.toString()}`)
                                }}
                              >
                                {cell?.label || '-'}
                              </button>

                              {cell?.status !== 'na' && (
                                <div style={styles.matrixMeta}>
                                  {cell?.completedStudents || 0}/{cell?.totalStudents || 0} murid
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statTitle}>{title}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#f8fafc', color: '#0f172a', fontFamily: 'Inter, Arial, sans-serif' },
  topbar: { position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '10px 20px', background: '#08142b', color: '#ffffff', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' },
  brandWrap: { display: 'flex', alignItems: 'center', gap: '12px' },
  brandLogo: { width: '42px', height: '42px', objectFit: 'contain', borderRadius: '10px', background: 'transparent', flexShrink: 0 },
  brandTextWrap: { display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 },
  brandTitle: { fontSize: '20px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1, margin: 0 },
  brandSub: { fontSize: '12px', fontWeight: 500, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px' },
  nav: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  navButtonPrimary: { background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
  navButton: { background: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
  topbarRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  darkButton: { background: '#111827', color: '#ffffff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
  container: { maxWidth: '1240px', margin: '0 auto', padding: '24px', display: 'grid', gap: '20px' },
  hero: { background: 'linear-gradient(135deg, #ffffff, #eef4ff)', border: '1px solid #e2e8f0', borderRadius: '22px', padding: '28px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' },
  heroTitle: { margin: 0, fontSize: '30px', fontWeight: 800 },
  heroText: { margin: '10px 0 0 0', color: '#475569', lineHeight: 1.6 },
  heroInfo: { display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '16px', color: '#334155', fontSize: '14px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' },
  statCard: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)' },
  statTitle: { color: '#64748b', fontSize: '13px', marginBottom: '8px' },
  statValue: { fontSize: '28px', fontWeight: 800 },
  card: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '22px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)' },
  cardHeaderColumn: { display: 'grid', gap: '8px', marginBottom: '16px' },
  cardTitle: { margin: 0, fontSize: '20px', fontWeight: 700 },
  helperText: { color: '#64748b', lineHeight: 1.6, margin: 0 },
  helperMetaText: { color: '#64748b', fontSize: '14px' },
  examFilterRow: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' },
  examFilterLabel: { fontSize: '14px', fontWeight: 700, color: '#334155' },
  examFilterSelect: { minWidth: '220px', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px 12px', outline: 'none', background: '#ffffff', color: '#0f172a', fontWeight: 600 },
  sectionHeaderResponsive: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' },
  quickActionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
    marginTop: '16px',
  },
  quickActionCard: {
    borderRadius: '18px',
    padding: '18px',
    cursor: 'pointer',
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minHeight: '120px',
  },
  quickActionCardBlue: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
  },
  quickActionCardGreen: {
    background: '#ecfdf5',
    border: '1px solid #bbf7d0',
  },
  quickActionCardPurple: {
    background: '#faf5ff',
    border: '1px solid #e9d5ff',
  },
  quickActionTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  },
  quickActionDesc: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#475569',
    margin: 0,
  },
  quickActionArrow: {
    marginLeft: 'auto',
    fontSize: '18px',
    fontWeight: 700,
    color: '#334155',
  },
  emptyState: { background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '16px', padding: '24px', color: '#64748b' },
  matrixWrap: {
    overflowX: 'auto',
    overflowY: 'hidden',
    maxWidth: '100%',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    background: '#ffffff',
    boxShadow: 'inset 0 0 0 1px #e2e8f0',
  },
  matrixTable: {
    width: 'max-content',
    minWidth: '900px',
    borderCollapse: 'separate',
    borderSpacing: 0,
  },
  matrixTh: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    padding: '12px 14px',
    fontSize: '13px',
    fontWeight: 700,
    textAlign: 'center',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    color: '#0f172a',
    whiteSpace: 'nowrap',
  },
  matrixTd: {
    padding: '12px 10px',
    textAlign: 'center',
    borderBottom: '1px solid #e2e8f0',
    background: '#ffffff',
    minWidth: '140px',
    verticalAlign: 'middle',
  },
  matrixStickyCol: {
    position: 'sticky',
    left: 0,
    zIndex: 3,
    background: '#ffffff',
  },
  matrixClassCell: {
    minWidth: '190px',
    textAlign: 'left',
    fontWeight: 700,
    color: '#0f172a',
    boxShadow: '1px 0 0 #e2e8f0',
  },
  matrixStatusButton: {
    width: '100%',
    minHeight: '42px',
    borderRadius: '12px',
    border: '1px solid transparent',
    fontWeight: 700,
    fontSize: '13px',
    padding: '10px 12px',
    background: '#f8fafc',
    color: '#334155',
  },
  matrixStatusButtonComplete: {
    background: '#dcfce7',
    borderColor: '#86efac',
    color: '#166534',
  },
  matrixStatusButtonPartial: {
    background: '#fef3c7',
    borderColor: '#fcd34d',
    color: '#92400e',
  },
  matrixStatusButtonIncomplete: {
    background: '#fee2e2',
    borderColor: '#fca5a5',
    color: '#991b1b',
  },
  matrixStatusButtonNA: {
    background: '#f1f5f9',
    borderColor: '#e2e8f0',
    color: '#94a3b8',
  },
  matrixMeta: {
    marginTop: '6px',
    fontSize: '12px',
    color: '#64748b',
  },
}

export default DashboardPage
