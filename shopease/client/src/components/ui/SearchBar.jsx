import { Search } from 'lucide-react';
import { useId } from 'react';
export default function SearchBar({ label = 'Search', placeholder = 'Search records', value, onChange }) {
  const id = useId();
  return <div className="min-w-0 flex-1"><label htmlFor={id} className="sr-only">{label}</label><div className="relative"><Search className="pointer-events-none absolute top-3.5 left-3 text-muted" size={19} aria-hidden="true" /><input id={id} type="search" value={value} onChange={onChange} placeholder={placeholder} className="field-control pl-10" /></div></div>;
}
