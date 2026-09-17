import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCustomers, triggerClock, getOutbox } from '../api/client';
import Layout from '../components/Layout';

export default function Dashboard() {
  const [customers, setCustomers] = useState([]);
  const [outbox, setOutbox] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clockDate, setClockDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clockResult, setClockResult] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      getCustomers({ limit: 200 }),
      getOutbox({ limit: 5 }),
    ])
      .then(([c, o]) => {
        setCustomers(c.data.customers || []);
        setOutbox(o.data.notifications || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const active = customers.filter((c) => c.status === 'active');
  const paused = customers.filter((c) => c.status === 'paused');
  const unsubscribed = customers.filter((c) => !c.status);

  const handleClock = async () => {
    setClockLoading(true);
    setClockResult(null);
    try {
      const res = await triggerClock(clockDate);
      // res.data has: { date, generatedCount, eligibleCount, ... }
      setClockResult(res.data);
      // refresh outbox
      const o = await getOutbox({ limit: 5 });
      setOutbox(o.data.notifications || []);
    } catch (err) {
      setClockResult({ error: err.response?.data?.error || 'Clock trigger failed' });
    } finally {
      setClockLoading(false);
    }
  };

  if (loading) return <Layout><div className="loading-center"><div className="spinner" /></div></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-24">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your tiffin subscription business</p>
        </div>
        <Link to="/customers/new" className="btn btn-primary">+ Add Customer</Link>
      </div>

      {/* Stats */}
      <div className="grid-4 mb-24">
        <div className="stat-card">
          <div className="stat-icon purple">👥</div>
          <div>
            <div className="stat-label">Total Customers</div>
            <div className="stat-value">{customers.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">✅</div>
          <div>
            <div className="stat-label">Active</div>
            <div className="stat-value" style={{ color: 'var(--c-success)' }}>{active.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">⏸️</div>
          <div>
            <div className="stat-label">Paused</div>
            <div className="stat-value" style={{ color: 'var(--c-warning)' }}>{paused.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">❌</div>
          <div>
            <div className="stat-label">Unsubscribed</div>
            <div className="stat-value" style={{ color: 'var(--c-muted)' }}>{unsubscribed.length}</div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Clock Panel */}
        <div className="card">
          <h3 style={{ marginBottom: 4 }}>🔔 Daily Clock Trigger</h3>
          <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
            Simulate a morning run to queue delivery notifications (T1).
          </p>
          <div className="flex gap-12 items-center">
            <input
              id="clock-date"
              type="date"
              value={clockDate}
              onChange={(e) => setClockDate(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              id="btn-trigger-clock"
              className="btn btn-primary"
              onClick={handleClock}
              disabled={clockLoading}
            >
              {clockLoading ? '⏳' : '▶ Run'}
            </button>
          </div>
          {clockResult && (
            <div className={`mt-16 ${clockResult.error ? 'error-msg' : 'success-msg'}`}>
              {clockResult.error
                ? clockResult.error
                : `✅ ${clockResult.generatedCount} notification(s) queued for ${clockResult.date}.`}
            </div>
          )}
        </div>

        {/* Recent Notifications */}
        <div className="card">
          <div className="flex items-center justify-between mb-16">
            <h3>📨 Recent Notifications</h3>
            <Link to="/notifications" className="btn btn-ghost btn-sm">View all →</Link>
          </div>
          {outbox.length === 0 ? (
            <div className="text-muted text-sm">No notifications yet. Trigger the daily clock above.</div>
          ) : (
            outbox.map((n) => (
              <div className="outbox-item" key={n.id}>
                <div className="outbox-dot" />
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{n.customer_name}</div>
                  <div className="text-xs text-muted">{n.message}</div>
                  <div className="text-xs text-muted">{n.delivery_date}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent customers */}
      <div className="card mt-24">
        <div className="flex items-center justify-between mb-16">
          <h3>👥 Recent Customers</h3>
          <Link to="/customers" className="btn btn-ghost btn-sm">View all →</Link>
        </div>
        {customers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👤</div>
            <h4>No customers yet</h4>
            <p>Add your first customer to get started</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Area</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td className="text-muted">{c.phone}</td>
                    <td className="text-muted">{c.area || '—'}</td>
                    <td>
                      {c.status === 'active' && <span className="badge badge-success">● Active</span>}
                      {c.status === 'paused' && <span className="badge badge-warning">⏸ Paused</span>}
                      {!c.status && <span className="badge badge-muted">No plan</span>}
                    </td>
                    <td>
                      <Link to={`/customers/${c.id}`} className="btn btn-ghost btn-sm">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
