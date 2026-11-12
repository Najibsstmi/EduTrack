import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { fetchSchoolLevelLabels } from './levelLabels.js'

const getCurrentYear = () => new Date().getFullYear()

export const buildSegakYearOptions = (currentYear) => {
  const baseYear = Number(currentYear) || getCurrentYear()
  return [baseYear - 1, baseYear, baseYear + 1, baseYear + 2]
}

export function usePajskSegakData({ checkingAuth }) {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [profile, setProfile] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [academicYear, setAcademicYear] = useState('')
  const [levelMappings, setLevelMappings] = useState([])
  const [classes, setClasses] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [segakRows, setSegakRows] = useState([])
  const [pajskRows, setPajskRows] = useState([])
  const [pajskErrorMessage, setPajskErrorMessage] = useState('')
  const [lastPajskRefresh, setLastPajskRefresh] = useState(null)

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
      setErrorMessage(error.message || 'Gagal memuatkan data SEGAK.')
      setLoading(false)
    }
  }, [navigate])

  const loadYearData = useCallback(async (schoolId, year) => {
    setLoading(true)
    setErrorMessage('')
    setPajskErrorMessage('')

    try {
      const [
        loadedLevelMappings,
        { data: classData, error: classError },
        { data: enrollmentData, error: enrollmentError },
        { data: segakData, error: segakError },
        { data: pajskData, error: pajskError },
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
              gender,
              art_field
            )
          `)
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .eq('is_active', true),
        supabase
          .from('student_pajsk_segak')
          .select(`
            id,
            school_id,
            student_enrollment_id,
            academic_year,
            term,
            height_cm,
            weight_kg,
            bmi,
            bmi_category,
            segak_total_score,
            segak_grade,
            segak_stars,
            fitness_level,
            fitness_statement,
            is_absent,
            assessment_date,
            note,
            created_by,
            updated_by,
            created_at,
            updated_at
          `)
          .eq('school_id', schoolId)
          .eq('academic_year', year),
        supabase
          .from('pajsk_student_activity_history')
          .select(`
            school_id,
            academic_year,
            activity_id,
            activity_name,
            activity_date,
            organiser,
            competition_category,
            category,
            component,
            level,
            teacher_in_charge,
            student_profile_id,
            student_enrollment_id,
            student_name_snapshot,
            form_snapshot,
            class_name_snapshot,
            art_field_snapshot,
            participation_type,
            participation_score,
            contribution_type,
            achievement_result,
            achievement_score,
            participant_remarks,
            created_at,
            updated_at
          `)
          .eq('school_id', schoolId)
          .eq('academic_year', year)
          .order('activity_date', { ascending: false }),
      ])

      if (classError) throw classError
      if (enrollmentError) throw enrollmentError
      if (segakError) throw segakError

      setLevelMappings(loadedLevelMappings || [])
      setClasses(classData || [])
      setEnrollments(enrollmentData || [])
      setSegakRows(segakData || [])
      if (pajskError) {
        console.error(pajskError)
        setPajskRows([])
        setPajskErrorMessage(
          pajskError.message?.toLowerCase().includes('permission')
            ? 'Anda tidak mempunyai kebenaran membaca rekod PAJSK sekolah ini.'
            : `Rekod PAJSK tidak dapat dibaca: ${pajskError.message || 'Ralat pangkalan data.'}`
        )
      } else {
        setPajskRows(pajskData || [])
        setLastPajskRefresh(new Date())
      }
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error.message?.includes('student_pajsk_segak')
          ? 'Jadual student_pajsk_segak belum tersedia atau belum dikemaskini. Sila jalankan SQL migration PBS terkini di Supabase.'
          : error.message || 'Gagal memuatkan data SEGAK.'
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
  }, [academicYear, loadYearData, profile?.school_id])

  return {
    loading,
    errorMessage,
    setErrorMessage,
    profile,
    setupConfig,
    academicYear,
    setAcademicYear,
    levelMappings,
    classes,
    enrollments,
    segakRows,
    pajskRows,
    pajskErrorMessage,
    lastPajskRefresh,
    reload: () => {
      if (profile?.school_id && academicYear) {
        return loadYearData(profile.school_id, academicYear)
      }

      return Promise.resolve()
    },
  }
}
