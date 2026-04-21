import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  fetchSchoolLevelLabels,
  getDisplayClassLabel,
} from '../lib/levelLabels'

const styles = {
  page: {
    padding: '24px',
    background: '#f8fafc',
    minHeight: '100vh',
  },
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  card: {
    background: '#fff',
    borderRadius: '18px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
    border: '1px solid #e2e8f0',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    marginTop: '8px',
    lineHeight: 1.6,
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
    marginTop: '16px',
  },
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#334155',
  },
  select: {
    border: '1px solid #cbd5e1',
    borderRadius: '12px',
    padding: '12px 14px',
    fontSize: '14px',
    color: '#0f172a',
    background: '#fff',
  },
  helper: {
    fontSize: '13px',
    color: '#64748b',
  },
  infoBox: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1d4ed8',
    borderRadius: '14px',
    padding: '14px 16px',
    fontSize: '14px',
  },
  warningBox: {
    background: '#fff7ed',
    border: '1px solid #fdba74',
    color: '#c2410c',
    borderRadius: '14px',
    padding: '14px 16px',
    fontSize: '14px',
  },
  studentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '14px',
  },
  studentTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
  },
  actionRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  button: {
    border: 'none',
    borderRadius: '12px',
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  primaryButton: {
    background: '#0f172a',
    color: '#fff',
  },
  secondaryButton: {
    background: '#e2e8f0',
    color: '#0f172a',
  },
  successButton: {
    background: '#16a34a',
    color: '#fff',
  },
  studentList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '12px',
  },
  studentCard: {
    border: '1px solid #e2e8f0',
    borderRadius: '14px',
    padding: '14px',
    background: '#fff',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  checkbox: {
    marginTop: '4px',
    width: '18px',
    height: '18px',
  },
  studentInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  studentName: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#0f172a',
  },
  studentMeta: {
    fontSize: '12px',
    color: '#64748b',
  },
  emptyState: {
    textAlign: 'center',
    color: '#64748b',
    padding: '28px 16px',
    fontSize: '14px',
  },
  statusText: {
    fontSize: '13px',
    color: '#475569',
  },
  backButton: {
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#0f172a',
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
}

const normalizeText = (value) =>
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()

const isSelectiveSubject = (subject) =>
  normalizeText(subject?.subject_type) === 'selective'

export default function ManageSubjectStudentsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState(null)
  const [currentAcademicYear, setCurrentAcademicYear] = useState(new Date().getFullYear())
  const [levelMappings, setLevelMappings] = useState([])

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [allStudentEnrollments, setAllStudentEnrollments] = useState([])
  const [studentSubjectEnrollments, setStudentSubjectEnrollments] = useState([])

  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')

  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState(new Set())

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    try {
      setLoading(true)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error('Pengguna tidak ditemui.')
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, school_id, role, full_name')
        .eq('id', user.id)
        .single()

      if (profileError || !profileData?.school_id) {
        throw new Error('Maklumat profil atau sekolah tidak ditemui.')
      }

      setProfile(profileData)

      const { data: setupData } = await supabase
        .from('school_setup_configs')
        .select('current_academic_year')
        .eq('school_id', profileData.school_id)
        .maybeSingle()

      const academicYear =
        setupData?.current_academic_year || new Date().getFullYear()

      setCurrentAcademicYear(academicYear)

      const loadedLevelMappings = await fetchSchoolLevelLabels({
        schoolId: profileData.school_id,
        academicYear,
      })
      setLevelMappings(loadedLevelMappings)

      const [
        { data: classData, error: classError },
        { data: subjectData, error: subjectError },
        { data: enrollmentData, error: enrollmentError },
        { data: studentSubjectData, error: studentSubjectError },
      ] = await Promise.all([
        supabase
          .from('classes')
          .select('id, class_name, tingkatan')
          .eq('school_id', profileData.school_id)
          .order('tingkatan', { ascending: true })
          .order('class_name', { ascending: true }),

        supabase
          .from('subjects')
          .select('id, subject_name, tingkatan, subject_type, is_active')
          .eq('school_id', profileData.school_id)
          .eq('is_active', true)
          .order('tingkatan', { ascending: true })
          .order('subject_name', { ascending: true }),

        supabase
          .from('student_enrollments')
          .select(`
            id,
            class_id,
            school_id,
            academic_year,
            is_active,
            student_profile_id,
            student_profiles (
              id,
              full_name,
              ic_number,
              gender
            )
          `)
          .eq('school_id', profileData.school_id)
          .eq('academic_year', academicYear)
          .eq('is_active', true),

        supabase
          .from('student_subject_enrollments')
          .select('id, student_enrollment_id, subject_id, academic_year, is_active')
          .eq('school_id', profileData.school_id)
          .eq('academic_year', academicYear),
      ])

      if (classError) throw classError
      if (subjectError) throw subjectError
      if (enrollmentError) throw enrollmentError
      if (studentSubjectError) throw studentSubjectError

      setClasses(classData || [])
      setSubjects(subjectData || [])
      setAllStudentEnrollments(enrollmentData || [])
      setStudentSubjectEnrollments(studentSubjectData || [])
    } catch (error) {
      console.error('loadInitialData error:', error)
      alert(error.message || 'Gagal memuatkan data.')
    } finally {
      setLoading(false)
    }
  }

  const selectedClassData = useMemo(() => {
    return classes.find((item) => String(item.id) === String(selectedClassId)) || null
  }, [classes, selectedClassId])

  const availableSubjects = useMemo(() => {
    if (!selectedClassData?.tingkatan) return []

    return subjects.filter(
      (subject) =>
        normalizeText(subject.tingkatan) === normalizeText(selectedClassData.tingkatan)
    )
  }, [subjects, selectedClassData])

  const selectedSubjectData = useMemo(() => {
    return availableSubjects.find(
      (item) => String(item.id) === String(selectedSubjectId)
    ) || null
  }, [availableSubjects, selectedSubjectId])

  const studentsInClass = useMemo(() => {
    if (!selectedClassId) return []

    return allStudentEnrollments
      .filter((item) => String(item.class_id) === String(selectedClassId))
      .map((item) => ({
        enrollment_id: item.id,
        student_profile_id: item.student_profile_id,
        full_name: item.student_profiles?.full_name || '',
        ic_number: item.student_profiles?.ic_number || '',
        gender: item.student_profiles?.gender || '',
      }))
      .sort((a, b) =>
        String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ms', {
          sensitivity: 'base',
        })
      )
  }, [allStudentEnrollments, selectedClassId])

  useEffect(() => {
    if (!selectedSubjectData) {
      setSelectedEnrollmentIds(new Set())
      return
    }

    const activeIds = studentSubjectEnrollments
      .filter(
        (row) =>
          String(row.subject_id) === String(selectedSubjectData.id) &&
          Number(row.academic_year) === Number(currentAcademicYear) &&
          row.is_active === true
      )
      .map((row) => String(row.student_enrollment_id))

    setSelectedEnrollmentIds(new Set(activeIds))
  }, [selectedSubjectData, studentSubjectEnrollments, currentAcademicYear])

  const handleToggleStudent = (enrollmentId) => {
    setSelectedEnrollmentIds((prev) => {
      const next = new Set(prev)
      const key = String(enrollmentId)

      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }

      return next
    })
  }

  const handleSelectAll = () => {
    const allIds = studentsInClass.map((student) => String(student.enrollment_id))
    setSelectedEnrollmentIds(new Set(allIds))
  }

  const handleClearAll = () => {
    setSelectedEnrollmentIds(new Set())
  }

  const handleSave = async () => {
    if (!profile?.school_id) {
      alert('Maklumat sekolah tidak ditemui.')
      return
    }

    if (!selectedClassData || !selectedSubjectData) {
      alert('Sila pilih kelas dan subjek dahulu.')
      return
    }

    if (!isSelectiveSubject(selectedSubjectData)) {
      alert('Subjek core tidak perlu diurus secara manual.')
      return
    }

    try {
      setSaving(true)

      const selectedIds = new Set(
        Array.from(selectedEnrollmentIds).map((id) => String(id))
      )

      const classEnrollmentIds = studentsInClass.map((student) =>
        String(student.enrollment_id)
      )

      const rowsToUpsert = classEnrollmentIds.map((enrollmentId) => ({
        school_id: profile.school_id,
        academic_year: currentAcademicYear,
        student_enrollment_id: enrollmentId,
        subject_id: selectedSubjectData.id,
        is_active: selectedIds.has(String(enrollmentId)),
        updated_at: new Date().toISOString(),
      }))

      const { error: upsertError } = await supabase
        .from('student_subject_enrollments')
        .upsert(rowsToUpsert, {
          onConflict: 'student_enrollment_id,subject_id,academic_year',
        })

      if (upsertError) throw upsertError

      alert('Penyertaan murid untuk subjek ini berjaya disimpan.')
      await loadInitialData()
    } catch (error) {
      console.error('handleSave error:', error)
      alert(error.message || 'Gagal menyimpan data penyertaan murid.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={styles.backButton}
        >
          ← Kembali
        </button>

        <section style={styles.card}>
          <h1 style={styles.title}>Urus Murid Subjek</h1>
          <p style={styles.subtitle}>
            Pilih kelas dan subjek. Untuk subjek selective, tanda murid yang mengambil
            subjek tersebut. Sistem akan menggunakan senarai ini untuk dashboard,
            Input Markah dan analisis.
          </p>

          <div style={styles.filterGrid}>
            <div style={styles.fieldWrap}>
              <label style={styles.label}>Kelas</label>
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value)
                  setSelectedSubjectId('')
                  setSelectedEnrollmentIds(new Set())
                }}
                style={styles.select}
              >
                <option value="">Pilih Kelas</option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {getDisplayClassLabel(item.tingkatan, item.class_name, levelMappings)}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.fieldWrap}>
              <label style={styles.label}>Subjek</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                style={styles.select}
                disabled={!selectedClassId}
              >
                <option value="">Pilih Subjek</option>
                {availableSubjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.subject_name}
                    {isSelectiveSubject(item) ? ' (Selective)' : ' (Core)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <div style={styles.helper}>
              Tahun akademik semasa: <strong>{currentAcademicYear}</strong>
            </div>
          </div>
        </section>

        {selectedSubjectData && !isSelectiveSubject(selectedSubjectData) && (
          <section style={styles.card}>
            <div style={styles.infoBox}>
              Subjek <strong>{selectedSubjectData.subject_name}</strong> ditetapkan sebagai
              <strong> core</strong>. Semua murid dalam kelas ini dianggap mengambil
              subjek tersebut, jadi tidak perlu urus murid secara manual.
            </div>
          </section>
        )}

        {selectedClassData && selectedSubjectData && isSelectiveSubject(selectedSubjectData) && (
          <section style={styles.card}>
            <div style={styles.studentHeader}>
              <div>
                <h2 style={styles.studentTitle}>
                  Senarai Murid — {selectedSubjectData.subject_name}
                </h2>
                <div style={styles.statusText}>
                  {getDisplayClassLabel(
                    selectedClassData.tingkatan,
                    selectedClassData.class_name,
                    levelMappings
                  )}{' '}
                  •{' '}
                  {selectedEnrollmentIds.size}/{studentsInClass.length} murid dipilih
                </div>
              </div>

              <div style={styles.actionRow}>
                <button
                  type="button"
                  style={{ ...styles.button, ...styles.secondaryButton }}
                  onClick={handleSelectAll}
                >
                  Pilih Semua
                </button>

                <button
                  type="button"
                  style={{ ...styles.button, ...styles.secondaryButton }}
                  onClick={handleClearAll}
                >
                  Kosongkan
                </button>

                <button
                  type="button"
                  style={{ ...styles.button, ...styles.successButton }}
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>

            <div style={styles.warningBox}>
              Tanda hanya murid yang benar-benar mengambil subjek ini. Murid yang tidak
              ditanda tidak akan dipaparkan dalam Input Markah dan analisis untuk subjek ini.
            </div>

            {studentsInClass.length === 0 ? (
              <div style={styles.emptyState}>Tiada murid aktif dalam kelas ini.</div>
            ) : (
              <div style={{ marginTop: '16px' }}>
                <div style={styles.studentList}>
                  {studentsInClass.map((student) => {
                    const checked = selectedEnrollmentIds.has(
                      String(student.enrollment_id)
                    )

                    return (
                      <label key={student.enrollment_id} style={styles.studentCard}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleStudent(student.enrollment_id)}
                          style={styles.checkbox}
                        />

                        <div style={styles.studentInfo}>
                          <div style={styles.studentName}>{student.full_name || '-'}</div>
                          <div style={styles.studentMeta}>
                            IC: {student.ic_number || '-'}
                          </div>
                          <div style={styles.studentMeta}>
                            Jantina: {student.gender || '-'}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {loading && (
          <section style={styles.card}>
            <div style={styles.emptyState}>Loading data...</div>
          </section>
        )}
      </div>
    </div>
  )
}