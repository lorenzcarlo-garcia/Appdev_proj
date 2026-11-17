import { cloneElement, useId } from 'react';
export default function FormField({ label, children, id, error, hint, required = false }) {
  const generated = useId();
  const fieldId = id || generated;
  const describedBy = [hint && `${fieldId}-hint`, error && `${fieldId}-error`].filter(Boolean).join(' ') || undefined;
  return <div className="space-y-2"><label htmlFor={fieldId} className="block text-sm font-semibold">{label}{required && <span className="ml-1 text-red-700" aria-hidden="true">*</span>}</label>{hint && <p id={`${fieldId}-hint`} className="text-sm text-muted">{hint}</p>}{cloneElement(children, { id: fieldId, required, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, className: `field-control ${children.props.className || ''}` })}{error && <p id={`${fieldId}-error`} className="text-sm text-red-700">{error}</p>}</div>;
}
