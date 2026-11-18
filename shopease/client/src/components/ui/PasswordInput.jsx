import {useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';

export default function PasswordInput({className='',disabled,...props}){
  const [visible,setVisible]=useState(false);
  const Icon=visible?EyeOff:Eye;
  return <div className="relative">
    <input {...props} disabled={disabled} type={visible?'text':'password'} className={`${className} pr-14`}/>
    <button type="button" disabled={disabled} className="absolute inset-y-0 right-1 my-auto inline-flex h-11 w-11 items-center justify-center rounded-control text-brand hover:bg-canvas disabled:opacity-50" aria-label={visible?'Hide password':'Show password'} aria-controls={props.id} aria-pressed={visible} onClick={()=>setVisible(previous=>!previous)}><Icon size={20} aria-hidden="true"/></button>
  </div>;
}
