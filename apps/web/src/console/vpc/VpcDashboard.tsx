import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useNavigate } from 'react-router';
import { useTopology } from '../../state/topologyStore';
import { ConsoleLink } from '../components/ConsoleLink';
import { FidelityLabel } from '../components/FidelityLabel';
import { DASH } from '../components/values';
import { regionShortName } from '../data';

interface ResourceCount {
  readonly label: string;
  /** `null`: not modeled (Unsupported). */
  readonly count: number | null;
  readonly href?: string;
}

/**
 * VPC console › VPC dashboard: "Create VPC", "Launch EC2 Instances" and "Resources by
 * Region", in the order of the capture `vpc.txt` (2026-11-03). Resources the simulator
 * can't create count 0; DHCP option sets aren't modeled, so they show "–" as Unsupported.
 * Service Health and the promotional panels are left out (catalog skill, branding limits).
 */
export function VpcDashboard() {
  const topology = useTopology();
  const navigate = useNavigate();
  const region = regionShortName(topology.region);
  const elasticIps = topology.instances.filter(
    (instance) => instance.primaryNetworkInterface.publicIp?.kind === 'elastic-ip',
  ).length;

  const resources: ResourceCount[] = [
    { label: 'VPCs', count: topology.vpcs.length, href: '/vpc/your-vpcs' },
    { label: 'Subnets', count: topology.subnets.length, href: '/vpc/subnets' },
    { label: 'Route Tables', count: topology.routeTables.length, href: '/vpc/route-tables' },
    {
      label: 'Internet Gateways',
      count: topology.internetGateways.length,
      href: '/vpc/internet-gateways',
    },
    { label: 'Egress-only Internet Gateways', count: 0 },
    { label: 'DHCP option sets', count: null },
    { label: 'Elastic IPs', count: elasticIps },
    { label: 'Endpoints', count: 0 },
    { label: 'Instance Connect Endpoints', count: 0 },
    { label: 'Endpoint Services', count: 0 },
    { label: 'NAT Gateways', count: 0 },
    { label: 'VPC Peering Connections', count: 0 },
    { label: 'Network ACLs', count: topology.networkAcls.length, href: '/vpc/network-acls' },
    {
      label: 'Security Groups',
      count: topology.securityGroups.length,
      href: '/vpc/security-groups',
    },
    { label: 'Customer Gateways', count: 0 },
    { label: 'Virtual Private Gateways', count: 0 },
    { label: 'Site-to-Site VPN Connections', count: 0 },
    { label: 'Running Instances', count: topology.instances.length, href: '/ec2/instances' },
  ];

  return (
    <ContentLayout header={<Header variant="h1">VPC dashboard</Header>}>
      <SpaceBetween size="l">
        <Container>
          <SpaceBetween size="s">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="primary"
                onClick={() => {
                  void navigate('/vpc/create-vpc');
                }}
              >
                Create VPC
              </Button>
              <Button
                onClick={() => {
                  void navigate('/ec2/launch-instances');
                }}
              >
                Launch EC2 Instances
              </Button>
            </SpaceBetween>
            <Box variant="small">Note: Your Instances will launch in the United States region.</Box>
          </SpaceBetween>
        </Container>
        <Container
          header={
            <Header
              variant="h2"
              description="You are using the following Amazon VPC resources"
              actions={<Button disabled>Refresh Resources</Button>}
            >
              Resources by Region
            </Header>
          }
        >
          <ColumnLayout columns={3} variant="text-grid">
            {resources.map((resource) => (
              <div key={resource.label}>
                <Box variant="awsui-key-label">
                  {resource.href === undefined ? (
                    resource.label
                  ) : (
                    <ConsoleLink href={resource.href}>{resource.label}</ConsoleLink>
                  )}
                </Box>
                <Box>
                  {region} {resource.count ?? DASH}{' '}
                  {resource.count === null && <FidelityLabel fidelity="Unsupported" />}
                </Box>
                <ConsoleLink href="/reference/global-view">See all regions</ConsoleLink>
              </div>
            ))}
          </ColumnLayout>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
