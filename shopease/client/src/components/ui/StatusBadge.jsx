const colors = {
  Submitted:'status-submitted',
  'Under Investigation':'status-investigation',
  'Scheduled for Action':'status-scheduled',
  Resolved:'status-resolved',
  Draft:'status-draft',
  Cancelled:'status-cancelled',
  Planned:'status-submitted',
  Ongoing:'status-investigation',
  Completed:'status-resolved',
};
export default function StatusBadge({status}) {
  return <span className={`status-badge ${colors[status] || 'status-submitted'}`}>{status || 'Status unavailable'}</span>;
}
