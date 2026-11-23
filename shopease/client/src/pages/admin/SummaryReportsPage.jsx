import {useState} from 'react';
import {CalendarDays,CalendarRange,Calendar} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import FormField from '../../components/ui/FormField';
import Button from '../../components/ui/Button';
import PdfDownloadButton from '../../components/reports/PdfDownloadButton';
import {downloadSummaryPdf} from '../../services/management';
import {todayInManila} from '../../utils/validation';

// Calendar helpers on 'YYYY-MM-DD' strings (UTC dates, so the browser zone never shifts days).
const toDate=text=>new Date(text+'T00:00:00Z');
const toText=date=>date.toISOString().slice(0,10);
const addDays=(text,days)=>toText(new Date(toDate(text).getTime()+days*86400000));
const monday=text=>addDays(text,-((toDate(text).getUTCDay()+6)%7));
const label=new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'});
const monthLabel=new Intl.DateTimeFormat('en-PH',{timeZone:'UTC',month:'long',year:'numeric'});
const types=[['week','Weekly',CalendarDays],['month','Monthly',CalendarRange],['year','Yearly',Calendar]];

export default function SummaryReportsPage(){
  const today=todayInManila(),thisYear=Number(today.slice(0,4));
  const [type,setType]=useState('month');
  const [week,setWeek]=useState(today),[month,setMonth]=useState(today.slice(0,7)),[year,setYear]=useState(String(thisYear));
  // The API takes any date inside the period.
  const date=type==='week'?week:type==='month'?`${month}-01`:`${year}-01-01`;
  const valid=/^\d{4}-\d{2}-\d{2}$/.test(date) && date<=today;
  const start=valid?(type==='week'?monday(week):date):null;
  const description=!valid?'Choose a period that has already started.':type==='week'?`Monday ${label.format(toDate(start))} to Sunday ${label.format(toDate(addDays(start,6)))}`:type==='month'?monthLabel.format(toDate(start)):`January to December ${year}`;
  const lastMonth=(()=>{const d=toDate(today.slice(0,8)+'01');d.setUTCMonth(d.getUTCMonth()-1);return toText(d).slice(0,7);})();
  const quick=[['This week',()=>{setType('week');setWeek(today);}],['Last week',()=>{setType('week');setWeek(addDays(monday(today),-7));}],['This month',()=>{setType('month');setMonth(today.slice(0,7));}],['Last month',()=>{setType('month');setMonth(lastMonth);}],['This year',()=>{setType('year');setYear(String(thisYear));}],['Last year',()=>{setType('year');setYear(String(thisYear-1));}]];
  return <>
    <PageHeader title="Summary reports"/>
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="panel space-y-6 p-5 sm:p-7">
        <fieldset><legend className="text-sm font-semibold">Report type</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{types.map(([value,name,Icon])=><label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-4 py-3 text-sm font-semibold ${type===value?'border-brand bg-canvas text-brand-dark':'border-line'}`}>
            <input type="radio" name="summary-type" value={value} checked={type===value} onChange={()=>setType(value)} className="sr-only"/><Icon size={19} aria-hidden="true"/>{name}</label>)}</div>
        </fieldset>
        {type==='week' && <FormField label="Any day in the week" hint="Weeks run from Monday to Sunday."><input type="date" min="2000-01-01" max={today} value={week} onChange={event=>setWeek(event.target.value)}/></FormField>}
        {type==='month' && <FormField label="Month"><input type="month" min="2000-01" max={today.slice(0,7)} value={month} onChange={event=>setMonth(event.target.value)} placeholder="YYYY-MM"/></FormField>}
        {type==='year' && <FormField label="Year"><select value={year} onChange={event=>setYear(event.target.value)}>{Array.from({length:6},(_,i)=>String(thisYear-i)).map(value=><option key={value}>{value}</option>)}</select></FormField>}
        <div className="flex flex-wrap gap-2" aria-label="Quick choices">{quick.map(([name,choose])=><Button key={name} variant="secondary" onClick={choose}>{name}</Button>)}</div>
        <div className="flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm" aria-live="polite"><span className="text-muted">Period: </span><strong>{description}</strong></p>
          <PdfDownloadButton variant="primary" disabled={!valid} request={()=>downloadSummaryPdf({period:type,date})} fallbackName={`BantayLog-${type}-summary.pdf`}/>
        </div>
      </section>
      <p className="text-xs leading-6 text-muted">Summaries count non-cancelled reports by the date they were first submitted, in Philippine time, and list blotter numbers without names. Each download is recorded in the Activity log. For a period still in progress, the PDF states the time its figures were taken.</p>
    </div>
  </>;
}
