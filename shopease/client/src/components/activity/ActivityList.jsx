import {useState} from 'react';
import {Link} from 'react-router-dom';
import ActorPanel from './ActorPanel';
import {formatDateTime} from '../../utils/dates';
import {actionLabels,roleLabels} from '../../utils/activityLabels';

function target(entry){
  if(entry.entity_id==null) return null;
  if(entry.entity_type==='report') return `/admin/reports/${entry.entity_id}`;
  if(entry.entity_type==='blotter') return `/admin/blotters/${entry.entity_id}`;
  if(entry.entity_type==='community_update') return '/admin/community-updates';
  return null;
}
// Entries carry only the actor's role, a record reference and generated details.
// canInspect (Captain/Super Admin): the "By ..." line opens the person behind the entry.
export default function ActivityList({entries,canInspect=false}){
  const [selected,setSelected]=useState(null);
  return <><ol className="activity-list" aria-label="Barangay actions">{entries.map(entry=>{
    const to=target(entry),reference=entry.entity_ref || `#${entry.entity_id}`;
    return <li key={entry.id} className="activity-item">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="font-semibold text-brand-dark">{actionLabels[entry.action]||entry.action}</p><time className="text-xs text-muted tabular-nums">{formatDateTime(entry.created_at)}</time></div>
      <p className="mt-1 text-sm wrap-anywhere">{to?<Link className="text-link" to={to}>{reference}</Link>:<span>{reference}</span>}{entry.detail && <span className="text-muted"> · {entry.detail}</span>}</p>
      <p className="mt-1 text-xs text-muted">{canInspect && entry.actor_id?<button type="button" className="text-link" onClick={()=>setSelected(entry)} aria-haspopup="dialog">By {roleLabels[entry.actor_role]||entry.actor_role}</button>:<>By {roleLabels[entry.actor_role]||entry.actor_role}</>}</p>
    </li>;})}</ol>{selected && <ActorPanel entry={selected} onClose={()=>setSelected(null)}/>}</>;
}
