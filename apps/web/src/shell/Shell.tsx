import AppLayout from '@cloudscape-design/components/app-layout';
import BreadcrumbGroup, {
  type BreadcrumbGroupProps,
} from '@cloudscape-design/components/breadcrumb-group';
import Flashbar from '@cloudscape-design/components/flashbar';
import { consoleNavs } from '@sim/catalog';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router';
import type { MessageKey } from '../i18n/translate';
import { useT } from '../i18n/useT';
import { PRODUCT_NAME } from '../product';
import { navItemHref, servicesById } from '../routes/appRoutes';
import { isPageHandle, type PageHandle } from '../routes/pageHandle';
import { useUi, type StorageProblem } from '../state/uiStore';
import { AppFooter, DisclaimerBanner } from './Disclaimers';
import { ConsoleSideNav } from './ConsoleSideNav';
import { TopBar } from './TopBar';
import { shellTokenStyle } from './tokens';
import './shell.css';

const HEADER_ID = 'sim-header';
const FOOTER_ID = 'sim-footer';

const STORAGE_MESSAGES: Readonly<Record<StorageProblem, MessageKey>> = {
  'backed-up': 'storage.backedUp',
  unreadable: 'storage.unreadable',
  'save-failed': 'storage.saveFailed',
};

function useCurrentPage(): { handle: PageHandle; serviceId: string | undefined } {
  const matches = useMatches();
  const last = matches[matches.length - 1];
  const handle: PageHandle = isPageHandle(last?.handle) ? last.handle : { page: 'not-found' };
  if (handle.page === 'console') return { handle, serviceId: handle.consolePage.serviceId };
  const referenceId = handle.page === 'reference' ? last?.params.serviceId : undefined;
  return {
    handle,
    serviceId: referenceId !== undefined && servicesById.has(referenceId) ? referenceId : undefined,
  };
}

/** Banner, top bar, side navigation for reproduced consoles, page content and footer. */
export function Shell() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { handle, serviceId } = useCurrentPage();
  const [menuAnchor, setMenuAnchor] = useState<HTMLDivElement | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const hydrated = useUi((state) => state.hydrated);
  const visitService = useUi((state) => state.visitService);
  const storageProblem = useUi((state) => state.storageProblem);
  const dismissStorageProblem = useUi((state) => state.dismissStorageProblem);

  const service = serviceId === undefined ? undefined : servicesById.get(serviceId);
  const nav = handle.page === 'console' ? consoleNavs[handle.consolePage.serviceId] : undefined;

  // Recently visited is real local history. Waiting for hydration keeps the first visit
  // from being overwritten by the stored list.
  useEffect(() => {
    if (hydrated && serviceId !== undefined) visitService(serviceId);
  }, [hydrated, serviceId, visitService]);

  const pageTitle =
    handle.page === 'home'
      ? t('home.title')
      : handle.page === 'console'
        ? handle.consolePage.label
        : (service?.name ?? t('notFound.title'));
  useEffect(() => {
    document.title = `${pageTitle} | ${PRODUCT_NAME}`;
  }, [pageTitle]);

  // After client-side navigation, move focus to the new page's heading (WCAG 2.4.3).
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    const heading = document.querySelector<HTMLElement>('main h1');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [location.pathname]);

  const breadcrumbs: BreadcrumbGroupProps.Item[] =
    nav && handle.page === 'console' && service
      ? [
          { text: service.name, href: navItemHref(nav.header) },
          ...(handle.consolePage.path === navItemHref(nav.header)
            ? []
            : [{ text: handle.consolePage.label, href: handle.consolePage.path }]),
        ]
      : [];

  return (
    <div style={shellTokenStyle}>
      <div id={HEADER_ID} className="sim-header">
        <DisclaimerBanner />
        <TopBar servicesMenuAnchor={menuAnchor} />
        <div ref={setMenuAnchor} className="sim-services-anchor" />
      </div>
      <AppLayout
        headerSelector={`#${HEADER_ID}`}
        footerSelector={`#${FOOTER_ID}`}
        toolsHide
        navigationHide={nav === undefined}
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => {
          setNavigationOpen(detail.open);
        }}
        navigation={nav && <ConsoleSideNav nav={nav} />}
        breadcrumbs={
          breadcrumbs.length > 0 && (
            <BreadcrumbGroup
              items={breadcrumbs}
              ariaLabel={t('breadcrumbs.ariaLabel')}
              expandAriaLabel={t('breadcrumbs.expandAriaLabel')}
              onFollow={(event) => {
                event.preventDefault();
                void navigate(event.detail.href);
              }}
            />
          )
        }
        notifications={
          storageProblem !== null && (
            <Flashbar
              items={[
                {
                  id: 'storage',
                  type: 'warning',
                  content: t(STORAGE_MESSAGES[storageProblem]),
                  dismissible: true,
                  dismissLabel: t('storage.dismiss'),
                  onDismiss: dismissStorageProblem,
                },
              ]}
            />
          )
        }
        content={<Outlet />}
      />
      <AppFooter id={FOOTER_ID} />
    </div>
  );
}
