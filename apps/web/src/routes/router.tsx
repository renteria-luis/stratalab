import type { RouteObject } from 'react-router';
import { LabsPage } from '../labs/LabsPage';
import { ConsoleHome } from '../pages/home/ConsoleHome';
import { ConsolePageView } from '../pages/ConsolePageView';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ServiceReferenceView } from '../pages/ServiceReferenceView';
import { WhenHydrated } from '../console/components/WhenHydrated';
import { SUB_PAGES } from '../console/registry';
import { Shell } from '../shell/Shell';
import { REFERENCE_PREFIX, consolePages } from './appRoutes';
import type { PageHandle } from './pageHandle';

/**
 * Route objects for the data router. Every console page comes from the catalog's nav
 * files (CAT-05); reference pages cover every service; anything else is "not found".
 */
export function appRouteObjects(): RouteObject[] {
  const handle = (value: PageHandle) => value;
  const pages = consolePages();
  return [
    {
      path: '/',
      element: <Shell />,
      children: [
        { index: true, element: <ConsoleHome />, handle: handle({ page: 'home' }) },
        ...pages.map((page): RouteObject => ({
          path: page.path,
          element: <ConsolePageView page={page} />,
          handle: handle({ page: 'console', consolePage: page }),
        })),
        ...SUB_PAGES.map((sub): RouteObject => {
          const parent = pages.find((page) => page.path === sub.parentPath);
          if (parent === undefined) throw new Error(`No console page ${sub.parentPath}`);
          return {
            path: sub.path,
            element: (
              <WhenHydrated>
                <sub.Component />
              </WhenHydrated>
            ),
            handle: handle({ page: 'console', consolePage: parent, subPage: { label: sub.label } }),
          };
        }),
        { path: '/labs', element: <LabsPage />, handle: handle({ page: 'labs' }) },
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
