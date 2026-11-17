export default function Button({ children, variant = 'primary', busy = false, disabled = false, className = '', type = 'button', ...props }) {
  const variants = { primary: 'button-primary', secondary: 'button-secondary', danger: 'button-danger', ghost: 'button-ghost' };
  return <button type={type} className={`button ${variants[variant] || variants.primary} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined} {...props}>{busy ? 'Please wait...' : children}</button>;
}
