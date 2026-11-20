import {ClipboardList,Clock3,CircleCheck,Layers3} from 'lucide-react';

const icons = {open:ClipboardList,ongoing:Clock3,resolved:CircleCheck,default:Layers3};
// With onSelect the card becomes a toggle button (aria-pressed shows the active filter).
export default function StatCard({label,value,detail,tone='default',onSelect,selected=false,actionHint}) {
  const Icon = icons[tone] || icons.default;
  // Buttons may only contain phrasing content, so headings become block spans there.
  const Title = onSelect ? 'span' : 'h2', Text = onSelect ? 'span' : 'p';
  const body = <>
    <span className="stat-icon" aria-hidden="true"><Icon size={24}/></span>
    <Title className="stat-label mt-5 block text-brand-dark">{label}</Title>
    <Text className="stat-value mt-2 block text-brand">{value ?? '—'}</Text>
    {detail && <Text className="mt-3 block text-sm leading-6 text-muted">{detail}</Text>}
    {onSelect && actionHint && <span className="stat-action mt-3 block text-sm font-semibold" aria-hidden="true">{selected ? 'Showing in the table below' : actionHint}</span>}
  </>;
  if (!onSelect) return <article className={`panel stat-cell stat-${tone} p-5 sm:p-6`}>{body}</article>;
  return <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${label}: ${value ?? 'loading'}. ${actionHint || 'Show these reports'}`} className={`panel stat-cell stat-button stat-${tone} p-5 text-left sm:p-6${selected ? ' stat-selected' : ''}`}>{body}</button>;
}
