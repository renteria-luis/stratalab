import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { setNameTag, type Subnet } from '@sim/engine';
import { useNavigate } from 'react-router';
import { useTopology } from '../../state/topologyStore';
import { ActionsDropdown } from '../components/Actions';
import { ColumnPairs } from '../components/ColumnPairs';
import { DetailsPanel } from '../components/DetailsPanel';
import { ResourceTable, type ResourceColumn } from '../components/ResourceTable';
import { RoutesTable } from '../components/RoutesTable';
import { NaclEntriesTable } from '../components/RuleTables';
import { unsupportedTab } from '../components/unsupportedTab';
import { single, useSelection } from '../components/useSelection';
import { DASH, OWNER_ID, arn, idAndName, orDash, titleOf, yesNo } from '../components/values';
import { applyChange, useStatus, useTopologyReady, useVpcFiltered } from '../data';

/**
 * VPC console › Subnets. Columns and actions from the capture
 * `vpc-virtual_private_cloud-subnets.txt` (2026-11-05); "Internet access" values, the
 * "id | name" cells and the Route table and Network ACL tabs from the 2026-11-06 captures
 * (`…-subnets-private.txt`, `…-subnets-public_and_private.txt`,
 * `…-subnets-selection-route_table_tab.txt`, `…-subnets-selection-network_acl_tab.txt`).
 * Details tab fields and their column order from
 * `…-subnets-selection-private-details_tab.txt` (2026-11-06); settings R0 doesn't model show
 * the captured value of a new subnet. Zone IDs, IPv6, customer-owned pools, reservations and
 * DNS settings are not modeled.
 * Associations: RT-01, NACL-01. Internet access: RT-09. Available addresses: ADR-04.
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

  const routeTableOf = (subnet: Subnet) => {
    const id = status.subnets[subnet.id]?.routeTableId;
    if (id === undefined) return DASH;
    return idAndName(id, topology.routeTables.find((table) => table.id === id)?.name);
  };
  const vpcOf = (subnet: Subnet) =>
    idAndName(subnet.vpcId, topology.vpcs.find((vpc) => vpc.id === subnet.vpcId)?.name);
  // "Yes (public)" also when the only internet gateway route is blackhole, as captured (RT-09).
  const internetAccessOf = (subnet: Subnet) => {
    const type = status.subnets[subnet.id]?.type;
    if (type === undefined) return DASH;
    return type === 'public' ? 'Yes (public)' : 'No (private)';
  };
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
    { id: 'vpc', header: 'VPC', value: vpcOf },
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
    // R0 has no Local Zones, so the border group is the region, as captured.
    { id: 'border-group', header: 'Network border group', value: () => topology.region },
    { id: 'route-table', header: 'Route table', value: routeTableOf },
    { id: 'internet-access', header: 'Internet access', value: internetAccessOf },
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
                    <ColumnPairs
                      columns={[
                        [
                          ['Subnet ID', current.id],
                          ['IPv4 CIDR', current.cidrBlock],
                          ['Availability Zone', current.availabilityZone],
                          ['Network ACL', currentStatus.networkAclId],
                          ['Auto-assign customer-owned IPv4 address', 'No'],
                          ['IPv6 CIDR reservations', DASH],
                          ['Resource name DNS AAAA record', 'Disabled'],
                        ],
                        [
                          ['Subnet ARN', arn(topology.region, 'subnet', current.id)],
                          ['Available IPv4 addresses', currentStatus.availableIpv4Count],
                          ['Network border group', topology.region],
                          ['Default subnet', 'No'],
                          ['Customer-owned IPv4 pool', DASH],
                          ['IPv6-only', 'No'],
                          ['DNS64', 'Disabled'],
                        ],
                        [
                          ['State', 'Available'],
                          ['IPv6 CIDR', DASH],
                          ['VPC', vpcOf(current)],
                          ['Auto-assign public IPv4 address', yesNo(current.mapPublicIpOnLaunch)],
                          ['Outpost ID', DASH],
                          ['Hostname type', 'IP name'],
                          ['Owner', OWNER_ID],
                        ],
                        [
                          ['Block Public Access', 'Off'],
                          ['IPv6 CIDR association ID', DASH],
                          ['Route table', routeTableOf(current)],
                          ['Auto-assign IPv6 address', 'No'],
                          ['IPv4 CIDR reservations', DASH],
                          ['Resource name DNS A record', 'Disabled'],
                        ],
                      ]}
                    />
                  ),
                },
                unsupportedTab('flow-logs', 'Flow logs'),
                {
                  id: 'route-table',
                  label: 'Route table',
                  content: (
                    <SpaceBetween size="m">
                      <Header
                        variant="h3"
                        actions={
                          <SpaceBetween direction="horizontal" size="xs">
                            <Button
                              onClick={() => {
                                void navigate(
                                  `/vpc/route-tables/${currentStatus.routeTableId}/edit-routes`,
                                );
                              }}
                            >
                              Edit routes
                            </Button>
                            <Button
                              onClick={() => {
                                go('edit-route-table-association');
                              }}
                            >
                              Replace route table
                            </Button>
                          </SpaceBetween>
                        }
                      >
                        {`Route table: ${currentStatus.routeTableId}`}
                      </Header>
                      <RoutesTable
                        routes={routeTable?.routes ?? []}
                        columns="destination-target"
                        header={
                          <Header
                            variant="h3"
                            counter={`(${String(routeTable?.routes.length ?? 0)})`}
                          >
                            Routes
                          </Header>
                        }
                      />
                    </SpaceBetween>
                  ),
                },
                {
                  id: 'network-acl',
                  label: 'Network ACL',
                  content: (
                    <SpaceBetween size="m">
                      <Header
                        variant="h3"
                        actions={
                          <Button
                            onClick={() => {
                              go('edit-network-acl-association');
                            }}
                          >
                            Replace network ACL
                          </Button>
                        }
                        // Captured for a subnet on the default network ACL only; the text
                        // for an explicit association isn't captured, so none is shown.
                        description={
                          currentStatus.networkAclAssociation === 'default'
                            ? "This subnet uses the VPC's default network ACL."
                            : undefined
                        }
                      >
                        {`Network ACL: ${currentStatus.networkAclId}`}
                      </Header>
                      {(['inbound', 'outbound'] as const).map((direction) => {
                        const entries =
                          (direction === 'inbound' ? acl?.inboundEntries : acl?.outboundEntries) ??
                          [];
                        const label = direction === 'inbound' ? 'Inbound' : 'Outbound';
                        return (
                          <NaclEntriesTable
                            key={direction}
                            direction={direction}
                            entries={entries}
                            header={
                              <Header
                                variant="h3"
                                // The count includes the `*` rule, as captured ("Inbound rules (2)").
                                counter={`(${String(entries.length + 1)})`}
                                actions={
                                  <Button
                                    onClick={() => {
                                      void navigate(
                                        `/vpc/network-acls/${currentStatus.networkAclId}/edit-${direction}-rules`,
                                      );
                                    }}
                                  >
                                    {`Edit ${direction} rules`}
                                  </Button>
                                }
                              >
                                {`${label} rules`}
                              </Header>
                            }
                          />
                        );
                      })}
                    </SpaceBetween>
                  ),
                },
                unsupportedTab('cidr-reservations', 'CIDR reservations'),
                unsupportedTab('sharing', 'Sharing'),
                unsupportedTab('tags', 'Tags'),
                unsupportedTab('related-resources', 'Related resources'),
              ]
        }
      />
    </SpaceBetween>
  );
}
