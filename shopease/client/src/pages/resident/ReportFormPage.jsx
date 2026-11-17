import PendingPhotoPicker from '../../components/reports/PendingPhotoPicker';
import {createReportWithPhotos} from '../../services/reportSubmission';
import PhotoAttachments from '../../components/reports/PhotoAttachments';
import {useEffect, useRef, useState} from 'react';
import {Link, useLocation, useNavigate, useParams} from 'react-router-dom';
import {createDraft, createReport, getReport, saveReport, submitDraft} from '../../services/reports';
import {listCategories} from '../../services/categories';
import {reportPayload, validateReport} from '../../utils/validation';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ErrorState from '../../components/ui/ErrorState';
import EmptyState from '../../components/ui/EmptyState';

const emptyForm = {category_id:'',title:'',description:'',location:'',incident_date:''};
function message(error, fallback) {
  return typeof error.response?.data?.message === 'string' ? error.response.data.message : fallback;
}
function ReportEditor({id}) {
  const editing = Boolean(id);
  const validId = !editing || (/^[1-9]\d*$/.test(id) && Number(id) <= 4294967295);
  const navigate = useNavigate();
  const location = useLocation();
  const [attempt,setAttempt] = useState(0);
  const [loaded,setLoaded] = useState({loading:true,report:null,categories:[],error:'',notFound:false});
  const [form,setForm] = useState({...emptyForm});
  const [errors,setErrors] = useState({});
  const [error,setError] = useState('');
  const [notice,setNotice] = useState(location.state?.draftSaved ? 'Draft saved. You can continue editing it here.' : '');
  const [busy,setBusy] = useState(false);
  const [pendingPhotos,setPendingPhotos] = useState([]);
  const [recoveryId,setRecoveryId] = useState(null);
  const [photosBlocked,setPhotosBlocked] = useState(Boolean(id));
  const [uncertain,setUncertain] = useState(false);
  const [conflict,setConflict] = useState(false);
  const formRef = useRef(null);
  const mounted = useRef(true);
  const writing = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!validId) return;
    const controller = new AbortController();
    void Promise.all([listCategories(controller.signal),editing ? getReport(id,controller.signal) : Promise.resolve(null)]).then(([categories,data]) => {
      if (controller.signal.aborted) return;
      const report = data?.report || null;
      if (report) setForm({category_id:report.category_id === null ? '' : String(report.category_id),title:report.title || '',description:report.description || '',location:report.location || '',incident_date:report.incident_date || ''});
      setLoaded({loading:false,report,categories,error:'',notFound:false});
    }).catch(failure => {
      if (!controller.signal.aborted) setLoaded({loading:false,report:null,categories:[],error:message(failure,'We could not load the report form. Please try again.'),notFound:failure.response?.status === 404});
    });
    return () => controller.abort();
  }, [id,editing,validId,attempt]);
  function reload() {
    if (writing.current) return;
    setError(''); setNotice(''); setConflict(false); setUncertain(false);
    setLoaded(previous => ({...previous,loading:true}));
    setAttempt(value => value + 1);
  }
  function change(event) {
    const {name,value} = event.target;
    setForm(previous => ({...previous,[name]:value}));
    setErrors(previous => ({...previous,[name]:undefined}));
    setNotice('');
  }
  const draft = !editing || loaded.report?.submission_stage === 'Draft';
  const editable = !editing || (loaded.report && !loaded.report.cancelled_at && (loaded.report.submission_stage === 'Draft' || loaded.report.status === 'Submitted'));
  async function save(event) {
    event.preventDefault();
    if (writing.current || photosBlocked || uncertain || !editable) return;
    const intent = event.nativeEvent.submitter?.value || (draft ? 'draft' : 'save');
    const submit = !draft || intent === 'submit';
    const nextErrors = validateReport(form,{submit,activeCategoryIds:loaded.categories.map(category => category.id)});
    setErrors(nextErrors); setError(''); setNotice(''); setConflict(false);
    if (Object.keys(nextErrors).length) { formRef.current.elements.namedItem(Object.keys(nextErrors)[0])?.focus(); return; }
    writing.current = true; setBusy(true);
    let draftSaved = false;
    try {
      const details = reportPayload(form);
      if (!editing) {
        const created = pendingPhotos.length
          ? await createReportWithPhotos(details,pendingPhotos,{submit:intent === 'submit'})
          : intent === 'draft' ? await createDraft(details) : await createReport(details);
        if (!mounted.current) return;
        if (intent === 'draft') navigate(`/resident/reports/${created.id}/edit`,{replace:true,state:{draftSaved:true}});
        else navigate(`/resident/reports/${created.id}`,{replace:true,state:{notice:'Report submitted successfully.'}});
      } else {
        const saved=await saveReport(id,{...details,expected_token:loaded.report.edit_token});
        if(mounted.current)setLoaded(previous=>({...previous,report:{...previous.report,edit_token:saved.edit_token}}));
        if (draft && intent === 'submit') {
          draftSaved = true;
          await submitDraft(id);
        }
        if (!mounted.current) return;
        if (draft && intent === 'draft') setNotice('Draft saved. It remains private.');
        else navigate(`/resident/reports/${id}`,{replace:true,state:{notice:draft ? 'Report submitted successfully.' : 'Report changes saved.'}});
      }
    } catch (failure) {
      if (mounted.current) {
        const savedId = failure.savedReportId;
        const unconfirmedCreate = !editing && (!failure.response || failure.response.status >= 500);
        setRecoveryId(savedId || null);
        setUncertain(Boolean(savedId) || unconfirmedCreate);
        if (savedId) setNotice('Your report was saved. Photo upload or submission could not be confirmed. Open the saved report to check its photos and status before trying again.');
        setConflict(failure.response?.status === 409);
        if (draftSaved) setNotice('Your draft was saved, but submission was not confirmed. Check the saved report before trying again.');
        setError(message(failure,unconfirmedCreate ? 'We could not confirm the save. Check My Reports before trying again to avoid creating a duplicate.' : 'We could not confirm your changes. Check your saved report before trying again.'));
      }
    } finally { writing.current = false; if (mounted.current) setBusy(false); }
  }
  const back = <Link to={editing ? `/resident/reports/${id}` : '/resident/reports'} className="button button-secondary">{editing ? 'Back to report' : 'Back to My Reports'}</Link>;
  if (!validId || loaded.notFound) return <section className="panel"><EmptyState title="Report not found" action={<Link className="button button-secondary" to="/resident/reports">Back to My Reports</Link>}>This report does not exist or is not available to your account.</EmptyState></section>;
  if (loaded.loading) return <LoadingSpinner label="Loading report form..." />;
  if (loaded.error) return <div className="space-y-4">{back}<ErrorState message={loaded.error} onRetry={reload} /></div>;
  if (!editable) return <section className="panel"><EmptyState title="This report can no longer be edited" action={back}>Only private drafts and active Submitted reports can be edited.</EmptyState></section>;
  const unavailableCategory = form.category_id !== '' && !loaded.categories.some(category => String(category.id) === form.category_id);
  return <>
    <PageHeader title={editing ? draft ? 'Continue draft' : 'Edit report' : 'Report an incident'} description={draft ? 'Save an incomplete private draft, or submit a complete report to your barangay.' : 'Update your report while it is still Submitted.'} action={back} />
    <div className="mx-auto max-w-3xl space-y-5">
      {notice && <Alert variant="success">{notice}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {uncertain && <Link className="button button-secondary" to={recoveryId ? `/resident/reports/${recoveryId}` : "/resident/reports?view=all"}>{recoveryId ? "Open saved report" : "Check My Reports before saving again"}</Link>}
      {conflict && !recoveryId && <div className="space-y-3"><p className="text-sm leading-6 text-muted">The report may have changed. Reloading will discard unsaved changes.</p><Button variant="secondary" onClick={reload} disabled={busy}>Reload latest report</Button></div>}
      {unavailableCategory && <Alert>The selected category is no longer available for submission. Choose an active category before submitting or saving a submitted report.</Alert>}
      {!loaded.categories.length && <Alert>No active categories are available. {draft ? 'You can still save a private draft without a category.' : 'Ask your barangay to make a category available before saving.'}</Alert>}
      <section className="panel p-5 sm:p-7">
        <p className="mb-6 text-sm leading-6 text-muted">Fields marked <span className="text-red-700">*</span> are required to submit. {draft && 'Drafts may be incomplete.'}</p>
        <form ref={formRef} noValidate onSubmit={save} aria-label={editing ? 'Edit report' : 'Create report'} aria-busy={busy || undefined} className="space-y-5">
          <FormField id="report-category" label="Category" error={errors.category_id} required><select name="category_id" value={form.category_id} onChange={change} disabled={busy || uncertain}><option value="">Choose a category</option>{unavailableCategory && <option value={form.category_id} disabled>Unavailable category (#{form.category_id})</option>}{loaded.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></FormField>
          <FormField id="report-title" label="Title" error={errors.title} required><input name="title" maxLength={150} value={form.title} onChange={change} disabled={busy || uncertain} placeholder="Briefly describe the concern" /></FormField>
          <FormField id="report-description" label="Description" error={errors.description} required><textarea name="description" rows={6} maxLength={65535} value={form.description} onChange={change} disabled={busy || uncertain} placeholder="Describe what happened and any details that can help barangay staff." /></FormField>
          <FormField id="report-location" label="Location" error={errors.location} required><textarea name="location" rows={2} maxLength={255} value={form.location} onChange={change} disabled={busy || uncertain} placeholder="Street, purok, or nearby landmark" /></FormField>
          <FormField id="report-incident-date" label="Date and time of the concern" hint="When did the concern happen, or when did you notice it?" error={errors.incident_date} required><input type="datetime-local" name="incident_date" step={1} min="1000-01-01T00:00" value={form.incident_date} onChange={change} disabled={busy || uncertain} /></FormField>
          {editing ? <PhotoAttachments reportId={id} editable disabled={busy || uncertain} onBlocked={setPhotosBlocked}/> : <PendingPhotoPicker files={pendingPhotos} onChange={setPendingPhotos} disabled={busy || uncertain}/>}
          <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">{draft && <Button type="submit" name="intent" value="draft" variant="secondary" disabled={busy || uncertain || photosBlocked}>Save Draft</Button>}<Button type="submit" name="intent" value={draft ? 'submit' : 'save'} busy={busy} disabled={uncertain || photosBlocked || (!draft && !loaded.categories.length)}>{draft ? 'Submit Report' : 'Save changes'}</Button></div>
        </form>
      </section>
    </div>
  </>;
}
export default function ReportFormPage() {
  const {id} = useParams();
  return <ReportEditor key={id || 'new'} id={id} />;
}
