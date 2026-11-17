import {Link} from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import CommunityUpdatesPanel from '../../components/community/CommunityUpdatesPanel';
export default function ResidentHomePage(){
  return <><PageHeader title="Your barangay, in view" description="Keep up with maintenance updates and report concerns in your community." action={<div className="flex flex-wrap gap-3"><Link className="button button-secondary" to="/resident/reports">My Reports</Link><Link className="button button-primary" to="/resident/reports/new">Report an incident</Link></div>}/><CommunityUpdatesPanel/></>;
}
