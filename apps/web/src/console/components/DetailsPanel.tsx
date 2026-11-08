import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Tabs, { type TabsProps } from '@cloudscape-design/components/tabs';
import { useT } from '../../i18n/useT';
import { FidelityLabel } from './FidelityLabel';

/**
 * Details of the selected resource under its table, with the console's tabs. Tabs R0
 * doesn't model show an Unsupported notice instead of invented content.
 */
export function DetailsPanel({
  title,
  tabs,
  emptyText,
}: {
  title: string | null;
  tabs: readonly TabsProps.Tab[];
  /** Shown when not exactly one resource is selected, for example "Select a VPC" (captured 2026-11-05). */
  emptyText: string;
}) {
  if (title === null) {
    return (
      <Container>
        <Box textAlign="center" color="text-body-secondary" padding="s">
          {emptyText}
        </Box>
      </Container>
    );
  }
  return (
    <Container header={<Header variant="h2">{title}</Header>} disableContentPaddings={false}>
      <Tabs tabs={[...tabs]} />
    </Container>
  );
}

export function UnsupportedNotice() {
  const { t, locale } = useT();
  return (
    <Box padding="s">
      <span lang={locale}>
        <FidelityLabel fidelity="Unsupported" /> {t('fidelity.notSimulated')}
      </span>
    </Box>
  );
}
