import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createCustomer } from '../api/client';
import Layout from '../components/Layout';

export default function NewCustomer() {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', address: '', area: '', notes: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.phone) {
      setError('Name and phone are required.');
      return;
    }
    setLoading(true);
    try {
      const res = await createCustomer(form);
      navigate(`/customers/${res.data.customer.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create customer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex items-center gap-12 mb-24">
        <Link to="/customers" className="btn btn-ghost btn-sm">← Back</Link>
        <div>
          <h1 className="page-title">New Customer</h1>
          <p className="page-subtitle">Add a new tiffin subscriber</p>
        </div>
      </div>

      <div style={{ maxWidth: 600 }}>
        <div className="card">
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={submit}>
            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="nc-name">Full Name *</label>
                <input id="nc-name" name="name" placeholder="Ramesh Patel" value={form.name} onChange={handle} required />
              </div>
              <div className="form-group">
                <label htmlFor="nc-phone">Phone Number *</label>
                <input id="nc-phone" name="phone" type="tel" placeholder="9876543210" value={form.phone} onChange={handle} required />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="nc-email">Email (optional)</label>
              <input id="nc-email" name="email" type="email" placeholder="customer@example.com" value={form.email} onChange={handle} />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="nc-area">Area / Locality</label>
                <input id="nc-area" name="area" placeholder="Andheri West" value={form.area} onChange={handle} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="nc-address">Full Address</label>
              <textarea id="nc-address" name="address" placeholder="Flat no, building, street…" value={form.address} onChange={handle} />
            </div>
            <div className="form-group">
              <label htmlFor="nc-notes">Notes</label>
              <textarea id="nc-notes" name="notes" placeholder="Delivery preferences, dietary requirements…" value={form.notes} onChange={handle} />
            </div>
            <div className="flex gap-12 justify-end">
              <Link to="/customers" className="btn btn-outline">Cancel</Link>
              <button id="btn-create-customer" className="btn btn-primary" disabled={loading}>
                {loading ? 'Creating…' : '✅ Create Customer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
