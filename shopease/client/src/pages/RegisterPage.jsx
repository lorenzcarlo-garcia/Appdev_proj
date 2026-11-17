import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerResident } from '../services/auth';
import { authErrorMessage, registrationPayload, todayInManila, validateRegistration } from '../utils/validation';
import AuthLayout from '../layouts/AuthLayout';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';

const initialForm = {email:'',password:'',confirm_password:'',first_name:'',middle_name:'',last_name:'',birth_date:'',contact_no:'',address:''};
export default function RegisterPage() {
  const [form,setForm] = useState(initialForm);
  const [errors,setErrors] = useState({});
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const navigate = useNavigate();
  const formRef = useRef(null);
  const mounted = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function change(event) {
    const {name,value} = event.target;
    setForm(previous => ({...previous,[name]:value}));
    setErrors(previous => ({...previous,[name]:undefined,...(name==='password'?{confirm_password:undefined}:{})}));
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    const nextErrors = validateRegistration(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { formRef.current.elements.namedItem(Object.keys(nextErrors)[0])?.focus(); return; }
    submitting.current = true; setBusy(true);
    try {
      await registerResident(registrationPayload(form));
      if (!mounted.current) return;
      setForm(initialForm);
      navigate('/login',{replace:true,state:{registrationSuccess:true}});
    } catch (failure) {
      if (mounted.current) {
        setError(authErrorMessage(failure,'We could not create your account. Check your connection and try again.'));
        setForm(previous => ({...previous,password:'',confirm_password:''}));
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const input = (name, props = {}) => <input name={name} value={form[name]} onChange={change} disabled={busy} {...props} />;
  return <AuthLayout title="Create an account" description="Register as a resident to report and track community concerns." wide footer={<>Already have an account? <Link to="/login" className="text-link">Log in</Link></>}>
    <div className="space-y-5">{error && <Alert variant="error">{error}</Alert>}
      <p className="text-sm text-muted">Fields marked <span className="text-red-700">*</span> are required.</p>
      <form ref={formRef} noValidate onSubmit={submit} aria-label="Resident registration" aria-busy={busy || undefined} className="space-y-6">
        <fieldset disabled={busy} className="min-w-0 space-y-4"><legend className="mb-4 text-base font-semibold">Resident details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="register-first-name" label="First name" error={errors.first_name} required>{input('first_name',{autoComplete:'given-name',maxLength:80})}</FormField>
            <FormField id="register-last-name" label="Last name" error={errors.last_name} required>{input('last_name',{autoComplete:'family-name',maxLength:80})}</FormField>
            <FormField id="register-middle-name" label="Middle name (optional)" error={errors.middle_name}>{input('middle_name',{autoComplete:'additional-name',maxLength:80})}</FormField>
            <FormField id="register-birth-date" label="Birth date (optional)" error={errors.birth_date}>{input('birth_date',{type:'date',autoComplete:'bday',min:'1000-01-01',max:todayInManila()})}</FormField>
          </div>
          <FormField id="register-contact" label="Contact number (optional)" error={errors.contact_no}>{input('contact_no',{type:'tel',autoComplete:'tel',maxLength:20})}</FormField>
          <FormField id="register-address" label="Address" error={errors.address} required><textarea name="address" autoComplete="street-address" rows={3} maxLength={255} value={form.address} onChange={change} disabled={busy} /></FormField>
        </fieldset>
        <fieldset disabled={busy} className="min-w-0 space-y-4 border-t border-line pt-5"><legend className="pr-2 text-base font-semibold">Login details</legend>
          <FormField id="register-email" label="Email" error={errors.email} required>{input('email',{type:'email',autoComplete:'username',inputMode:'email',autoCapitalize:'none',spellCheck:false,maxLength:150,placeholder:'you@example.com'})}</FormField>
          <fieldset className="space-y-3" aria-describedby="register-password-guidance"><legend className="sr-only">Password and confirmation</legend><p id="register-password-guidance" className="text-sm text-muted">Use 12-128 characters for the password.</p><div className="grid gap-4 sm:grid-cols-2">
            <FormField id="register-password" label="Password" error={errors.password} required>{input('password',{type:'password',autoComplete:'new-password',minLength:12,maxLength:128})}</FormField>
            <FormField id="register-confirm-password" label="Confirm password" error={errors.confirm_password} required>{input('confirm_password',{type:'password',autoComplete:'new-password',minLength:12,maxLength:128})}</FormField>
          </div></fieldset>
        </fieldset>
        <p className="text-sm leading-6 text-muted">You can report concerns after creating your account. Your resident details may be verified later.</p>
        <Button type="submit" busy={busy} className="w-full">Create account</Button>
      </form>
    </div>
  </AuthLayout>;
}
