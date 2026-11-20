import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import useResource from '../../hooks/useResource';
import {listActivity} from '../../services/management';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Pagination from '../../components/ui/Pagination';
import ActivityList from '../../components/activity/ActivityList';
import {entityTypeLabels,roleLabels} from '../../utils/activityLabels';
import {todayInManila} from '../../utils/validation';

const pageSize=25;
export default function ActivityPage(){
  const {user}=useAuth();const superAdmin=user.role==='super_admin';
  const canInspect=['captain','super_admin'].includes(user.role);
  // Filters live in the address, so "Show only this person's actions" links and Back work.
  const [params,setParams]=useSearchParams();
  const read=key=>params.get(key)||'';
  const page=/^[1-9]\d*$/.test(read('page'))?Number(read('page')):1;
  const actorId=canInspect && /^[1-9]\d*$/.test(read('actor_id'))?read('actor_id'):'';
  const query=Object.fromEntries(Object.entries({entity_type:read('entity_type'),actor_role:read('actor_role'),actor_id:actorId,from:read('from'),to:read('to'),page:String(page),page_size:String(pageSize)}).filter(([key,value])=>value && (key!=='to' || read('from'))));
  const log=useResource(listActivity,query);
  const [dates,setDates]=useState({from:read('from'),to:read('to')});const [dateError,setDateError]=useState('');
  const types=Object.entries(entityTypeLabels).filter(([key])=>superAdmin || key!=='staff_account');
  const roles=Object.entries(roleLabels).filter(([key])=>superAdmin || key!=='super_admin' || true);
  function update(values){setParams(previous=>{const next=new URLSearchParams(previous);if(!('page' in values))next.delete('page');for(const [key,value] of Object.entries(values)){if(value)next.set(key,String(value));else next.delete(key);}return next;});}
  function applyDates(event){
    event.preventDefault();
    if(!dates.from && !dates.to){setDateError('');return update({from:'',to:''});}
    if(!dates.from || !dates.to) return setDateError('Choose both a start and an end date.');
    if(dates.from>dates.to) return setDateError('The start date must be on or before the end date.');
    setDateError('');update(dates);
  }
  const filtered=query.entity_type || query.actor_role || query.actor_id || query.from;
  return <>
    <PageHeader title="Activity log"/>
    <div className="space-y-5">
      <section className="panel p-5" aria-label="Activity filters"><form className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-5" onSubmit={applyDates}>
        <FormField label="Record type"><select value={read('entity_type')} onChange={event=>update({entity_type:event.target.value})}><option value="">All records</option>{types.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></FormField>
        <FormField label="Done by"><select value={read('actor_role')} onChange={event=>update({actor_role:event.target.value})}><option value="">Everyone</option>{roles.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></FormField>
        <FormField label="From" error={dateError}><input type="date" max={todayInManila()} value={dates.from} onChange={event=>setDates(previous=>({...previous,from:event.target.value}))}/></FormField>
        <FormField label="To"><input type="date" max={todayInManila()} value={dates.to} onChange={event=>setDates(previous=>({...previous,to:event.target.value}))}/></FormField>
        <Button type="submit" variant="secondary">Apply dates</Button>
      </form></section>
      {actorId && <Alert>Showing actions by one person only. <button type="button" className="text-link" onClick={()=>update({actor_id:''})}>Show everyone</button></Alert>}
      {log.error?<ErrorState message={log.error} onRetry={log.reload}/>:log.loading?<LoadingSpinner label="Loading activity..."/>:<section className="panel overflow-hidden">
        {log.data.entries?.length?<ActivityList entries={log.data.entries} canInspect={canInspect}/>:<EmptyState title={filtered?'No matching activity':'No activity recorded yet'}>Actions are recorded from the moment this log was installed. Earlier actions remain in each record's own history.</EmptyState>}
        {log.data.total>0 && <Pagination page={page} pageSize={pageSize} total={log.data.total} onPageChange={next=>update({page:next})}/>}
      </section>}
      <p className="text-xs leading-6 text-muted">“Done by” is the role the person had at the time of the action. Remarks, resident details and private report text are never copied here.{canInspect?' Select “By …” on an entry to see who it was.':''}{superAdmin?' Staff-account changes are visible to Super Admin only.':''}</p>
    </div>
  </>;
}
