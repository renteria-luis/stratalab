import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Autosuggest from '@cloudscape-design/components/autosuggest';
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
  type Route,
  type Subnet,
  type Topology,
} from '@sim/engine';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useT } from '../../i18n/useT';
import { useUi } from '../../state/uiStore';
import { useTopology } from '../../state/topologyStore';
import { FidelityLabel } from '../components/FidelityLabel';
import { FormPage } from '../components/FormPage';
import { NotFoundResource } from '../components/NotFoundResource';
import { TagsUnsupported } from '../components/TagsUnsupported';
import { useChange } from '../components/useChange';
import { DASH, orDash, titleOf } from '../components/values';
import { VpcSelect } from '../components/VpcSelect';
import { useStatus } from '../data';
import { andThen } from '../../topology/compose';

/**
 * Route table forms. Labels from the captures (2026-11-05)
 * `vpc-virtual_private_cloud-route_tables-create_route_table.txt`,
 * `vpc-virtual_private_cloud-route_tables-selection-routes_tab-edit_routes.txt` and
 * `vpc-virtual_private_cloud-route_tables-selection-subnet_associations_tab-edit_subnet_associations.txt`,
 * plus the Edit routes rows, target types and Target field of 2026-11-06 and 2026-11-08
 * (`…-edit_routes-add_route.txt`, `…-edit_routes-nat_gateway_target.txt`).
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

/**
 * Target types of the Edit routes "Target type" select, in the captured order (2026-11-06 and
 * 2026-11-08). Choosing a type fills the Target field with its ID prefix ("nat-"), as
 * captured. R1 simulates internet gateway and NAT gateway targets; the others stay listed,
 * disabled, as Unsupported (AGENTS.md, rule 8).
 */
const TARGET_TYPES = [
  { label: 'Carrier Gateway' },
  { label: 'Core Network' },
  { label: 'Egress Only Internet Gateway' },
  { label: 'Gateway Load Balancer Endpoint' },
  { label: 'Instance' },
  { label: 'Internet Gateway', type: 'internet-gateway', prefix: 'igw-' },
  { label: 'local' },
  { label: 'NAT Gateway', type: 'nat-gateway', prefix: 'nat-' },
  { label: 'Network Interface' },
  { label: 'Outpost Local Gateway' },
  { label: 'Peering Connection' },
  { label: 'ODB Network' },
  { label: 'Transit Gateway' },
  { label: 'Virtual Private Gateway' },
] as const;

type TargetType = Route['target']['type'];

const TYPE_LABEL: Readonly<Record<TargetType, string>> = {
  'internet-gateway': 'Internet Gateway',
  'nat-gateway': 'NAT Gateway',
};
const TYPE_PREFIX: Readonly<Record<TargetType, string>> = {
  'internet-gateway': 'igw-',
  'nat-gateway': 'nat-',
};

/**
 * Destination suggestions as captured (2026-11-08): IPv4, then IPv6 (Unsupported), then the
 * region's AWS-managed prefix lists, left out until VPC endpoints are simulated.
 */
const DESTINATION_SUGGESTIONS = [
  '0.0.0.0/0',
  '0.0.0.0/8',
  '0.0.0.0/16',
  '0.0.0.0/24',
  '0.0.0.0/32',
];
const IPV6_SUGGESTIONS = ['::/0', '::/16', '::/32', '::/48', '::/64'];

/** The entered-text option of the Destination and Target fields, as captured. */
const USE_ENTERED = { enteredTextLabel: (value: string) => `Use: "${value}"` };

/** A row of the editor. The first row is the VPC's local route, which can't be changed. */
type RouteRow =
  | { readonly local: true; readonly destination: string }
  | {
      readonly local: false;
      readonly destination: string;
      /** Null until a target type is chosen: a new row shows an empty "Target type". */
      readonly targetType: TargetType | null;
      /** The Target field text: an ID, the prefix the type filled in, or what was typed. */
      readonly target: string;
    };

type EditableRow = Extract<RouteRow, { local: false }>;

function routeTarget(row: EditableRow): Route['target'] | null {
  const id = row.target.trim();
  if (row.targetType === null || id === '' || id === TYPE_PREFIX[row.targetType]) return null;
  return row.targetType === 'nat-gateway'
    ? { type: 'nat-gateway', natGatewayId: id }
    : { type: 'internet-gateway', internetGatewayId: id };
}

function targetIdOf(target: Route['target']): string {
  return target.type === 'nat-gateway' ? target.natGatewayId : target.internetGatewayId;
}

export function EditRoutes() {
  const { t } = useT();
  const { routeTableId = '' } = useParams();
  const topology = useTopology();
  const table = topology.routeTables.find((candidate) => candidate.id === routeTableId);
  const vpc = topology.vpcs.find((candidate) => candidate.id === table?.vpcId);
  const savedRoutes = useStatus().routeTables[routeTableId]?.routes ?? [];
  const [rows, setRows] = useState<RouteRow[]>(() => [
    { local: true, destination: vpc?.cidrBlock ?? '' },
    ...(table?.routes ?? []).map((route): RouteRow => ({
      local: false,
      destination: route.destinationCidrBlock,
      targetType: route.target.type,
      target: targetIdOf(route.target),
    })),
  ]);
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  if (table === undefined || vpc === undefined) {
    return <NotFoundResource id={routeTableId} backHref={LIST} backLabel="Route tables" />;
  }
  const subnetVpc = new Map(topology.subnets.map((subnet) => [subnet.id, subnet.vpcId]));
  // Target suggestions: "id (name)", as captured for internet gateways (2026-11-06).
  const resources: Readonly<Record<TargetType, readonly { id: string; name?: string }[]>> = {
    'internet-gateway': topology.internetGateways,
    'nat-gateway': (topology.natGateways ?? []).filter(
      (nat) => subnetVpc.get(nat.subnetId) === vpc.id,
    ),
  };
  const editable = rows.filter((row): row is EditableRow => !row.local);
  const destinationError = (row: RouteRow) =>
    !row.local && cidr.parseCidr(row.destination.trim()) === null
      ? 'Enter a valid IPv4 CIDR block.'
      : undefined;
  const targetError = (row: RouteRow) =>
    !row.local && routeTarget(row) === null ? 'Choose a target.' : undefined;
  const update = (index: number, change: Partial<Omit<EditableRow, 'local'>>) => {
    setRows(rows.map((item, i) => (i === index && !item.local ? { ...item, ...change } : item)));
  };
  const typeOptions = TARGET_TYPES.map((option) =>
    'type' in option
      ? { value: option.type, label: option.label }
      : {
          value: option.label,
          label: option.label,
          disabled: true,
          disabledReason: t('fidelity.notSimulated'),
          labelTag: t('fidelity.Unsupported'),
        },
  );

  return (
    <FormPage
      title={`Edit routes: ${titleOf(table.id, table.name)}`}
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
        if (rows.some((row) => destinationError(row) ?? targetError(row))) return;
        submit(
          (current) =>
            replaceRoutes(
              current,
              table.id,
              editable.flatMap((row) => {
                const target = routeTarget(row);
                return target === null
                  ? []
                  : [{ destinationCidrBlock: row.destination.trim(), target }];
              }),
            ),
          () => ({ href: LIST, selectId: table.id }),
        );
      }}
    >
      <Container>
        <AttributeEditor<RouteRow>
          items={rows}
          addButtonText="Add route"
          removeButtonText="Remove"
          isItemRemovable={(row) => !row.local}
          onAddButtonClick={() => {
            setRows([...rows, { local: false, destination: '', targetType: null, target: '' }]);
          }}
          onRemoveButtonClick={({ detail }) => {
            setRows(rows.filter((_, index) => index !== detail.itemIndex));
          }}
          definition={[
            {
              label: 'Destination',
              errorText: (row) => (submitted ? destinationError(row) : undefined),
              control: (row, index) =>
                row.local ? (
                  row.destination
                ) : (
                  <Autosuggest
                    ariaLabel="Destination"
                    value={row.destination}
                    clearAriaLabel="Clear"
                    i18nStrings={USE_ENTERED}
                    options={[
                      ...DESTINATION_SUGGESTIONS.map((value) => ({ value })),
                      ...IPV6_SUGGESTIONS.map((value) => ({
                        value,
                        disabled: true,
                        labelTag: t('fidelity.Unsupported'),
                      })),
                    ]}
                    onChange={({ detail }) => {
                      update(index, { destination: detail.value });
                    }}
                  />
                ),
            },
            {
              label: 'Target',
              errorText: (row) => (submitted ? targetError(row) : undefined),
              control: (row, index) => (
                <SpaceBetween direction="horizontal" size="xs">
                  <Select
                    ariaLabel="Target type"
                    disabled={row.local}
                    selectedOption={
                      row.local
                        ? { value: 'local', label: 'local' }
                        : row.targetType === null
                          ? null
                          : { value: row.targetType, label: TYPE_LABEL[row.targetType] }
                    }
                    options={typeOptions}
                    onChange={({ detail }) => {
                      const type = detail.selectedOption.value as TargetType;
                      update(index, { targetType: type, target: TYPE_PREFIX[type] });
                    }}
                  />
                  {(row.local || row.targetType !== null) && (
                    <Autosuggest
                      ariaLabel="Target"
                      disabled={row.local}
                      value={row.local ? 'local' : row.target}
                      clearAriaLabel="Clear"
                      i18nStrings={USE_ENTERED}
                      options={
                        row.local || row.targetType === null
                          ? []
                          : resources[row.targetType].map((resource) => ({
                              value: resource.id,
                              label:
                                resource.name === undefined
                                  ? resource.id
                                  : `${resource.id} (${resource.name})`,
                            }))
                      }
                      onChange={({ detail }) => {
                        update(index, { target: detail.value });
                      }}
                    />
                  )}
                </SpaceBetween>
              ),
            },
            // Read-only columns. The local route is Active and created with the table; a row
            // added on this page shows "–", "No" and "CreateRoute" until saved (captured).
            ...(['Status', 'Propagated', 'Route Origin'] as const).map((label) => ({
              label,
              control: (row: RouteRow) => {
                if (row.local) {
                  if (label === 'Status') return 'Active';
                  if (label === 'Propagated') return 'No';
                  return EDIT_ORIGIN.CreateRouteTable;
                }
                const saved = savedRoutes.find(
                  (route) =>
                    route.destinationCidrBlock === row.destination.trim() &&
                    route.target === row.target.trim(),
                );
                if (label === 'Propagated') return 'No';
                if (saved === undefined) return label === 'Status' ? DASH : EDIT_ORIGIN.CreateRoute;
                if (label === 'Status') return STATE_LABEL[saved.state];
                return EDIT_ORIGIN[saved.origin];
              },
            })),
          ]}
        />
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
