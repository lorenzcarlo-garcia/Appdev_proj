import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from './ui/LoadingSpinner';
import ErrorState from './ui/ErrorState';
import EmptyState from './ui/EmptyState';
import { Link } from 'react-router-dom';
export default function ProtectedRoute({ roles }) {
  const { user, loading, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner label="Checking your session..." />;
  if (error) return <main className="mx-auto max-w-lg p-5 pt-16"><ErrorState message={error} onRetry={() => void refresh()} /></main>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (!roles.includes(user.role)) return <main className="mx-auto max-w-xl p-5 pt-12"><EmptyState title="You do not have access to this page" action={<Link className="button button-primary" to={user.role === 'resident' ? '/resident' : '/admin'}>Return to my home</Link>}>This page is available to other barangay roles.</EmptyState></main>;
  return <Outlet />;
}
