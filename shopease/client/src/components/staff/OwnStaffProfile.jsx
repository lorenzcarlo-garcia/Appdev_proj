import {useState} from 'react';
import {UserRound,PenLine} from 'lucide-react';
import useResource from '../../hooks/useResource';
import useWriteAction from '../../hooks/useWriteAction';
import {getOwnStaffProfile,saveOwnStaffProfile} from '../../services/management';
import {residentForm,residentPayload} from '../../utils/residents';
import {formatDate} from '../../utils/dates';
import PersonalFields from '../residents/ResidentFields';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorState from '../ui/ErrorState';
import WriteFeedback from '../ui/WriteFeedback';
import RecordDetails from '../ui/RecordDetails';
import Alert from '../ui/Alert';

export default function OwnStaffProfile(){
  const resource=useResource(getOwnStaffProfile),action=useWriteAction();
  const [form,setForm]=useState(null),[notice,setNotice]=useState('');
  const profile=resource.data.profile;
  const completed=Boolean(profile?.version);
  function close(){if(!action.busy)setForm(null);}
  return <section className="panel p-5 sm:p-7" aria-labelledby="staff-personal-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3"><span className="service-card-icon" aria-hidden="true"><UserRound size={23}/></span><div><h2 id="staff-personal-title" className="text-xl font-semibold text-brand-dark">Personal information</h2><p className="mt-1 text-sm text-muted">Your details for your barangay personnel account.</p></div></div>
      {profile && <Button variant="secondary" onClick={()=>{action.reset();setNotice('');setForm(residentForm(profile));}}><PenLine size={16} aria-hidden="true"/>{completed?'Edit my details':'Add my details'}</Button>}
    </div>
    {resource.loading?<LoadingSpinner label="Loading your personal information..."/>:resource.error?<div className="mt-5"><ErrorState message={resource.error} onRetry={resource.reload}/></div>:completed?<div className="mt-6 border-t border-line pt-5"><RecordDetails items={[
      ['Full name',[profile.first_name,profile.middle_name,profile.last_name].filter(Boolean).join(' ')],
      ['Birth date',formatDate(profile.birth_date)],['Contact number',profile.contact_no],['Address',profile.address],
    ]}/></div>:<p className="mt-5 rounded-control bg-canvas px-4 py-4 text-sm leading-7 text-muted">Add your name, address, birth date and contact number. Your sign-in email and account role are managed separately.</p>}
    {notice && <div className="mt-5"><Alert variant="success">{notice}</Alert></div>}
    {form && <Modal open title={completed?'Edit my personal information':'Add my personal information'} description="First name, last name and address are required. Birth date, middle name and contact number are optional. This does not change your role or permissions." onClose={close}>
      <form className="space-y-5" aria-label="My personal information" onSubmit={event=>{event.preventDefault();void action.run(()=>saveOwnStaffProfile(residentPayload(form)),result=>{setForm(null);setNotice(result.changed?'Your personal information has been saved.':'Your personal information is unchanged.');resource.reload();});}}>
        <WriteFeedback action={action} onReload={()=>{setForm(null);resource.reload();}}/>
        <PersonalFields form={form} disabled={action.busy} onChange={event=>{const {name,value}=event.target;setForm(previous=>({...previous,[name]:value}));}}/>
        <div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" onClick={close} disabled={action.busy}>Cancel</Button><Button type="submit" busy={action.busy}>Save my details</Button></div>
      </form>
    </Modal>}
  </section>;
}
