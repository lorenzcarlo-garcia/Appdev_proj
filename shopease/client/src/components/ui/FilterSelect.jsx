import FormField from './FormField';
export default function FilterSelect({ label, value, onChange, options, id }) {
  return <FormField label={label} id={id}><select value={value} onChange={onChange}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FormField>;
}
