import Button from './Button';
export default function Pagination({ page, pageSize, total, onPageChange, busy = false }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-4"><p className="text-sm text-muted">Page {page} of {pages} &middot; {total} {total === 1 ? 'record' : 'records'}</p><div className="flex gap-2"><Button variant="secondary" disabled={busy || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button><Button variant="secondary" disabled={busy || page >= pages} onClick={() => onPageChange(page + 1)}>Next</Button></div></nav>;
}
