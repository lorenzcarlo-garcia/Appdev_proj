import {useEffect,useRef,useState} from 'react';
import {Plus} from 'lucide-react';
import {useAuth} from '../../hooks/useAuth';
import {maintenanceStatuses,listCommunityUpdates,createCommunityUpdate,saveCommunityUpdate,publishCommunityUpdate,archiveCommunityUpdate} from '../../services/communityUpdates';
import CommunityUpdateCard from './CommunityUpdateCard';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import LoadingSpinner from '../ui/LoadingSpinner';
import FormField from '../ui/FormField';
import Modal from '../ui/Modal';
import Pagination from '../ui/Pagination';
const blank={title:'',summary:'',location:'',maintenance_status:'Planned'};
const managers=['secretary','captain','super_admin'];
function explanation(error){return typeof error.response?.data?.message==='string' ? error.response.data.message : 'We could not confirm your changes. Reload the updates before trying again.';}
export default function CommunityUpdatesPanel({management=false}){
  const {user}=useAuth();const manage=management && managers.includes(user.role);
  const [query,setQuery]=useState({view:manage?'all':'published',maintenance_status:'',type:'',q:'',page:1});
  const filtered=Boolean(query.q || query.maintenance_status || query.type || (manage && query.view!=='all'));
  const [search,setSearch]=useState('');const [revision,setRevision]=useState(0);
  const key=JSON.stringify([manage,query,revision]);
  const [state,setState]=useState({key:null,updates:[],total:0,error:''});
  const [editor,setEditor]=useState(null);const [form,setForm]=useState({...blank});const [errors,setErrors]=useState({});
  const [confirmation,setConfirmation]=useState(null);const [busy,setBusy]=useState(false);
  const [saveError,setSaveError]=useState('');const [notice,setNotice]=useState('');const [uncertain,setUncertain]=useState(false);
  const writing=useRef(false);const mounted=useRef(true);const formRef=useRef(null);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    const controller=new AbortController();const [,params]=JSON.parse(key);
    listCommunityUpdates({...params,page_size:10},controller.signal).then(data=>{
      if(!controller.signal.aborted){setState({key,updates:data.updates,total:data.total,error:''});setUncertain(false);}
    }).catch(error=>{if(!controller.signal.aborted)setState({key,updates:[],total:0,error:explanation(error)});});
    return ()=>controller.abort();
  },[key]);
  function reload(){setRevision(value=>value+1);}
  function filter(values){setQuery(previous=>({...previous,...values,page:1}));}
  function openEditor(row){if(writing.current || uncertain)return;setSaveError('');setErrors({});setEditor({row});setForm(row?{title:row.title,summary:row.summary,location:row.location,maintenance_status:row.maintenance_status}:{...blank});}
  function close(){if(!writing.current)setEditor(null);}
  function change(event){const {name,value}=event.target;setForm(previous=>({...previous,[name]:value}));setErrors(previous=>({...previous,[name]:undefined}));}
  async function write(action){
    if(writing.current || uncertain)return;writing.current=true;setBusy(true);setSaveError('');setNotice('');
    const creation=action.kind==='save' && !action.row;
    try{
      if(action.kind==='publish')await publishCommunityUpdate(action.row.id,action.row.version);
      else if(action.kind==='archive')await archiveCommunityUpdate(action.row.id,action.row.version);
      else if(action.row)await saveCommunityUpdate(action.row.id,{...action.details,expected_version:action.row.version,...(action.row.publication_state==='Published'?{confirm:true}:{})});
      else await createCommunityUpdate(action.details);
      if(!mounted.current)return;
      setEditor(null);setConfirmation(null);setNotice(action.kind==='publish'?'Update published. Residents can now see it.':action.kind==='archive'?'Update archived and hidden from residents.':creation?'Draft saved. Review it before publishing.':'Update changes saved.');reload();
    }catch(error){if(mounted.current){setSaveError(explanation(error));setConfirmation(null);if(creation && (!error.response || error.response.status>=500))setUncertain(true);}}
    finally{writing.current=false;if(mounted.current)setBusy(false);}
  }
  function save(event){
    event.preventDefault();if(writing.current || uncertain)return;
    const next={};for(const [field,max]of [['title',150],['summary',2000],['location',255]])if(!form[field].trim() || [...form[field].trim()].length>max)next[field]=`Enter 1-${max} characters.`;
    if(!maintenanceStatuses.includes(form.maintenance_status))next.maintenance_status='Choose a progress status.';
    setErrors(next);if(Object.keys(next).length){formRef.current.elements.namedItem(Object.keys(next)[0])?.focus();return;}
    const action={kind:'save',row:editor.row,details:{title:form.title.trim(),summary:form.summary.trim(),location:form.location.trim(),maintenance_status:form.maintenance_status}};
    if(editor.row?.publication_state==='Published')setConfirmation(action);else void write(action);
  }
  const loading=state.key!==key;
  function actions(row){if(!manage || row.publication_state==='Archived')return null;return <><Button variant="secondary" disabled={busy || uncertain} onClick={()=>openEditor(row)}>Edit</Button>{row.publication_state==='Draft' && <Button disabled={busy || uncertain} onClick={()=>{setSaveError('');setConfirmation({kind:'publish',row});}}>Review and publish</Button>}<Button variant="secondary" disabled={busy || uncertain} onClick={()=>{setSaveError('');setConfirmation({kind:'archive',row});}}>Archive</Button></>;}
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Community issues and maintenance</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{manage?'Prepare a community summary, review it, then publish it for residents.':'Follow planned action, ongoing work and resolved issues reported in your community. Only reviewed summaries are shared.'}</p></div>{manage && <Button disabled={busy || uncertain} onClick={()=>openEditor(null)}><Plus size={18} aria-hidden="true"/>New update</Button>}</div>
    {notice && <Alert variant="success">{notice}</Alert>}
    {saveError && !editor && <Alert variant="error">{saveError}</Alert>}
    {uncertain && !editor && <Alert>Creation could not be confirmed. Reload and check the update list before creating another draft. <Button variant="secondary" onClick={reload}>Reload updates</Button></Alert>}
    <section className="panel p-4 sm:p-5" aria-label="Update filters"><form onSubmit={event=>{event.preventDefault();filter({q:search.trim()});}} className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><FormField label="Search updates"><input type="search" maxLength={100} value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search title, summary or location"/></FormField></div><Button type="submit" variant="secondary">Search</Button></div><div className="grid gap-4 sm:grid-cols-2"><FormField label="Update type"><select value={query.type} onChange={event=>filter({type:event.target.value})}><option value="">All updates</option><option value="Reported issue">Resident-reported issues</option><option value="Maintenance">Maintenance</option></select></FormField><FormField label="Progress"><select value={query.maintenance_status} onChange={event=>filter({maintenance_status:event.target.value})}><option value="">All progress</option>{maintenanceStatuses.map(status=><option key={status} value={status}>{status==='Completed'?'Resolved / Completed':status}</option>)}</select></FormField>{manage && <FormField label="Visibility"><select value={query.view} onChange={event=>filter({view:event.target.value})}><option value="all">All updates</option><option value="drafts">Drafts</option><option value="published">Published</option><option value="archived">Archived</option></select></FormField>}</div></form></section>
    {loading?<LoadingSpinner label="Loading community updates..."/>:state.error?<ErrorState message={state.error} onRetry={reload}/>:<><div className="grid items-start gap-5 xl:grid-cols-2">{state.updates.map(update=><CommunityUpdateCard key={update.id} update={update} management={manage} actions={actions(update)}/>)}</div>{!state.updates.length && <section className="panel"><EmptyState title={filtered?'No matching updates':'No community updates yet'}>{filtered?'Try a different search, type or progress filter.':manage?'Create a draft and review the summary before publishing.':'Reviewed issues reported by residents and barangay maintenance updates will appear here once published.'}</EmptyState></section>}{state.total>0 && <section className="panel"><Pagination page={query.page} pageSize={10} total={state.total} busy={busy} onPageChange={page=>setQuery(previous=>({...previous,page}))}/></section>}</>}
    {management && <p className="text-xs leading-5 text-muted">Secretary, Captain and Super Admin manage these summaries. Archived updates are retained. Only separately reviewed summaries are published. Private incident reports, resident identities, blotters and report photos remain private.</p>}
    {editor && !confirmation && <Modal open onClose={close} title={editor.row?'Edit community update':'Prepare a community update'} description="Use a shared area or landmark. Do not include resident names, contact details, private case information or personal addresses."><form ref={formRef} noValidate onSubmit={save} className="space-y-5">
      {saveError && <Alert variant="error">{saveError}</Alert>}
      {uncertain && <Alert>Creation was not confirmed. Close this form and reload the list before trying again.</Alert>}
      <FormField label="Title" error={errors.title} required><input name="title" maxLength={150} value={form.title} onChange={change} disabled={busy || uncertain} autoFocus/></FormField>
      <FormField label="Shared location" error={errors.location} hint="For example: the barangay hall or a public street." required><input name="location" maxLength={255} value={form.location} onChange={change} disabled={busy || uncertain}/></FormField>
      <FormField label="Community summary" error={errors.summary} required><textarea name="summary" rows={6} maxLength={2000} value={form.summary} onChange={change} disabled={busy || uncertain}/></FormField>
      <FormField label="Progress" hint={editor.row?.source_report_id?'Progress follows the source report. Update its processing status to change this.':undefined} error={errors.maintenance_status} required><select name="maintenance_status" value={form.maintenance_status} onChange={change} disabled={busy || uncertain || Boolean(editor.row?.source_report_id)}>{maintenanceStatuses.map(status=><option key={status}>{status}</option>)}</select></FormField>
      <div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" onClick={close} disabled={busy}>Close</Button>{saveError && editor.row && <Button variant="secondary" disabled={busy} onClick={()=>{setEditor(null);reload();}}>Discard changes and reload</Button>}<Button type="submit" busy={busy} disabled={uncertain}>{editor.row?.publication_state==='Published'?'Review public changes':editor.row?'Save draft changes':'Save draft'}</Button></div>
    </form></Modal>}
    {confirmation && <Modal open onClose={()=>{if(!writing.current)setConfirmation(null);}} title={confirmation.kind==='archive'?'Archive this update?':confirmation.kind==='publish'?'Publish this update?':'Save these public changes?'}>
      <div className="space-y-5"><Alert>{confirmation.kind==='archive'?'Residents will no longer see this update. It will be retained as a read-only archive.':'Read the summary below. Confirm it contains no resident names, contact details, private case information or personal addresses. Residents will see this text immediately.'}</Alert><CommunityUpdateCard update={{...confirmation.row,...confirmation.details}}/><div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={()=>setConfirmation(null)}>Go back</Button><Button variant={confirmation.kind==='archive'?'danger':'primary'} busy={busy} onClick={()=>void write(confirmation)}>{confirmation.kind==='archive'?'Confirm archive':confirmation.kind==='publish'?'Reviewed - publish':'Reviewed - save changes'}</Button></div></div>
    </Modal>}
  </div>;
}
