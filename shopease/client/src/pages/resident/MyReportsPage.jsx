import {useEffect, useMemo, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {listReports} from '../../services/reports';
import {listCategories} from '../../services/categories';
import {formatDate} from '../../utils/dates';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import ErrorState from '../../components/ui/ErrorState';
import SearchBar from '../../components/ui/SearchBar';
import FilterSelect from '../../components/ui/FilterSelect';
import Pagination from '../../components/ui/Pagination';
import StatusBadge from '../../components/ui/StatusBadge';
import Alert from '../../components/ui/Alert';

const views = [{value:'active',label:'Active reports'},{value:'drafts',label:'Private drafts'},{value:'cancelled',label:'Cancelled reports'},{value:'all',label:'All my records'}];
const groups = [{value:'all',label:'All statuses'},{value:'open',label:'Open'},{value:'ongoing',label:'Ongoing'},{value:'resolved',label:'Resolved'}];
function label(report) {
  return report.cancelled_at ? 'Cancelled' : report.submission_stage === 'Draft' ? 'Draft' : report.status;
}
export default function MyReportsPage() {
  const [params,setParams] = useSearchParams();
  const view = views.some(option => option.value === params.get('view')) ? params.get('view') : 'active';
  const pageText = params.get('page') || '1';
  const page = /^[1-9]\d*$/.test(pageText) && Number(pageText) <= 1000000 ? Number(pageText) : 1;
  const search = params.get('q') || '';
  const showStatus = !['drafts','cancelled'].includes(view);
  const status = showStatus && groups.some(group => group.value === params.get('status')) ? params.get('status') : 'all';
  const [revision,setRevision] = useState(0);
  const key = JSON.stringify([view,page,search,status,revision]);
  const [state,setState] = useState({key:null,reports:[],categories:[],total:0,error:'',categoryWarning:''});
  const ready = state.key === key;
  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([listReports({view,page,page_size:20,search,status_group:status},controller.signal),listCategories(controller.signal)]).then(([reports,categories]) => {
      if (controller.signal.aborted) return;
      if (reports.status === 'rejected') {
        const message = reports.reason.response?.data?.message;
        setState({key,reports:[],categories:[],total:0,error:typeof message === 'string' ? message : 'We could not load your reports. Please try again.',categoryWarning:''});
        return;
      }
      setState({key,reports:reports.value.reports,categories:categories.status === 'fulfilled' ? categories.value : [],total:reports.value.total,error:'',categoryWarning:categories.status === 'rejected' ? 'Category names could not be loaded. Your reports are still shown.' : ''});
    });
    return () => controller.abort();
  }, [view,page,search,status,key]);
  function update(changes, replace = false) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const [name,value] of Object.entries(changes)) {
        if (value === '' || value === null || (name === 'page' && value === 1)) next.delete(name);
        else next.set(name,String(value));
      }
      return next;
    }, {replace});
  }
  const categoryNames = useMemo(() => new Map(state.categories.map(category => [category.id,category.name])), [state.categories]);
  const categoryName = report => report.category_id === null ? 'Not selected' : categoryNames.get(report.category_id) || `Category unavailable (#${report.category_id})`;
  const loaded = ready ? state.reports : [];
  const filtered = loaded;
  const returnPath = '/resident/reports' + (params.toString() ? '?' + params.toString() : '');
  const detailLink = report => <Link className="text-link wrap-anywhere" to={`/resident/reports/${report.id}`} state={{from:returnPath}}>{report.title || (report.submission_stage === 'Draft' ? 'Untitled draft' : 'Untitled report')}</Link>;
  const columns = [
    {key:'reference_no',label:'Reference',render:report => report.reference_no || 'Private draft'},
    {key:'title',label:'Title',render:detailLink},
    {key:'category_id',label:'Category',render:categoryName},
    {key:'created_at',label:'Created',render:report => formatDate(report.created_at)},
    {key:'status',label:'Status',render:report => <StatusBadge status={label(report)} />},
  ];
  const emptyTitle = view === 'drafts' ? 'No private drafts' : view === 'cancelled' ? 'No cancelled reports' : 'No reports in this view';
  return <>
    <PageHeader title="My Reports" description="Follow your reports, private drafts, and status updates." action={<Link className="button button-primary" to="/resident/reports/new">Report an incident</Link>} />
    <div className="space-y-5">
      <section className="panel space-y-5 p-4 sm:p-5" aria-label="Report filters">
        <FilterSelect label="Records to show" value={view} onChange={event => update({view:event.target.value,page:1,status:'all'})} options={views} />
        <SearchBar label="Search your reports by title, reference, location or category" placeholder="Search your reports" value={search} onChange={event => update({q:event.target.value,page:1},true)} />
        {showStatus && <fieldset><legend className="mb-2 text-sm font-semibold">Status</legend><div className="flex flex-wrap gap-2">{groups.map(group => <Button key={group.value} variant={status === group.value ? 'primary' : 'secondary'} className="rounded-control" aria-pressed={status === group.value} onClick={() => update({status:group.value,page:1})}>{group.label}</Button>)}</div></fieldset>}
        <p className="text-xs leading-5 text-muted">Search and status filters apply across all your records in this view. Open means Submitted; Ongoing includes Under Investigation and Scheduled for Action.</p>
      </section>
      {ready && state.categoryWarning && <Alert>{state.categoryWarning}</Alert>}
      {ready && state.error ? <ErrorState message={state.error} onRetry={() => setRevision(value => value + 1)} /> : <section className="panel md:overflow-hidden" aria-label="Your reports">
        {ready && <p role="status" className="border-b border-line px-4 py-3 text-sm text-muted">{state.total} matching {state.total===1?'record':'records'}.</p>}
        {<DataTable columns={columns} rows={filtered} loading={!ready} caption="My reports" emptyTitle={search || status!=='all'?'No matching reports':emptyTitle} renderCard={report => <div className="space-y-3"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted"><span className="wrap-anywhere">{report.reference_no || 'Private draft'}</span><span>{formatDate(report.created_at)}</span></div><h2 className="text-base leading-6 font-semibold">{detailLink(report)}</h2><p className="text-sm text-muted">{categoryName(report)}</p><StatusBadge status={label(report)} /></div>} />}
        {ready && <Pagination page={page} pageSize={20} total={state.total} onPageChange={next => update({page:next})} />}
      </section>}
    </div>
  </>;
}
