import {useState} from 'react';
import {Link} from 'react-router-dom';
import {MapPin} from 'lucide-react';
import useWriteAction from '../../hooks/useWriteAction';
import {assignReportArea} from '../../services/management';
import Button from '../ui/Button';
import FormField from '../ui/FormField';
import WriteFeedback from '../ui/WriteFeedback';

// Lets barangay personnel file a submitted report under an area/purok, or correct it.
// The resident's own location text is never changed.
export default function ReportAreaAssignment({report,areas,canManageAreas,onSaved}){
  const action=useWriteAction();
  const [value,setValue]=useState(report.area_id==null?'':String(report.area_id));
  const current=report.area_id==null?'':String(report.area_id);
  const choices=areas.filter(area=>area.is_active || String(area.id)===current);
  if(!areas.length) return <section className="panel space-y-3 p-5 sm:p-7"><h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin size={20} aria-hidden="true"/>Area or purok</h2><p className="text-sm leading-6 text-muted">No areas have been set up yet, so reports cannot be grouped by area.{canManageAreas && <> <Link className="text-link" to="/admin/areas">Add areas</Link>.</>}</p></section>;
  return <section className="panel space-y-4 p-5 sm:p-7">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin size={20} aria-hidden="true"/>Area or purok</h2>
    <p className="text-sm leading-6 text-muted">Used for the dashboard's area counts. The resident's own location text stays unchanged.</p>
    <WriteFeedback action={action} onReload={onSaved}/>
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={event=>{event.preventDefault();void action.run(()=>assignReportArea(report.id,value===''?null:Number(value),report.edit_token),onSaved);}}>
      <div className="min-w-0 flex-1"><FormField label="Area for this report"><select value={value} onChange={event=>setValue(event.target.value)} disabled={action.busy || action.uncertain}><option value="">Unassigned</option>{choices.map(area=><option key={area.id} value={area.id}>{area.name}{area.is_active?'':' (inactive)'}</option>)}</select></FormField></div>
      <Button type="submit" variant="secondary" busy={action.busy} disabled={action.uncertain || value===current}>Save area</Button>
    </form>
  </section>;
}
