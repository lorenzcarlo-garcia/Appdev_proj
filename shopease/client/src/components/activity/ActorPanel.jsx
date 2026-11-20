import {Link} from 'react-router-dom';
import useResource from '../../hooks/useResource';
import {getActivityPerson} from '../../services/management';
import {formatDateTime} from '../../utils/dates';
import {roleLabels} from '../../utils/activityLabels';
import Modal from '../ui/Modal';
import LoadingSpinner from '../ui/LoadingSpinner';
import ErrorState from '../ui/ErrorState';

// Who performed an action (Captain and Super Admin only). Standard audit details:
// identity, roles then and now, account status and sign-in dates. No address,
// birth date or contact number.
function Details({entry,onClose}){
  const result=useResource(getActivityPerson,{id:entry.actor_id}),person=result.data.person;
  if(result.loading) return <LoadingSpinner label="Loading person..."/>;
  if(result.error) return <ErrorState message={result.error} onRetry={result.reload}/>;
  const name=[person.first_name,person.middle_name,person.last_name].filter(Boolean).join(' ');
  const changed=person.current_role!==entry.actor_role;
  const rows=[
    ['Name',name||'No name on file (personal information not filled in)'],
    ['Email',person.email],
    ['Role when this was done',roleLabels[entry.actor_role]||entry.actor_role],
    ['Current role',<>{roleLabels[person.current_role]||person.current_role}{changed && <span className="ml-2 rounded-control bg-canvas px-2 py-0.5 text-xs text-muted">Role has changed since</span>}</>],
    ['Account status',person.is_active?'Active':'Deactivated'],
    ['Account created',formatDateTime(person.account_created_at)],
    ['Last sign-in',formatDateTime(person.last_login_at,'Never')],
    ['Logged actions',`${person.actions} (first ${formatDateTime(person.first_action_at)}, latest ${formatDateTime(person.last_action_at)})`],
    ['Roles used in the log',person.roles_used.map(role=>roleLabels[role]||role).join(', ')],
  ];
  return <div className="space-y-5">
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(0,11rem)_1fr]">{rows.map(([label,value])=><div key={label} className="contents"><dt className="text-muted">{label}</dt><dd className="font-medium wrap-anywhere">{value}</dd></div>)}</dl>
    <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-4"><Link className="button button-secondary" to={`/admin/activity?actor_id=${person.id}`} onClick={onClose}>Show only this person's actions</Link></div>
  </div>;
}
export default function ActorPanel({entry,onClose}){
  return <Modal open title="Who did this" onClose={onClose}>{entry && <Details key={entry.id} entry={entry} onClose={onClose}/>}</Modal>;
}
