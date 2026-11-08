import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { setNameTag, type Vpc } from '@sim/engine';
import { useNavigate } from 'react-router';
import { useTopology } from '../../state/topologyStore';
import { ActionsDropdown } from '../components/Actions';
import { ColumnPairs } from '../components/ColumnPairs';
import { ConsoleLink } from '../components/ConsoleLink';
import { DetailsPanel } from '../components/DetailsPanel';
import { ResourceTable, type ResourceColumn } from '../components/ResourceTable';
import { unsupportedTab } from '../components/unsupportedTab';
import { single, useSelection } from '../components/useSelection';
import { DASH, OWNER_ID, orDash, titleOf } from '../components/values';
import { applyChange, useTopologyReady, useVpcFiltered } from '../data';

/**
 * VPC console › Your VPCs. Columns, actions and labels from the capture
 * `vpc-virtual_private_cloud-your_vpcs.txt` (2026-11-03). Encryption controls, Block Public
 * Access, IPv6, DHCP options, DNS settings and tenancy are not modeled: their cells show "–"
 * or the captured default. Details tab fields, their column grouping and the tab list from
 * `vpc-virtual_private_cloud-your_vpcs-delete_success.txt` (2026-11-06, split panel); the
 * grouping is Inferred from the page text order (the encryption fields end columns 1 and 2).
 */
export function YourVpcs() {
  const topology = useTopology();
  const ready = useTopologyReady();
  const navigate = useNavigate();
  const [selected, setSelected] = useSelection();
  const vpcs = useVpcFiltered(topology.vpcs, (vpc) => vpc.id);
  const current = topology.vpcs.find((vpc) => vpc.id === single(selected)) ?? null;

  const columns: ResourceColumn<Vpc>[] = [
    {
      id: 'name',
      header: 'Name',
      value: (vpc) => orDash(vpc.name),
      editName: (vpc, name) => {
        applyChange((t) => setNameTag(t, { type: 'vpc', id: vpc.id }, name));
      },
    },
    { id: 'id', header: 'VPC ID', value: (vpc) => vpc.id },
    { id: 'state', header: 'State', value: () => 'Available' },
    { id: 'encryption-control-id', header: 'Encryption control ID', value: () => DASH },
    { id: 'encryption-control-mode', header: 'Encryption control mode', value: () => DASH },
    { id: 'block-public-access', header: 'Block Public Access', value: () => 'Off' },
    { id: 'ipv4-cidr', header: 'IPv4 CIDR', value: (vpc) => vpc.cidrBlock },
    { id: 'ipv6-cidr', header: 'IPv6 CIDR', value: () => DASH },
    { id: 'dhcp', header: 'DHCP option set', value: () => DASH },
    {
      id: 'main-route-table',
      header: 'Main route table',
      value: (vpc) => vpc.mainRouteTableId,
      render: (vpc) => <ConsoleLink href="/vpc/route-tables">{vpc.mainRouteTableId}</ConsoleLink>,
    },
    {
      id: 'main-network-acl',
      header: 'Main network ACL',
      value: (vpc) => vpc.defaultNetworkAclId,
      render: (vpc) => (
        <ConsoleLink href="/vpc/network-acls">{vpc.defaultNetworkAclId}</ConsoleLink>
      ),
    },
    { id: 'tenancy', header: 'Tenancy', value: () => 'default' },
    { id: 'default-vpc', header: 'Default VPC', value: () => 'No' },
    { id: 'owner', header: 'Owner ID', value: () => OWNER_ID },
  ];

  const createVpc = () => {
    void navigate('/vpc/create-vpc');
  };

  return (
    <SpaceBetween size="l">
      <ResourceTable
        title="Your VPCs"
        resourceName="VPCs"
        items={vpcs}
        columns={columns}
        trackBy={(vpc) => vpc.id}
        selectedIds={selected}
        onSelectionChange={setSelected}
        loading={!ready}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <ActionsDropdown
              actions={[
                { id: 'create-default-vpc', text: 'Create default VPC', supported: false },
                { id: 'create-flow-log', text: 'Create flow log', supported: false },
                { id: 'edit-vpc-settings', text: 'Edit VPC settings', supported: false },
                { id: 'edit-cidrs', text: 'Edit CIDRs', supported: false },
                { id: 'middlebox', text: 'Manage middlebox routes', supported: false },
                { id: 'encryption', text: 'Create encryption control', supported: false },
                { id: 'manage-tags', text: 'Manage tags', supported: false },
                { id: 'delete', text: 'Delete VPC', supported: false },
              ]}
            />
            <Button variant="primary" onClick={createVpc}>
              Create VPC
            </Button>
          </SpaceBetween>
        }
        empty={{
          title: 'No VPCs',
          description: 'You do not have any VPCs in this region',
          action: <Button onClick={createVpc}>Create VPC</Button>,
        }}
      />
      <DetailsPanel
        title={current === null ? null : titleOf(current.id, current.name)}
        emptyText="Select a VPC"
        tabs={
          current === null
            ? []
            : [
                {
                  id: 'details',
                  label: 'Details',
                  content: (
                    <ColumnPairs
                      columns={[
                        [
                          ['VPC ID', current.id],
                          ['DNS resolution', 'Enabled'],
                          ['Main network ACL', current.defaultNetworkAclId],
                          ['IPv6 CIDR (Network border group)', DASH],
                          ['Encryption control ID', DASH],
                        ],
                        [
                          ['State', 'Available'],
                          ['Tenancy', 'default'],
                          ['Default VPC', 'No'],
                          ['Network Address Usage metrics', 'Disabled'],
                          ['Encryption control mode', DASH],
                        ],
                        [
                          ['Block Public Access', 'Off'],
                          ['DHCP option set', DASH],
                          ['IPv4 CIDR', current.cidrBlock],
                          ['Route 53 Resolver DNS Firewall rule groups', DASH],
                        ],
                        [
                          // Disabled is the captured default of a VPC that isn't the default VPC.
                          ['DNS hostnames', 'Disabled'],
                          ['Main route table', current.mainRouteTableId],
                          ['IPv6 pool', DASH],
                          ['Owner ID', OWNER_ID],
                        ],
                      ]}
                    />
                  ),
                },
                unsupportedTab('resource-map', 'Resource map'),
                unsupportedTab('cidrs', 'CIDRs'),
                unsupportedTab('flow-logs', 'Flow logs'),
                unsupportedTab('tags', 'Tags'),
                unsupportedTab('related-resources', 'Related resources'),
                unsupportedTab('integrations', 'Integrations'),
              ]
        }
      />
    </SpaceBetween>
  );
}
