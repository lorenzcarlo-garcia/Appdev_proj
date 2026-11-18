import StatusBadge from './StatusBadge';
export default function StatusTimeline({ entries, formatDate }) {
  if (!entries.length) return <p className="text-sm text-muted">No status updates yet.</p>;
  return <ol aria-label="Status history" className="space-y-5 border-l-2 border-line pl-5">{entries.map((entry, index) => <li key={`${entry.created_at}-${index}`} className="relative"><span aria-hidden="true" className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full border-2 border-surface bg-brand" /><StatusBadge status={entry.new_status} /><p className="mt-2 text-xs text-muted tabular-nums">{formatDate(entry.created_at)}</p>{entry.remarks && <p className="mt-2 text-sm leading-6 whitespace-pre-wrap wrap-anywhere">{entry.remarks}</p>}</li>)}</ol>;
}
