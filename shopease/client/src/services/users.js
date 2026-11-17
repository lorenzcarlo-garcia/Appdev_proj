import api from './api';
export async function listStaff(params, signal) {
  const {data} = await api.get('/users', {params, signal});
  return data;
}
export async function createStaff(details) {
  const {data} = await api.post('/users', details);
  return data.user;
}
export async function updateStaff(id, changes) {
  const {data} = await api.patch(`/users/${id}`, changes);
  return data.user;
}
