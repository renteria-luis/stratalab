import type { RouteObject } from 'react-router';
import { ConsoleHome } from '../pages/home/ConsoleHome';
import { ConsolePageView } from '../pages/ConsolePageView';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ServiceReferenceView } from '../pages/ServiceReferenceView';
import { Shell } from '../shell/Shell';
import { REFERENCE_PREFIX, consolePages } from './appRoutes';
import type { PageHandle } from './pageHandle';

/**
 * Route objects for the data router. Every console page comes from the catalog's nav
 * files (CAT-05); reference pages cover every service; anything else is "not found".
 */
export function appRouteObjects(): RouteObject[] {
  const handle = (value: PageHandle) => value;
  return [
    {
      path: '/',
      element: <Shell />,
      children: [
        { index: true, element: <ConsoleHome />, handle: handle({ page: 'home' }) },
        ...consolePages().map((page): RouteObject => ({
          path: page.path,
          element: <ConsolePageView page={page} />,
          handle: handle({ page: 'console', consolePage: page }),
        })),
        {
          path: `${REFERENCE_PREFIX}/:serviceId`,
          element: <ServiceReferenceView />,
          handle: handle({ page: 'reference' }),
        },
        { path: '*', element: <NotFoundPage />, handle: handle({ page: 'not-found' }) },
      ],
    },
  ];
}
