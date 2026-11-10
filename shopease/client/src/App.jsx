import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Store } from 'lucide-react';
import api from './services/api';
const emptyForm = {
  name: '', description: '', price: '', stock: '',
  category: '', image_url: ''
};
export default function App() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function loadProducts(term = search) {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/products', { params: { search: term } });
      setProducts(response.data.products);
    } catch {
      setError('Cannot load products. Check your backend and database.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadProducts(''); }, []);
  function startAdd() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
    setMessage('');
  }
  function startEdit(product) {
    setForm({
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      stock: String(product.stock),
      category: product.category || '',
      image_url: product.image_url || ''
    });
    setEditingId(product.id);
    setShowForm(true);
    setMessage('');
}
  async function saveProduct(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    const payload = { ...form, price: Number(form.price), stock: Number(form.stock) };
    try {
      if (editingId !== null) {
        await api.put(`/products/${editingId}`, payload);
        setMessage('Product updated successfully.');
      } else {
        await api.post('/products', payload);
        setMessage('Product added successfully.');
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      await loadProducts();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save product.');
    }
  }
  async function deleteProduct(product) {
    if (!window.confirm(`Delete "${product.name}"?`)) return;
    setError('');
    setMessage('');
    try {
      await api.delete(`/products/${product.id}`);
      setMessage('Product deleted successfully.');
      await loadProducts();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete product.');
    }
  }
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="flex items-center justify-between bg-slate-950 px-6 py-4 text-white">
        <div className="flex items-center gap-3 text-xl font-bold">
          <Store className="text-blue-400" /> ShopEasy Admin
        </div>
        <span className="text-sm text-slate-300">Product Management</span>
      </header>
      <main className="mx-auto max-w-7xl p-5 md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-3xl font-bold">Products</h1>
            <p className="mt-1 text-slate-500">Add, view, edit, search, and delete products.</p></div>
          <button onClick={startAdd} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">
            <Plus size={18} /> Add Product
          </button>
        </div>
        {message && <p role="status" className="mb-4 rounded-lg bg-green-100 p-3 text-green-800">{message}</p>}
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-100 p-3 text-red-700">{error}</p>}
        <div className="mb-5 flex items-center gap-3 rounded-xl border bg-white px-4">
          <Search size={20} className="text-slate-400" />
          <input className="w-full py-3 outline-none" placeholder="Search products by name..."
            value={search} onChange={e => { const value = e.target.value; setSearch(value); loadProducts(value); }} />
        </div>
        {showForm && (
          <form onSubmit={saveProduct} className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-xl font-bold">{editingId !== null ? 'Edit Product' : 'Add New Product'}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Product Name *
                <input required maxLength={150} className="mt-1 w-full rounded-lg border p-3 font-normal" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="text-sm font-medium">Category
                <input className="mt-1 w-full rounded-lg border p-3 font-normal" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
              </label>
              <label className="text-sm font-medium">Price (PHP) *
                <input required type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border p-3 font-normal" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
              </label>
              <label className="text-sm font-medium">Stock *
                <input required type="number" min="0" step="1" className="mt-1 w-full rounded-lg border p-3 font-normal" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Description
                <textarea rows={3} className="mt-1 w-full rounded-lg border p-3 font-normal" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Image URL
                <input type="url" className="mt-1 w-full rounded-lg border p-3 font-normal" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} />
              </label>
            </div>
            <div className="mt-5 flex gap-3">
              <button type="submit" className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white">{editingId !== null ? 'Save Changes' : 'Create Product'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-5 py-3 font-semibold">Cancel</button>
            </div>
          </form>
        )}
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr>
              <th className="p-4">Product</th><th className="p-4">Category</th><th className="p-4">Price</th><th className="p-4">Stock</th><th className="p-4">Actions</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="5" className="p-6">Loading products...</td></tr>
              : products.length === 0 ? <tr><td colSpan="5" className="p-6">No products found.</td></tr>
: products.map(product => <tr key={product.id} className="border-t hover:bg-slate-50">
                <td className="p-4"><div className="flex items-center gap-3">
                  <img src={product.image_url || 'https://placehold.co/80x80?text=Product'} alt="" className="h-12 w-12 rounded-lg border object-cover" />
                  <div><p className="font-semibold">{product.name}</p><p className="text-xs text-slate-500">ID: {product.id}</p></div>
                </div></td>
                <td className="p-4">{product.category || '—'}</td>
                <td className="p-4 font-semibold">₱{Number(product.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                <td className="p-4">{product.stock}</td>
                <td className="p-4"><div className="flex gap-2">
                  <button onClick={() => startEdit(product)} aria-label={`Edit ${product.name}`} className="rounded-md bg-blue-100 p-2 text-blue-700"><Pencil size={16} /></button>
                  <button onClick={() => deleteProduct(product)} aria-label={`Delete ${product.name}`} className="rounded-md bg-red-100 p-2 text-red-700"><Trash2 size={16} /></button>
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-slate-500">Total products displayed: {products.length}</p>
      </main>
    </div>
  );
}
