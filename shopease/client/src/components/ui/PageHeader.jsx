export default function PageHeader({ title, description, action, eyebrow }) {
  return <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0">{eyebrow && <p className="mb-2 text-xs font-semibold tracking-widest text-brand uppercase">{eyebrow}</p>}<h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>}</div>{action && <div className="shrink-0">{action}</div>}</header>;
}
