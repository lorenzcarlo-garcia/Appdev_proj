export default function StatCard({ label, value, detail, tone = 'default' }) {
  const tones = { default: 'text-ink', open: 'text-slate-700', ongoing: 'text-amber-900', resolved: 'text-green-800' };
  return <article className="panel p-5"><h2 className="text-sm text-muted">{label}</h2><p className={`mt-2 text-3xl font-bold tabular-nums ${tones[tone] || tones.default}`}>{value ?? '\u2014'}</p>{detail && <p className="mt-2 text-xs text-muted">{detail}</p>}</article>;
}
