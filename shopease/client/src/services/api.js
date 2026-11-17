import axios from 'axios';

const baseURL = 'http://localhost:5000/api';
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
  if (response.config.url === '/auth/logout') csrfToken = undefined;
  return response;
}, (error) => {
  if ([401, 403].includes(error.response?.status)) csrfToken = undefined;
  // Do not automatically replay writes.
  return Promise.reject(error);
});
export default api;
