import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import SignupPage from './pages/SignupPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import PendingApprovalPage from './pages/PendingApprovalPage.jsx'
import MasterAdminDashboard from './pages/MasterAdminDashboard.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import SchoolAdminDashboard from './pages/SchoolAdminDashboard.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import SchoolSetupPage from './pages/SchoolSetupPage.jsx'
import SchoolSetupExamsPage from './pages/SchoolSetupExamsPage.jsx'
import SchoolSetupGradesPage from './pages/SchoolSetupGradesPage.jsx'
import SchoolSetupSubjectsPage from './pages/SchoolSetupSubjectsPage.jsx'
import SchoolLogoSettingsPage from './pages/SchoolLogoSettingsPage.jsx'
import StudentsPage from './pages/StudentsPage'
import ClassesPage from './pages/ClassesPage'
import StudentImportPage from './pages/StudentImportPage'
import StudentScoresPage from './pages/StudentScoresPage'
import TargetsPage from './pages/TargetsPage'
import AnalysisPage from './pages/AnalysisPage'
import StudentIndividualAnalysisPage from './pages/StudentIndividualAnalysisPage'
import StudentSubjectTrendPage from './pages/StudentSubjectTrendPage'
import ManageSubjectStudentsPage from './pages/ManageSubjectStudentsPage'
import PbdInputPage from './pages/PbdInputPage.jsx'
import PbdAnalysisPage from './pages/PbdAnalysisPage.jsx'
import PajskInputPage from './pages/PajskInputPage.jsx'
import PajskSegakPage from './pages/PajskSegakPage.jsx'
import PajskSegakInputPage from './pages/PajskSegakInputPage.jsx'
import PajskSegakAnalysisPage from './pages/PajskSegakAnalysisPage.jsx'
import PsychometricInputPage from './pages/PsychometricInputPage.jsx'
import PsychometricAnalysisPage from './pages/PsychometricAnalysisPage.jsx'
import PbsAnalysisPage from './pages/PbsAnalysisPage.jsx'
import PerformanceDialogPage from './pages/PerformanceDialogPage.jsx'
import UserProfilePage from './pages/UserProfilePage.jsx'
import InstallEduTrackButton from './components/InstallEduTrackButton.jsx'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import { forceCleanLogout } from './lib/authSession'
import { getDashboardPath } from './lib/dashboardPath'

function AuthSessionWatcher() {
  const navigate = useNavigate()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        navigate('/login', { replace: true })
        return
      }

      if (!session && event !== 'INITIAL_SESSION') {
        await forceCleanLogout()
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  return null
}

function DashboardRedirect() {
  const [targetPath, setTargetPath] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadTargetPath = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!isMounted) return

      if (userError || !user) {
        setTargetPath('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, is_school_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (isMounted) {
        setTargetPath(getDashboardPath(profile))
      }
    }

    loadTargetPath()

    return () => {
      isMounted = false
    }
  }, [])

  if (!targetPath) {
    return <div className="p-6 text-slate-600">Loading...</div>
  }

  return <Navigate to={targetPath} replace />
}

function App() {
  if (!hasSupabaseConfig) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-slate-100 p-3 text-slate-900 sm:p-4 md:p-6">
        <div className="mx-auto mt-6 min-w-0 max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-10 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            EduTrack
          </p>
          <h1 className="mt-2 text-2xl font-bold">Konfigurasi Supabase diperlukan</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Localhost sudah berjalan, tetapi app memerlukan fail .env dengan
            VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY untuk sambung ke Supabase.
          </p>
          <div className="mt-5 rounded-xl bg-slate-950 p-4 font-mono text-xs text-white">
            <div>VITE_SUPABASE_URL=...</div>
            <div>VITE_SUPABASE_ANON_KEY=...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <AuthSessionWatcher />
      <InstallEduTrackButton />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/register" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard" element={<SchoolAdminDashboard />} />
        <Route path="/home" element={<DashboardPage />} />
        <Route path="/master-admin" element={<MasterAdminDashboard />} />
        <Route path="/school-setup" element={<SchoolSetupPage />} />
        <Route path="/school-setup/exams" element={<SchoolSetupExamsPage />} />
        <Route path="/school-setup/grades" element={<SchoolSetupGradesPage />} />
        <Route path="/school-setup/subjects" element={<SchoolSetupSubjectsPage />} />
        <Route path="/exam-settings" element={<SchoolSetupExamsPage />} />
        <Route path="/grade-settings" element={<SchoolSetupGradesPage />} />
        <Route path="/subject-settings" element={<SchoolSetupSubjectsPage />} />
        <Route path="/class-settings" element={<ClassesPage />} />
        <Route path="/settings/school-logo" element={<SchoolLogoSettingsPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/import" element={<StudentImportPage />} />
        <Route path="/scores" element={<StudentScoresPage />} />
        <Route path="/classes" element={<ClassesPage />} />
        <Route path="/manage-subject-students" element={<ManageSubjectStudentsPage />} />
        <Route path="/targets" element={<TargetsPage />} />
        <Route path="/academic-targets" element={<TargetsPage />} />
        <Route path="/pbs" element={<DashboardRedirect />} />
        <Route path="/pbs/pbd" element={<PbdInputPage />} />
        <Route path="/pbs/pbd/input" element={<PbdInputPage />} />
        <Route path="/input-pbd" element={<PbdInputPage />} />
        <Route path="/pbs/pbd/analysis" element={<PbdAnalysisPage />} />
        <Route path="/analisis-pbd" element={<PbdAnalysisPage />} />
        <Route path="/analysis/pbd" element={<PbdAnalysisPage />} />
        <Route path="/pbs/pbd/subject" element={<PbdAnalysisPage />} />
        <Route path="/pbs/pbd/student" element={<PbdAnalysisPage />} />
        <Route path="/pbs/pajsk" element={<PajskInputPage />} />
        <Route path="/pbs/pajsk/segak" element={<PajskSegakPage />} />
        <Route path="/pbs/pajsk/segak/input" element={<PajskSegakInputPage />} />
        <Route path="/pbs/pajsk/segak/analysis" element={<PajskSegakAnalysisPage />} />
        <Route path="/pbs/ppsi" element={<PsychometricInputPage />} />
        <Route path="/pbs/ppsi/input" element={<PsychometricInputPage />} />
        <Route path="/psikometrik/input" element={<PsychometricInputPage />} />
        <Route path="/psychometric/input" element={<PsychometricInputPage />} />
        <Route path="/analysis" element={<DashboardRedirect />} />
        <Route path="/analysis/class" element={<AnalysisPage />} />
        <Route path="/analysis/subject" element={<AnalysisPage />} />
        <Route path="/analysis/student" element={<StudentIndividualAnalysisPage />} />
        <Route path="/analysis/student-subject" element={<StudentSubjectTrendPage />} />
        <Route path="/analysis/pajsk-segak" element={<PajskSegakAnalysisPage />} />
        <Route path="/analysis/psychometric" element={<PsychometricAnalysisPage />} />
        <Route path="/analysis/pbs" element={<PbsAnalysisPage />} />
        <Route path="/dialog-prestasi" element={<PerformanceDialogPage />} />
        <Route path="/pending" element={<PendingApprovalPage />} />
        <Route path="/pending-approval" element={<PendingApprovalPage />} />
        <Route path="/profile" element={<UserProfilePage />} />
        <Route path="/profil-saya" element={<UserProfilePage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}

export default App
