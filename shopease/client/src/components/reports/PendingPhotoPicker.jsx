import PhotoUploadControl from './PhotoUploadControl';
import {useEffect,useRef,useState} from 'react';
import Alert from '../ui/Alert';
import Button from '../ui/Button';
function Preview({file}) {
  const image=useRef(null);
  useEffect(()=>{
    const url=URL.createObjectURL(file);
    image.current.src=url;
    return ()=>URL.revokeObjectURL(url);
  },[file]);
  return <img ref={image} alt={`Selected photo: ${file.name}`} className="h-40 w-full rounded-control object-cover"/>;
}
export default function PendingPhotoPicker({files,onChange,disabled=false}) {
  const [error,setError]=useState('');
  function choose(event) {
    const selected=Array.from(event.target.files || []);event.target.value='';
    if(disabled || !selected.length) return;
    if(files.length+selected.length>3 || selected.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>5*1024*1024)) {
      setError('Choose up to 3 JPEG, PNG or WebP photos in total, each no larger than 5 MB.');return;
    }
    setError('');onChange([...files,...selected]);
  }
  return <section className="space-y-4" aria-label="Report photos">
    <div><h2 className="text-lg font-semibold">Photos (optional)</h2><p className="mt-1 text-sm leading-6 text-muted">Add up to 3 JPEG, PNG or WebP photos, 5 MB each and at most 20 megapixels. Photos stay private to you and authorized barangay staff.</p></div>
    {error && <Alert variant="error">{error}</Alert>}
    <PhotoUploadControl disabled={disabled || files.length>=3} onChange={choose}/>
    <p className="text-sm text-muted" role="status">{files.length ? `${files.length} of 3 photos selected. They will upload when you save or submit.` : 'No photos selected. You can submit without a photo.'}</p>
    <div className="grid gap-4 sm:grid-cols-3">{files.map((file,index)=><div key={`${file.name}:${file.lastModified}:${index}`} className="min-w-0 space-y-2 rounded-sheet border border-line p-2"><Preview file={file}/><p className="truncate text-xs text-muted">{file.name}</p><Button variant="secondary" disabled={disabled} onClick={()=>{onChange(files.filter((_,position)=>position!==index));setError('');}}>Remove photo</Button></div>)}</div>
    <p className="text-xs leading-5 text-muted">Camera options depend on your phone or browser. Avoid including unrelated people or personal information.</p>
  </section>;
}
