import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { setNameTag, type Subnet } from '@sim/engine';
import { useNavigate } from 'react-router';
import { useTopology } from '../../state/topologyStore';
import { ActionsDropdown } from '../components/Actions';
import { DetailsPanel } from '../components/DetailsPanel';
import { ResourceTable, type ResourceColumn } from '../components/ResourceTable';
import { RoutesTable } from '../components/RoutesTable';
import { NaclEntriesTable } from '../components/RuleTables';
import { unsupportedTab } from '../components/unsupportedTab';
import { single, useSelection } from '../components/useSelection';
import { DASH, OWNER_ID, arn, orDash, titleOf, yesNo } from '../components/values';
import { applyChange, useStatus, useTopologyReady, useVpcFiltered } from '../data';

/**
 * VPC console › Subnets. Columns, actions, tabs and detail fields from the capture
 * `vpc-virtual_private_cloud-subnets.txt` (2026-11-03). Zone IDs, IPv6, customer-owned
 * pools, reservations and DNS settings are not modeled.
 * Associations: RT-01, NACL-01. Available addresses: ADR-04.
 */
export function Subnets() {
  const topology = useTopology();
  const status = useStatus();
  const ready = useTopologyReady();
  const navigate = useNavigate();
  const [selected, setSelected] = useSelection();
  const subnets = useVpcFiltered(topology.subnets, (subnet) => subnet.vpcId);
  const currentId = single(selected);
  const current = topology.subnets.find((subnet) => subnet.id === currentId) ?? null;
  const currentStatus = current === null ? undefined : status.subnets[current.id];

  const routeTableOf = (subnet: Subnet) => status.subnets[subnet.id]?.routeTableId ?? DASH;
  const aclOf = (subnet: Subnet) => status.subnets[subnet.id]?.networkAclId ?? DASH;

  const columns: ResourceColumn<Subnet>[] = [
    {
      id: 'name',
      header: 'Name',
      value: (subnet) => orDash(subnet.name),
      editName: (subnet, name) => {
        applyChange((t) => setNameTag(t, { type: 'subnet', id: subnet.id }, name));
      },
    },
    { id: 'id', header: 'Subnet ID', value: (subnet) => subnet.id },
    { id: 'state', header: 'State', value: () => 'Available' },
    { id: 'vpc', header: 'VPC', value: (subnet) => subnet.vpcId },
    { id: 'bpa', header: 'Block Public Access', value: () => 'Off' },
    { id: 'ipv4', header: 'IPv4 CIDR', value: (subnet) => subnet.cidrBlock },
    { id: 'ipv6', header: 'IPv6 CIDR', value: () => DASH },
    { id: 'ipv6-association', header: 'IPv6 CIDR association ID', value: () => DASH },
    {
      id: 'available',
      header: 'Available IPv4 addresses',
      value: (subnet) => String(status.subnets[subnet.id]?.availableIpv4Count ?? DASH),
    },
    { id: 'az', header: 'Availability Zone', value: (subnet) => subnet.availabilityZone },
    { id: 'route-table', header: 'Route table', value: routeTableOf },
    { id: 'network-acl', header: 'Network ACL', value: aclOf },
    { id: 'default', header: 'Default subnet', value: () => 'No' },
    {
      id: 'auto-public',
      header: 'Auto-assign public IPv4 address',
      value: (subnet) => yesNo(subnet.mapPublicIpOnLaunch),
    },
    { id: 'auto-coip', header: 'Auto-assign customer-owned IPv4 address', value: () => 'No' },
    { id: 'coip-pool', header: 'Customer-owned IPv4 pool', value: () => '-' },
    { id: 'auto-ipv6', header: 'Auto-assign IPv6 address', value: () => 'No' },
    { id: 'owner', header: 'Owner ID', value: () => OWNER_ID },
  ];

  const go = (suffix: string) => {
    if (currentId !== null) void navigate(`/vpc/subnets/${currentId}/${suffix}`);
  };
  const create = () => {
    void navigate('/vpc/create-subnet');
  };
  const routeTable =
    currentStatus === undefined ? undefined : status.routeTables[currentStatus.routeTableId];
  const acl =
    currentStatus === undefined
      ? undefined
      : topology.networkAcls.find((candidate) => candidate.id === currentStatus.networkAclId);

  return (
    <SpaceBetween size="l">
      <ResourceTable
        title="Subnets"
        resourceName="subnets"
        items={subnets}
        columns={columns}
        trackBy={(subnet) => subnet.id}
        selectedIds={selected}
        onSelectionChange={setSelected}
        loading={!ready}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <ActionsDropdown
              actions={[
                { id: 'view', text: 'View details', supported: false },
                { id: 'flow-log', text: 'Create flow log', supported: false },
                {
                  id: 'edit-settings',
                  text: 'Edit subnet settings',
                  supported: true,
                  disabled: currentId === null,
                  onClick: () => {
                    go('edit-subnet-settings');
                  },
                },
                { id: 'ipv6', text: 'Edit IPv6 CIDRs', supported: false },
                {
                  id: 'edit-acl',
                  text: 'Replace network ACL',
                  supported: true,
                  disabled: currentId === null,
                  onClick: () => {
                    go('edit-network-acl-association');
                  },
                },
                {
                  id: 'edit-rtb',
                  text: 'Replace route table',
                  supported: true,
                  disabled: currentId === null,
                  onClick: () => {
                    go('edit-route-table-association');
                  },
                },
                { id: 'reservations', text: 'Edit CIDR reservations', supported: false },
                { id: 'share', text: 'Share subnet', supported: false },
                { id: 'tags', text: 'Manage tags', supported: false },
                { id: 'delete', text: 'Delete subnet', supported: false },
              ]}
            />
            <Button variant="primary" onClick={create}>
              Create subnet
            </Button>
          </SpaceBetween>
        }
        empty={{
          title: 'No subnets',
          description: 'You do not have any subnets in this region',
          action: <Button onClick={create}>Create subnet</Button>,
        }}
      />
      <DetailsPanel
        title={current === null ? null : titleOf(current.id, current.name)}
        emptyText="Select a subnet"
        tabs={
          current === null || currentStatus === undefined
            ? []
            : [
                {
                  id: 'details',
                  label: 'Details',
                  content: (
                    <KeyValuePairs
                      columns={4}
                      items={[
                        { label: 'Subnet ID', value: current.id },
                        { label: 'IPv4 CIDR', value: current.cidrBlock },
                        { label: 'Availability Zone', value: current.availabilityZone },
                        { label: 'Default subnet', value: 'No' },
                        { label: 'Subnet ARN', value: arn(topology.region, 'subnet', current.id) },
                        {
                          label: 'Available IPv4 addresses',
                          value: currentStatus.availableIpv4Count,
                        },
                        { label: 'VPC', value: current.vpcId },
                        {
                          label: 'Auto-assign public IPv4 address',
                          value: yesNo(current.mapPublicIpOnLaunch),
                        },
                        { label: 'Owner', value: OWNER_ID },
                        { label: 'State', value: 'Available' },
                        { label: 'IPv6 CIDR', value: DASH },
                        { label: 'Route table', value: currentStatus.routeTableId },
                        { label: 'Auto-assign IPv6 address', value: 'No' },
                        { label: 'Block Public Access', value: 'Off' },
                        { label: 'Network ACL', value: currentStatus.networkAclId },
                      ]}
                    />
                  ),
                },
                unsupportedTab('flow-logs', 'Flow logs'),
                {
                  id: 'route-table',
                  label: 'Route table',
                  content: (
                    <RoutesTable
                      routes={routeTable?.routes ?? []}
                      header={
                        <Header
                          variant="h3"
                          actions={
                            <Button
                              onClick={() => {
                                go('edit-route-table-association');
                              }}
                            >
                              Edit route table association
                            </Button>
                          }
                        >
                          {`Route table: ${currentStatus.routeTableId}`}
                        </Header>
                      }
                    />
                  ),
                },
                {
                  id: 'network-acl',
                  label: 'Network ACL',
                  content: (
                    <SpaceBetween size="l">
                      <NaclEntriesTable
                        direction="inbound"
                        entries={acl?.inboundEntries ?? []}
                        header={
                          <Header
                            variant="h3"
                            actions={
                              <Button
                                onClick={() => {
                                  go('edit-network-acl-association');
                                }}
                              >
                                Edit network ACL association
                              </Button>
                            }
                          >
                            {`Network ACL: ${currentStatus.networkAclId}`}
                          </Header>
                        }
                      />
                      <NaclEntriesTable direction="outbound" entries={acl?.outboundEntries ?? []} />
                    </SpaceBetween>
                  ),
                },
                unsupportedTab('cidr-reservations', 'CIDR reservations'),
                unsupportedTab('sharing', 'Sharing'),
                unsupportedTab('tags', 'Tags'),
              ]
        }
      />
    </SpaceBetween>
  );
}
