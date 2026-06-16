import { useEffect, useState, type ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router';

type NavItem = { to: string; label: string; end?: boolean; };
type NavSection = { title: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    title: 'メイン',
    items: [
      { to: '/', label: 'ダッシュボード', end: true },
      { to: '/lines', label: '回線一覧', end: true },
    ],
  },
  {
    title: '履歴',
    items: [{ to: '/lines/history', label: '履歴・タイムライン', end: true }],
  },
  {
    title: '設定',
    items: [
      { to: '/settings/storage', label: 'ストレージ' },
      { to: '/settings/backup', label: 'バックアップ' },
      { to: '/settings/notifications', label: '通知設定' },
      { to: '/settings/activity-types', label: '活動種別' },
    ],
  },
];

const devLabel = import.meta.env.VITE_DEV_LABEL as string | undefined;
const themeStorageKey = 'line-ops-ledger.ui-theme';
const sidebarStorageKey = 'line-ops-ledger.sidebar-collapsed';
type ThemeMode = 'light' | 'dark';

function getInitialTheme(): ThemeMode {
  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function AppLayout(): ReactElement {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.localStorage.getItem(sidebarStorageKey) === 'true');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''}`}>
      {isSidebarCollapsed ? (
        <button type="button" className="sidebar-restore" onClick={() => setIsSidebarCollapsed(false)}>
          ナビを開く
        </button>
      ) : null}
      <aside className="sidebar" aria-label="アプリナビゲーション" hidden={isSidebarCollapsed}>
        <div className="sidebar__header">
          <p className="eyebrow">Local-first encrypted PWA</p>
          <h1>回線運用台帳</h1>
          <p className="sidebar__description">
            回線・期限・証跡・特典の確認導線を先に固定するための初期シェルです。
          </p>
          {import.meta.env.DEV && devLabel ? <p className="dev-progress-badge">{devLabel}</p> : null}
          <div className="sidebar__controls" aria-label="表示設定">
            <button
              type="button"
              className="button button--sm"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? 'ライト表示' : 'ダーク表示'}
            </button>
            <button type="button" className="button button--sm" onClick={() => setIsSidebarCollapsed(true)}>
              ナビを閉じる
            </button>
          </div>
        </div>
        <nav className="nav" aria-label="サイドナビゲーション">
          {navSections.map((section) => {
            const sectionId = `side-nav-${section.title}`;
            return (
              <section key={section.title} aria-labelledby={sectionId}>
                <h2 className="nav__section" id={sectionId}>
                  {section.title}
                </h2>
                <ul className="nav__list">
                  {section.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }: { isActive: boolean }) =>
                          isActive ? 'nav__item nav__item--active' : 'nav__item'
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
