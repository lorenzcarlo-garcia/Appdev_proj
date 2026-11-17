import api from './api';
export async function listCategories(signal) {
  const {data} = await api.get('/categories', {signal});
  return data.categories;
}
export async function getCategory(id, signal) {
  const {data} = await api.get(`/categories/${encodeURIComponent(id)}`, {signal});
  return data.category;
}
