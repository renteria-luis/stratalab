import AppLayout from '@cloudscape-design/components/app-layout';
import BreadcrumbGroup, {
  type BreadcrumbGroupProps,
} from '@cloudscape-design/components/breadcrumb-group';
import Flashbar, { type FlashbarProps } from '@cloudscape-design/components/flashbar';
import { consoleNavs } from '@sim/catalog';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router';
import type { MessageKey } from '../i18n/translate';
import { useT } from '../i18n/useT';
import { PRODUCT_NAME } from '../product';
import { navItemHref, servicesById } from '../routes/appRoutes';
import { isPageHandle, type PageHandle } from '../routes/pageHandle';
import { LabPanel } from '../labs/LabPanel';
import { LabSync } from '../labs/LabSync';
import { useActiveLab } from '../labs/useActiveLab';
import { labStore, useLabs } from '../state/labStore';
import { useTopologyStore } from '../state/topologyStore';
import { TracePlayer } from '../workbench/TracePlayer';
import { Workbench } from '../workbench/Workbench';
import { useUi, type StorageProblem } from '../state/uiStore';
import { AppFooter, DisclaimerBanner } from './Disclaimers';
import { ConsoleSideNav } from './ConsoleSideNav';
import { TopBar } from './TopBar';
import { shellTokenStyle } from './tokens';
import './shell.css';
import { ct } from '../console/text';

const HEADER_ID = 'sim-header';
const FOOTER_ID = 'sim-footer';

const STORAGE_MESSAGES: Readonly<Record<StorageProblem, MessageKey>> = {
  'backed-up': 'storage.backedUp',
  unreadable: 'storage.unreadable',
  'save-failed': 'storage.saveFailed',
};

const TOPOLOGY_STORAGE_MESSAGES: Readonly<Record<StorageProblem, MessageKey>> = {
  'backed-up': 'storage.topology.backedUp',
  unreadable: 'storage.topology.unreadable',
  'save-failed': 'storage.topology.saveFailed',
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
  const { t, locale } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { handle, serviceId } = useCurrentPage();
  const [menuAnchor, setMenuAnchor] = useState<HTMLDivElement | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const hydrated = useUi((state) => state.hydrated);
  const visitService = useUi((state) => state.visitService);
  const storageProblem = useUi((state) => state.storageProblem);
  const dismissStorageProblem = useUi((state) => state.dismissStorageProblem);
  const topologyProblem = useTopologyStore((state) => state.storageProblem);
  const labProblem = useLabs((state) => state.storageProblem);
  const dismissLabProblem = useLabs((state) => state.dismissStorageProblem);
  const lab = useActiveLab();
  const toolsOpen = useUi((state) => state.labPanelOpen);
  const setToolsOpen = useUi((state) => state.setLabPanelOpen);
  const workbenchOpen = useUi((state) => state.workbenchOpen);
  const setWorkbench = useUi((state) => state.setWorkbench);
  const dismissTopologyProblem = useTopologyStore((state) => state.dismissStorageProblem);

  const service = serviceId === undefined ? undefined : servicesById.get(serviceId);
  const nav = handle.page === 'console' ? consoleNavs[handle.consolePage.serviceId] : undefined;

  // Recently visited is real local history. Waiting for hydration keeps the first visit
  // from being overwritten by the stored list.
  useEffect(() => {
    if (hydrated && serviceId !== undefined) visitService(serviceId);
  }, [hydrated, serviceId, visitService]);

  const pageTitle =
    handle.page === 'home'
      ? ct('home.title')
      : handle.page === 'labs'
        ? t('labs.title')
        : handle.page === 'console'
          ? (handle.subPage?.label ?? handle.consolePage.label)
          : (service?.name ?? t('notFound.title'));
  useEffect(() => {
    document.title = `${pageTitle} | ${PRODUCT_NAME}`;
  }, [pageTitle]);

  // Lab mode: pages outside the solution path are recorded locally for the review.
  useEffect(() => {
    if (lab !== undefined) labStore.getState().recordVisit(location.pathname, lab.relevantRoutes);
  }, [lab, location.pathname]);

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

  const notifications: FlashbarProps.MessageDefinition[] = [
    ...(storageProblem === null
      ? []
      : [
          {
            id: 'storage',
            type: 'warning' as const,
            content: t(STORAGE_MESSAGES[storageProblem]),
            dismissible: true,
            dismissLabel: t('storage.dismiss'),
            onDismiss: dismissStorageProblem,
          },
        ]),
    ...(labProblem === null
      ? []
      : [
          {
            id: 'lab-storage',
            type: 'warning' as const,
            content: t(STORAGE_MESSAGES[labProblem]),
            dismissible: true,
            dismissLabel: t('storage.dismiss'),
            onDismiss: dismissLabProblem,
          },
        ]),
    ...(topologyProblem === null
      ? []
      : [
          {
            id: 'topology-storage',
            type: 'warning' as const,
            content: t(TOPOLOGY_STORAGE_MESSAGES[topologyProblem]),
            dismissible: true,
            dismissLabel: t('storage.dismiss'),
            onDismiss: dismissTopologyProblem,
          },
        ]),
  ];

  const breadcrumbs: BreadcrumbGroupProps.Item[] =
    nav && handle.page === 'console' && service
      ? [
          { text: service.name, href: navItemHref(nav.header) },
          ...(handle.consolePage.path === navItemHref(nav.header)
            ? []
            : [{ text: handle.consolePage.label, href: handle.consolePage.path }]),
          ...(handle.subPage === undefined
            ? []
            : [{ text: handle.subPage.label, href: location.pathname }]),
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
        toolsHide={lab === undefined}
        tools={lab && <LabPanel lab={lab} />}
        toolsOpen={lab !== undefined && toolsOpen}
        onToolsChange={({ detail }) => {
          setToolsOpen(detail.open);
        }}
        splitPanel={<Workbench />}
        splitPanelOpen={workbenchOpen}
        onSplitPanelToggle={({ detail }) => {
          setWorkbench(detail.open);
        }}
        splitPanelPreferences={{ position: 'bottom' }}
        ariaLabels={{
          tools: t('lab.panel'),
          toolsToggle: t('lab.panel'),
          toolsClose: t('lab.panel'),
        }}
        navigationHide={nav === undefined}
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => {
          setNavigationOpen(detail.open);
        }}
        navigation={
          nav && (
            <ConsoleSideNav
              nav={nav}
              activeHref={handle.page === 'console' ? handle.consolePage.path : location.pathname}
            />
          )
        }
        breadcrumbs={
          breadcrumbs.length > 0 && (
            <BreadcrumbGroup
              items={breadcrumbs}
              ariaLabel={ct('breadcrumbs.ariaLabel')}
              expandAriaLabel={ct('breadcrumbs.expandAriaLabel')}
              onFollow={(event) => {
                event.preventDefault();
                void navigate(event.detail.href);
              }}
            />
          )
        }
        notifications={
          notifications.length > 0 && (
            <div lang={locale}>
              <Flashbar items={notifications} />
            </div>
          )
        }
        content={<Outlet />}
      />
      <AppFooter id={FOOTER_ID} />
      <TracePlayer />
      <LabSync />
    </div>
  );
}
