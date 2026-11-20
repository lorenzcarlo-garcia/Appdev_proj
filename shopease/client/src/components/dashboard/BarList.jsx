// Horizontal bars with the count printed beside each bar (colour is never the only cue).
export default function BarList({id,title,note,rows,empty,footer}){
  const max=Math.max(0,...rows.map(row=>row.total));
  return <section className="panel p-5 sm:p-7" aria-labelledby={id}>
    <h2 id={id} className="text-lg font-semibold text-brand-dark">{title}</h2>
    {note && <p className="mt-1 text-xs leading-5 text-muted">{note}</p>}
    {rows.length?<ol className="mt-5 space-y-4">{rows.map(row=><li key={row.key}>
      <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 wrap-anywhere">{row.label}</span><span className="shrink-0 font-semibold tabular-nums">{row.total}</span></div>
      <div className="bar-track mt-1.5" aria-hidden="true"><span className={`bar-fill${row.muted?' bar-muted':''}`} style={{width:`${row.total/max*100}%`}}/></div>
    </li>)}</ol>:<p className="mt-4 text-sm text-muted">{empty}</p>}
    {footer}
  </section>;
}
