import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { cards, type Card, type Service } from '@sim/catalog';
import { useNavigate, useParams } from 'react-router';
import { useT } from '../i18n/useT';
import { serviceHref, servicesById } from '../routes/appRoutes';
import { NotFoundPage } from './NotFoundPage';
import { ct } from '../console/text';

/**
 * Study-mode page for any service (catalog skill, "Three kinds of service"):
 * - nav-only: the "No card yet" notice and the official docs link when `docsUrl` exists;
 * - reference: the card under the reference notice;
 * - simulated: a link to its console.
 */
export function ServiceReferenceView() {
  const { serviceId } = useParams();
  const service = serviceId === undefined ? undefined : servicesById.get(serviceId);
  if (!service) return <NotFoundPage />;
  return <ServiceReference service={service} />;
}

function ServiceReference({ service }: { service: Service }) {
  const { t } = useT();
  const card = cards.find((entry) => entry.serviceId === service.id);

  return (
    <ContentLayout
      header={
        <Header variant="h1" description={service.menuDescription}>
          {service.name}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Notice service={service} hasCard={card !== undefined} />
        <Container header={<Header variant="h2">{t('reference.details')}</Header>}>
          <KeyValuePairs
            columns={2}
            items={[
              { label: t('reference.category'), value: service.category },
              {
                label: t('reference.examScope'),
                value: examScope(service, t('reference.examNone')),
              },
            ]}
          />
        </Container>
        {card && <CardView card={card} />}
      </SpaceBetween>
    </ContentLayout>
  );
}

function examScope(service: Service, none: string): string {
  const exams = [service.exam.clf && 'CLF-C02', service.exam.saa && 'SAA-C03'].filter(
    (exam): exam is string => typeof exam === 'string',
  );
  return exams.length === 0 ? none : exams.join(', ');
}

function Notice({ service, hasCard }: { service: Service; hasCard: boolean }) {
  const { t } = useT();
  const navigate = useNavigate();

  // Links go in the Alert's action slot as buttons: a text link on the info background
  // falls below the 4.5:1 contrast WCAG 2.1 AA asks for.
  if (service.kind === 'simulated') {
    const href = serviceHref(service);
    return (
      <Alert
        type="info"
        header={t('reference.simulatedNotice')}
        action={
          <Button
            href={href}
            onFollow={(event) => {
              event.preventDefault();
              void navigate(href);
            }}
          >
            {t('reference.openConsole', { name: service.name })}
          </Button>
        }
      />
    );
  }

  return (
    <Alert
      type="info"
      header={t('reference.notice')}
      action={
        service.docsUrl !== undefined && (
          <Button
            href={service.docsUrl}
            target="_blank"
            external
            i18nStrings={{ externalIconAriaLabel: ct('nav.opensInNewTab') }}
          >
            {t('reference.docsLink')}
          </Button>
        )
      }
    >
      {!hasCard && t('reference.noCard')}
    </Alert>
  );
}

function CardView({ card }: { card: Card }) {
  const { t, locale } = useT();
  const text = card[locale];
  return (
    <Container header={<Header variant="h2">{t('reference.card')}</Header>}>
      <SpaceBetween size="l">
        <Box variant="p">{text.summary}</Box>
        <Section title={t('reference.examCues')} items={text.examCues} />
        <Section
          title={t('reference.notToConfuseWith')}
          items={text.notToConfuseWith.map(
            (entry) =>
              `${servicesById.get(entry.serviceId)?.name ?? entry.serviceId}: ${entry.difference}`,
          )}
        />
        <div>
          <Box variant="h3">{t('reference.pricingModel')}</Box>
          <Box variant="p">{text.pricingModel}</Box>
        </div>
        <div>
          <Box variant="h3">{t('reference.sharedResponsibility')}</Box>
          <Section
            title={t('reference.responsibilityAws')}
            items={text.sharedResponsibility.aws}
            level="h4"
          />
          <Section
            title={t('reference.responsibilityCustomer')}
            items={text.sharedResponsibility.customer}
            level="h4"
          />
        </div>
        <div>
          <Box variant="h3">{t('reference.sources')}</Box>
          <ul>
            {card.sources.map((source) => (
              <li key={source.url}>
                <Link href={source.url} external externalIconAriaLabel={ct('nav.opensInNewTab')}>
                  {source.title}
                </Link>{' '}
                ({t('reference.accessedOn', { date: source.accessedOn })})
              </li>
            ))}
          </ul>
          <Box variant="small">
            {t('reference.cardStatus')}: {card.status}
          </Box>
        </div>
      </SpaceBetween>
    </Container>
  );
}

function Section({
  title,
  items,
  level = 'h3',
}: {
  title: string;
  items: readonly string[];
  level?: 'h3' | 'h4';
}) {
  return (
    <div>
      <Box variant={level}>{title}</Box>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
