import {BadgeCheck,Clock3,UserRound} from 'lucide-react';
import {reporterName} from '../../utils/reporter';
// Who filed a submitted report. Shown to barangay personnel only (the API sends it only to them).
export default function ReporterDetails({reporter,compact=false}){
  const Heading=compact?'h3':'h2';
  return <section className={compact?'rounded-control border border-line bg-canvas p-4':'panel p-5 sm:p-7'} aria-label="Reported by">
    <Heading className={`flex items-center gap-2 font-semibold ${compact?'text-base':'text-lg'}`}><UserRound size={20} aria-hidden="true"/>Reported by</Heading>
    {!reporter?<p className="mt-3 text-sm text-muted">The resident record for this report is not available.</p>:<dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      <div><dt className="text-muted">Name</dt><dd className="mt-1 font-medium wrap-anywhere">{reporterName(reporter)}</dd></div>
      <div><dt className="text-muted">Resident verification</dt><dd className="mt-1 flex items-center gap-1.5 font-medium">{reporter.is_verified?<><BadgeCheck size={16} aria-hidden="true"/>Verified</>:<><Clock3 size={16} aria-hidden="true"/>Not yet verified</>}</dd></div>
      <div><dt className="text-muted">Contact number</dt><dd className="mt-1 font-medium wrap-anywhere">{reporter.contact_no||'Not provided'}</dd></div>
      <div><dt className="text-muted">Address</dt><dd className="mt-1 font-medium wrap-anywhere">{reporter.address||'Not provided'}</dd></div>
    </dl>}
  </section>;
}
