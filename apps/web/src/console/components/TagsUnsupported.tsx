import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { FidelityLabel } from './FidelityLabel';

/**
 * The captured "Tags" section of create forms. R0 models only the Name tag, so other tags
 * are Unsupported; the section stays for muscle memory.
 */
export function TagsUnsupported({
  title = 'Tags',
  description,
  emptyText,
  addLabel,
  remainingText,
}: {
  title?: string;
  description?: string;
  emptyText: string;
  addLabel: string;
  remainingText: string;
}) {
  return (
    <Container
      header={
        <Header
          variant="h2"
          description={description}
          info={<FidelityLabel fidelity="Unsupported" />}
        >
          {title}
        </Header>
      }
    >
      <SpaceBetween size="s">
        <Box color="text-body-secondary">{emptyText}</Box>
        <Button formAction="none" disabled>
          {addLabel}
        </Button>
        <Box variant="small" color="text-body-secondary">
          {remainingText}
        </Box>
      </SpaceBetween>
    </Container>
  );
}
