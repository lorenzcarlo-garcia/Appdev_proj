import api from './api';
export const maintenanceStatuses=['Planned','Ongoing','Completed'];
export async function listCommunityUpdates(params,signal){return (await api.get('/community-updates',{params,signal})).data;}
export async function createCommunityUpdate(details){return (await api.post('/community-updates',details)).data.update;}
export async function saveCommunityUpdate(id,details){return (await api.put(`/community-updates/${id}`,details)).data.update;}
export async function publishCommunityUpdate(id,version){return (await api.post(`/community-updates/${id}/publish`,{expected_version:version,confirm:true})).data.update;}
export async function archiveCommunityUpdate(id,version){return (await api.post(`/community-updates/${id}/archive`,{expected_version:version,confirm:true})).data.update;}
