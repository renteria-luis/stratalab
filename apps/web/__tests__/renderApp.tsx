import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { AppProviders } from '../src/App';
import { appRouteObjects } from '../src/routes/router';

/** Renders the whole app at `path` with an in-memory router. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(appRouteObjects(), { initialEntries: [path] });
  const result = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router };
}

/**
 * Renders one component inside a router. Use it for top-bar parts: in jsdom nothing has a
 * width, so TopNavigation collapses its search slot into an icon button.
 */
export function renderInRouter(ui: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: ['/'] });
  const result = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...result, router };
}
