import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
});
// Separate client avoids recursively invoking the mutation interceptor.
const tokenApi = axios.create({ baseURL, withCredentials: true });
let csrfToken;
let tokenRequest;
api.interceptors.request.use(async (config) => {
  if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase())) {
    if (!csrfToken) {
      tokenRequest ||= tokenApi.get('/auth/csrf').then(({ data }) => data.csrfToken)
        .finally(() => { tokenRequest = undefined; });
      csrfToken = await tokenRequest;
    }
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});
api.interceptors.response.use((response) => {
  if (response.data?.csrfToken) csrfToken = response.data.csrfToken;
  if (['/auth/logout','/auth/change-password'].includes(response.config.url)) csrfToken = undefined;
  return response;
}, (error) => {
  if ([401, 403].includes(error.response?.status)) csrfToken = undefined;
  if (error.response?.status === 401 && !['/auth/login', '/auth/register', '/auth/me'].includes(error.config?.url)) {
    window.dispatchEvent(new Event('bantaylog:unauthorized'));
  }
  // Do not automatically replay writes.
  return Promise.reject(error);
});
export default api;
