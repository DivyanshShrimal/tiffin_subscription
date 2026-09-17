import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
  { to: '/customers', icon: '👥', label: 'Customers' },
  { to: '/billing', icon: '💰', label: 'Billing' },
  { to: '/notifications', icon: '🔔', label: 'Notifications' },
  { to: '/import', icon: '📥', label: 'Import CSV' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">🍱</div>
        <span>TiffinMgr</span>
      </div>
      <nav>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div style={{ marginBottom: 8, color: 'var(--c-text)', fontWeight: 500 }}>
          {user?.name || user?.email}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ padding: '6px 0' }}>
          🚪 Logout
        </button>
      </div>
    </aside>
  );
}
