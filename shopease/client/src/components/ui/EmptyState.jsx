import { ClipboardList } from 'lucide-react';
export default function EmptyState({ title = 'Nothing here yet', children, action }) {
  return <div className="flex flex-col items-center px-5 py-12 text-center"><span className="mb-4 rounded-xl bg-canvas p-3 text-brand"><ClipboardList size={25} aria-hidden="true" /></span><h2 className="text-lg font-semibold">{title}</h2>{children && <div className="mt-2 max-w-md text-sm leading-6 text-muted">{children}</div>}{action && <div className="mt-5">{action}</div>}</div>;
}
