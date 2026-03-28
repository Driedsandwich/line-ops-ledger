import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './App';
import { DashboardPage } from './pages/DashboardPage';
import { LinesPage } from './pages/LinesPage';
import { SettingsPage } from './pages/SettingsPage';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'lines', element: <LinesPage /> },
      { path: 'settings', element: <SettingsPage /> },
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
