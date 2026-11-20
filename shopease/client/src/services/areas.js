import api from './api';
// Active areas/puroks for the resident report form.
export async function listAreas(signal) {
  const {data} = await api.get('/areas', {signal});
  return data.areas;
}
