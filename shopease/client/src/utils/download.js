// Saves a PDF returned by the API (requested with responseType 'blob') as a file.
export function saveDownload(response,fallbackName){
  const name=/filename="([^"]+)"/.exec(response.headers?.['content-disposition']||'')?.[1]||fallbackName;
  const url=URL.createObjectURL(response.data);
  const link=document.createElement('a');link.href=url;link.download=name;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  return name;
}
// Error bodies arrive as Blobs when a file was requested; read the server's message.
export async function downloadErrorMessage(error,fallback='The PDF could not be created. Please try again.'){
  const data=error.response?.data;
  if(data && typeof data.text==='function'){
    try{const parsed=JSON.parse(await data.text());if(typeof parsed.message==='string')return parsed.message;}catch{/* not JSON */}
  }
  if(error.response?.status===403) return 'Only the Secretary, Captain or Super Admin can download this PDF.';
  return fallback;
}
