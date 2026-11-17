import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ShieldCheck, LayoutDashboard, ClipboardList, BookOpen, Users, Tags, UserRoundCog, UserRound, Menu, LogOut, Home, Megaphone } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Modal from '../components/ui/Modal';

const roleLabels = {resident:'Resident',staff:'Staff',secretary:'Secretary',captain:'Captain',super_admin:'Super Admin'};
const adminLinks = [
  {to:'/admin',label:'Dashboard',icon:LayoutDashboard,end:true},
  {to:'/admin/reports',label:'Reports',icon:ClipboardList},
  {to:'/admin/blotters',label:'Blotter Records',icon:BookOpen},
  {to:'/admin/community-updates',label:'Community Updates',icon:Megaphone},
  {to:'/admin/residents',label:'Residents',icon:Users},
  {to:'/admin/categories',label:'Categories',icon:Tags,roles:['secretary','super_admin']},
  {to:'/admin/account',label:'My Account',icon:UserRound},
  {to:'/admin/staff',label:'Staff Accounts',icon:UserRoundCog,roles:['super_admin']},
];
const residentLinks = [
  {to:'/resident',label:'Home',icon:Home,end:true},
  {to:'/resident/reports',label:'My Reports',icon:ClipboardList},
  {to:'/resident/profile',label:'Profile',icon:UserRound},
];
function Brand() {
  return <div className="flex items-center gap-3 text-brand-dark"><ShieldCheck size={29} strokeWidth={1.8} aria-hidden="true" /><span className="text-xl font-bold tracking-tight">BantayLog</span></div>;
}
function Navigation({ links, onSelect, mobile = false }) {
  return <nav aria-label="Main navigation" className={mobile ? 'space-y-1' : 'space-y-2'}>{links.map(({to,label,icon:Icon,end}) => <NavLink key={to} to={to} end={end} onClick={onSelect} className={({isActive}) => `flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold ${isActive ? 'active-navigation text-white' : 'text-brand-dark hover:bg-white/80'} focus-visible:outline-offset-2`}><Icon size={19} aria-hidden="true" />{label}</NavLink>)}</nav>;
}
export default function AppLayout({ variant = 'admin', children }) {
  const {user,logout} = useAuth();
  const [menuOpen,setMenuOpen] = useState(false);
  const [loggingOut,setLoggingOut] = useState(false);
  const [error,setError] = useState('');
  const resident = variant === 'resident';
  const links = (resident ? residentLinks : adminLinks).filter(link => !link.roles || link.roles.includes(user.role));
  async function handleLogout() {
    setLoggingOut(true); setError('');
    try { await logout(); }
    catch { setError('We could not log you out. Please try again.'); }
    finally { setLoggingOut(false); }
  }
  return <div className="workspace-background min-h-dvh lg:p-8 xl:p-12">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <div className="workspace-frame mx-auto flex min-h-dvh max-w-[1480px] lg:min-h-[calc(100dvh-4rem)] xl:min-h-[calc(100dvh-6rem)]">
      <aside className="sticky top-8 hidden min-h-[calc(100dvh-4rem)] w-60 shrink-0 flex-col self-start rounded-l-[28px] border-r border-line/70 bg-white/35 px-4 py-7 lg:flex xl:top-12 xl:min-h-[calc(100dvh-6rem)]">
        <div className="px-3"><Brand /><p className="mt-3 text-[10px] font-semibold tracking-[0.18em] text-muted">BARANGAY SERVICES</p></div>
        <div className="mt-9"><Navigation links={links} /></div>
        <div className="mt-auto px-1 pt-10"><div className="rounded-2xl border border-white/90 bg-white/60 px-4 py-5"><ShieldCheck size={23} className="mb-3 text-brand" aria-hidden="true" /><p className="text-sm font-semibold text-brand-dark">Community concerns.<br />Clearer records.</p><p className="mt-2 text-xs leading-5 text-muted">Your barangay workspace.</p></div></div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-line/60 bg-white/80 px-5 py-4 sm:px-8 lg:rounded-tr-[28px] lg:bg-white/20 lg:py-6">
          <div className="min-w-0"><div className="lg:hidden"><Brand /></div><p className="hidden text-xs font-semibold tracking-[0.12em] text-brand uppercase lg:block">{resident ? 'Resident portal' : 'Barangay workspace'}</p><p className="mt-1.5 hidden text-sm text-muted lg:block">Welcome back to BantayLog</p></div>
          <div className="ml-auto flex max-w-full shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-white bg-white/85 px-3 py-2 text-xs font-semibold text-brand-dark md:inline-flex"><UserRound size={16} aria-hidden="true" />{roleLabels[user.role]}</span>
            <NavLink to={resident ? '/resident/profile' : '/admin/account'} className="button button-ghost px-3" aria-label="My account"><UserRound size={18} aria-hidden="true"/><span className="hidden sm:inline">My account</span></NavLink>
            <Button variant="ghost" onClick={handleLogout} busy={loggingOut}><LogOut size={17} aria-hidden="true" /><span>Log out</span></Button>
            {!resident && <Button variant="secondary" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen} className="px-3 lg:hidden"><Menu size={21} aria-hidden="true" /><span className="sr-only">Open menu</span></Button>}
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={`mx-auto max-w-[1440px] px-5 py-6 sm:px-8 sm:py-8 ${resident ? 'pb-28 lg:pb-8' : ''}`}>{error && <div className="mb-5"><Alert variant="error">{error}</Alert></div>}{children || <Outlet />}</main>
      </div>
    </div>
    {resident && <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm lg:hidden">{residentLinks.map(({to,label,icon:Icon,end}) => <NavLink key={to} to={to} end={end} className={({isActive}) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-xs ${isActive ? 'bg-teal-50 font-bold text-brand' : 'text-muted'}`}><Icon size={20} aria-hidden="true" />{label}</NavLink>)}</nav>}
    {!resident && <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="BantayLog menu"><Navigation links={links} mobile onSelect={() => setMenuOpen(false)} /></Modal>}
  </div>;
}
