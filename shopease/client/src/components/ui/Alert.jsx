import { CircleAlert, CircleCheck, Info } from 'lucide-react';
export default function Alert({ children, variant = 'info', title }) {
  const options = { info: ['border-teal-200 bg-teal-50 text-teal-950', Info], error: ['border-red-200 bg-red-50 text-red-900', CircleAlert], success: ['border-green-200 bg-green-50 text-green-900', CircleCheck] };
  const [style, Icon] = options[variant] || options.info;
  return <div role={variant === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-lg border p-4 text-sm leading-6 ${style}`}><Icon size={19} className="mt-0.5 shrink-0" aria-hidden="true" /><div>{title && <p className="font-semibold">{title}</p>}{children}</div></div>;
}
