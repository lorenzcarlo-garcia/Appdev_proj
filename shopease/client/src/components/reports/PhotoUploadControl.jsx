import {useRef,useState} from 'react';
import {Camera,ImagePlus} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
export default function PhotoUploadControl({disabled=false,onChange}) {
  const [open,setOpen]=useState(false);
  const gallery=useRef(null);
  const camera=useRef(null);
  function select(source) {if(disabled) return;setOpen(false);source.current.click();}
  return <>
    <button type="button" disabled={disabled} onClick={()=>setOpen(true)} className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-sheet border-2 border-dashed border-brand/35 bg-canvas px-5 py-6 text-brand hover:border-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Add report photos" aria-haspopup="dialog" aria-expanded={open}>
      <ImagePlus size={32} aria-hidden="true"/><span className="font-semibold">Add photos</span><span className="text-center text-sm text-muted">Tap or click to add a photo</span>
    </button>
    <Modal open={open} onClose={()=>setOpen(false)} title="Add a photo" description="Choose an existing photo, or use your phone camera.">
    <input ref={gallery} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled} onChange={onChange} aria-label="Choose photos from your device"/>
    <input ref={camera} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={disabled} onChange={onChange} aria-label="Take a report photo"/>
      <div className="flex flex-col gap-3"><Button variant="secondary" onClick={()=>select(gallery)} disabled={disabled}><ImagePlus size={20} aria-hidden="true"/>Choose photos</Button><Button variant="secondary" onClick={()=>select(camera)} disabled={disabled}><Camera size={20} aria-hidden="true"/>Take a photo</Button></div>
      <p className="mt-4 text-xs leading-5 text-muted">On a laptop, choose a photo from your files. Camera availability depends on your device and browser.</p>
    </Modal>
  </>;
}
