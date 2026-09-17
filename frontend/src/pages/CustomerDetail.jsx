import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getCustomer,
  updateCustomer,
  deleteCustomer,
  subscribe,
  pauseSubscription,
  resumeSubscription,
  transferSubscription,
  getBill,
  getStatus,
} from '../api/client';
import Layout from '../components/Layout';
import Modal from '../components/Modal';

/* ─── small helpers ─────────────────────────────────── */
function StatusBadge({ status }) {
  if (status === 'active') return <span className="badge badge-success">● Active</span>;
  if (status === 'paused') return <span className="badge badge-warning">⏸ Paused</span>;
  return <span className="badge badge-muted">No plan</span>;
}

function Field({ label, value }) {
  return (
    <div className="detail-field">
      <div className="field-label">{label}</div>
      <div className="field-value">{value || <span className="text-muted">—</span>}</div>
    </div>
  );
}

/* ─── Modals ─────────────────────────────────────────── */
function SubscribeModal({ customerId, onClose, onDone }) {
  const [form, setForm] = useState({ planName: 'Tiffin Plan', monthlyPrice: '', startDate: new Date().toISOString().slice(0, 10), endDate: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const h = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await subscribe(customerId, {
        planName: form.planName,
        monthlyPrice: Number(form.monthlyPrice),
        startDate: form.startDate,
        endDate: form.endDate || undefined,
      });
      onDone();
    } catch (err) {
      setErr(err.response?.data?.message || err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };
  return (
    <Modal title="📋 Subscribe to Plan" onClose={onClose}>
      {err && <div className="error-msg">{err}</div>}
      <form onSubmit={submit}>
        <div className="form-group">
          <label>Plan Name</label>
          <input id="sub-plan" name="planName" placeholder="Tiffin Plan" value={form.planName} onChange={h} required />
        </div>
        <div className="form-group">
          <label>Monthly Price (₹)</label>
          <input id="sub-price" name="monthlyPrice" type="number" min="1" step="0.01" placeholder="2500" value={form.monthlyPrice} onChange={h} required />
        </div>
        <div className="grid-2">
          <div className="form-group">
            <label>Start Date</label>
            <input id="sub-start" name="startDate" type="date" value={form.startDate} onChange={h} required />
          </div>
          <div className="form-group">
            <label>End Date (optional)</label>
            <input id="sub-end" name="endDate" type="date" value={form.endDate} onChange={h} />
          </div>
        </div>
        <div className="flex gap-12 justify-end">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button id="btn-subscribe-submit" className="btn btn-primary" disabled={loading}>
            {loading ? '…' : '✅ Subscribe'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PauseModal({ customerId, onClose, onDone }) {
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const h = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await pauseSubscription(customerId, form);
      onDone();
    } catch (err) {
      setErr(err.response?.data?.message || err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };
  return (
    <Modal title="⏸ Pause Subscription" onClose={onClose}>
      {err && <div className="error-msg">{err}</div>}
      <form onSubmit={submit}>
        <div className="grid-2">
          <div className="form-group">
            <label>Pause From</label>
            <input id="pause-start" name="startDate" type="date" value={form.startDate} onChange={h} required />
          </div>
          <div className="form-group">
            <label>Pause Until</label>
            <input id="pause-end" name="endDate" type="date" value={form.endDate} onChange={h} required />
          </div>
        </div>
        <div className="form-group">
          <label>Reason (optional)</label>
          <input id="pause-reason" name="reason" placeholder="Travel, festival…" value={form.reason} onChange={h} />
        </div>
        <div className="flex gap-12 justify-end">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button id="btn-pause-submit" className="btn btn-success" disabled={loading}>
            {loading ? '…' : '⏸ Pause'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TransferModal({ subscription, onClose, onDone }) {
  const [form, setForm] = useState({ newCustomerId: '', transferDate: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const h = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.newCustomerId) { setErr('New Customer ID is required'); return; }
    setLoading(true);
    try {
      await transferSubscription(subscription.id, {
        newCustomerId: Number(form.newCustomerId),
        transferDate: form.transferDate,
      });
      onDone();
    } catch (err) {
      setErr(err.response?.data?.message || err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };
  return (
    <Modal title="🔄 Transfer Subscription" onClose={onClose}>
      <p className="text-sm text-muted mb-16">
        Transfer subscription #{subscription?.id} mid-cycle to another customer.
        The original subscription will end the day before the transfer date.
      </p>
      {err && <div className="error-msg">{err}</div>}
      <form onSubmit={submit}>
        <div className="form-group">
          <label>New Customer ID</label>
          <input id="transfer-customer-id" name="newCustomerId" type="number" min="1" placeholder="Enter target customer ID…" value={form.newCustomerId} onChange={h} required />
          <div className="text-xs text-muted" style={{ marginTop: 4 }}>Find the customer ID from the Customers list.</div>
        </div>
        <div className="form-group">
          <label>Transfer Date</label>
          <input id="transfer-date" name="transferDate" type="date" value={form.transferDate} onChange={h} required />
        </div>
        <div className="flex gap-12 justify-end">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button id="btn-transfer-submit" className="btn btn-primary" disabled={loading}>
            {loading ? '…' : '🔄 Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditModal({ customer, onClose, onDone }) {
  const [form, setForm] = useState({
    name: customer.name || '',
    phone: customer.phone || '',
    email: customer.email || '',
    address: customer.address || '',
    area: customer.area || '',
    notes: customer.notes || '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const h = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await updateCustomer(customer.id, form);
      onDone();
    } catch (err) {
      setErr(err.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };
  return (
    <Modal title="✏️ Edit Customer" onClose={onClose}>
      {err && <div className="error-msg">{err}</div>}
      <form onSubmit={submit}>
        <div className="grid-2">
          <div className="form-group">
            <label>Name *</label>
            <input id="edit-name" name="name" value={form.name} onChange={h} required />
          </div>
          <div className="form-group">
            <label>Phone *</label>
            <input id="edit-phone" name="phone" value={form.phone} onChange={h} required />
          </div>
        </div>
        <div className="form-group">
          <label>Email</label>
          <input id="edit-email" name="email" type="email" value={form.email} onChange={h} />
        </div>
        <div className="form-group">
          <label>Area</label>
          <input id="edit-area" name="area" value={form.area} onChange={h} />
        </div>
        <div className="form-group">
          <label>Address</label>
          <textarea id="edit-address" name="address" value={form.address} onChange={h} />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea id="edit-notes" name="notes" value={form.notes} onChange={h} />
        </div>
        <div className="flex gap-12 justify-end">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button id="btn-edit-submit" className="btn btn-primary" disabled={loading}>
            {loading ? '…' : '💾 Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── Main Page ───────────────────────────────────────── */
export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'subscribe'|'pause'|'transfer'|'edit'

  // Billing
  const [billMonth, setBillMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [bill, setBill] = useState(null);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState('');

  const load = async () => {
    try {
      const [cRes, sRes] = await Promise.all([getCustomer(id), getStatus(id)]);
      setCustomer(cRes.data.customer);
      setStatus(sRes.data);
    } catch {
      navigate('/customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${customer.name}? This cannot be undone.`)) return;
    try {
      await deleteCustomer(id);
      navigate('/customers');
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const handleResume = async () => {
    try {
      await resumeSubscription(id);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || 'Resume failed');
    }
  };

  const loadBill = async () => {
    setBillError('');
    setBillLoading(true);
    try {
      const res = await getBill(id, billMonth);
      setBill(res.data);
    } catch (err) {
      setBillError(err.response?.data?.error || 'Failed to load bill');
      setBill(null);
    } finally {
      setBillLoading(false);
    }
  };

  const modalDone = () => { setModal(null); load(); };

  if (loading) return <Layout><div className="loading-center"><div className="spinner" /></div></Layout>;
  if (!customer) return null;

  const sub = status?.subscription;
  const pauses = status?.recentPauses || [];

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-12 mb-24">
        <Link to="/customers" className="btn btn-ghost btn-sm">← Back</Link>
        <div style={{ flex: 1 }}>
          <h1 className="page-title">{customer.name}</h1>
          <p className="page-subtitle">{customer.phone} {customer.area ? `· ${customer.area}` : ''}</p>
        </div>
        <div className="flex gap-8">
          <button id="btn-edit" className="btn btn-outline btn-sm" onClick={() => setModal('edit')}>✏️ Edit</button>
          <button id="btn-delete" className="btn btn-danger btn-sm" onClick={handleDelete}>🗑 Delete</button>
        </div>
      </div>

      <div className="detail-grid">
        {/* Left column */}
        <div>
          {/* Customer info */}
          <div className="card mb-24">
            <h3 style={{ marginBottom: 16 }}>Customer Info</h3>
            <Field label="Phone" value={customer.phone} />
            <Field label="Email" value={customer.email} />
            <Field label="Area" value={customer.area} />
            <Field label="Address" value={customer.address} />
            <Field label="Notes" value={customer.notes} />
            <Field label="Customer Since" value={customer.created_at?.slice(0, 10)} />
          </div>

          {/* Subscription */}
          <div className="card mb-24">
            <div className="flex items-center justify-between mb-16">
              <h3>Subscription</h3>
              <StatusBadge status={sub?.status} />
            </div>

            {sub ? (
              <>
                <Field label="Monthly Price" value={`₹${sub.monthly_price}`} />
                <Field label="Start Date" value={sub.start_date} />
                <Field label="End Date" value={sub.end_date} />
                <Field label="Plan ID" value={sub.id} />

                <hr className="divider" />
                <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                  {sub.status === 'active' && (
                    <>
                      <button id="btn-pause" className="btn btn-outline btn-sm" onClick={() => setModal('pause')}>⏸ Pause</button>
                      <button id="btn-transfer" className="btn btn-outline btn-sm" onClick={() => setModal('transfer')}>🔄 Transfer Plan</button>
                    </>
                  )}
                  {sub.status === 'paused' && (
                    <button id="btn-resume" className="btn btn-success btn-sm" onClick={handleResume}>▶ Resume</button>
                  )}
                </div>
              </>
            ) : (
              <div>
                <p className="text-muted text-sm mb-16">No active subscription</p>
                <button id="btn-subscribe" className="btn btn-primary btn-sm" onClick={() => setModal('subscribe')}>+ Subscribe</button>
              </div>
            )}
          </div>

          {/* Pause History */}
          {pauses.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>⏸ Pause History</h3>
              {pauses.map((p) => (
                <div key={p.id} style={{ background: 'var(--c-surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{p.pause_start} → {p.pause_end}</span>
                    {p.is_active ? <span className="badge badge-warning">Active</span> : <span className="badge badge-muted">Past</span>}
                  </div>
                  {p.reason && <div className="text-xs text-muted mt-8">{p.reason}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column – Billing */}
        <div>
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>💰 Bill Calculator</h3>
            <p className="text-sm text-muted mb-16">Calculate the exact bill for any billing month.</p>

            <div className="flex gap-12 items-center mb-16">
              <input
                id="bill-month"
                type="month"
                value={billMonth}
                onChange={(e) => setBillMonth(e.target.value)}
                style={{ flex: 1 }}
              />
              <button id="btn-calc-bill" className="btn btn-primary" onClick={loadBill} disabled={billLoading}>
                {billLoading ? '⏳' : '📊 Calculate'}
              </button>
            </div>

            {billError && <div className="error-msg">{billError}</div>}

            {bill && (
              <>
                {/* Summary stats */}
                <div className="billing-summary">
                  <div className="billing-stat">
                    <div className="b-val" style={{ color: 'var(--c-primary)' }}>₹{bill.totalBill}</div>
                    <div className="b-label">Total Bill</div>
                  </div>
                  <div className="billing-stat">
                    <div className="b-val">{bill.servedWeekdays}</div>
                    <div className="b-label">Served Days</div>
                  </div>
                  <div className="billing-stat">
                    <div className="b-val">{bill.pausedWeekdays}</div>
                    <div className="b-label">Paused Days</div>
                  </div>
                  <div className="billing-stat">
                    <div className="b-val">{bill.totalWeekdaysInMonth}</div>
                    <div className="b-label">Weekdays in Month</div>
                  </div>
                </div>

                <div className="info-box mb-16" style={{ fontSize: '0.82rem' }}>
                  <strong>Daily Rate:</strong> ₹{bill.dailyRate} &nbsp;|&nbsp;
                  <strong>Month:</strong> {bill.month} &nbsp;|&nbsp;
                  {bill.transfers?.length > 0 && <span><strong>Transfers:</strong> {bill.transfers.length}</span>}
                </div>

                {/* Day-by-day breakdown */}
                {bill.dailyBreakdown?.length > 0 && (
                  <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Day</th>
                          <th>Status</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.dailyBreakdown.map((row) => {
                            const status = !row.isWeekday ? 'weekend' : !row.isEligible ? 'uneligible' : row.isPaused ? 'paused' : 'served';
                            return (
                              <tr
                                key={row.date}
                                className={
                                  status === 'served'
                                    ? 'breakdown-row-served'
                                    : status === 'paused'
                                    ? 'breakdown-row-paused'
                                    : 'breakdown-row-uneligible'
                                }
                              >
                                <td>{row.date}</td>
                                <td>{row.dayOfWeek}</td>
                                <td>
                                  {status === 'served' && <span className="badge badge-success">Served</span>}
                                  {status === 'paused' && <span className="badge badge-warning">Paused</span>}
                                  {status === 'weekend' && <span className="badge badge-muted">Weekend</span>}
                                  {status === 'uneligible' && <span className="badge badge-muted">N/A</span>}
                                </td>
                                <td className="text-right">
                                  {status === 'served' ? `₹${bill.dailyRate}` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === 'subscribe' && <SubscribeModal customerId={id} onClose={() => setModal(null)} onDone={modalDone} />}
      {modal === 'pause' && <PauseModal customerId={id} onClose={() => setModal(null)} onDone={modalDone} />}
      {modal === 'transfer' && sub && <TransferModal subscription={sub} onClose={() => setModal(null)} onDone={modalDone} />}
      {modal === 'edit' && <EditModal customer={customer} onClose={() => setModal(null)} onDone={modalDone} />}
    </Layout>
  );
}
