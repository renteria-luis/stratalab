import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import { FUNCTIONAL_VIEWS } from '../console/registry';
import { ct } from '../console/text';
import type { ConsolePage } from '../routes/appRoutes';

/**
 * A page of a reproduced console. Functional pages render their view; every other page
 * shows a neutral empty state that gives no hint about any lab (catalog skill, lab mode).
 */
export function ConsolePageView({ page }: { page: ConsolePage }) {
  const View = page.kind === 'functional' ? FUNCTIONAL_VIEWS[page.path] : undefined;
  if (View !== undefined) return <View />;
  return (
    <ContentLayout
      header={
        <Header variant="h1" counter="(0)">
          {page.label}
        </Header>
      }
    >
      <Container>
        <Box textAlign="center" padding={{ vertical: 'xl' }} color="text-body-secondary">
          <Box variant="strong" color="inherit">
            {ct('empty.title')}
          </Box>
          <Box variant="p" color="inherit">
            {ct('empty.hint')}
          </Box>
        </Box>
      </Container>
    </ContentLayout>
  );
}
