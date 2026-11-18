import {useState} from 'react';
import {Link} from 'react-router-dom';
import {Megaphone} from 'lucide-react';
import useResource from '../../hooks/useResource';
import useWriteAction from '../../hooks/useWriteAction';
import {getReportCommunityUpdate,createReportCommunityUpdate} from '../../services/communityUpdates';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import Modal from '../ui/Modal';
import ErrorState from '../ui/ErrorState';
import WriteFeedback from '../ui/WriteFeedback';
import Alert from '../ui/Alert';

export default function ReportCommunityShare({report}){
  const linked=useResource(getReportCommunityUpdate,{reportId:report.id}),action=useWriteAction();
  const [form,setForm]=useState(null);
  const update=linked.data.updates?.[0];
  return <section className="panel space-y-4 p-5 sm:p-7">
    <div className="flex items-center gap-3"><span className="service-card-icon" aria-hidden="true"><Megaphone size={22}/></span><h2 className="text-xl font-semibold text-brand-dark">Share a community issue</h2></div>
    <p className="text-sm leading-7 text-muted">Let residents follow barangay action on this concern. Write a separate public summary using a shared location. Names, private case details and report photos must stay private.</p>
    <WriteFeedback action={action} onReload={()=>{setForm(null);linked.reload();}}/>
    {linked.loading?<p className="text-sm text-muted">Checking for a community update...</p>:linked.error?<ErrorState message={linked.error} onRetry={linked.reload}/>:update?<>
      <Alert>{update.publication_state==='Published'?'A reviewed summary is visible in the resident community feed. Its progress follows this report.':update.publication_state==='Archived'?'The linked community update is archived and hidden from residents.':'A private community-update draft is ready for review. Residents cannot see it yet.'}</Alert>
      <Link className="button button-secondary" to="/admin/community-updates">Review community updates</Link>
    </>:!report.cancelled_at?<Button onClick={()=>{action.reset();setForm({title:'',summary:'',location:'',expected_report_token:report.edit_token});}}>Prepare public summary</Button>:<p className="text-sm text-muted">Cancelled reports cannot be shared.</p>}
    {form && <Modal open title="Prepare a public issue summary" description="Nothing from the private report is copied automatically. This saves a draft; review and publication are separate steps." onClose={()=>{if(!action.busy)setForm(null);}}>
      <form className="space-y-5" onSubmit={event=>{event.preventDefault();void action.run(()=>createReportCommunityUpdate(report.id,form),()=>{setForm(null);linked.reload();},{create:true});}}>
        <WriteFeedback action={action} onReload={()=>{setForm(null);linked.reload();}}/>
        <FormField label="Public issue title" required><input name="title" maxLength={150} value={form.title} onChange={event=>setForm(previous=>({...previous,title:event.target.value}))} disabled={action.busy}/></FormField>
        <FormField label="Shared area or landmark" hint="Use a public street or landmark, without a resident's personal address." required><input name="location" maxLength={255} value={form.location} onChange={event=>setForm(previous=>({...previous,location:event.target.value}))} disabled={action.busy}/></FormField>
        <FormField label="Public summary" hint="Describe the community issue and barangay action. Leave out names, contact details and confidential allegations." required><textarea name="summary" rows={5} maxLength={2000} value={form.summary} onChange={event=>setForm(previous=>({...previous,summary:event.target.value}))} disabled={action.busy}/></FormField>
        <Alert>Progress follows the source report. Review and publish this draft in Community Updates before residents can see it.</Alert>
        <div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={action.busy} onClick={()=>setForm(null)}>Close</Button><Button type="submit" busy={action.busy}>Save public-summary draft</Button></div>
      </form>
    </Modal>}
  </section>;
}
