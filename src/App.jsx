import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import SignupPage from './pages/SignupPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import PendingApprovalPage from './pages/PendingApprovalPage.jsx'
import MasterAdminDashboard from './pages/MasterAdminDashboard.jsx'
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
import AnalysisHubPage from './pages/AnalysisHubPage'
import StudentIndividualAnalysisPage from './pages/StudentIndividualAnalysisPage'
import StudentSubjectTrendPage from './pages/StudentSubjectTrendPage'
import ManageSubjectStudentsPage from './pages/ManageSubjectStudentsPage'
import { supabase } from './lib/supabaseClient'
import { forceCleanLogout } from './lib/authSession'

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

function App() {
  return (
    <>
      <AuthSessionWatcher />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/register" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
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
        <Route path="/analysis" element={<AnalysisHubPage />} />
        <Route path="/analysis/class" element={<AnalysisPage />} />
        <Route path="/analysis/student" element={<StudentIndividualAnalysisPage />} />
        <Route path="/analysis/student-subject" element={<StudentSubjectTrendPage />} />
        <Route path="/pending" element={<PendingApprovalPage />} />
        <Route path="/pending-approval" element={<PendingApprovalPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}

export default App
