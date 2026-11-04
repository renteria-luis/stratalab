import '@cloudscape-design/global-styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { AppProviders } from './App';
import { appRouteObjects } from './routes/router';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

const router = createBrowserRouter(appRouteObjects());

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
