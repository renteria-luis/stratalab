import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { setMainRouteTable, setNameTag, type RouteTable, type Subnet } from '@sim/engine';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useTopology } from '../../state/topologyStore';
import { ActionsDropdown } from '../components/Actions';
import { ChangeErrors } from '../components/ChangeErrors';
import { DetailsPanel } from '../components/DetailsPanel';
import { failureOf, type ChangeFailure } from '../components/failure';
import { ResourceTable, type ResourceColumn } from '../components/ResourceTable';
import { RoutesTable } from '../components/RoutesTable';
import { unsupportedTab } from '../components/unsupportedTab';
import { single, useSelection } from '../components/useSelection';
import { DASH, OWNER_ID, orDash, titleOf, yesNo } from '../components/values';
import { applyChange, useStatus, useTopologyReady, useVpcFiltered } from '../data';

/**
 * VPC console › Route tables. Columns, actions, tabs and the routes and subnet association
 * tabs from the captures `vpc-virtual_private_cloud-route_tables-selection-*.txt`
 * (2026-11-03). Rules: RT-01 (main table, associations), RT-03 (local route), RT-08 (state).
 */
export function RouteTables() {
  const topology = useTopology();
  const status = useStatus();
  const ready = useTopologyReady();
  const navigate = useNavigate();
  const [selected, setSelected] = useSelection();
  const [confirmMain, setConfirmMain] = useState(false);
  const [failure, setFailure] = useState<ChangeFailure | null>(null);
  const tables = useVpcFiltered(topology.routeTables, (table) => table.vpcId);
  const currentId = single(selected);
  const current = topology.routeTables.find((table) => table.id === currentId) ?? null;
  const currentStatus = current === null ? undefined : status.routeTables[current.id];

  const explicitSubnets = (table: RouteTable) =>
    topology.subnets.filter((subnet) => subnet.routeTableId === table.id);

  const columns: ResourceColumn<RouteTable>[] = [
    {
      id: 'name',
      header: 'Name',
      value: (table) => orDash(table.name),
      editName: (table, name) => {
        applyChange((t) => setNameTag(t, { type: 'route-table', id: table.id }, name));
      },
    },
    { id: 'id', header: 'Route table ID', value: (table) => table.id },
    {
      id: 'explicit',
      header: 'Explicit subnet associations',
      value: (table) =>
        orDash(
          explicitSubnets(table)
            .map((subnet) => subnet.id)
            .join(', '),
        ),
    },
    { id: 'edge', header: 'Edge associations', value: () => DASH },
    {
      id: 'main',
      header: 'Main',
      value: (table) => yesNo(status.routeTables[table.id]?.main ?? false),
    },
    { id: 'vpc', header: 'VPC', value: (table) => table.vpcId },
    { id: 'owner', header: 'Owner ID', value: () => OWNER_ID },
  ];

  const go = (suffix: string) => {
    if (currentId !== null) void navigate(`/vpc/route-tables/${currentId}/${suffix}`);
  };
  const create = () => {
    void navigate('/vpc/create-route-table');
  };

  const explicit = current === null ? [] : explicitSubnets(current);
  const withoutExplicit =
    current === null
      ? []
      : topology.subnets.filter(
          (subnet) => subnet.vpcId === current.vpcId && subnet.routeTableId === undefined,
        );

  return (
    <SpaceBetween size="l">
      <ChangeErrors failure={failure} />
      <ResourceTable
        title="Route tables"
        resourceName="route tables"
        items={tables}
        columns={columns}
        trackBy={(table) => table.id}
        selectedIds={selected}
        onSelectionChange={setSelected}
        loading={!ready}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <ActionsDropdown
              actions={[
                { id: 'view', text: 'View details', supported: false },
                {
                  id: 'set-main',
                  text: 'Set main route table',
                  supported: true,
                  disabled: currentId === null || currentStatus?.main === true,
                  onClick: () => {
                    setConfirmMain(true);
                  },
                },
                {
                  id: 'edit-associations',
                  text: 'Edit subnet associations',
                  supported: true,
                  disabled: currentId === null,
                  onClick: () => {
                    go('edit-subnet-associations');
                  },
                },
                { id: 'edge', text: 'Edit edge associations', supported: false },
                { id: 'propagation', text: 'Edit route propagation', supported: false },
                {
                  id: 'edit-routes',
                  text: 'Edit routes',
                  supported: true,
                  disabled: currentId === null,
                  onClick: () => {
                    go('edit-routes');
                  },
                },
                { id: 'tags', text: 'Manage tags', supported: false },
                { id: 'delete', text: 'Delete route table', supported: false },
              ]}
            />
            <Button variant="primary" onClick={create}>
              Create route table
            </Button>
          </SpaceBetween>
        }
        empty={{
          title: 'No route tables',
          description: 'You do not have any route tables in this region',
          action: <Button onClick={create}>Create route table</Button>,
        }}
      />
      <DetailsPanel
        title={current === null ? null : titleOf(current.id, current.name)}
        emptyText="Select a route table above"
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
                        { label: 'Route table ID', value: current.id },
                        { label: 'Main', value: yesNo(currentStatus.main) },
                        {
                          label: 'Explicit subnet associations',
                          value: orDash(explicit.map((subnet) => subnet.id).join(', ')),
                        },
                        { label: 'Edge associations', value: DASH },
                        { label: 'VPC', value: current.vpcId },
                        { label: 'Owner ID', value: OWNER_ID },
                      ]}
                    />
                  ),
                },
                {
                  id: 'routes',
                  label: 'Routes',
                  content: (
                    <RoutesTable
                      routes={currentStatus.routes}
                      header={
                        <Header
                          variant="h3"
                          counter={`(${String(currentStatus.routes.length)})`}
                          actions={
                            <Button
                              onClick={() => {
                                go('edit-routes');
                              }}
                            >
                              Edit routes
                            </Button>
                          }
                        >
                          Routes
                        </Header>
                      }
                    />
                  ),
                },
                {
                  id: 'subnet-associations',
                  label: 'Subnet associations',
                  content: (
                    <SpaceBetween size="l">
                      <SubnetList
                        title="Explicit subnet associations"
                        subnets={explicit}
                        onEdit={() => {
                          go('edit-subnet-associations');
                        }}
                        empty={
                          <SpaceBetween size="xxs">
                            <Box variant="strong" textAlign="center">
                              No subnet associations
                            </Box>
                            <Box textAlign="center">You do not have any subnet associations.</Box>
                          </SpaceBetween>
                        }
                      />
                      <SubnetList
                        title="Subnets without explicit associations"
                        description="The following subnets have not been explicitly associated with any route tables and are therefore associated with the main route table:"
                        subnets={withoutExplicit}
                        onEdit={() => {
                          go('edit-subnet-associations');
                        }}
                      />
                    </SpaceBetween>
                  ),
                },
                unsupportedTab('edge-associations', 'Edge associations'),
                unsupportedTab('route-propagation', 'Route propagation'),
                unsupportedTab('tags', 'Tags'),
              ]
        }
      />
      <Modal
        visible={confirmMain && current !== null}
        header="Set main route table"
        onDismiss={() => {
          setConfirmMain(false);
        }}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                onClick={() => {
                  setConfirmMain(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (current !== null) {
                    setFailure(failureOf(applyChange((t) => setMainRouteTable(t, current.id))));
                  }
                  setConfirmMain(false);
                }}
              >
                OK
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {current === null ? null : `Set ${current.id} as the main route table of ${current.vpcId}?`}
      </Modal>
    </SpaceBetween>
  );
}

function SubnetList({
  title,
  description,
  subnets,
  onEdit,
  empty,
}: {
  title: string;
  description?: string;
  subnets: readonly Subnet[];
  onEdit: () => void;
  empty?: ReactNode;
}) {
  return (
    <Table<Subnet>
      variant="embedded"
      items={[...subnets]}
      trackBy="id"
      empty={empty}
      header={
        <Header
          variant="h3"
          counter={`(${String(subnets.length)})`}
          description={description}
          actions={<Button onClick={onEdit}>Edit subnet associations</Button>}
        >
          {title}
        </Header>
      }
      columnDefinitions={[
        { id: 'name', header: 'Name', cell: (subnet) => orDash(subnet.name) },
        { id: 'id', header: 'Subnet ID', cell: (subnet) => subnet.id },
        { id: 'ipv4', header: 'IPv4 CIDR', cell: (subnet) => subnet.cidrBlock },
        { id: 'ipv6', header: 'IPv6 CIDR', cell: () => DASH },
      ]}
    />
  );
}
