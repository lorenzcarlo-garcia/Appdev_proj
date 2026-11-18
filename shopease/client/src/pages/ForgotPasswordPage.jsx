import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Mail,ShieldCheck} from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import {requestPasswordReset,resetForgottenPassword} from '../services/auth';
import {authErrorMessage} from '../utils/validation';

export default function ForgotPasswordPage(){
  const navigate=useNavigate();
  const [email,setEmail]=useState('');
  const [requestId,setRequestId]=useState(null);
  const [form,setForm]=useState({code:'',new_password:'',confirm_password:''});
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [cooldown,setCooldown]=useState(0);
  const writing=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const cooling=cooldown>0;
  useEffect(()=>{
    if(!cooling)return;
    const timer=setInterval(()=>setCooldown(value=>Math.max(0,value-1)),1000);
    return()=>clearInterval(timer);
  },[cooling]);
  async function sendCode(event){
    event?.preventDefault();
    if(writing.current)return;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length>150){setError('Enter your registered email address.');return;}
    writing.current=true;setBusy(true);setError('');
    try{
      const result=await requestPasswordReset(email.trim().toLowerCase());
      if(mounted.current){setRequestId(result.request_id);setNotice(result.message);setForm({code:'',new_password:'',confirm_password:''});setCooldown(60);}
    }catch(failure){if(mounted.current)setError(authErrorMessage(failure,'We could not request a reset code. Check your connection and try again.'));}
    finally{writing.current=false;if(mounted.current)setBusy(false);}
  }
  async function reset(event){
    event.preventDefault();if(writing.current)return;
    if(!/^\d{8}$/.test(form.code)){setError('Enter the eight-digit code from your email.');return;}
    if(form.new_password.length<12 || form.new_password.length>128){setError('Use 12-128 characters for the new password.');return;}
    if(form.new_password!==form.confirm_password){setError('New password and confirmation must match.');return;}
    writing.current=true;setBusy(true);setError('');
    try{
      await resetForgottenPassword({request_id:requestId,...form});
      if(mounted.current){setForm({code:'',new_password:'',confirm_password:''});navigate('/login',{replace:true,state:{passwordChanged:true}});}
    }catch(failure){if(mounted.current)setError(authErrorMessage(failure,'We could not confirm your password reset. Try logging in with your new password before requesting another code.'));}
    finally{writing.current=false;if(mounted.current)setBusy(false);}
  }
  return <AuthLayout title={requestId?'Choose a new password':'Forgot password?'} description={requestId?'Enter the code from your email and choose a new password.':'We will email a reset code to the address registered with your account.'} footer={<Link to="/login" className="text-link">Back to log in</Link>}>
    <div className="space-y-5">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert>{notice}</Alert>}
      {!requestId?<form onSubmit={sendCode} className="space-y-5" aria-label="Request a password reset">
        <FormField id="recovery-email" label="Registered email" required><input type="email" name="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={150} disabled={busy} placeholder="you@example.com"/></FormField>
        <Button type="submit" busy={busy} className="w-full"><Mail size={18} aria-hidden="true"/>Send reset code</Button>
        <p className="text-sm leading-6 text-muted">Keep BantayLog open on your phone or laptop while you check your email. No access to your email? Contact the barangay administrator.</p>
      </form>:<>
        <p className="rounded-control border border-line bg-canvas px-4 py-3 text-sm wrap-anywhere">Reset requested for <strong>{email.trim()}</strong></p>
        <form onSubmit={reset} className="space-y-5" aria-label="Reset your password">
          <FormField id="recovery-code" label="Eight-digit reset code" hint="Codes expire after 15 minutes. Only the latest code is valid." required><input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={form.code} onChange={event=>setForm(previous=>({...previous,code:event.target.value.replace(/\D/g,'')}))} disabled={busy} className="font-mono tracking-[.2em]"/></FormField>
          <FormField id="recovery-password" label="New password" hint="Use 12-128 characters." required><input type="password" name="new_password" autoComplete="new-password" minLength={12} maxLength={128} value={form.new_password} onChange={event=>setForm(previous=>({...previous,new_password:event.target.value}))} disabled={busy}/></FormField>
          <FormField id="recovery-confirm" label="Confirm new password" required><input type="password" name="confirm_password" autoComplete="new-password" minLength={12} maxLength={128} value={form.confirm_password} onChange={event=>setForm(previous=>({...previous,confirm_password:event.target.value}))} disabled={busy}/></FormField>
          <Button type="submit" busy={busy} className="w-full"><ShieldCheck size={18} aria-hidden="true"/>Reset password</Button>
        </form>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button variant="secondary" onClick={()=>void sendCode()} disabled={busy || cooling}>{cooling?`Send again in ${cooldown}s`:'Send another code'}</Button>
          <button type="button" className="text-link" disabled={busy} onClick={()=>{setRequestId(null);setForm({code:'',new_password:'',confirm_password:''});setError('');setNotice('');}}>Use a different email</button>
        </div>
      </>}
    </div>
  </AuthLayout>;
}
