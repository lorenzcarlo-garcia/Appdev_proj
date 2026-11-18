import api from './api';
export async function login(credentials) {
  const { data } = await api.post('/auth/login', credentials);
  return data;
}
export async function registerResident(details) {
  const { data } = await api.post('/auth/register', details);
  return data;
}
export async function getCurrentUser(signal) {
  const { data } = await api.get('/auth/me', { signal });
  return data.user;
}
export async function logoutSession() {
  await api.post('/auth/logout');
}

export async function changeOwnPassword(details) {
  await api.post('/auth/change-password',{current_password:details.current_password,new_password:details.new_password,confirm_password:details.confirm_password});
}
export async function requestPasswordReset(email){
  const {data}=await api.post('/auth/forgot-password',{email});
  return data;
}
export async function resetForgottenPassword(details){
  const {data}=await api.post('/auth/reset-password',details);
  return data;
}
