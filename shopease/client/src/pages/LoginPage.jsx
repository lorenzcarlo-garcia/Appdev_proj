import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { login } from '../services/auth';
import { authErrorMessage, validateLogin } from '../utils/validation';
import AuthLayout from '../layouts/AuthLayout';
import FormField from '../components/ui/FormField';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';

export default function LoginPage() {
  const {error:sessionError,refresh} = useAuth();
  const location = useLocation();
  const [form,setForm] = useState({email:'',password:''});
  const [errors,setErrors] = useState({});
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [attempted,setAttempted] = useState(false);
  const formRef = useRef(null);
  const mounted = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function change(event) {
    const {name,value} = event.target;
    setForm(previous => ({...previous,[name]:value}));
    setErrors(previous => ({...previous,[name]:undefined}));
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setAttempted(true); setError('');
    const nextErrors = validateLogin(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { formRef.current.elements.namedItem(Object.keys(nextErrors)[0])?.focus(); return; }
    submitting.current = true; setBusy(true);
    try {
      await login({email:form.email.trim().toLowerCase(),password:form.password});
      if (!mounted.current) return;
      setForm(previous => ({...previous,password:''}));
      // The public route redirects to the user's portal after /auth/me confirms it.
      await refresh();
    } catch (failure) {
      if (mounted.current) {
        setError(authErrorMessage(failure,'We could not log you in. Check your connection and try again.'));
        setForm(previous => ({...previous,password:''}));
        formRef.current?.elements.namedItem('password')?.focus();
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <AuthLayout title="Log in" footer={<>New resident? <Link to="/register" className="text-link">Create an account</Link></>}>
    <div className="space-y-5">
      {location.state?.registrationSuccess && !attempted && <Alert variant="success">Your account was created. Please log in.</Alert>}
      {location.state?.passwordChanged && !attempted && <Alert variant="success">Your password was changed. Log in with your new password. Your other devices have been signed out.</Alert>}
      {sessionError && <Alert variant="error">{sessionError} <button type="button" className="text-link" onClick={() => void refresh()}>Check connection again</button></Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      <form ref={formRef} noValidate onSubmit={submit} aria-label="Log in" aria-busy={busy || undefined} className="space-y-5">
        <FormField id="login-email" label="Email" error={errors.email} required><input type="email" name="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={150} value={form.email} onChange={change} disabled={busy} placeholder="you@example.com" /></FormField>
        <FormField id="login-password" label="Password" error={errors.password} required><input type="password" name="password" autoComplete="current-password" minLength={12} maxLength={128} value={form.password} onChange={change} disabled={busy} placeholder="Enter your password" /></FormField>
        <Link to="/forgot-password" className="text-link">Forgot your password?</Link>
        <Button type="submit" busy={busy} className="w-full">Log in</Button>
      </form>
    </div>
  </AuthLayout>;
}
