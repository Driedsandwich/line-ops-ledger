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

registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
