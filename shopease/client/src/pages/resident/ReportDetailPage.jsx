import useWriteAction from '../../hooks/useWriteAction';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Button from '../../components/ui/Button';
import WriteFeedback from '../../components/ui/WriteFeedback';
import PhotoAttachments from '../../components/reports/PhotoAttachments';
import {useEffect, useState} from 'react';
import {Link, useLocation, useParams} from 'react-router-dom';
import {getReport,cancelReport} from '../../services/reports';
import {getCategory} from '../../services/categories';
import {formatDateTime} from '../../utils/dates';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import StatusTimeline from '../../components/ui/StatusTimeline';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';
import Alert from '../../components/ui/Alert';

export default function ReportDetailPage() {
  const {id} = useParams();
  const action=useWriteAction();
  const [confirmCancel,setConfirmCancel]=useState(false);
  const location = useLocation();
  const validId = /^[1-9]\d*$/.test(id || '') && Number(id) <= 4294967295;
  const [revision,setRevision] = useState(0);
  const key = `${id}:${revision}`;
  const [state,setState] = useState({key:null,report:null,history:[],category:null,categoryWarning:'',error:'',notFound:false});
  const from = location.state?.from;
  const backPath = typeof from === 'string' && /^\/resident\/reports(?:\?|$)/.test(from) ? from : '/resident/reports';
  useEffect(() => {
    if (!validId) return;
    const controller = new AbortController();
    void getReport(id,controller.signal).then(async data => {
      let category = null;
      let categoryWarning = '';
      if (data.report.category_id !== null) {
        try { category = await getCategory(data.report.category_id,controller.signal); }
        catch { categoryWarning = 'The category name is currently unavailable.'; }
      }
      if (!controller.signal.aborted) setState({key,report:data.report,history:data.history,category,categoryWarning,error:'',notFound:false});
    }).catch(error => {
      if (controller.signal.aborted) return;
      setState({key,report:null,history:[],category:null,categoryWarning:'',notFound:error.response?.status === 404,error:typeof error.response?.data?.message === 'string' ? error.response.data.message : 'We could not load this report. Please try again.'});
    });
    return () => controller.abort();
  }, [id,key,validId]);
  const backLink = <Link to={backPath} className="button button-secondary">Back to My Reports</Link>;
  if (!validId || (state.key === key && state.notFound)) return <section className="panel"><EmptyState title="Report not found" action={backLink}>This report does not exist or is not available to your account.</EmptyState></section>;
  if (state.key !== key) return <LoadingSpinner label="Loading your report..." />;
  if (state.error) return <div className="space-y-4">{backLink}<ErrorState message={state.error} onRetry={() => setRevision(value => value + 1)} /></div>;
  const report = state.report;
  const draft = report.submission_stage === 'Draft';
  const cancelled = Boolean(report.cancelled_at);
  const badge = cancelled ? 'Cancelled' : draft ? 'Draft' : report.status;
  const editable = !cancelled && (draft || report.status === 'Submitted');
  const successNotice = ['Report submitted successfully.','Report changes saved.'].includes(location.state?.notice) ? location.state.notice : '';
  const categoryName = report.category_id === null ? 'Not selected' : state.category?.name || `Category unavailable (#${report.category_id})`;
  return <>
    <PageHeader title={report.title || (draft ? 'Untitled draft' : 'Untitled report')} description={report.reference_no || 'Private draft - no official reference number yet'} action={<div className="flex flex-wrap gap-3">{backLink}{editable && <Link className="button button-primary" to={`/resident/reports/${report.id}/edit`}>{draft ? 'Continue Draft' : 'Edit report'}</Link>}</div>} />
    <div className="space-y-5">
      <WriteFeedback action={action} onReload={()=>setRevision(value=>value+1)}/>
      {!cancelled && !draft && report.status==='Submitted' && <div><Button variant="secondary" disabled={action.busy} onClick={()=>{action.reset();setConfirmCancel(true);}}>Cancel this report</Button></div>}
      {successNotice && <Alert variant="success">{successNotice}</Alert>}
      {draft && <Alert>This draft is private. Processing history begins when it is submitted.</Alert>}
      {cancelled && <Alert>This report was cancelled and is retained for your records.</Alert>}
      {!cancelled && report.status === 'Resolved' && <Alert variant="success">This report is resolved and cannot be reopened.</Alert>}
      {state.categoryWarning && <Alert>{state.categoryWarning}</Alert>}
      <section className="panel p-5 sm:p-6" aria-labelledby="report-information-title"><h2 id="report-information-title" className="mb-5 text-lg font-semibold">Report information</h2><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <div><dt className="text-sm text-muted">Status</dt><dd className="mt-2"><StatusBadge status={badge} />{cancelled && <p className="mt-2 text-xs text-muted">Last processing status: {report.status}</p>}</dd></div>
        <div><dt className="text-sm text-muted">Category</dt><dd className="mt-2 text-sm font-medium wrap-anywhere">{categoryName}</dd></div>
        <div><dt className="text-sm text-muted">Incident date and time</dt><dd className="mt-2 text-sm font-medium">{formatDateTime(report.incident_date)}</dd></div>
        <div><dt className="text-sm text-muted">Created</dt><dd className="mt-2 text-sm font-medium">{formatDateTime(report.created_at)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-muted">Location</dt><dd className="mt-2 text-sm leading-6 whitespace-pre-wrap wrap-anywhere">{report.location || 'Not entered'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-muted">Description</dt><dd className="mt-2 text-sm leading-7 whitespace-pre-wrap wrap-anywhere">{report.description || 'Not entered'}</dd></div>
        {cancelled && <div><dt className="text-sm text-muted">Cancelled on</dt><dd className="mt-2 text-sm font-medium">{formatDateTime(report.cancelled_at)}</dd></div>}
      </dl><p className="mt-6 border-t border-line pt-4 text-xs text-muted">All dates and times are shown in Philippine time (Asia/Manila).</p></section>
      <section className="panel p-5 sm:p-6"><PhotoAttachments key={report.id} reportId={report.id}/></section>
      <section className="panel p-5 sm:p-6" aria-labelledby="report-history-title"><h2 id="report-history-title" className="mb-5 text-lg font-semibold">Status history and staff remarks</h2><StatusTimeline entries={state.history} formatDate={formatDateTime} /></section>
    </div>
    <ConfirmDialog error={action.error} open={confirmCancel} title="Cancel this report?" description="This cancellation is final. Your report is retained, but barangay processing will stop. File a new report if you need to raise the concern again." confirmLabel="Cancel report" dangerous busy={action.busy} onCancel={()=>{if(!action.busy)setConfirmCancel(false);}} onConfirm={()=>void action.run(()=>cancelReport(id),()=>{setConfirmCancel(false);setRevision(value=>value+1);})}/>
  </>;
}
