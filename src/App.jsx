import { Navigate, Route, Routes } from 'react-router-dom'
import SignupPage from './pages/SignupPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import PendingApprovalPage from './pages/PendingApprovalPage.jsx'
import MasterAdminDashboard from './pages/MasterAdminDashboard.jsx'
import SchoolAdminDashboard from './pages/SchoolAdminDashboard.jsx'
import SchoolSetupPage from './pages/SchoolSetupPage.jsx'
import SchoolSetupExamsPage from './pages/SchoolSetupExamsPage.jsx'
import SchoolSetupGradesPage from './pages/SchoolSetupGradesPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/master-admin" element={<MasterAdminDashboard />} />
      <Route path="/school-admin" element={<SchoolAdminDashboard />} />
      <Route path="/school-setup" element={<SchoolSetupPage />} />
      <Route path="/school-setup/exams" element={<SchoolSetupExamsPage />} />
      <Route path="/school-setup/grades" element={<SchoolSetupGradesPage />} />
      <Route path="/pending" element={<PendingApprovalPage />} />
      <Route path="/pending-approval" element={<PendingApprovalPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
