const colors = {
  Submitted: 'bg-slate-100 text-slate-700',
  'Under Investigation': 'bg-amber-100 text-amber-900',
  'Scheduled for Action': 'bg-violet-100 text-violet-900',
  Resolved: 'bg-green-100 text-green-900',
  Draft: 'border border-dashed border-slate-400 bg-white text-muted',
  Cancelled: 'bg-red-50 text-red-800',
};
export default function StatusBadge({ status }) {
  return <span className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs leading-4 font-semibold ${colors[status] || 'bg-slate-100 text-slate-700'}`}>{status || 'Status unavailable'}</span>;
}
