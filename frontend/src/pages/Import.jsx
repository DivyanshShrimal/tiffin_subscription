import { useState, useRef } from 'react';
import { importCustomers } from '../api/client';
import Layout from '../components/Layout';

const SAMPLE_CSV = `name,phone,email,area,address,monthly_price,start_date
Priya Sharma,9876543210,priya@example.com,Andheri,Flat 4 Sunrise Apts,2500,2025-01-01
Rajan Mehta,9123456780,rajan@example.com,Bandra,12 Hill Road,3000,2025-01-01
Sunita Patel,9988776655,,Juhu,Sea View Complex,2000,2025-02-01`;

export default function Import() {
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText.trim()) { setError('Please paste or upload CSV content.'); return; }
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await importCustomers(csvText);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed. Check CSV format.');
    } finally {
      setLoading(false);
    }
  };

  const loadSample = () => setCsvText(SAMPLE_CSV);

  return (
    <Layout>
      <div className="mb-24">
        <h1 className="page-title">Import Customers</h1>
        <p className="page-subtitle">Bulk onboard customers from a CSV file (T4)</p>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Left: Upload / Paste */}
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>📄 CSV Data</h3>
          <p className="text-sm text-muted mb-16">
            Upload a CSV file or paste its content below. Phone numbers must be unique.
            Existing customers with matching phones are skipped.
          </p>

          <div className="flex gap-8 mb-16">
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current?.click()}>
              📁 Upload File
            </button>
            <button className="btn btn-ghost btn-sm" onClick={loadSample}>
              📋 Load Sample
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            style={{ display: 'none' }}
            id="csv-file-input"
          />

          <textarea
            id="csv-textarea"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Paste CSV content here…"
            style={{ minHeight: 260, fontFamily: 'monospace', fontSize: '0.82rem' }}
          />

          {error && <div className="error-msg mt-16">{error}</div>}

          <button
            id="btn-import-csv"
            className="btn btn-primary w-full mt-16"
            onClick={handleImport}
            disabled={loading}
          >
            {loading ? '⏳ Importing…' : '📥 Import Customers'}
          </button>
        </div>

        {/* Right: Format guide + results */}
        <div>
          <div className="card mb-24">
            <h3 style={{ marginBottom: 12 }}>📋 CSV Format</h3>
            <p className="text-sm text-muted mb-12">Required columns:</p>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Required</th>
                    <th>Example</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['name', '✅ Yes', 'Priya Sharma'],
                    ['phone', '✅ Yes', '9876543210'],
                    ['email', '❌ No', 'priya@example.com'],
                    ['area', '❌ No', 'Andheri'],
                    ['address', '❌ No', 'Flat 4, Sunrise Apts'],
                    ['monthly_price', '❌ No', '2500'],
                    ['start_date', '❌ No', '2025-01-01'],
                  ].map(([col, req, ex]) => (
                    <tr key={col}>
                      <td><code style={{ color: 'var(--c-primary)', fontSize: '0.82rem' }}>{col}</code></td>
                      <td>{req}</td>
                      <td className="text-muted text-sm">{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="info-box mt-16 text-sm">
              📌 If <code>monthly_price</code> and <code>start_date</code> are provided, customers are auto-subscribed to a plan.
            </div>
          </div>

          {/* Import Result */}
          {result && (
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>✅ Import Results</h3>
              <div className="grid-2 mb-16">
                <div className="billing-stat">
                  <div className="b-val" style={{ color: 'var(--c-success)' }}>{result.created}</div>
                  <div className="b-label">Created</div>
                </div>
                <div className="billing-stat">
                  <div className="b-val" style={{ color: 'var(--c-warning)' }}>{result.skipped}</div>
                  <div className="b-label">Skipped (duplicate)</div>
                </div>
              </div>

              {result.errors?.length > 0 && (
                <>
                  <div className="text-sm text-danger mb-8">⚠️ {result.errors.length} row(s) had errors:</div>
                  {result.errors.map((e, i) => (
                    <div key={i} className="error-msg" style={{ marginBottom: 6 }}>
                      Row {e.row}: {e.error}
                    </div>
                  ))}
                </>
              )}

              {result.customers?.length > 0 && (
                <div className="table-wrapper mt-16">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Subscribed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.customers.map((c) => (
                        <tr key={c.id}>
                          <td>{c.name}</td>
                          <td className="text-muted">{c.phone}</td>
                          <td>{c.subscribed ? <span className="badge badge-success">✅ Yes</span> : <span className="badge badge-muted">No</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
