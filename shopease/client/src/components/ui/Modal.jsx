import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import Button from './Button';
export default function Modal({ open, onClose, title, children, description }) {
  const dialog = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    return () => { if (element.open) element.close(); };
  }, [open]);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={event => { event.preventDefault(); onClose(); }} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-line bg-white p-0 text-ink shadow-xl"><div className="flex items-start justify-between gap-4 border-b border-line p-5"><div><h2 id={titleId} className="text-xl font-semibold">{title}</h2>{description && <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">{description}</p>}</div><Button variant="ghost" onClick={onClose} aria-label="Close dialog" className="shrink-0 px-3"><X size={20} aria-hidden="true" /></Button></div><div className="p-5">{children}</div></dialog>;
}
