export default function EmptyState({title='No records yet',children,action}) {
  return <div className="px-5 py-9 sm:px-6 sm:py-12"><h2 className="text-xl font-semibold text-ink">{title}</h2>{children && <div className="mt-3 max-w-lg text-sm leading-7 text-muted">{children}</div>}{action && <div className="mt-6">{action}</div>}</div>;
}
