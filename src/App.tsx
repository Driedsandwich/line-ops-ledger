import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'ダッシュボード', end: true },
  { to: '/lines', label: '回線一覧' },
  { to: '/settings', label: '設定' },
];

const devProgressLabel = 'DEV / feat/dashboard-notification-summary / PR #31';

export function AppLayout(): JSX.Element {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__header">
          <p className="eyebrow">Local-first encrypted PWA</p>
          <h1>回線運用台帳</h1>
          <p className="sidebar__description">
            回線・期限・証跡・特典の確認導線を先に固定するための初期シェルです。
          </p>
          {import.meta.env.DEV ? <p className="dev-progress-badge">{devProgressLabel}</p> : null}
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }: { isActive: boolean }) =>
                isActive ? 'nav__item nav__item--active' : 'nav__item'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
