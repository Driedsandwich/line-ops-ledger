import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppLayout } from './App';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { LinesPage } from './pages/LinesPage';
import { SettingsPage, type SettingsSectionKey } from './pages/SettingsPage';
import './styles.css';

function settingsRoute(section: SettingsSectionKey): { path: string; element: JSX.Element } {
  return {
    path: `settings/${section}`,
    element: <SettingsPage section={section} />,
  };
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'lines', element: <LinesPage /> },
      { path: 'lines/history', element: <HistoryPage /> },
      { path: 'settings', element: <Navigate to="/settings/storage" replace /> },
      settingsRoute('storage'),
      settingsRoute('backup'),
      settingsRoute('notifications'),
      settingsRoute('activity-types'),
    ],
  },
]);

async function registerServiceWorker(): Promise<void> {
  if (import.meta.env.DEV) {
    return;
  }

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.error('service worker registration failed', error);
    }
  }
}

const DEV_SW_CLEANUP_FLAG = 'line-ops-ledger.dev-sw-cleanup-done';

async function cleanupDevServiceWorkerArtifacts(): Promise<void> {
  if (!import.meta.env.DEV) {
    return;
  }

  if (sessionStorage.getItem(DEV_SW_CLEANUP_FLAG) === '1') {
    return;
  }

  let shouldReload = false;

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) {
        shouldReload = true;
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    }

    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      if (cacheKeys.length > 0) {
        shouldReload = true;
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
    }
  } catch (error) {
    console.warn('dev service worker cleanup failed', error);
  } finally {
    sessionStorage.setItem(DEV_SW_CLEANUP_FLAG, '1');
  }

  if (shouldReload) {
    window.location.reload();
  }
}

registerServiceWorker();
void cleanupDevServiceWorkerArtifacts();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
