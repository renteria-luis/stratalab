import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import {
  associateRouteTable,
  cidr,
  createRouteTable,
  disassociateRouteTable,
  replaceRoutes,
  type HelperResult,
  type Subnet,
  type Topology,
} from '@sim/engine';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useUi } from '../../state/uiStore';
import { useTopology } from '../../state/topologyStore';
import { FidelityLabel } from '../components/FidelityLabel';
import { FormPage } from '../components/FormPage';
import { NotFoundResource } from '../components/NotFoundResource';
import { TagsUnsupported } from '../components/TagsUnsupported';
import { useChange } from '../components/useChange';
import { DASH, orDash } from '../components/values';
import { VpcSelect } from '../components/VpcSelect';
import { useStatus } from '../data';
import { andThen } from '../../topology/compose';

/**
 * Route table forms. Labels from the captures (2026-11-05)
 * `vpc-virtual_private_cloud-route_tables-create_route_table.txt`,
 * `vpc-virtual_private_cloud-route_tables-selection-routes_tab-edit_routes.txt` and
 * `vpc-virtual_private_cloud-route_tables-selection-subnet_associations_tab-edit_subnet_associations.txt`.
 * Validation messages aren't captured (they need a failed submit); they follow the docs.
 * Rules: RT-12 (create), RT-03, RT-04, RT-11 (routes), RT-01 (associations).
 */

/** The Edit routes page writes origins without spaces, unlike the Routes tab (captured). */
const EDIT_ORIGIN = { CreateRouteTable: 'CreateRouteTable', CreateRoute: 'CreateRoute' } as const;
const STATE_LABEL = { active: 'Active', blackhole: 'Blackhole' } as const;

const LIST = '/vpc/route-tables';

export function CreateRouteTablePage() {
  const topology = useTopology();
  const vpcFilter = useUi((state) => state.vpcFilter);
  const [name, setName] = useState('');
  const [vpcId, setVpcId] = useState<string | null>(vpcFilter ?? topology.vpcs[0]?.id ?? null);
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  return (
    <FormPage
      title="Create route table"
      description="A route table specifies how packets are forwarded between the subnets within your VPC, the internet, and your VPN connection."
      cancelHref={LIST}
      submitLabel="Create route table"
      failure={failure}
      onSubmit={() => {
        setSubmitted(true);
        if (vpcId === null) return;
        submit(
          (t) => createRouteTable(t, { vpcId, name: name.trim() }),
          (created) => ({ href: LIST, selectId: created.routeTableId }),
        );
      }}
    >
      <Container header={<Header variant="h2">Route table settings</Header>}>
        <SpaceBetween size="l">
          <FormField
            label="Name - optional"
            description="Create a tag with a key of 'Name' and a value that you specify."
          >
            <Input
              value={name}
              onChange={({ detail }) => {
                setName(detail.value);
              }}
            />
          </FormField>
          <FormField
            label="VPC"
            description="The VPC to use for this route table."
            errorText={submitted && vpcId === null ? 'Choose a VPC.' : undefined}
          >
            <VpcSelect value={vpcId} onChange={setVpcId} />
          </FormField>
        </SpaceBetween>
      </Container>
      <TagsUnsupported
        emptyText="No tags associated with the resource."
        addLabel="Add new tag"
        remainingText="You can add 50 more tags."
      />
    </FormPage>
  );
}

interface RouteRow {
  readonly destination: string;
  /** An internet gateway or NAT gateway ID, or null before a target is chosen. */
  readonly targetId: string | null;
}

/** The route target of a row: NAT gateway IDs start with `nat-` (r1-nat-gateway.md 2). */
function routeTarget(targetId: string) {
  return targetId.startsWith('nat-')
    ? ({ type: 'nat-gateway', natGatewayId: targetId } as const)
    : ({ type: 'internet-gateway', internetGatewayId: targetId } as const);
}

export function EditRoutes() {
  const { routeTableId = '' } = useParams();
  const topology = useTopology();
  const table = topology.routeTables.find((candidate) => candidate.id === routeTableId);
  const vpc = topology.vpcs.find((candidate) => candidate.id === table?.vpcId);
  const savedRoutes = useStatus().routeTables[routeTableId]?.routes ?? [];
  const [rows, setRows] = useState<RouteRow[]>(
    (table?.routes ?? []).map((route) => ({
      destination: route.destinationCidrBlock,
      targetId:
        route.target.type === 'nat-gateway'
          ? route.target.natGatewayId
          : route.target.internetGatewayId,
    })),
  );
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  if (table === undefined || vpc === undefined) {
    return <NotFoundResource id={routeTableId} backHref={LIST} backLabel="Route tables" />;
  }
  // Simplified target picker: internet gateways, then the VPC's NAT gateways. The real
  // console picks a target type first; that view waits for a capture (r1-nat-gateway.md 1).
  const subnetVpc = new Map(topology.subnets.map((subnet) => [subnet.id, subnet.vpcId]));
  const targets = [
    ...topology.internetGateways,
    ...(topology.natGateways ?? []).filter((nat) => subnetVpc.get(nat.subnetId) === vpc.id),
  ];
  const rowError = (row: RouteRow) =>
    cidr.parseCidr(row.destination.trim()) === null
      ? 'Enter a valid IPv4 CIDR block.'
      : row.targetId === null
        ? 'Choose a target.'
        : undefined;

  return (
    <FormPage
      title="Edit routes"
      cancelHref={LIST}
      submitLabel="Save changes"
      extraActions={
        <SpaceBetween direction="horizontal" size="xxs" alignItems="center">
          <Button formAction="none" disabled>
            Preview
          </Button>
          <FidelityLabel fidelity="Unsupported" />
        </SpaceBetween>
      }
      failure={failure}
      onSubmit={() => {
        setSubmitted(true);
        if (rows.some((row) => rowError(row) !== undefined)) return;
        submit(
          (t) =>
            replaceRoutes(
              t,
              table.id,
              rows.map((row) => ({
                destinationCidrBlock: row.destination.trim(),
                target: routeTarget(row.targetId ?? ''),
              })),
            ),
          () => ({ href: LIST, selectId: table.id }),
        );
      }}
    >
      <Container>
        <SpaceBetween size="m">
          <Table
            variant="embedded"
            items={[{ destination: vpc.cidrBlock }]}
            trackBy="destination"
            columnDefinitions={[
              { id: 'destination', header: 'Destination', cell: (row) => row.destination },
              { id: 'target', header: 'Target', cell: () => 'local' },
              { id: 'status', header: 'Status', cell: () => 'Active' },
              { id: 'propagated', header: 'Propagated', cell: () => 'No' },
              { id: 'origin', header: 'Route Origin', cell: () => EDIT_ORIGIN.CreateRouteTable },
            ]}
          />
          <AttributeEditor<RouteRow>
            items={rows}
            addButtonText="Add route"
            removeButtonText="Remove"
            empty={<Box color="text-body-secondary">{DASH}</Box>}
            onAddButtonClick={() => {
              setRows([...rows, { destination: '', targetId: null }]);
            }}
            onRemoveButtonClick={({ detail }) => {
              setRows(rows.filter((_, index) => index !== detail.itemIndex));
            }}
            definition={[
              {
                label: 'Destination',
                errorText: (row) =>
                  submitted && cidr.parseCidr(row.destination.trim()) === null
                    ? 'Enter a valid IPv4 CIDR block.'
                    : undefined,
                control: (row, index) => (
                  <Input
                    value={row.destination}
                    placeholder="0.0.0.0/0"
                    onChange={({ detail }) => {
                      setRows(
                        rows.map((item, i) =>
                          i === index ? { ...item, destination: detail.value } : item,
                        ),
                      );
                    }}
                  />
                ),
              },
              {
                label: 'Target',
                errorText: (row) =>
                  submitted && row.targetId === null ? 'Choose a target.' : undefined,
                control: (row, index) => (
                  <Select
                    selectedOption={
                      row.targetId === null ? null : { value: row.targetId, label: row.targetId }
                    }
                    placeholder="Internet Gateway"
                    empty="No internet gateways"
                    options={targets.map((target) => ({
                      value: target.id,
                      label: target.id,
                      description: target.name,
                    }))}
                    onChange={({ detail }) => {
                      setRows(
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, targetId: detail.selectedOption.value ?? null }
                            : item,
                        ),
                      );
                    }}
                  />
                ),
              },
              // Read-only columns of a saved route; a row added on this page has none yet
              // (shown as "–", Inferred: the capture shows saved routes only).
              ...(['Status', 'Propagated', 'Route Origin'] as const).map((label) => ({
                label,
                control: (row: RouteRow) => {
                  const saved = savedRoutes.find(
                    (route) =>
                      route.destinationCidrBlock === row.destination.trim() &&
                      route.target === row.targetId,
                  );
                  if (saved === undefined) return DASH;
                  if (label === 'Status') return STATE_LABEL[saved.state];
                  if (label === 'Propagated') return 'No';
                  return EDIT_ORIGIN[saved.origin];
                },
              })),
            ]}
          />
        </SpaceBetween>
      </Container>
    </FormPage>
  );
}

/** Explicit associations are the checked subnets; unchecking returns a subnet to the main table. */
export function EditRouteTableAssociations() {
  const { routeTableId = '' } = useParams();
  const topology = useTopology();
  const table = topology.routeTables.find((candidate) => candidate.id === routeTableId);
  const subnets = topology.subnets.filter((subnet) => subnet.vpcId === table?.vpcId);
  const [checked, setChecked] = useState<Subnet[]>(
    subnets.filter((subnet) => subnet.routeTableId === routeTableId),
  );
  const { failure, submit } = useChange();
  if (table === undefined) {
    return <NotFoundResource id={routeTableId} backHref={LIST} backLabel="Route tables" />;
  }
  const mainTableId = topology.vpcs.find((vpc) => vpc.id === table.vpcId)?.mainRouteTableId ?? DASH;
  return (
    <FormPage
      title="Edit subnet associations"
      description="Change which subnets are associated with this route table."
      cancelHref={LIST}
      submitLabel="Save associations"
      failure={failure}
      onSubmit={() => {
        const ids = new Set(checked.map((subnet) => subnet.id));
        submit(
          (start) =>
            subnets.reduce<HelperResult>(
              (result, subnet) =>
                andThen(result, (t: Topology) => {
                  if (ids.has(subnet.id)) return associateRouteTable(t, subnet.id, table.id);
                  if (subnet.routeTableId === table.id) return disassociateRouteTable(t, subnet.id);
                  return { ok: true, topology: t, created: {} };
                }),
              { ok: true, topology: start, created: {} },
            ),
          () => ({ href: LIST, selectId: table.id }),
        );
      }}
    >
      <Table<Subnet>
        header={<Header counter={`(${String(subnets.length)})`}>Available subnets</Header>}
        items={subnets}
        trackBy="id"
        selectionType="multi"
        selectedItems={checked}
        onSelectionChange={({ detail }) => {
          setChecked(detail.selectedItems);
        }}
        ariaLabels={{
          selectionGroupLabel: 'Subnets',
          itemSelectionLabel: (_data, subnet) => subnet.id,
          allItemsSelectionLabel: () => 'select all',
        }}
        empty="No subnets"
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (subnet) => orDash(subnet.name) },
          { id: 'id', header: 'Subnet ID', cell: (subnet) => subnet.id },
          { id: 'ipv4', header: 'IPv4 CIDR', cell: (subnet) => subnet.cidrBlock },
          { id: 'ipv6', header: 'IPv6 CIDR', cell: () => DASH },
          {
            id: 'route-table',
            header: 'Route table ID',
            cell: (subnet) => subnet.routeTableId ?? `Main (${mainTableId})`,
          },
        ]}
      />
    </FormPage>
  );
}
