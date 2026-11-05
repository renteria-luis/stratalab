import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useNavigate } from 'react-router';
import { ConsoleLink } from '../components/ConsoleLink';

/**
 * EC2 console home, from the capture `ec2.txt` (2026-11-03): title, one-line description,
 * "Launch a virtual server" and "Additional actions". The marketing, pricing and related
 * services panels are left out; prices never appear outside a dated snapshot (AGENTS.md, rule 10).
 */
export function Ec2Home() {
  const navigate = useNavigate();
  return (
    <ContentLayout
      header={
        <SpaceBetween size="xxs">
          <Box variant="small">Compute</Box>
          <Header
            variant="h1"
            description="Create, manage, and monitor virtual servers in the cloud."
          >
            Amazon Elastic Compute Cloud (EC2)
          </Header>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Launch a virtual server</Header>}>
          <Button
            variant="primary"
            onClick={() => {
              void navigate('/ec2/launch-instances');
            }}
          >
            Launch instance
          </Button>
        </Container>
        <Container header={<Header variant="h2">Additional actions</Header>}>
          <ConsoleLink href="/ec2/instances">View running instances</ConsoleLink>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
