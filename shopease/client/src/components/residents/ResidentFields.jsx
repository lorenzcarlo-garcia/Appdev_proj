import FormField from '../ui/FormField';
import {todayInManila} from '../../utils/validation';
export default function ResidentFields({form,onChange,disabled=false}){return <>
 <div className="grid gap-4 sm:grid-cols-2">{[['first_name','First name',80,true],['middle_name','Middle name',80,false],['last_name','Last name',80,true],['contact_no','Contact number',20,false]].map(([name,label,maxLength,required])=><FormField key={name} label={label} required={required}><input name={name} value={form[name]} onChange={onChange} maxLength={maxLength} type={name==='contact_no'?'tel':'text'} disabled={disabled}/></FormField>)}</div>
 <FormField label="Birth date"><input name="birth_date" type="date" min="1000-01-01" max={todayInManila()} value={form.birth_date} onChange={onChange} disabled={disabled}/></FormField>
 <FormField label="Address" required><textarea name="address" rows={3} maxLength={255} value={form.address} onChange={onChange} disabled={disabled}/></FormField>
 </>;}
