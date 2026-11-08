import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import type { Instance, SecurityGroupRule, Topology } from '@sim/engine';
import type { ReactNode } from 'react';
import { useT } from '../../i18n/useT';
import { FidelityLabel } from '../components/FidelityLabel';
import { LabelWithFidelity } from '../components/FormHelpers';
import { DASH, OWNER_ID, arn, orDash } from '../components/values';
import { PROTOCOL_LABEL, portRangeOf } from '../rules';
import { PLATFORM_DETAILS, USAGE_OPERATION } from './platform';

/**
 * EC2 console › Instances › instance details tabs. Labels, order and the values of an
 * instance launched with the console defaults from the captures
 * `ec2-instances-instances-selection-{details,security,networking,tags}_tab.txt`
 * (2026-11-05, us-east-1). Those captures are of the instance details page; the split panel
 * shows the same sections. Values R0 doesn't model (AMI, instance type, DNS hostnames,
 * metadata options, launch time, reservation) show "–" under an Unsupported label; settings
 * R0 doesn't model show the captured default. Tenancy is always default (Create VPC offers
 * only Default).
 * - Platform details and Usage operation: `platform.ts`.
 * - Addresses: ADR-09 (private), ADR-10 (public, auto-assigned or Elastic IP).
 * - Security groups: SG-03, SG-05.
 */

const COMPUTE_OPTIMIZER = 'Opt-in to AWS Compute Optimizer for recommendations.';

interface Props {
  topology: Topology;
  instance: Instance;
}

type Pair = readonly [label: string, value: ReactNode];

function Pairs({ items }: { items: readonly Pair[] }) {
  return <KeyValuePairs columns={3} items={items.map(([label, value]) => ({ label, value }))} />;
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <SpaceBetween size="s">
      <Header
        variant="h3"
        info={note === undefined ? undefined : <FidelityLabel fidelity="Unsupported" note={note} />}
      >
        {title}
      </Header>
      {children}
    </SpaceBetween>
  );
}

function facts(topology: Topology, instance: Instance) {
  const eni = instance.primaryNetworkInterface;
  const subnet = topology.subnets.find((candidate) => candidate.id === eni.subnetId);
  const groups = eni.securityGroupIds.map((id) => ({
    id,
    group: topology.securityGroups.find((candidate) => candidate.id === id),
  }));
  return {
    eni,
    subnet,
    groups,
    groupsText: groups.map(({ id, group }) => `${id} (${group?.name ?? id})`).join(', '),
    elasticIp: eni.publicIp?.kind === 'elastic-ip' ? eni.publicIp.address : undefined,
    autoAssignedIp: eni.publicIp?.kind === 'auto-assigned' ? eni.publicIp.address : undefined,
  };
}

function LaunchTime() {
  const { t } = useT();
  return (
    <LabelWithFidelity
      label={DASH}
      badge={<FidelityLabel fidelity="Unsupported" note={t('sim.launchTime')} />}
    />
  );
}

export function InstanceDetailsTab({ topology, instance }: Props) {
  const { t } = useT();
  const { eni, subnet, elasticIp, autoAssignedIp } = facts(topology, instance);
  const title = instance.name === undefined ? instance.id : `${instance.id} (${instance.name})`;
  const note = t('sim.instanceDefaults');
  return (
    <SpaceBetween size="l">
      <Section title={`Instance summary for ${title}`} note={note}>
        <Pairs
          items={[
            ['Instance ID', instance.id],
            ['Public IPv4 address', orDash(eni.publicIp?.address)],
            ['Private IPv4 addresses', eni.privateIpAddress],
            ['IPv6 address', DASH],
            ['Instance state', <StatusIndicator type="success">Running</StatusIndicator>],
            ['Public DNS', DASH],
            ['Hostname type', DASH],
            ['Private IP DNS name (IPv4 only)', DASH],
            ['Answer private resource DNS name', DASH],
            ['Instance type', DASH],
            ['Elastic IP addresses', orDash(elasticIp)],
            [
              'Auto-assigned IP address',
              autoAssignedIp === undefined ? DASH : `${autoAssignedIp} [Public IP]`,
            ],
            ['VPC ID', orDash(subnet?.vpcId)],
            ['AWS Compute Optimizer finding', COMPUTE_OPTIMIZER],
            ['IAM role', DASH],
            ['Subnet ID', eni.subnetId],
            ['Auto Scaling group name', DASH],
            ['IMDSv2', DASH],
            ['Instance ARN', arn(topology.region, 'instance', instance.id)],
            ['Managed', 'false'],
            ['Operator', DASH],
          ]}
        />
      </Section>
      <Section title="Instance details" note={note}>
        <Pairs
          items={[
            ['AMI ID', DASH],
            ['Monitoring', 'disabled'],
            ['Platform details', PLATFORM_DETAILS[instance.platform]],
            ['AMI name', DASH],
            ['Allowed image', '-'],
            ['Termination protection', 'Disabled'],
            ['Stop protection', 'Disabled'],
            ['Launch time', <LaunchTime />],
            ['AMI location', DASH],
            ['Instance reboot migration', 'Default (On)'],
            ['Instance auto-recovery', 'Default'],
            ['Lifecycle', 'normal'],
            ['Stop-hibernate behavior', 'Disabled'],
            ['AMI Launch index', '0'],
            ['Key pair assigned at launch', DASH],
            ['State transition reason', DASH],
            ['Credit specification', DASH],
            ['Kernel ID', DASH],
            ['State transition message', DASH],
            ['Usage operation', USAGE_OPERATION[instance.platform]],
            ['RAM disk ID', DASH],
            ['Owner', OWNER_ID],
            ['Enclaves Support', 'Disabled'],
            ['Boot mode', DASH],
            ['Current instance boot mode', DASH],
            ['Allow tags in instance metadata', 'Disabled'],
            ['Use RBN as guest OS hostname', 'Disabled'],
            ['Answer RBN DNS hostname IPv4', 'Enabled'],
          ]}
        />
      </Section>
      <Section title="Host and placement group" note={note}>
        <Pairs
          items={[
            ['Host ID', DASH],
            ['Affinity', DASH],
            ['Placement group', DASH],
            ['Host resource group name', DASH],
            ['Tenancy', 'default'],
            ['Placement group ID', DASH],
            ['Virtualization type', DASH],
            ['Reservation', DASH],
            ['Partition number', DASH],
            ['Number of vCPUs', DASH],
          ]}
        />
      </Section>
      <Section title="Capacity reservation">
        <Pairs
          items={[
            ['Capacity Reservation ID', DASH],
            ['Capacity Reservation setting', 'open'],
          ]}
        />
      </Section>
    </SpaceBetween>
  );
}

interface RuleRow {
  rule: SecurityGroupRule;
  groupName: string;
}

function InstanceRulesTable({
  direction,
  rows,
}: {
  direction: 'inbound' | 'outbound';
  rows: readonly RuleRow[];
}) {
  return (
    <Table<RuleRow>
      variant="embedded"
      // Captured without a counter, unlike the Network Interfaces and Elastic IP tables.
      header={
        <Header variant="h3">{direction === 'inbound' ? 'Inbound rules' : 'Outbound rules'}</Header>
      }
      items={[...rows]}
      trackBy={(row) => row.rule.id}
      columnDefinitions={[
        { id: 'name', header: 'Name', cell: () => DASH },
        { id: 'id', header: 'Security group rule ID', cell: (row) => row.rule.id },
        { id: 'ports', header: 'Port range', cell: (row) => portRangeOf(row.rule) },
        { id: 'protocol', header: 'Protocol', cell: (row) => PROTOCOL_LABEL[row.rule.protocol] },
        {
          id: 'peer',
          header: direction === 'inbound' ? 'Source' : 'Destination',
          cell: (row) =>
            row.rule.peer.type === 'cidr' ? row.rule.peer.cidrBlock : row.rule.peer.securityGroupId,
        },
        { id: 'groups', header: 'Security groups', cell: (row) => row.groupName },
        { id: 'description', header: 'Description', cell: (row) => orDash(row.rule.description) },
      ]}
    />
  );
}

export function InstanceSecurityTab({ topology, instance }: Props) {
  const { groups, groupsText } = facts(topology, instance);
  const rowsOf = (direction: 'inbound' | 'outbound'): RuleRow[] =>
    groups.flatMap(
      ({ id, group }) =>
        (direction === 'inbound' ? group?.inboundRules : group?.outboundRules)?.map((rule) => ({
          rule,
          groupName: group?.name ?? id,
        })) ?? [],
    );
  return (
    <SpaceBetween size="l">
      <Section title="Security details">
        <Pairs
          items={[
            ['IAM role', DASH],
            ['Owner ID', OWNER_ID],
            ['Launch time', <LaunchTime />],
            ['Security groups', groupsText],
          ]}
        />
      </Section>
      <InstanceRulesTable direction="inbound" rows={rowsOf('inbound')} />
      <InstanceRulesTable direction="outbound" rows={rowsOf('outbound')} />
    </SpaceBetween>
  );
}

export function InstanceNetworkingTab({ topology, instance }: Props) {
  const { t } = useT();
  const { eni, subnet, groupsText, elasticIp } = facts(topology, instance);
  const elasticRows = elasticIp === undefined ? [] : [elasticIp];
  return (
    <SpaceBetween size="l">
      <Pairs
        items={[
          ['VPC ID', orDash(subnet?.vpcId)],
          ['Subnet ID', eni.subnetId],
          ['Availability zone', orDash(subnet?.availabilityZone)],
          ['Availability zone ID', DASH],
          ['Outpost ID', DASH],
        ]}
      />
      <Section title="IP addresses">
        <Pairs
          items={[
            ['Public IPv4 address', orDash(eni.publicIp?.address)],
            ['Private IPv4 addresses', eni.privateIpAddress],
            ['IPv6 addresses', DASH],
            ['Secondary private IPv4 addresses', DASH],
            ['Carrier IP addresses (ephemeral)', DASH],
          ]}
        />
      </Section>
      <Section title="Hostname and DNS" note={t('sim.dnsNotModeled')}>
        <Pairs
          items={[
            ['Public DNS', DASH],
            ['Private IP DNS name (IPv4 only)', DASH],
            ['IPv4-only IP based name: A record only', DASH],
            ['Dualstack - IP based name: A and AAAA record', DASH],
            ['IPv6-only - IP based name: AAAA record only', DASH],
            ['Public hostname type', DASH],
            ['Private hostname type', DASH],
            ['Use RBN as guest OS hostname', 'Disabled'],
            ['Answer RBN DNS hostname IPv4', 'Enabled'],
            ['Answer RBN DNS hostname IPv6', '-'],
            ['Answer private resource DNS name', DASH],
          ]}
        />
      </Section>
      <Table
        variant="embedded"
        header={
          <Header variant="h3" counter="(1)">
            Network Interfaces
          </Header>
        }
        items={[eni]}
        trackBy="id"
        columnDefinitions={[
          { id: 'id', header: 'Interface ID', cell: (row) => row.id },
          { id: 'device', header: 'Device index', cell: () => '0' },
          { id: 'card', header: 'Card index', cell: () => '0' },
          { id: 'description', header: 'Description', cell: () => DASH },
          {
            id: 'public',
            header: 'Public IPv4 address',
            cell: (row) => orDash(row.publicIp?.address),
          },
          { id: 'private', header: 'Private IPv4 address', cell: (row) => row.privateIpAddress },
          { id: 'private-dns', header: 'Private IPv4 DNS', cell: () => DASH },
          { id: 'ipv6', header: 'IPv6 addresses', cell: () => DASH },
          { id: 'primary-ipv6', header: 'Primary IPv6 address', cell: () => DASH },
          { id: 'ipv4-prefixes', header: 'IPv4 Prefixes', cell: () => DASH },
          { id: 'ipv6-prefixes', header: 'IPv6 Prefixes', cell: () => DASH },
          { id: 'attachment-time', header: 'Attachment time', cell: () => DASH },
          { id: 'owner', header: 'Interface owner', cell: () => OWNER_ID },
          { id: 'attachment-status', header: 'Attachment status', cell: () => 'attached' },
          { id: 'vpc', header: 'VPC ID', cell: () => orDash(subnet?.vpcId) },
          { id: 'subnet', header: 'Subnet ID', cell: (row) => row.subnetId },
          { id: 'delete-on-terminate', header: 'Delete on terminate', cell: () => 'enabled' },
          { id: 'source-dest', header: 'Source / destination check', cell: () => 'enabled' },
          { id: 'groups', header: 'Security groups', cell: () => groupsText },
          { id: 'type', header: 'Interface type', cell: () => 'Elastic network interface' },
          { id: 'ena-express', header: 'ENA Express', cell: () => DASH },
          { id: 'ena-express-udp', header: 'ENA Express UDP', cell: () => DASH },
          { id: 'ena-queues', header: 'ENA queues', cell: () => DASH },
        ]}
      />
      <Table
        variant="embedded"
        header={
          <Header variant="h3" counter={`(${String(elasticRows.length)})`}>
            Elastic IP addresses
          </Header>
        }
        items={elasticRows}
        trackBy={(address) => address}
        empty="No Elastic IP addresses are associated with this instance"
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: () => DASH },
          { id: 'address', header: 'Allocated IPv4 address', cell: (address) => address },
          // Type, pool and allocation ID of an Elastic IP aren't captured or modeled.
          { id: 'type', header: 'Type', cell: () => DASH },
          { id: 'pool', header: 'Address pool', cell: () => DASH },
          { id: 'allocation', header: 'Allocation ID', cell: () => DASH },
        ]}
      />
    </SpaceBetween>
  );
}

export function InstanceTagsTab({ instance }: { instance: Instance }) {
  const tags = instance.name === undefined ? [] : [{ key: 'Name', value: instance.name }];
  return (
    <Table
      variant="embedded"
      header={
        <Header variant="h3" actions={<Button disabled>Manage tags</Button>}>
          Tags
        </Header>
      }
      items={tags}
      trackBy="key"
      empty="No tags associated with the resource."
      columnDefinitions={[
        { id: 'key', header: 'Key', cell: (tag) => tag.key },
        { id: 'value', header: 'Value', cell: (tag) => tag.value },
      ]}
    />
  );
}
