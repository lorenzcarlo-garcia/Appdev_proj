import {useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import useResource from '../../hooks/useResource';
import {getDashboard,listAdminCategories,listAdminAreas,listActivity} from '../../services/management';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import AdminReportList from '../../components/reports/AdminReportList';
import ActivityList from '../../components/activity/ActivityList';
import ResolutionBar from '../../components/dashboard/ResolutionBar';
import VolumeChart from '../../components/dashboard/VolumeChart';
import BarList from '../../components/dashboard/BarList';
import {plural} from '../../components/dashboard/chartFormat';
import {formatDate} from '../../utils/dates';
import {todayInManila} from '../../utils/validation';

const periods=[['last_12_months','Last 12 months'],['this_week','This week'],['this_month','This month'],['this_year','This year'],['custom','Custom dates']];
const groupings=[['','Automatic'],['day','By day'],['week','By week'],['month','By month'],['year','By year']];
const recentActivity={page:'1',page_size:'5'};

export default function DashboardPage(){
  const {user}=useAuth();
  const [params,setParams]=useSearchParams();
  const read=key=>params.get(key)||'';
  const period=read('period')||'last_12_months';
  // One filter set (in the URL) drives the cards, charts and the report table below.
  const query=Object.fromEntries(Object.entries({period,from:period==='custom'?read('from'):'',to:period==='custom'?read('to'):'',granularity:read('granularity'),category_id:read('category_id'),area_id:read('area_id')}).filter(([,value])=>value));
  const customReady=period!=='custom' || (query.from && query.to);
  const stats=useResource(getDashboard,customReady?query:{period:'last_12_months'});
  const cats=useResource(listAdminCategories),areas=useResource(listAdminAreas),activity=useResource(listActivity,recentActivity);
  const [dates,setDates]=useState({from:read('from'),to:read('to')});const [dateError,setDateError]=useState('');
  function update(values){setParams(previous=>{const next=new URLSearchParams(previous);next.delete('page');for(const [key,value] of Object.entries(values)){if(value)next.set(key,value);else next.delete(key);}return next;});}
  function applyDates(event){
    event.preventDefault();
    if(!dates.from || !dates.to) return setDateError('Choose both a start and an end date.');
    if(dates.from>dates.to) return setDateError('The start date must be on or before the end date.');
    setDateError('');update({period:'custom',...dates});
  }
  const data=stats.data,cohort=data.cohort,filters=data.filters;
  // Cards double as filters for the report table: same period, category and area.
  const group=read('status_group');
  function showGroup(next){
    update({status_group:next==='all'?'':next,status:'',view:''});
    const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('period-reports-title')?.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
  }
  const card=(key,props)=><StatCard {...props} selected={key==='all'?!group:group===key} onSelect={()=>showGroup(key)} actionHint="View these reports"/>;
  const areaRows=areas.data.areas||[];const canManageAreas=['secretary','super_admin'].includes(user.role);
  return <>
    <PageHeader title="Dashboard"/>
    <div className="space-y-5">
      <section className="panel p-5" aria-label="Dashboard filters">
        <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Period"><select value={period} onChange={event=>update(event.target.value==='custom'?{period:'custom'}:{period:event.target.value,from:'',to:''})}>{periods.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></FormField>
          <FormField label="Group reports"><select value={read('granularity')} onChange={event=>update({granularity:event.target.value})}>{groupings.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></FormField>
          <FormField label="Category"><select value={read('category_id')} onChange={event=>update({category_id:event.target.value})}><option value="">All categories</option>{cats.data.categories?.map(cat=><option key={cat.id} value={cat.id}>{cat.name}{cat.is_active?'':' (inactive)'}</option>)}</select></FormField>
          <FormField label="Area or purok"><select value={read('area_id')} onChange={event=>update({area_id:event.target.value})}><option value="">All areas</option><option value="unassigned">Unassigned</option>{areaRows.map(area=><option key={area.id} value={area.id}>{area.name}{area.is_active?'':' (inactive)'}</option>)}</select></FormField>
        </div>
        {period==='custom' && <form className="mt-4 grid items-end gap-4 border-t border-line pt-4 sm:grid-cols-3" onSubmit={applyDates}>
          <FormField label="From" error={dateError}><input type="date" min="2000-01-01" max={todayInManila()} value={dates.from} onChange={event=>setDates(previous=>({...previous,from:event.target.value}))}/></FormField>
          <FormField label="To (included)"><input type="date" min="2000-01-01" max={todayInManila()} value={dates.to} onChange={event=>setDates(previous=>({...previous,to:event.target.value}))}/></FormField>
          <Button type="submit" variant="secondary">Show these dates</Button>
        </form>}
      </section>
      {!customReady && <Alert>Choose a start and end date, then select “Show these dates”. Last 12 months is shown until then.</Alert>}
      {stats.error?<ErrorState message={stats.error} onRetry={stats.reload}/>:stats.loading || !cohort?<LoadingSpinner label="Loading dashboard..."/>:<>
        <p className="text-sm text-muted" aria-live="polite">Showing reports first submitted from <strong>{formatDate(filters.from)}</strong> to <strong>{formatDate(filters.to)}</strong> (Philippine time).</p>
        {data.anomalies.missing_submission_record>0 && <Alert>{plural(data.anomalies.missing_submission_record,'submitted report')} matching these filters {data.anomalies.missing_submission_record===1?'has':'have'} no submission record and {data.anomalies.missing_submission_record===1?'is':'are'} not counted in any period.</Alert>}
        <section className="report-totals grid sm:grid-cols-2 xl:grid-cols-4" aria-label="Reports received in this period">
          {card('all',{label:'Reports received',value:cohort.received,tone:'default',detail:'Non-cancelled reports first submitted in this period. Reports later cancelled are not counted.'})}
          {card('open',{label:'Awaiting action',value:cohort.awaiting,tone:'open',detail:'Still Submitted'})}
          {card('ongoing',{label:'Ongoing',value:cohort.ongoing,tone:'ongoing',detail:'Under investigation or scheduled for action'})}
          {card('resolved',{label:'Resolved',value:cohort.resolved,tone:'resolved',detail:'Resolved so far'})}
        </section>
        <ResolutionBar cohort={cohort}/>
        <VolumeChart series={data.series} granularity={filters.granularity}/>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <BarList id="categories-title" title="Most reported categories" rows={data.categories.map(row=>({key:row.id??'none',label:(row.name||'Category unavailable')+(row.is_active===0?' (inactive)':''),total:row.total}))} empty="No reports were received in this period."/>
          <BarList id="areas-title" title="Areas with the most reported concerns" note="Counts show how often residents reported concerns from each area, not how safe an area is." rows={data.areas.map(row=>({key:row.id??'unassigned',label:row.id==null?'Unassigned':row.name+(row.is_active===0?' (inactive)':''),total:row.total,muted:row.id==null}))} empty="No reports were received in this period."
            footer={!areaRows.length && <p className="mt-4 text-xs leading-5 text-muted">No areas have been set up yet, so every report is Unassigned.{canManageAreas && <> <Link className="text-link" to="/admin/areas">Add the barangay's areas</Link>.</>}</p>}/>
        </div>
      </>}
      <section className="panel overflow-hidden" aria-labelledby="recent-activity-title">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-0 sm:px-7"><h2 id="recent-activity-title" className="text-lg font-semibold text-brand-dark">Recent barangay actions</h2><Link className="text-link text-sm" to="/admin/activity">View activity log</Link></div>
        {activity.error?<div className="p-5"><ErrorState message={activity.error} onRetry={activity.reload}/></div>:activity.loading?<LoadingSpinner label="Loading recent actions..."/>:activity.data.entries?.length?<ActivityList entries={activity.data.entries} canInspect={['captain','super_admin'].includes(user.role)}/>:<p className="p-5 text-sm text-muted sm:px-7">No actions have been recorded since the activity log was added.</p>}
      </section>
      <section aria-labelledby="period-reports-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="period-reports-title" className="scroll-mt-4 text-xl font-semibold text-brand-dark">{{open:'Awaiting action',ongoing:'Ongoing reports',resolved:'Resolved reports'}[group]||'Reports in this period'}</h2>{group && <button type="button" className="text-link text-sm" onClick={()=>showGroup('all')}>Show all reports in this period</button>}</div>
        {filters ? <AdminReportList range={{from:filters.from,to:filters.to}}/> : !stats.error && <LoadingSpinner label="Loading reports..."/>}
      </section>
    </div>
  </>;
}
