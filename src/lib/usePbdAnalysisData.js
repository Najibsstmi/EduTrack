import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { fetchSchoolLevelLabels } from './levelLabels.js'
import { normalizeSubjectRows } from './subjectLabels.js'

const getCurrentYear = () => new Date().getFullYear()

export const buildPbdYearOptions = (currentYear) => {
  const baseYear = Number(currentYear) || getCurrentYear()
  return [baseYear - 1, baseYear, baseYear + 1, baseYear + 2]
}

export function usePbdAnalysisData({ checkingAuth }) {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [levelMappings, setLevelMappings] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [studentSubjectEnrollments, setStudentSubjectEnrollments] = useState([])
  const [teachers, setTeachers] = useState([])
  const [pbdScores, setPbdScores] = useState([])

  const init = useCallback(async () => {
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
        .select('id, full_name, email, school_id, role, is_school_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || !profileData) {
        navigate('/login', { replace: true })
        return
      }

      const { data: setupRows, error: setupError } = await supabase
        .from('school_setup_configs')
        .select('current_academic_year, active_grade_labels')
        .eq('school_id', profileData.school_id)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (setupError) throw setupError

      const setupData = setupRows?.[0] || null
      setProfile(profileData)
      setSetupConfig(setupData)
      setAcademicYear(setupData?.current_academic_year || getCurrentYear())
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Gagal memuatkan data PBD.')
      setLoading(false)
    }
  }, [navigate])

  const loadYearData = useCallback(async (schoolId, year) => {
    setLoading(true)
    setErrorMessage('')

    try {
      const [
        loadedLevelMappings,
        { data: classData, error: classError },
        { data: subjectData, error: subjectError },
        { data: enrollmentData, error: enrollmentError },
        { data: studentSubjectData, error: studentSubjectError },
        { data: teacherData, error: teacherError },
        { data: pbdScoreData, error: pbdScoreError },
      ] = await Promise.all([
        fetchSchoolLevelLabels({ schoolId, academicYear: year }),
        supabase
          .from('classes')
          .select('id, tingkatan, class_name, academic_year, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true)
          .order('tingkatan', { ascending: true })
          .order('class_name', { ascending: true }),
        supabase
          .from('subjects')
          .select('id, subject_name, subject_code, tingkatan, subject_type, is_core, is_active')
          .eq('school_id', schoolId)
          .eq('is_active', true)
          .order('subject_name', { ascending: true }),
        supabase
          .from('student_enrollments')
          .select(`
            id,
            class_id,
            student_profile_id,
            academic_year,
            is_active,
            student_profiles (
              id,
              full_name,
              ic_number,
              gender
            )
          `)
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true),
        supabase
          .from('student_subject_enrollments')
          .select('id, student_enrollment_id, subject_id, academic_year, is_active')
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true),
        supabase
          .from('profiles')
          .select('id, full_name, email, role, designation')
          .eq('school_id', schoolId)
          .eq('approval_status', 'approved')
          .eq('is_active', true)
          .order('full_name', { ascending: true }),
        supabase
          .from('student_pbd_scores')
          .select('id, school_id, student_enrollment_id, academic_year, subject_id, tp_level, evidence_note, assessment_date, created_by, updated_by, created_at, updated_at')
          .eq('school_id', schoolId)
          .eq('academic_year', year),
      ])

      if (classError) throw classError
      if (subjectError) throw subjectError
      if (enrollmentError) throw enrollmentError
      if (studentSubjectError) throw studentSubjectError
      if (teacherError) throw teacherError
      if (pbdScoreError) throw pbdScoreError

      setLevelMappings(loadedLevelMappings || [])
      setClasses(classData || [])
      setSubjects(normalizeSubjectRows(subjectData))
      setEnrollments(enrollmentData || [])
      setStudentSubjectEnrollments(studentSubjectData || [])
      setTeachers(teacherData || [])
      setPbdScores(pbdScoreData || [])
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error.message?.includes('student_pbd_scores')
          ? 'Jadual student_pbd_scores belum tersedia. Sila jalankan SQL migration PBS di Supabase.'
          : error.message || 'Gagal memuatkan data analisis PBD.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (checkingAuth) return
    init()
  }, [checkingAuth, init])

  useEffect(() => {
    if (!profile?.school_id || !academicYear) return
    loadYearData(profile.school_id, academicYear)
  }, [profile?.school_id, academicYear, loadYearData])

  return {
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
    reload: () => {
      if (profile?.school_id && academicYear) {
        loadYearData(profile.school_id, academicYear)
      }
    },
  }
}
