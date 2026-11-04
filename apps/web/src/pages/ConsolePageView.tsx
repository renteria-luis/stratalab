import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { useT } from '../i18n/useT';
import type { ConsolePage } from '../routes/appRoutes';

/**
 * A page of a reproduced console. Functional pages are placeholders until P7 builds them;
 * empty pages show a neutral empty state that gives no hint about any lab.
 */
export function ConsolePageView({ page }: { page: ConsolePage }) {
  const { t } = useT();
  return (
    <ContentLayout
      header={
        <Header variant="h1" counter={page.kind === 'empty' ? '(0)' : undefined}>
          {page.label}
        </Header>
      }
    >
      <Container>
        {page.kind === 'functional' ? (
          <Box padding={{ vertical: 'l' }}>
            <StatusIndicator type="pending">{t('functional.status')}</StatusIndicator>
            <Box variant="p" color="text-body-secondary">
              {t('functional.hint')}
            </Box>
          </Box>
        ) : (
          <Box textAlign="center" padding={{ vertical: 'xl' }} color="text-body-secondary">
            <Box variant="strong" color="inherit">
              {t('empty.title')}
            </Box>
            <Box variant="p" color="inherit">
              {t('empty.hint')}
            </Box>
          </Box>
        )}
      </Container>
    </ContentLayout>
  );
}
