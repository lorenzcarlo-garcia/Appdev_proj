import api from './api';
const path = id => `/reports/${id}/attachments`;
export async function listAttachments(id,signal) {return (await api.get(path(id),{signal})).data.attachments;}
export async function loadAttachment(id,photoId,signal) {return (await api.get(`${path(id)}/${photoId}`,{signal,responseType:'blob'})).data;}
export async function uploadAttachments(id,files) {
  const body = new FormData();
  files.forEach(file => body.append('photos',file));
  return (await api.post(path(id),body,{headers:{'Content-Type':undefined}})).data.attachments;
}
export async function removeAttachment(id,photoId) {await api.delete(`${path(id)}/${photoId}`);}
