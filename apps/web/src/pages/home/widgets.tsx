import Box from '@cloudscape-design/components/box';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { validate } from '@sim/engine';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '../../i18n/useT';
import { serviceHref, servicesById } from '../../routes/appRoutes';
import { useUi } from '../../state/uiStore';
import { EMPTY_TOPOLOGY } from '../../topology/emptyTopology';

function EmptyWidget({ title, hint }: { title: string; hint: string }) {
  return (
    <Box textAlign="center" color="text-body-secondary" padding={{ vertical: 'm' }}>
      <Box variant="strong" color="inherit">
        {title}
      </Box>
      <Box variant="p" color="inherit">
        {hint}
      </Box>
    </Box>
  );
}

/** Real local history of services opened in this browser. */
export function RecentlyVisitedWidget() {
  const { t } = useT();
  const navigate = useNavigate();
  const recent = useUi((state) => state.recentServiceIds);
  const services = recent.flatMap((id) => {
    const service = servicesById.get(id);
    return service && service.retired !== true ? [service] : [];
  });

  if (services.length === 0) {
    return <EmptyWidget title={t('menu.recent.empty')} hint={t('menu.recent.emptyHint')} />;
  }
  return (
    <SpaceBetween size="xs">
      {services.map((service) => {
        const href = serviceHref(service);
        return (
          <Link
            key={service.id}
            href={href}
            onFollow={(event) => {
              event.preventDefault();
              void navigate(href);
            }}
          >
            {service.name}
          </Link>
        );
      })}
    </SpaceBetween>
  );
}

export function LabsInProgressWidget() {
  const { t } = useT();
  return <EmptyWidget title={t('home.labs.empty')} hint={t('home.labs.emptyHint')} />;
}

/** Results of the engine's `validate()`; an empty topology until the topology store exists. */
export function TopologyHealthWidget() {
  const { t, tPlural } = useT();
  const topology = EMPTY_TOPOLOGY;
  const issues = useMemo(() => validate(topology), [topology]);

  return (
    <SpaceBetween size="m">
      {issues.length === 0 ? (
        <StatusIndicator type="success">{t('home.health.ok')}</StatusIndicator>
      ) : (
        <SpaceBetween size="xs">
          <StatusIndicator type="warning">
            {tPlural('home.health.issues', issues.length)}
          </StatusIndicator>
          <ul>
            {issues.map((issue) => (
              <li key={`${issue.code}:${issue.path.join('.')}`}>
                <StatusIndicator type={issue.severity === 'error' ? 'error' : 'warning'}>
                  {t(
                    issue.severity === 'error'
                      ? 'home.health.severity.error'
                      : 'home.health.severity.warning',
                  )}
                </StatusIndicator>{' '}
                <code>{issue.code}</code> ({issue.resource.id})
              </li>
            ))}
          </ul>
        </SpaceBetween>
      )}
      <KeyValuePairs
        ariaLabel={t('home.health.resources')}
        columns={3}
        items={[
          { label: t('home.health.vpcs'), value: topology.vpcs.length },
          { label: t('home.health.subnets'), value: topology.subnets.length },
          { label: t('home.health.instances'), value: topology.instances.length },
        ]}
      />
    </SpaceBetween>
  );
}

/** Stays an empty state until a dated price snapshot exists (AGENTS.md, rule 10). */
export function EstimatedCostWidget() {
  const { t } = useT();
  return <EmptyWidget title={t('home.cost.empty')} hint={t('home.cost.emptyHint')} />;
}
