import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCustomers, searchByPhone } from '../api/client';
import Layout from '../components/Layout';

function StatusBadge({ status }) {
  if (status === 'active') return <span className="badge badge-success">● Active</span>;
  if (status === 'paused') return <span className="badge badge-warning">⏸ Paused</span>;
  return <span className="badge badge-muted">No plan</span>;
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const navigate = useNavigate();

  const fetchAll = () => {
    setLoading(true);
    getCustomers({ limit: 200 })
      .then((r) => setCustomers(r.data.customers || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!phone.trim()) { fetchAll(); return; }
    setLoading(true);
    try {
      const r = await searchByPhone(phone.trim());
      setCustomers(r.data.customers || []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = customers.filter((c) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') return c.status === 'active';
    if (statusFilter === 'paused') return c.status === 'paused';
    if (statusFilter === 'none') return !c.status;
    return true;
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-24">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Manage all tiffin subscribers</p>
        </div>
        <div className="flex gap-12">
          <Link to="/import" className="btn btn-outline">📥 Import CSV</Link>
          <Link to="/customers/new" className="btn btn-primary">+ New Customer</Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-24">
        <div className="flex gap-12 items-center" style={{ flexWrap: 'wrap' }}>
          <form onSubmit={handleSearch} className="flex gap-8" style={{ flex: 1, minWidth: 200 }}>
            <input
              id="customer-phone-search"
              type="tel"
              placeholder="Search by phone number…"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ flex: 1 }}
            />
            <button id="btn-search" type="submit" className="btn btn-outline">🔍 Search</button>
            {phone && (
              <button type="button" className="btn btn-ghost" onClick={() => { setPhone(''); fetchAll(); }}>✕ Clear</button>
            )}
          </form>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 160 }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="none">No Plan</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h4>No customers found</h4>
            <p>Try a different search or add a new customer</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Area</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/customers/${c.id}`)}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="text-muted">{c.phone}</td>
                    <td className="text-muted">{c.email || '—'}</td>
                    <td className="text-muted">{c.area || '—'}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Link to={`/customers/${c.id}`} className="btn btn-ghost btn-sm">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-muted mt-8">
          {filtered.length} customer{filtered.length !== 1 ? 's' : ''} shown
        </div>
      </div>
    </Layout>
  );
}
