import DashboardPage from './pages/admin/DashboardPage';
import ReportsPage from './pages/admin/ReportsPage';
import AdminReportDetailPage from './pages/admin/AdminReportDetailPage';
import ResidentsPage from './pages/admin/ResidentsPage';
import CategoriesPage from './pages/admin/CategoriesPage';
import BlottersPage from './pages/admin/BlottersPage';
import BlotterDetailPage from './pages/admin/BlotterDetailPage';
import BlotterFormPage from './pages/admin/BlotterFormPage';
import AccountPage from './pages/AccountPage';
import ResidentHomePage from './pages/resident/ResidentHomePage';
import CommunityUpdatesPage from './pages/admin/CommunityUpdatesPage';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import AuthProvider from './context/AuthContext.jsx';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import RegisterPage from './pages/RegisterPage';
import StaffAccountsPage from './pages/admin/StaffAccountsPage';
import MyReportsPage from './pages/resident/MyReportsPage';
import ReportDetailPage from './pages/resident/ReportDetailPage';
import ReportFormPage from './pages/resident/ReportFormPage';
import NotFoundPage from './pages/NotFoundPage';
import LoadingSpinner from './components/ui/LoadingSpinner';
import ErrorState from './components/ui/ErrorState';

const administrativeRoles = ['staff','secretary','captain','super_admin'];
function HomeRedirect() {
  const {user,loading,error,refresh} = useAuth();
  if (loading) return <LoadingSpinner label="Checking your session..." />;
  if (error) return <main className="mx-auto max-w-lg p-5 pt-16"><ErrorState message={error} onRetry={() => void refresh()} /></main>;
  return <Navigate replace to={!user ? '/login' : user.role === 'resident' ? '/resident' : '/admin'} />;
}
function PublicOnly() {
  const {user,loading} = useAuth();
  if (loading) return <LoadingSpinner label="Checking your session..." />;
  return user ? <Navigate replace to={user.role === 'resident' ? '/resident' : '/admin'} /> : <Outlet />;
}
export function AppRoutes() {
  return <Routes>
    <Route path="/" element={<HomeRedirect />} />
    <Route element={<PublicOnly />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Route>
    <Route element={<ProtectedRoute roles={['resident']} />}>
      <Route path="/resident" element={<AppLayout variant="resident" />}>
        <Route index element={<ResidentHomePage />} />
        <Route path="reports" element={<MyReportsPage />} />
        <Route path="reports/new" element={<ReportFormPage />} />
        <Route path="reports/:id" element={<ReportDetailPage />} />
        <Route path="reports/:id/edit" element={<ReportFormPage />} />
        <Route path="profile" element={<AccountPage />} />
      </Route>
    </Route>
    <Route element={<ProtectedRoute roles={administrativeRoles} />}>
      <Route path="/admin" element={<AppLayout />}>
        <Route index element={<DashboardPage/>} />
        <Route path="reports" element={<ReportsPage/>} />
        <Route path="reports/:id" element={<AdminReportDetailPage/>} />
        <Route path="blotters" element={<BlottersPage/>} />
        <Route path="blotters/:id" element={<BlotterDetailPage/>} />
        <Route element={<ProtectedRoute roles={['secretary','captain','super_admin']} />}>
          <Route path="blotters/new" element={<BlotterFormPage/>} />
          <Route path="blotters/:id/edit" element={<BlotterFormPage mode="edit"/>} />
        </Route>
        <Route element={<ProtectedRoute roles={['captain','super_admin']} />}>
          <Route path="reports/:id/convert" element={<BlotterFormPage mode="convert"/>}/>
        </Route>
        <Route path="account" element={<AccountPage />} />
        <Route path="community-updates" element={<CommunityUpdatesPage />} />
        <Route path="residents" element={<ResidentsPage/>} />
        <Route element={<ProtectedRoute roles={['secretary','super_admin']} />}>
          <Route path="categories" element={<CategoriesPage/>} />
        </Route>
        <Route element={<ProtectedRoute roles={['super_admin']} />}>
          <Route path="staff" element={<StaffAccountsPage />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes>;
}
export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>;
}
