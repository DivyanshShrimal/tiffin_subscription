import { useState } from 'react';
import { getOutbox, triggerClock } from '../api/client';
import Layout from '../components/Layout';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [fetched, setFetched] = useState(false);

  // Clock trigger state
  const [clockDate, setClockDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clockResult, setClockResult] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (dateFilter) params.date = dateFilter;
      const res = await getOutbox(params);
      setNotifications(res.data.notifications || []);
      setFetched(true);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClock = async () => {
    setClockLoading(true);
    setClockResult(null);
    try {
      const res = await triggerClock(clockDate);
      setClockResult(res.data);
      // auto-refresh notifications
      await fetchNotifications();
    } catch (err) {
      setClockResult({ error: err.response?.data?.error || 'Failed' });
    } finally {
      setClockLoading(false);
    }
  };

  return (
    <Layout>
      <div className="mb-24">
        <h1 className="page-title">Notifications</h1>
        <p className="page-subtitle">Daily delivery notification outbox (T1)</p>
      </div>

      <div className="grid-2 mb-24">
        {/* Clock trigger */}
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>🔔 Daily Clock Trigger</h3>
          <p className="text-sm text-muted mb-16">
            Simulate the morning run that identifies customers due a delivery and queues notifications.
            Duplicate calls for the same date are idempotent.
          </p>
          <div className="form-group">
            <label htmlFor="notif-clock-date">Delivery Date</label>
            <input
              id="notif-clock-date"
              type="date"
              value={clockDate}
              onChange={(e) => setClockDate(e.target.value)}
            />
          </div>
          <button
            id="btn-trigger-clock-notif"
            className="btn btn-primary w-full"
            onClick={handleClock}
            disabled={clockLoading}
          >
            {clockLoading ? '⏳ Processing…' : '▶ Trigger Clock'}
          </button>
          {clockResult && (
            <div className={`mt-16 ${clockResult.error ? 'error-msg' : 'success-msg'}`}>
              {clockResult.error
                ? clockResult.error
                : `✅ ${clockResult.queued} notification(s) queued for ${clockResult.date}.`}
            </div>
          )}
        </div>

        {/* Outbox filter */}
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>📨 View Outbox</h3>
          <p className="text-sm text-muted mb-16">
            Browse notifications already queued. Filter by date to see a specific day's deliveries.
          </p>
          <div className="form-group">
            <label htmlFor="notif-date-filter">Filter by Date (optional)</label>
            <input
              id="notif-date-filter"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
          <button
            id="btn-load-outbox"
            className="btn btn-outline w-full"
            onClick={fetchNotifications}
            disabled={loading}
          >
            {loading ? '⏳ Loading…' : '📋 Load Notifications'}
          </button>
        </div>
      </div>

      {/* Notifications list */}
      {fetched && (
        <div className="card">
          <div className="flex items-center justify-between mb-16">
            <h3>Queued Notifications</h3>
            <span className="badge badge-primary">{notifications.length} total</span>
          </div>

          {notifications.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <div className="empty-icon">🔕</div>
              <h4>No notifications found</h4>
              <p>Trigger the daily clock to queue deliveries</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Message</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={n.id}>
                      <td className="text-muted">{n.id}</td>
                      <td>{n.delivery_date}</td>
                      <td style={{ fontWeight: 500 }}>{n.customer_name}</td>
                      <td className="text-muted">{n.phone}</td>
                      <td className="text-sm text-muted">{n.message}</td>
                      <td>
                        <span className={`badge ${n.status === 'sent' ? 'badge-success' : 'badge-primary'}`}>
                          {n.status || 'queued'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
