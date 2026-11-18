import StatusBadge from '../ui/StatusBadge';
import {MapPin,CalendarDays} from 'lucide-react';
import {formatDateTime} from '../../utils/dates';
export default function CommunityUpdateCard({update,management=false,actions}){
  return <article className="panel min-w-0 space-y-4 p-5 sm:p-6">
    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={update.maintenance_status}/>{management && <span className="rounded-sm border border-line px-3 py-1 text-xs font-medium text-muted">{update.publication_state}</span>}</div>
    <h3 className="text-xl font-semibold wrap-anywhere">{update.title}</h3>
    <p className="flex items-start gap-2 text-sm text-muted"><MapPin size={17} className="mt-0.5 shrink-0" aria-hidden="true"/><span className="wrap-anywhere">{update.location}</span></p>
    <p className="text-sm leading-7 whitespace-pre-wrap wrap-anywhere">{update.summary}</p>
    {update.published_at && <p className="flex items-start gap-2 border-t border-line pt-4 text-xs leading-5 text-muted"><CalendarDays size={16} className="mt-0.5 shrink-0" aria-hidden="true"/><span>Published {formatDateTime(update.published_at)}<br/>Last updated {formatDateTime(update.updated_at)}</span></p>}
    {actions && <div className="flex flex-wrap gap-3 border-t border-line pt-4">{actions}</div>}
  </article>;
}
