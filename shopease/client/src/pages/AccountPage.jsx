import OwnProfile from '../components/residents/OwnProfile';
import {useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../hooks/useAuth';
import {validatePasswordChange,authErrorMessage} from '../utils/validation';
import PageHeader from '../components/ui/PageHeader';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
const blank={current_password:'',new_password:'',confirm_password:''};
const labels={resident:'Resident',staff:'Staff',secretary:'Secretary',captain:'Captain',super_admin:'Super Admin'};
export default function AccountPage(){
  const {user,changePassword}=useAuth();const navigate=useNavigate();
  const [form,setForm]=useState({...blank});const [errors,setErrors]=useState({});
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [uncertain,setUncertain]=useState(false);
  const writing=useRef(false),mounted=useRef(true),formRef=useRef(null);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  function change(event){const {name,value}=event.target;setForm(previous=>({...previous,[name]:value}));setErrors(previous=>({...previous,[name]:undefined}));}
  async function submit(event){
    event.preventDefault();if(writing.current || uncertain)return;
    const next=validatePasswordChange(form);setErrors(next);setError('');
    if(Object.keys(next).length){formRef.current.elements.namedItem(Object.keys(next)[0])?.focus();return;}
    writing.current=true;setBusy(true);
    try{
      await changePassword(form);
      navigate('/login',{replace:true,state:{passwordChanged:true}});
    }catch(failure){if(mounted.current){
      const unconfirmed=!failure.response || failure.response.status>=500 || failure.response.status===409;
      setUncertain(unconfirmed);setForm({...blank});
      setError(unconfirmed?'We could not confirm the password change. Use Log out, then check whether you can log in with your new password before trying again.':authErrorMessage(failure,'We could not change your password. Please try again.'));
    }}finally{writing.current=false;if(mounted.current)setBusy(false);}
  }
  return <><PageHeader title="My account" description="Manage the password you use to sign in to BantayLog."/>
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="panel p-5 sm:p-7" aria-label="Account information"><dl className="space-y-4"><div><dt className="text-sm text-muted">Email</dt><dd className="mt-1 font-medium wrap-anywhere">{user.email}</dd></div><div><dt className="text-sm text-muted">Account role</dt><dd className="mt-1 font-medium">{labels[user.role]}</dd></div></dl></section>
      {user.role==='resident' && <OwnProfile/>}
      <section className="panel p-5 sm:p-7" aria-labelledby="change-password-title"><h2 id="change-password-title" className="text-lg font-semibold">Change password</h2><p className="mt-2 text-sm leading-6 text-muted">Choose a unique password with 12-128 characters. After changing it, you will be signed out on this device and your other devices.</p>
        <form ref={formRef} noValidate onSubmit={submit} aria-label="Change password" aria-busy={busy || undefined} className="mt-6 space-y-5">
          {error && <Alert variant="error">{error}</Alert>}
          <FormField label="Current password" error={errors.current_password} required><input type="password" name="current_password" autoComplete="current-password" maxLength={128} value={form.current_password} onChange={change} disabled={busy || uncertain}/></FormField>
          <FormField label="New password" hint="Use a password you do not use for other accounts." error={errors.new_password} required><input type="password" name="new_password" autoComplete="new-password" minLength={12} maxLength={128} value={form.new_password} onChange={change} disabled={busy || uncertain}/></FormField>
          <FormField label="Confirm new password" error={errors.confirm_password} required><input type="password" name="confirm_password" autoComplete="new-password" minLength={12} maxLength={128} value={form.confirm_password} onChange={change} disabled={busy || uncertain}/></FormField>
          <Button type="submit" busy={busy} disabled={uncertain} className="w-full sm:w-auto">Change password and sign out</Button>
        </form>
      </section>
    </div>
  </>;
}
