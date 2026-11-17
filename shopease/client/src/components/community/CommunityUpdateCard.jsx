import {MapPin,CalendarDays} from 'lucide-react';
import {formatDateTime} from '../../utils/dates';
const colors={Planned:'bg-slate-100 text-slate-700',Ongoing:'bg-amber-100 text-amber-900',Completed:'bg-emerald-100 text-emerald-900'};
export default function CommunityUpdateCard({update,management=false,actions}){
  return <article className="panel min-w-0 space-y-4 p-5 sm:p-6">
    <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${colors[update.maintenance_status] || colors.Planned}`}>{update.maintenance_status}</span>{management && <span className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted">{update.publication_state}</span>}</div>
    <h3 className="text-lg font-semibold wrap-anywhere">{update.title}</h3>
    <p className="flex items-start gap-2 text-sm text-muted"><MapPin size={17} className="mt-0.5 shrink-0" aria-hidden="true"/><span className="wrap-anywhere">{update.location}</span></p>
    <p className="text-sm leading-7 whitespace-pre-wrap wrap-anywhere">{update.summary}</p>
    {update.published_at && <p className="flex items-start gap-2 border-t border-line pt-4 text-xs leading-5 text-muted"><CalendarDays size={16} className="mt-0.5 shrink-0" aria-hidden="true"/><span>Published {formatDateTime(update.published_at)}<br/>Last updated {formatDateTime(update.updated_at)}</span></p>}
    {actions && <div className="flex flex-wrap gap-3 border-t border-line pt-4">{actions}</div>}
  </article>;
}
