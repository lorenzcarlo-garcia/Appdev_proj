import {ClipboardList,Clock3,CircleCheck,Layers3} from 'lucide-react';

const icons = {open:ClipboardList,ongoing:Clock3,resolved:CircleCheck,default:Layers3};
export default function StatCard({label,value,detail,tone='default'}) {
  const Icon = icons[tone] || icons.default;
  return <article className={`panel stat-cell stat-${tone} p-5 sm:p-6`}>
    <span className="stat-icon" aria-hidden="true"><Icon size={24}/></span>
    <h2 className="stat-label mt-5 text-brand-dark">{label}</h2>
    <p className="stat-value mt-2 text-brand">{value ?? '\u2014'}</p>
    {detail && <p className="mt-3 text-sm leading-6 text-muted">{detail}</p>}
  </article>;
}
