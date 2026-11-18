import {useEffect, useRef, useState} from 'react';
import {Plus} from 'lucide-react';
import {listStaff, createStaff, updateStaff} from '../../services/users';
import {validateLogin} from '../../utils/validation';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import FormField from '../../components/ui/FormField';
import SearchBar from '../../components/ui/SearchBar';
import FilterSelect from '../../components/ui/FilterSelect';
import Pagination from '../../components/ui/Pagination';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const roles = [{value:'staff',label:'Staff'}, {value:'secretary',label:'Secretary'}, {value:'captain',label:'Captain'}];
const roleLabel = role => roles.find(option => option.value === role)?.label || role;
const emptyForm = {email:'',password:'',confirm_password:'',role:'staff'};
const dateFormat = new Intl.DateTimeFormat('en-PH', {timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
function lastLogin(value) {
  if (!value) return 'Not yet logged in';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : 'Unavailable';
}
function AccessBadge({active}) {
  return <span className={`status-badge ${active ? 'status-resolved' : 'status-draft'}`}>{active ? 'Active' : 'Inactive'}</span>;
}
function failureMessage(error, fallback) {
  return typeof error.response?.data?.message === 'string' ? error.response.data.message : fallback;
}
export default function StaffAccountsPage() {
  const [query,setQuery] = useState({search:'',role:'all',state:'all',page:1,page_size:20});
  const [search,setSearch] = useState('');
  const [result,setResult] = useState({users:[],total:0});
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState('');
  const [notice,setNotice] = useState('');
  const [editor,setEditor] = useState(null);
  const [form,setForm] = useState(emptyForm);
  const [errors,setErrors] = useState({});
  const [saveError,setSaveError] = useState('');
  const [pendingAccess,setPendingAccess] = useState(null);
  const [accessError,setAccessError] = useState('');
  const [busy,setBusy] = useState(false);
  const mutation = useRef(false);
  const mounted = useRef(true);
  const formRef = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    void listStaff(query,controller.signal).then(data => {
      if (!controller.signal.aborted) { setResult(data); setLoadError(''); }
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(failureMessage(error,'We could not load staff accounts. Please try again.'));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query]);
  function reload(changes = {}) {
    setLoading(true); setLoadError('');
    setQuery(previous => ({...previous,page:1,...changes}));
  }
  function openEditor(user) {
    setNotice(''); setSaveError(''); setErrors({});
    setForm(user ? {...emptyForm,email:user.email,role:user.role} : {...emptyForm});
    setEditor(user ? {mode:'edit',user} : {mode:'create'});
  }
  function closeEditor() {
    if (mutation.current) return;
    setEditor(null); setForm({...emptyForm}); setSaveError(''); setErrors({});
  }
  function change(event) {
    const {name,value} = event.target;
    setForm(previous => ({...previous,[name]:value}));
    setErrors(previous => ({...previous,[name]:undefined}));
  }
  async function save(event) {
    event.preventDefault();
    if (mutation.current || !editor) return;
    const next = editor.mode === 'create' ? validateLogin(form) : {};
    if (!roles.some(option => option.value === form.role)) next.role = 'Choose Staff, Secretary, or Captain.';
    if (editor.mode === 'create' && (!form.confirm_password || form.password !== form.confirm_password)) next.confirm_password = 'Passwords must match.';
    setErrors(next); setSaveError('');
    if (Object.keys(next).length) { formRef.current.elements.namedItem(Object.keys(next)[0])?.focus(); return; }
    mutation.current = true; setBusy(true);
    try {
      if (editor.mode === 'create') await createStaff({email:form.email.trim().toLowerCase(),password:form.password,role:form.role});
      else await updateStaff(editor.user.id,{role:form.role});
      if (!mounted.current) return;
      setNotice(editor.mode === 'create' ? 'Staff account created. The account holder can now log in.' : 'Account role updated. Permissions apply on the next protected request.');
      setEditor(null); setForm({...emptyForm}); reload();
    } catch (error) {
      if (mounted.current) {
        setSaveError(failureMessage(error,'We could not save the account. Please try again.'));
        setForm(previous => ({...previous,password:'',confirm_password:''}));
      }
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  async function changeAccess() {
    if (mutation.current || !pendingAccess) return;
    mutation.current = true; setBusy(true); setAccessError('');
    try {
      await updateStaff(pendingAccess.id,{is_active:!pendingAccess.is_active});
      if (!mounted.current) return;
      setNotice(pendingAccess.is_active ? 'Account deactivated and existing login sessions revoked.' : 'Account reactivated. The account holder must log in again.');
      setPendingAccess(null); reload();
    } catch (error) {
      if (mounted.current) {
        setAccessError(failureMessage(error,'We could not confirm the access change. Review the refreshed list before trying again.'));
        setPendingAccess(null); reload();
      }
    } finally { mutation.current = false; if (mounted.current) setBusy(false); }
  }
  const actions = user => <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => openEditor(user)} disabled={busy}>Edit role</Button><Button variant={user.is_active ? 'ghost' : 'secondary'} disabled={busy} onClick={() => {setAccessError('');setNotice('');setPendingAccess(user);}}>{user.is_active ? 'Deactivate' : 'Reactivate'}</Button></div>;
  const columns = [
    {key:'email',label:'Email'},
    {key:'role',label:'Role',render:user => roleLabel(user.role)},
    {key:'is_active',label:'Access',render:user => <AccessBadge active={Boolean(user.is_active)} />},
    {key:'last_login_at',label:'Last login',render:user => lastLogin(user.last_login_at)},
    {key:'actions',label:'Actions',render:actions},
  ];
  return <>
    <PageHeader title="Staff Accounts" description="Create staff accounts, assign barangay roles, and manage account access." action={<Button onClick={() => openEditor()} disabled={busy}><Plus size={18} aria-hidden="true" />Create staff account</Button>} />
    <div className="space-y-5">
      {notice && <Alert variant="success">{notice}</Alert>}
      {accessError && <Alert variant="error">{accessError}</Alert>}
      <section className="panel p-4 sm:p-5" aria-label="Account filters">
        <form onSubmit={event => {event.preventDefault();reload({search:search.trim()});}} className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row"><SearchBar label="Search staff by email" placeholder="Search by email" value={search} onChange={event => setSearch(event.target.value)} /><Button type="submit" variant="secondary">Search</Button></div>
          <div className="grid gap-4 sm:grid-cols-2"><FilterSelect label="Role" value={query.role} onChange={event => reload({role:event.target.value})} options={[{value:'all',label:'All staff roles'},...roles]} /><FilterSelect label="Access" value={query.state} onChange={event => reload({state:event.target.value})} options={[{value:'all',label:'Active and inactive'},{value:'active',label:'Active only'},{value:'inactive',label:'Inactive only'}]} /></div>
        </form>
      </section>
      {loadError ? <ErrorState message={loadError} onRetry={() => reload()} /> : <section className="panel md:overflow-hidden" aria-label="Staff accounts">
        <DataTable columns={columns} rows={result.users} loading={loading} caption="Staff accounts" emptyTitle="No staff accounts found" renderCard={user => <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 font-semibold wrap-anywhere">{user.email}</h2><AccessBadge active={Boolean(user.is_active)} /></div><p className="text-sm text-muted">{roleLabel(user.role)}</p><p className="text-xs text-muted">Last login: {lastLogin(user.last_login_at)}</p>{actions(user)}</div>} />
        {!loading && <Pagination page={query.page} pageSize={query.page_size} total={result.total} onPageChange={page => reload({page})} />}
      </section>}
      <p className="text-xs leading-5 text-muted">This page manages Staff, Secretary, and Captain accounts. Resident and Super Admin accounts are protected.</p>
    </div>
    {editor && <Modal open onClose={closeEditor} title={editor.mode === 'create' ? 'Create staff account' : 'Edit account role'} description={editor.mode === 'create' ? 'Choose the role for this staff account.' : editor.user.email}>
      <form ref={formRef} noValidate onSubmit={save} aria-busy={busy || undefined} className="space-y-5">
        {saveError && <Alert variant="error">{saveError}</Alert>}
        {editor.mode === 'create' && <FormField id="staff-email" label="Email" error={errors.email} required><input type="email" name="email" autoComplete="off" autoCapitalize="none" spellCheck={false} inputMode="email" maxLength={150} value={form.email} onChange={change} disabled={busy} /></FormField>}
        <FormField id="staff-role" label="Role" error={errors.role} required><select name="role" value={form.role} onChange={change} disabled={busy}>{roles.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FormField>
        {editor.mode === 'create' && <fieldset className="space-y-3" aria-describedby="staff-password-guidance"><legend className="sr-only">Password and confirmation</legend><p id="staff-password-guidance" className="text-sm text-muted">Use 12-128 characters for the password.</p><div className="space-y-4"><FormField id="staff-password" label="Password" error={errors.password} required><input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} value={form.password} onChange={change} disabled={busy} /></FormField><FormField id="staff-confirm-password" label="Confirm password" error={errors.confirm_password} required><input type="password" name="confirm_password" autoComplete="new-password" minLength={12} maxLength={128} value={form.confirm_password} onChange={change} disabled={busy} /></FormField></div></fieldset>}
        <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-4"><Button variant="secondary" onClick={closeEditor} disabled={busy}>Cancel</Button><Button type="submit" busy={busy}>{editor.mode === 'create' ? 'Create account' : 'Save role'}</Button></div>
      </form>
    </Modal>}
    <ConfirmDialog open={Boolean(pendingAccess)} onCancel={() => {if (!mutation.current) setPendingAccess(null);}} onConfirm={changeAccess} busy={busy} dangerous={Boolean(pendingAccess?.is_active)} title={pendingAccess?.is_active ? 'Deactivate account?' : 'Reactivate account?'} description={pendingAccess ? `${pendingAccess.email}: ${pendingAccess.is_active ? 'This account will lose access and its current sessions will end.' : 'This account will be able to log in again.'}` : ''} confirmLabel={pendingAccess?.is_active ? 'Deactivate account' : 'Reactivate account'} />
  </>;
}
