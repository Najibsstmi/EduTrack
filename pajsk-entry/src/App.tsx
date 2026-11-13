import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { LoadingScreen } from './components/LoadingScreen'
import { useSession } from './session/useSession'

const AccessPage = lazy(() => import('./pages/AccessPage').then((module) => ({ default: module.AccessPage })))
const ActivityWizardPage = lazy(() => import('./pages/ActivityWizardPage').then((module) => ({ default: module.ActivityWizardPage })))
const AdminAccessPage = lazy(() => import('./pages/AdminAccessPage').then((module) => ({ default: module.AdminAccessPage })))
const AdminSetupPage = lazy(() => import('./pages/AdminSetupPage').then((module) => ({ default: module.AdminSetupPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage })))

function ProtectedLayout() {
  const { data, loading } = useSession()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!data) return <Navigate to="/access" replace state={{ from: location.pathname }} />
  return <AppLayout><Outlet /></AppLayout>
}

function WriterRoute() {
  const { data } = useSession()
  if (data?.access.role === 'viewer') return <Navigate to="/history" replace />
  return <Outlet />
}

function AdminRoute() {
  const { data } = useSession()
  if (data?.access.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

export default function App() {
  const { loading } = useSession()

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/access" element={loading ? <LoadingScreen /> : <AccessPage />} />
        <Route path="/admin/setup" element={<AdminSetupPage />} />
        <Route element={<ProtectedLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route element={<WriterRoute />}>
            <Route path="activity/new" element={<ActivityWizardPage />} />
            <Route path="activity/:activityId/edit" element={<ActivityWizardPage />} />
          </Route>
          <Route element={<AdminRoute />}>
            <Route path="admin/access" element={<AdminAccessPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
