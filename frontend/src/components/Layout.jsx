/* Protected layout wrapper */
import Sidebar from './Sidebar';

export default function Layout({ children }) {
  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}
