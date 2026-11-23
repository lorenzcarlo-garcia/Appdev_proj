import {useState} from 'react';
import {FileDown} from 'lucide-react';
import Button from '../ui/Button';
import {saveDownload,downloadErrorMessage} from '../../utils/download';

// Requests a PDF from the API and saves it; shows the server's message if it fails.
export default function PdfDownloadButton({request,fallbackName,label='Download PDF',variant='secondary',disabled=false}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function download(){
    setBusy(true);setError('');
    try{saveDownload(await request(),fallbackName);}
    catch(failure){setError(await downloadErrorMessage(failure));}
    finally{setBusy(false);}
  }
  return <span className="inline-flex flex-col gap-1">
    <Button variant={variant} onClick={download} busy={busy} disabled={disabled}><FileDown size={17} aria-hidden="true"/><span>{busy?'Preparing PDF…':label}</span></Button>
    {error && <span role="alert" className="max-w-xs text-xs text-red-700">{error}</span>}
  </span>;
}
