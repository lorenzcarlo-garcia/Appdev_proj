import {Link} from 'react-router-dom';
import {Search,ClipboardPlus,UserRound,ArrowUpRight} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import CommunityUpdatesPanel from '../../components/community/CommunityUpdatesPanel';
const services = [
  {to:'/resident/reports',title:'Find your reports',description:'Find your Report ID and follow the latest status updates.',icon:Search},
  {to:'/resident/reports/new',title:'Report a concern',description:'Tell the barangay what happened. Add photos or save a draft.',icon:ClipboardPlus},
  {to:'/resident/profile',title:'Your resident profile',description:'Keep your contact information and resident details up to date.',icon:UserRound},
];
export default function ResidentHomePage(){
  return <><PageHeader title="Barangay services" description="Report a concern or check maintenance updates from your barangay." action={<div className="flex flex-wrap gap-3"><Link className="button button-secondary" to="/resident/reports">My Reports</Link><Link className="button button-primary" to="/resident/reports/new">Report an incident</Link></div>}/>
    <nav aria-label="Resident services" className="mb-8 grid gap-4 sm:grid-cols-3">{services.map(({to,title,description,icon:Icon})=><Link key={to} to={to} className="panel service-card"><div className="flex items-center justify-between gap-4"><span className="service-card-icon"><Icon size={23} aria-hidden="true"/></span><ArrowUpRight size={19} className="text-brand" aria-hidden="true"/></div><div><h2 className="text-xl font-semibold text-brand-dark">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{description}</p></div></Link>)}</nav>
    <CommunityUpdatesPanel/></>;
}
