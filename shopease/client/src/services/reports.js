import api from './api';
export async function listReports(params, signal) {
  const {data} = await api.get('/reports', {params, signal});
  return data;
}
export async function getReport(id, signal) {
  const {data} = await api.get(`/reports/${encodeURIComponent(id)}`, {signal});
  return data;
}
export async function createReport(details) {
  const {data} = await api.post('/reports', details);
  return data.report;
}
export async function createDraft(details) {
  const {data} = await api.post('/reports/drafts', details);
  return data.report;
}
export async function saveReport(id, details) {
  const {data} = await api.put(`/reports/${encodeURIComponent(id)}`, details);
  return data;
}
export async function submitDraft(id) {
  const {data} = await api.post(`/reports/${encodeURIComponent(id)}/submit`, {});
  return data.report;
}

export async function cancelReport(id) {return (await api.post(`/reports/${encodeURIComponent(id)}/cancel`,{})).data;}
