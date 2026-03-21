import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'ダッシュボード' },
  { to: '/lines', label: '回線一覧' },
  { to: '/settings', label: '設定' },
];

const devProgressLabel = 'DEV / feat/compact-lines-view-and-refresh-dev-labels / PR pending';

export function AppLayout(): JSX.Element {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__header">
          <p className="eyebrow">Line Ops Ledger</p>
          <h1>回線運用台帳</h1>
          <p className="muted">Local-first PWA shell</p>
          {import.meta.env.DEV ? <p className="notice">{devProgressLabel}</p> : null}
        </div>

        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
