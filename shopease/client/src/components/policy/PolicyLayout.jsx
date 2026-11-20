import {Link} from 'react-router-dom';
import ServiceIdentity from '../ui/ServiceIdentity';
import {useAuth} from '../../hooks/useAuth';
const POLICY_VERSION='Draft of 20 November 2026';
export default function PolicyLayout({title,children}){
  const {user}=useAuth();
  const home=!user?'/login':user.role==='resident'?'/resident':'/admin';
  return <div className="auth-background min-h-dvh px-4 py-6 sm:px-8 sm:py-10">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <div className="mx-auto w-full max-w-[760px]">
      <header className="service-masthead mb-7 flex flex-wrap items-center justify-between gap-4 pb-5"><ServiceIdentity/><Link className="button button-secondary" to={home}>{user?'Back to BantayLog':'Back to sign in'}</Link></header>
      <main id="main-content" tabIndex={-1} className="panel p-5 sm:p-9">
        <p className="rounded-control border border-line bg-canvas px-4 py-3 text-sm leading-6"><strong>Draft for barangay review.</strong> This text describes how BantayLog currently works. It is not yet an official policy of Barangay Sta. Ana, Pateros, and it is not legal advice.</p>
        <h1 className="mt-6 text-[28px] leading-tight font-semibold text-brand-dark sm:text-[34px]">{title}</h1>
        <p className="mt-2 text-sm text-muted">{POLICY_VERSION}</p>
        <div className="policy-text">{children}</div>
        <p className="mt-10 border-t border-line pt-5 text-sm text-muted"><Link className="text-link" to="/terms">Terms and Conditions</Link> · <Link className="text-link" to="/privacy">Privacy Notice</Link></p>
      </main>
    </div>
  </div>;
}
