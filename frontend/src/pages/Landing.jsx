import { Link } from 'react-router-dom';

const features = [
  {
    icon: '👥',
    title: 'Customer Management',
    desc: 'Create, update, search customers by phone number. Full lifecycle management.',
  },
  {
    icon: '📋',
    title: 'Subscription Plans',
    desc: 'Subscribe customers to monthly tiffin plans with custom pricing and start dates.',
  },
  {
    icon: '⏸️',
    title: 'Pause & Resume',
    desc: 'Customers can pause deliveries for travel or festivals. Paused days are never billed.',
  },
  {
    icon: '💰',
    title: 'Smart Billing',
    desc: 'Month-end bills calculated from actual weekdays served. Transparent day-by-day audit trail.',
  },
  {
    icon: '🔔',
    title: 'Daily Notifications',
    desc: 'Automatically identify which customers are due a delivery each morning. (T1)',
  },
  {
    icon: '📥',
    title: 'Bulk CSV Import',
    desc: 'Onboard many customers at once by uploading a formatted CSV file. (T4)',
  },
  {
    icon: '🔄',
    title: 'Plan Transfers',
    desc: 'Transfer an active subscription mid-cycle to a new plan with pro-rated billing. (T6)',
  },
  {
    icon: '🔒',
    title: 'Secure Access',
    desc: 'JWT-based authentication ensures only the owner can manage the system.',
  },
];

export default function Landing() {
  return (
    <div style={{ minHeight: '100vh' }}>
      {/* NAV */}
      <nav className="landing-nav">
        <div className="landing-logo">
          <span>🍱</span> TiffinMgr
        </div>
        <div className="flex gap-12">
          <Link to="/login" className="btn btn-outline btn-sm">Login</Link>
          <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
        </div>
      </nav>

      {/* HERO */}
      <div className="landing-hero">
        <h1>Home-Style Tiffin Delivery,<br />Managed Effortlessly</h1>
        <p>
          A complete subscription management system for tiffin providers.
          Track customers, manage pauses, and generate accurate month-end bills automatically.
        </p>
        <div className="landing-cta-row">
          <Link to="/register" className="btn btn-primary btn-lg">🚀 Start for Free</Link>
          <Link to="/login" className="btn btn-outline btn-lg">Sign In</Link>
        </div>
      </div>

      {/* FEATURES */}
      <div className="landing-features">
        <h2>Everything You Need to Run Your Tiffin Business</h2>
        <div className="features-grid">
          {features.map((f) => (
            <div className="feature-card" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* STORY SECTION */}
      <div style={{ background: 'var(--c-surface)', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)', padding: '60px 40px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: 16, fontSize: '1.7rem' }}>How It Works</h2>
        <p style={{ color: 'var(--c-muted)', maxWidth: 640, margin: '0 auto 40px' }}>
          Customers subscribe to a monthly tiffin plan and receive lunch every weekday.
          When they travel or celebrate festivals, they pause — and those days are never billed.
          At month-end, the owner gets a precise, transparent bill for each customer.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, maxWidth: 800, margin: '0 auto' }}>
          {[
            { step: '1', label: 'Register & Login', icon: '🔐' },
            { step: '2', label: 'Add Customers', icon: '👤' },
            { step: '3', label: 'Set Subscriptions', icon: '📅' },
            { step: '4', label: 'Manage Pauses', icon: '⏸️' },
            { step: '5', label: 'Generate Bills', icon: '💳' },
          ].map((s) => (
            <div key={s.step} style={{ background: 'var(--c-surface2)', borderRadius: 12, padding: '20px 16px', border: '1px solid var(--c-border)' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--c-primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Step {s.step}</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <footer className="landing-footer">
        © {new Date().getFullYear()} TiffinMgr — Home-Style Tiffin Subscription Management
      </footer>
    </div>
  );
}
