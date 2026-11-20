// Resolved ÷ received for the SAME cohort and filters; never mixes periods.
export default function ResolutionBar({cohort}){
  const {received,resolved}=cohort;
  const percent=received?Math.round(resolved/received*100):null;
  return <section className="panel p-5 sm:p-7" aria-labelledby="resolution-title">
    <h2 id="resolution-title" className="text-lg font-semibold text-brand-dark">Resolution progress</h2>
    {received?<>
      <p className="mt-2 text-sm leading-6"><strong className="tabular-nums">{resolved} of {received}</strong> reports received in this period are now resolved <span className="tabular-nums">({percent}%)</span>.</p>
      <div className="progress-track mt-4" role="progressbar" aria-label="Reports resolved" aria-valuemin={0} aria-valuemax={received} aria-valuenow={resolved} aria-valuetext={`${resolved} of ${received} resolved`}><span className="progress-fill" style={{width:`${percent}%`}}/></div>
    </>:<p className="mt-2 text-sm leading-6 text-muted">No reports were received in this period, so there is no progress to measure yet.</p>}
    <p className="mt-3 text-xs leading-5 text-muted">Counts the current status of non-cancelled reports first submitted in the selected period, with the same filters as everything on this page.</p>
  </section>;
}
