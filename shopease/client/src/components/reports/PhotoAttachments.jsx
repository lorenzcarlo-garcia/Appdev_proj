import PhotoUploadControl from './PhotoUploadControl';
import {useEffect,useRef,useState} from 'react';
import {listAttachments,loadAttachment,uploadAttachments,removeAttachment} from '../../services/reportAttachments';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import ConfirmDialog from '../ui/ConfirmDialog';
function explanation(error) {
  return typeof error.response?.data?.message === 'string' ? error.response.data.message : 'Photo changes could not be confirmed. Reload the photos before trying again.';
}
function PrivatePhoto({reportId,photo}) {
  const [state,setState] = useState({url:'',error:false});
  useEffect(() => {
    const controller = new AbortController();let url;
    loadAttachment(reportId,photo.id,controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);setState({url,error:false});
    }).catch(() => {if (!controller.signal.aborted) setState({url:'',error:true});});
    return () => {controller.abort();if (url) URL.revokeObjectURL(url);};
  },[reportId,photo.id]);
  return state.url ? <a href={state.url} target="_blank" rel="noreferrer" aria-label={`Open report photo ${photo.id}`}><img className="h-40 w-full rounded-lg object-cover" src={state.url} alt={`Attached report photo ${photo.id}`} /></a> : <p className="p-5 text-sm text-muted">{state.error ? 'Photo preview unavailable. Reload photos to retry.' : 'Loading photo...'}</p>;
}
export default function PhotoAttachments({reportId,editable=false,disabled=false,onBlocked}) {
  const [photos,setPhotos] = useState([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [uncertain,setUncertain] = useState(false);
  const [revision,setRevision] = useState(0);
  const [removing,setRemoving] = useState(null);
  const writing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {mounted.current=true;return () => {mounted.current=false;};},[]);
  useEffect(() => {
    const controller = new AbortController();
    listAttachments(reportId,controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      setPhotos(rows);setLoading(false);setUncertain(false);setError('');onBlocked?.(false);
    }).catch(failure => {
      if (controller.signal.aborted) return;
      setLoading(false);setUncertain(true);setError(explanation(failure));onBlocked?.(true);
    });
    return () => controller.abort();
  },[reportId,revision,onBlocked]);
  async function mutate(action) {
    if (writing.current || disabled) return;
    writing.current=true;setBusy(true);setError('');onBlocked?.(true);
    try {
      await action();
      if (mounted.current) {setLoading(true);setRevision(value=>value+1);}
    } catch(failure) {
      if (mounted.current) {setError(explanation(failure));setUncertain(true);}
    } finally {writing.current=false;if (mounted.current) setBusy(false);}
  }
  function choose(event) {
    const files=Array.from(event.target.files || []);event.target.value='';
    if (!files.length || writing.current || disabled || uncertain) return;
    if (files.length+photos.length>3 || files.some(file=>file.size>5*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))) {
      setError('Choose up to 3 JPEG, PNG or WebP photos in total, each no larger than 5 MB.');return;
    }
    void mutate(()=>uploadAttachments(reportId,files));
  }
  const locked=loading || busy || disabled || uncertain || photos.length>=3;
  return <section className="space-y-4" aria-label="Report photos" aria-busy={busy || loading || undefined}>
    <div><h2 className="text-lg font-semibold">Photos (optional)</h2><p className="mt-1 text-sm leading-6 text-muted">Up to 3 JPEG, PNG or WebP photos, 5 MB each and at most 20 megapixels. Photos stay private to you and authorized barangay staff. Avoid including unrelated people or personal information.</p></div>
    {error && <Alert variant="error">{error}</Alert>}
    {uncertain && <Button variant="secondary" disabled={busy || disabled} onClick={()=>{setLoading(true);setRevision(value=>value+1);}}>Reload photos</Button>}
    {loading && <p className="text-sm text-muted">Loading photos...</p>}
    {!loading && !photos.length && !uncertain && <p className="text-sm text-muted">No photos attached.</p>}
    <div className="grid gap-4 sm:grid-cols-3">{photos.map(photo=><div key={`${photo.id}:${revision}`} className="min-w-0 space-y-2 rounded-xl border border-line p-2"><PrivatePhoto reportId={reportId} photo={photo}/>{editable && <Button variant="secondary" disabled={busy || disabled || uncertain || loading} onClick={()=>setRemoving(photo.id)}>Remove photo</Button>}</div>)}</div>
    {editable && <div className="space-y-3"><PhotoUploadControl disabled={locked} onChange={choose}/><p className="text-xs leading-5 text-muted">Photos are saved immediately. If an upload fails, reload the photos before submitting your draft.</p></div>}
    <ConfirmDialog open={removing !== null} onCancel={()=>setRemoving(null)} onConfirm={()=>{if (disabled || writing.current) return;const photoId=removing;setRemoving(null);void mutate(()=>removeAttachment(reportId,photoId));}} title="Remove photo?" description="This removes the selected photo from your report. You can attach another while the report is editable." confirmLabel="Remove photo" dangerous busy={busy || disabled}/>
  </section>;
}
