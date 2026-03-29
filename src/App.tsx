import { NavLink, Outlet } from 'react-router-dom';

type NavItem = { to: string; label: string; end?: boolean; indent?: boolean };

const navItems: NavItem[] = [
  { to: '/', label: 'ダッシュボード', end: true },
  { to: '/lines', label: '回線一覧', end: true },
  { to: '/lines/history', label: '履歴・タイムライン', indent: true },
  { to: '/settings', label: '設定' },
];

const devLabel = import.meta.env.VITE_DEV_LABEL as string | undefined;

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
          {import.meta.env.DEV && devLabel ? <p className="dev-progress-badge">{devLabel}</p> : null}
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }: { isActive: boolean }) => {
                const base = item.indent ? 'nav__item nav__item--sub' : 'nav__item';
                return isActive ? `${base} nav__item--active` : base;
              }}
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
