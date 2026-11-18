import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import Button from './Button';
export default function Modal({ open, onClose, title, children, description, id, placement = 'center' }) {
  const dialog = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    return () => { if (element.open) element.close(); };
  }, [open]);
  return <dialog id={id} ref={dialog} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={event => { event.preventDefault(); onClose(); }} className={`${placement === 'drawer' ? 'fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-[calc(100%-2rem)] max-w-xs rounded-r-sheet' : 'fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg rounded-sheet'} service-dialog overflow-y-auto border border-rule p-0 text-ink`}><div className="flex items-start justify-between gap-4 border-b border-line p-5"><div><h2 id={titleId} className="text-xl font-semibold">{title}</h2>{description && <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">{description}</p>}</div><Button variant="ghost" onClick={onClose} aria-label="Close dialog" className="shrink-0 px-3"><X size={20} aria-hidden="true" /></Button></div><div className="p-5">{children}</div></dialog>;
}
