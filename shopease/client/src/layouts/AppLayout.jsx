import ServiceIdentity from '../components/ui/ServiceIdentity';
import ResidentVerification from '../components/residents/ResidentVerification';
import lakePhoto from '../assets/branding/lake.jpg';
import { useId, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, BookOpen, Users, Tags, UserRoundCog, UserRound, Menu, LogOut, Home, Megaphone, MapPin, History, FileText } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import Modal from '../components/ui/Modal';

const roleLabels = {resident:'Resident',staff:'Staff',secretary:'Secretary',captain:'Captain',super_admin:'Super Admin'};
const adminLinks = [
  {to:'/admin',label:'Dashboard',icon:LayoutDashboard,end:true},
  {to:'/admin/reports',label:'Reports',icon:ClipboardList},
  {to:'/admin/blotters',label:'Blotter Records',icon:BookOpen},
  {to:'/admin/summary-reports',label:'Summary Reports',icon:FileText,roles:['secretary','captain','super_admin']},
  {to:'/admin/community-updates',label:'Community Updates',icon:Megaphone},
  {to:'/admin/residents',label:'Residents',icon:Users},
  {to:'/admin/categories',label:'Categories',icon:Tags,roles:['secretary','super_admin']},
  {to:'/admin/areas',label:'Areas and Puroks',icon:MapPin,roles:['secretary','super_admin']},
  {to:'/admin/activity',label:'Activity Log',icon:History},
  {to:'/admin/account',label:'My Account',icon:UserRound},
  {to:'/admin/staff',label:'Staff Accounts',icon:UserRoundCog,roles:['super_admin']},
];
const residentLinks = [
  {to:'/resident',label:'Home',icon:Home,end:true},
  {to:'/resident/reports',label:'My Reports',icon:ClipboardList},
  {to:'/resident/profile',label:'Profile',icon:UserRound},
];
function Navigation({links,onSelect}) {
  return <nav aria-label="Main navigation" className="space-y-1">{links.map(({to,label,icon:Icon,end}) => <NavLink key={to} to={to} end={end} onClick={onSelect} className={({isActive}) => `flex min-h-12 items-center gap-3 rounded-control px-3.5 py-3 text-sm font-semibold ${isActive ? 'active-navigation text-white' : 'text-brand-dark hover:bg-canvas'} focus-visible:outline-offset-2`}><Icon size={19} className="shrink-0" aria-hidden="true" /><span>{label}</span></NavLink>)}</nav>;
}
export default function AppLayout({ variant = 'admin', children }) {
  const {user,logout} = useAuth();
  const [menuOpen,setMenuOpen] = useState(false);
  const menuId=useId();
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
  return <div className="workspace-background min-h-dvh">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <div className="workspace-frame flex min-h-dvh w-full">
      <div className="min-w-0 flex-1">
        <header className="lake-masthead relative isolate grid min-h-36 grid-cols-1 items-center gap-4 overflow-hidden px-4 py-6 sm:min-h-44 sm:px-8 sm:py-8 md:flex md:flex-wrap md:justify-between">
          <div className="absolute inset-0 -z-10" aria-hidden="true"><img src={lakePhoto} alt="" width="900" height="600" className="h-full w-full object-cover object-[center_55%]" /><div className="absolute inset-0 bg-[#062f2d]/65" /></div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button variant="ghost" onClick={() => setMenuOpen(true)} aria-label="Open feature menu" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={menuId} className="shrink-0 px-3"><Menu size={23} aria-hidden="true" /></Button>
            <div className="min-w-0"><ServiceIdentity compact tone="light"/><p className="mt-1 hidden text-xs text-white sm:block">{resident ? 'Resident portal' : 'Barangay workspace'}</p></div>
          </div>
          <div className="masthead-actions">
            {user.role==='resident' ? <ResidentVerification/> : <span className="hidden border-l border-white/40 px-4 py-2 text-xs font-semibold tracking-wide text-white lg:inline-flex">{roleLabels[user.role]}</span>}
            <Button variant="ghost" onClick={handleLogout} busy={loggingOut}><LogOut size={17} aria-hidden="true" /><span>Log out</span></Button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="workspace-content">{error && <div className="mb-5"><Alert variant="error">{error}</Alert></div>}{children || <Outlet />}</main>
      </div>
    </div>
    <Modal id={menuId} placement="drawer" open={menuOpen} onClose={() => setMenuOpen(false)} title="BantayLog menu"><Navigation links={links} onSelect={() => setMenuOpen(false)} /></Modal>
  </div>;
}
