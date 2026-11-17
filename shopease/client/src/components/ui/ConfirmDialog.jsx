import Alert from './Alert';
import Modal from './Modal';
import Button from './Button';
export default function ConfirmDialog({ open, onCancel, onConfirm, title = 'Confirm action', description, confirmLabel = 'Confirm', dangerous = false, busy = false, error = '' }) {
  return <Modal open={open} onClose={() => { if (!busy) onCancel(); }} title={title} description={description}>{error && <div className="mb-4"><Alert variant="error">{error}</Alert></div>}<div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>Cancel</Button><Button variant={dangerous ? 'danger' : 'primary'} onClick={onConfirm} busy={busy}>{confirmLabel}</Button></div></Modal>;
}
