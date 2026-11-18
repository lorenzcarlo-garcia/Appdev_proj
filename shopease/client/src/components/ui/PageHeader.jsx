export default function PageHeader({title,description,action,eyebrow}) {
  return <header className="page-header mb-7 flex flex-col gap-5 sm:mb-9 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0">{eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}<h1 className="text-[28px] leading-[1.18] font-semibold text-brand-dark sm:text-[36px]">{title}</h1>{description && <p className="mt-3 max-w-[65ch] text-sm leading-7 text-muted">{description}</p>}</div>{action && <div className="flex shrink-0 flex-wrap gap-3">{action}</div>}</header>;
}
