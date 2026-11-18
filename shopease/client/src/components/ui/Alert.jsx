import { CircleAlert, CircleCheck, Info } from 'lucide-react';
export default function Alert({ children, variant = 'info', title }) {
  const options = { info: ['notice-info', Info], error: ['notice-error', CircleAlert], success: ['notice-success', CircleCheck] };
  const [style, Icon] = options[variant] || options.info;
  return <div role={variant === 'error' ? 'alert' : 'status'} className={`notice flex items-start gap-3 ${style}`}><Icon size={19} className="mt-0.5 shrink-0" aria-hidden="true" /><div>{title && <p className="font-semibold">{title}</p>}{children}</div></div>;
}
