import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCustomers, getBill } from '../api/client';
import Layout from '../components/Layout';

export default function Billing() {
  const [customers, setCustomers] = useState([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [custLoading, setCustLoading] = useState(true);

  useEffect(() => {
    getCustomers({ limit: 200 })
      .then((r) => setCustomers(r.data.customers || []))
      .finally(() => setCustLoading(false));
  }, []);

  const generateAll = async () => {
    setLoading(true);
    setBills([]);
    const eligible = customers.filter((c) => c.subscription_status);
    const results = await Promise.allSettled(
      eligible.map((c) =>
        getBill(c.id, month).then((r) => ({ customer: c, bill: r.data }))
      )
    );
    const resolved = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);
    setBills(resolved);
    setLoading(false);
  };

  const totalRevenue = bills.reduce((acc, b) => acc + parseFloat(b.bill.totalBill || 0), 0);

  return (
    <Layout>
      <div className="flex items-center justify-between mb-24">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">Generate month-end bills for all active subscribers</p>
        </div>
      </div>

      <div className="card mb-24">
        <div className="flex gap-12 items-center" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="billing-month" style={{ display: 'block', marginBottom: 6, fontSize: '0.82rem', color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Billing Month
            </label>
            <input
              id="billing-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <button
            id="btn-generate-bills"
            className="btn btn-primary"
            onClick={generateAll}
            disabled={loading || custLoading}
            style={{ alignSelf: 'flex-end' }}
          >
            {loading ? '⏳ Calculating…' : '📊 Generate Bills'}
          </button>
        </div>
      </div>

      {bills.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid-3 mb-24">
            <div className="stat-card">
              <div className="stat-icon green">💰</div>
              <div>
                <div className="stat-label">Total Revenue</div>
                <div className="stat-value" style={{ color: 'var(--c-success)' }}>₹{totalRevenue.toFixed(2)}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple">📋</div>
              <div>
                <div className="stat-label">Bills Generated</div>
                <div className="stat-value">{bills.length}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange">📅</div>
              <div>
                <div className="stat-label">Billing Month</div>
                <div className="stat-value" style={{ fontSize: '1.2rem' }}>{month}</div>
              </div>
            </div>
          </div>

          {/* Bills Table */}
          <div className="card">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Weekdays</th>
                    <th>Served</th>
                    <th>Paused</th>
                    <th>Daily Rate</th>
                    <th>Bill Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map(({ customer, bill }) => (
                    <tr key={customer.id}>
                      <td style={{ fontWeight: 600 }}>{customer.name}</td>
                      <td className="text-muted">{customer.phone}</td>
                      <td className="text-muted">{bill.totalWeekdaysInMonth}</td>
                      <td style={{ color: 'var(--c-success)' }}>{bill.servedWeekdays}</td>
                      <td style={{ color: bill.pausedWeekdays > 0 ? 'var(--c-warning)' : 'var(--c-muted)' }}>
                        {bill.pausedWeekdays}
                      </td>
                      <td className="text-muted">₹{bill.dailyRate}</td>
                      <td style={{ fontWeight: 700, color: 'var(--c-primary)' }}>₹{bill.totalBill}</td>
                      <td>
                        <Link to={`/customers/${customer.id}`} className="btn btn-ghost btn-sm">Details →</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {bills.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-icon">💰</div>
          <h4>No bills generated yet</h4>
          <p>Select a billing month and click "Generate Bills" to see results</p>
        </div>
      )}
    </Layout>
  );
}
