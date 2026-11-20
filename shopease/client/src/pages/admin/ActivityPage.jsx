import {useState} from 'react';
import {useAuth} from '../../hooks/useAuth';
import useResource from '../../hooks/useResource';
import {listActivity} from '../../services/management';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';
import ActivityList from '../../components/activity/ActivityList';
import {entityTypeLabels} from '../../utils/activityLabels';
import {todayInManila} from '../../utils/validation';

const pageSize=25;
export default function ActivityPage(){
  const {user}=useAuth();const superAdmin=user.role==='super_admin';
  const [query,setQuery]=useState({entity_type:'',from:'',to:'',page:1});
  const [dates,setDates]=useState({from:'',to:''});const [dateError,setDateError]=useState('');
  const params={page:String(query.page),page_size:String(pageSize),...(query.entity_type?{entity_type:query.entity_type}:{}),...(query.from?{from:query.from,to:query.to}:{})};
  const log=useResource(listActivity,params);
  const types=Object.entries(entityTypeLabels).filter(([key])=>superAdmin || key!=='staff_account');
  function applyDates(event){
    event.preventDefault();
    if(!dates.from && !dates.to){setDateError('');setQuery(previous=>({...previous,from:'',to:'',page:1}));return;}
    if(!dates.from || !dates.to){setDateError('Choose both a start and an end date.');return;}
    if(dates.from>dates.to){setDateError('The start date must be on or before the end date.');return;}
    setDateError('');setQuery(previous=>({...previous,...dates,page:1}));
  }
  return <>
    <PageHeader title="Activity log" description="A record of barangay actions on reports, blotters, community updates, residents, categories and areas."/>
    <div className="space-y-5">
      <section className="panel p-5" aria-label="Activity filters"><form className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={applyDates}>
        <FormField label="Record type"><select value={query.entity_type} onChange={event=>setQuery(previous=>({...previous,entity_type:event.target.value,page:1}))}><option value="">All records</option>{types.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></FormField>
        <FormField label="From" error={dateError}><input type="date" max={todayInManila()} value={dates.from} onChange={event=>setDates(previous=>({...previous,from:event.target.value}))}/></FormField>
        <FormField label="To"><input type="date" max={todayInManila()} value={dates.to} onChange={event=>setDates(previous=>({...previous,to:event.target.value}))}/></FormField>
        <Button type="submit" variant="secondary">Apply dates</Button>
      </form></section>
      {log.error?<ErrorState message={log.error} onRetry={log.reload}/>:log.loading?<LoadingSpinner label="Loading activity..."/>:<section className="panel overflow-hidden">
        {log.data.entries?.length?<ActivityList entries={log.data.entries} showEmail={superAdmin}/>:<EmptyState title={query.entity_type || query.from?'No matching activity':'No activity recorded yet'}>Actions are recorded from the moment this log was installed. Earlier actions remain in each record's own history.</EmptyState>}
        {log.data.total>0 && <Pagination page={query.page} pageSize={pageSize} total={log.data.total} onPageChange={page=>setQuery(previous=>({...previous,page}))}/>}
      </section>}
      <p className="text-xs leading-6 text-muted">Entries show the role that acted, the record reference and a short description. Remarks, resident details and private report text are never copied here.{superAdmin?' Staff-account changes and account emails are visible to Super Admin only.':''}</p>
    </div>
  </>;
}
