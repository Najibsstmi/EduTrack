import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function StudentScoresPage() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [exams, setExams] = useState([])

  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedExam, setSelectedExam] = useState('')

  const [students, setStudents] = useState([])
  const [scores, setScores] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
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
      .select('id, school_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      navigate('/login', { replace: true })
      return
    }

    setProfile(profileData)

    const { data: setupData } = await supabase
      .from('school_setup_configs')
      .select('current_academic_year')
      .eq('school_id', profileData.school_id)
      .maybeSingle()

    setSetupConfig(setupData || null)

    await loadInitialData(profileData, setupData)
  }

  const loadInitialData = async (profileData, setupData) => {
    let classQuery = supabase
      .from('classes')
      .select('id, class_name, tingkatan')
      .eq('school_id', profileData.school_id)
      .eq('is_active', true)
      .order('tingkatan', { ascending: true })
      .order('class_name', { ascending: true })

    if (setupData?.current_academic_year) {
      classQuery = classQuery.eq('academic_year', setupData.current_academic_year)
    }

    const { data: classData } = await classQuery
    setClasses(classData || [])

    const { data: subjectData } = await supabase
      .from('subjects')
      .select('id, subject_name, subject_code')
      .eq('school_id', profileData.school_id)
      .order('subject_name', { ascending: true })

    setSubjects(subjectData || [])

    let examQuery = supabase
      .from('exam_configs')
      .select('id, exam_key, exam_name, exam_order, grade_label, academic_year')
      .eq('school_id', profileData.school_id)
      .order('exam_order', { ascending: true })

    if (setupData?.current_academic_year) {
      examQuery = examQuery.eq('academic_year', setupData.current_academic_year)
    }

    const { data: examData } = await examQuery
    setExams(examData || [])
  }

  const loadStudentsAndScores = async () => {
    if (!selectedClass || !selectedSubject || !selectedExam || !profile?.school_id) return

    let enrollmentQuery = supabase
      .from('student_enrollments')
      .select(`
        id,
        student_profile_id,
        class_id,
        academic_year,
        is_active,
        student_profiles (
          id,
          full_name,
          ic_number
        )
      `)
      .eq('school_id', profile.school_id)
      .eq('class_id', selectedClass)
      .eq('is_active', true)
      .order('id', { ascending: true })

    if (setupConfig?.current_academic_year) {
      enrollmentQuery = enrollmentQuery.eq('academic_year', setupConfig.current_academic_year)
    }

    const { data: enrollmentData } = await enrollmentQuery

    const studentRows = (enrollmentData || []).map((row) => ({
      student_id: row.student_profile_id,
      full_name: row.student_profiles?.full_name || '-',
      ic_number: row.student_profiles?.ic_number || '-',
    }))

    setStudents(studentRows)

    let scoreQuery = supabase
      .from('student_scores')
      .select('*')
      .eq('class_id', selectedClass)
      .eq('subject_id', selectedSubject)
      .eq('exam_key', selectedExam)
      .eq('school_id', profile.school_id)

    if (setupConfig?.current_academic_year) {
      scoreQuery = scoreQuery.eq('academic_year', setupConfig.current_academic_year)
    }

    const { data: scoreData } = await scoreQuery

    const scoreMap = {}
    scoreData?.forEach((s) => {
      const scoreStudentId = s.student_profile_id || s.student_id
      if (scoreStudentId) scoreMap[scoreStudentId] = s
    })

    setScores(scoreMap)
  }

  useEffect(() => {
    loadStudentsAndScores()
  }, [selectedClass, selectedSubject, selectedExam, profile?.school_id])

  const handleScoreChange = (studentId, value) => {
    setScores((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        mark: value,
      },
    }))
  }

  const handleSave = async () => {
    if (!profile?.school_id) return

    setSaving(true)

    const payload = students.map((student) => ({
      student_profile_id: student.student_id,
      class_id: selectedClass,
      subject_id: selectedSubject,
      exam_key: selectedExam,
      mark: scores[student.student_id]?.mark === '' ? null : Number(scores[student.student_id]?.mark),
      school_id: profile.school_id,
      academic_year: setupConfig?.current_academic_year || null,
    }))

    const { error } = await supabase
      .from('student_scores')
      .upsert(payload, {
        onConflict: 'student_profile_id,subject_id,exam_key',
      })

    setSaving(false)

    if (error) {
      alert('Error simpan markah')
      console.error(error)
      return
    }

    alert('Markah berjaya disimpan')
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Input Markah Murid</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="rounded border px-3 py-2"
        >
          <option value="">Pilih Kelas</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{`${c.tingkatan || ''} ${c.class_name}`.trim()}</option>
          ))}
        </select>

        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          className="rounded border px-3 py-2"
        >
          <option value="">Pilih Subjek</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.subject_name}</option>
          ))}
        </select>

        <select
          value={selectedExam}
          onChange={(e) => setSelectedExam(e.target.value)}
          className="rounded border px-3 py-2"
        >
          <option value="">Pilih Peperiksaan</option>
          {exams.map((e) => (
            <option key={`${e.id}-${e.exam_key}`} value={e.exam_key}>
              {e.exam_name}
            </option>
          ))}
        </select>
      </div>

      <table className="w-full border">
        <thead>
          <tr>
            <th className="border px-3 py-2 text-left">Nama</th>
            <th className="border px-3 py-2 text-left">No IC</th>
            <th className="border px-3 py-2 text-left">Markah</th>
          </tr>
        </thead>

        <tbody>
          {students.map((student) => (
            <tr key={student.student_id}>
              <td className="border px-3 py-2">{student.full_name}</td>
              <td className="border px-3 py-2">{student.ic_number}</td>

              <td className="border px-3 py-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scores[student.student_id]?.mark ?? ''}
                  onChange={(e) => handleScoreChange(student.student_id, e.target.value)}
                  className="w-28 rounded border px-3 py-2"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={handleSave}
        disabled={saving || !selectedClass || !selectedSubject || !selectedExam}
        className="mt-4 rounded bg-green-600 px-4 py-2 text-white disabled:opacity-60"
      >
        {saving ? 'Menyimpan...' : 'Simpan Markah'}
      </button>
    </div>
  )
}
