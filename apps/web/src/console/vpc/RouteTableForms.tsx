import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Box from '@cloudscape-design/components/box';
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
import { FormPage } from '../components/FormPage';
import { NotFoundResource } from '../components/NotFoundResource';
import { TagsUnsupported } from '../components/TagsUnsupported';
import { useChange } from '../components/useChange';
import { DASH, orDash } from '../components/values';
import { VpcSelect } from '../components/VpcSelect';
import { andThen } from '../../topology/compose';

/**
 * Route table forms. No capture of these pages exists yet; labels follow the AWS docs
 * procedures (create-vpc-route-table.html, WorkWithRouteTables.html).
 * Rules: RT-12 (create), RT-03, RT-04, RT-11 (routes), RT-01 (associations).
 */

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
          <FormField label="Name - optional">
            <Input
              value={name}
              onChange={({ detail }) => {
                setName(detail.value);
              }}
            />
          </FormField>
          <FormField
            label="VPC"
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
  readonly internetGatewayId: string | null;
}

export function EditRoutes() {
  const { routeTableId = '' } = useParams();
  const topology = useTopology();
  const table = topology.routeTables.find((candidate) => candidate.id === routeTableId);
  const vpc = topology.vpcs.find((candidate) => candidate.id === table?.vpcId);
  const [rows, setRows] = useState<RouteRow[]>(
    (table?.routes ?? []).map((route) => ({
      destination: route.destinationCidrBlock,
      internetGatewayId: route.target.internetGatewayId,
    })),
  );
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  if (table === undefined || vpc === undefined) {
    return <NotFoundResource id={routeTableId} backHref={LIST} backLabel="Route tables" />;
  }
  const gateways = topology.internetGateways;
  const rowError = (row: RouteRow) =>
    cidr.parseCidr(row.destination.trim()) === null
      ? 'Enter a valid IPv4 CIDR block.'
      : row.internetGatewayId === null
        ? 'Choose a target.'
        : undefined;

  return (
    <FormPage
      title="Edit routes"
      cancelHref={LIST}
      submitLabel="Save changes"
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
                target: {
                  type: 'internet-gateway',
                  internetGatewayId: row.internetGatewayId ?? '',
                },
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
            ]}
          />
          <AttributeEditor<RouteRow>
            items={rows}
            addButtonText="Add route"
            removeButtonText="Remove"
            empty={<Box color="text-body-secondary">{DASH}</Box>}
            onAddButtonClick={() => {
              setRows([...rows, { destination: '', internetGatewayId: null }]);
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
                  submitted && row.internetGatewayId === null ? 'Choose a target.' : undefined,
                control: (row, index) => (
                  <Select
                    selectedOption={
                      row.internetGatewayId === null
                        ? null
                        : { value: row.internetGatewayId, label: row.internetGatewayId }
                    }
                    placeholder="Internet Gateway"
                    empty="No internet gateways"
                    options={gateways.map((igw) => ({
                      value: igw.id,
                      label: igw.id,
                      description: igw.name,
                    }))}
                    onChange={({ detail }) => {
                      setRows(
                        rows.map((item, i) =>
                          i === index
                            ? { ...item, internetGatewayId: detail.selectedOption.value ?? null }
                            : item,
                        ),
                      );
                    }}
                  />
                ),
              },
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
