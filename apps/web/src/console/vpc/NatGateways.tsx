import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import {
  createNatGateway,
  nextPublicAddress,
  setNameTag,
  type NatGateway,
  type Topology,
} from '@sim/engine';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '../../i18n/useT';
import { useTopology } from '../../state/topologyStore';
import { ActionsDropdown } from '../components/Actions';
import { ColumnPairs } from '../components/ColumnPairs';
import { DetailsPanel } from '../components/DetailsPanel';
import { FidelityLabel } from '../components/FidelityLabel';
import { LabelWithFidelity, PartlySupportedRadio } from '../components/FormHelpers';
import { FormPage } from '../components/FormPage';
import { ResourceTable, type ResourceColumn } from '../components/ResourceTable';
import { TagsUnsupported } from '../components/TagsUnsupported';
import { unsupportedTab } from '../components/unsupportedTab';
import { useChange } from '../components/useChange';
import { single, useSelection } from '../components/useSelection';
import { DASH, idAndName, orDash, titleOf } from '../components/values';
import { applyChange, useStatus, useTopologyReady, useVpcFiltered, vpcOfSubnet } from '../data';

/**
 * VPC console › NAT gateways and Create NAT gateway. Labels from the captures (2026-11-08)
 * `vpc-virtual_private_cloud-nat_gateways.txt`, `…-create_nat_gateway.txt` and
 * `…-create_nat_gateway-zonal.txt` (read-only user, an account with no NAT gateways).
 * Not captured: the cells and details panel of an existing NAT gateway (State "Available"
 * comes from the docs procedure, nat-gateway-working-with.html), validation messages and the
 * result of "Allocate Elastic IP". R1 models one zonal public NAT gateway (NAT-06), always
 * Available (r1-nat-gateway.md 5). Rules: NAT-01, NAT-06, NAT-07.
 */

const LIST = '/vpc/nat-gateways';
const CREATE = '/vpc/create-nat-gateway';

/** Captured select placeholder; the Elastic IP select shows this text when it has no options. */
const NO_ELASTIC_IPS = 'No Elastic IP addresses found';

export function NatGateways() {
  const { t } = useT();
  const topology = useTopology();
  const status = useStatus();
  const ready = useTopologyReady();
  const navigate = useNavigate();
  const [selected, setSelected] = useSelection();
  const all = topology.natGateways ?? [];
  const natGateways = useVpcFiltered(all, (nat) => vpcOfSubnet(topology, nat.subnetId));
  const currentId = single(selected);
  const current = all.find((nat) => nat.id === currentId) ?? null;

  const vpcOf = (nat: NatGateway) => {
    const vpcId = status.natGateways[nat.id]?.vpcId;
    if (vpcId === undefined) return DASH;
    return idAndName(vpcId, topology.vpcs.find((vpc) => vpc.id === vpcId)?.name);
  };
  const subnetOf = (nat: NatGateway) =>
    idAndName(nat.subnetId, topology.subnets.find((subnet) => subnet.id === nat.subnetId)?.name);

  // Values a public zonal NAT gateway has in R1. Not modeled: the requester-managed network
  // interface (NAT-07), times and the regional route table, so they show "–" as other lists do.
  const columns: ResourceColumn<NatGateway>[] = [
    {
      id: 'name',
      header: 'Name',
      value: (nat) => orDash(nat.name),
      editName: (nat, name) => {
        applyChange((draft) => setNameTag(draft, { type: 'nat-gateway', id: nat.id }, name));
      },
    },
    { id: 'id', header: 'NAT gateway ID', value: (nat) => nat.id },
    { id: 'connectivity', header: 'Connectivity type', value: () => 'Public' },
    { id: 'state', header: 'State', value: () => 'Available' },
    { id: 'state-message', header: 'State message', value: () => DASH },
    { id: 'availability-mode', header: 'Availability mode', value: () => 'Zonal' },
    { id: 'route-table', header: 'Route table ID', value: () => DASH },
    {
      id: 'public-ip',
      header: 'Primary public IPv4 address',
      value: (nat) => nat.elasticIpAddress,
    },
    {
      id: 'private-ip',
      header: 'Primary private IPv4 address',
      value: (nat) => nat.privateIpAddress,
    },
    { id: 'eni', header: 'Primary network interface ID', value: () => DASH },
    { id: 'vpc', header: 'VPC', value: vpcOf },
    { id: 'subnet', header: 'Subnet', value: subnetOf },
    { id: 'created', header: 'Created', value: () => DASH },
    { id: 'deleted', header: 'Deleted', value: () => DASH },
  ];
  const create = () => {
    void navigate(CREATE);
  };

  return (
    <SpaceBetween size="l">
      <ResourceTable
        title="NAT gateways"
        resourceName="NAT gateways"
        filterPlaceholder="Find NAT gateways by attribute or tag"
        items={natGateways}
        columns={columns}
        trackBy={(nat) => nat.id}
        selectedIds={selected}
        onSelectionChange={setSelected}
        loading={!ready}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <ActionsDropdown
              actions={[
                { id: 'create', text: 'Create NAT gateway', supported: true, onClick: create },
                { id: 'view', text: 'View details', supported: false },
                {
                  id: 'secondary',
                  text: 'Edit secondary IPv4 address associations',
                  supported: false,
                },
                { id: 'tags', text: 'Manage tags', supported: false },
                { id: 'delete', text: 'Delete NAT gateway', supported: false },
              ]}
            />
            <Button variant="primary" onClick={create}>
              Create NAT gateway
            </Button>
          </SpaceBetween>
        }
        empty={{ title: 'No NAT gateways found' }}
      />
      <DetailsPanel
        title={current === null ? null : titleOf(current.id, current.name)}
        emptyText="Select a NAT gateway"
        tabs={
          current === null
            ? []
            : [
                {
                  id: 'details',
                  label: 'Details',
                  content: (
                    <SpaceBetween size="s">
                      <FidelityLabel fidelity="Inferred" note={t('sim.natDetails')} />
                      <ColumnPairs columns={detailColumns(columns, current)} />
                    </SpaceBetween>
                  ),
                },
                unsupportedTab('tags', 'Tags'),
              ]
        }
      />
    </SpaceBetween>
  );
}

/**
 * The details tab isn't captured: it repeats the table columns (without Name, which is the
 * panel title), read column by column in groups of four (Inferred).
 */
function detailColumns(columns: readonly ResourceColumn<NatGateway>[], nat: NatGateway) {
  const pairs = columns
    .filter((column) => column.id !== 'name')
    .map((column) => [column.header, column.value(nat)] as const);
  const size = 4;
  return Array.from({ length: Math.ceil(pairs.length / size) }, (_, index) =>
    pairs.slice(index * size, (index + 1) * size),
  );
}

/** The Elastic IP that "Allocate Elastic IP" reserves for this form (NAT-01, ADR-10). */
function allocatedOption(topology: Topology) {
  const address = nextPublicAddress(topology);
  return address === null ? null : { value: address, label: address };
}

export function CreateNatGatewayPage() {
  const { t } = useT();
  const topology = useTopology();
  const [name, setName] = useState('');
  const [subnetId, setSubnetId] = useState<string | null>(null);
  const [allocated, setAllocated] = useState(false);
  const [privateIp, setPrivateIp] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  const elasticIp = allocated ? allocatedOption(topology) : null;
  const subnet = topology.subnets.find((candidate) => candidate.id === subnetId);

  return (
    <FormPage
      title="Create NAT gateway"
      description="A highly available, managed Network Address Translation (NAT) service that instances in private subnets can use to connect to services in other VPCs, on-premises networks, or the internet."
      cancelHref={LIST}
      submitLabel="Create NAT gateway"
      failure={failure}
      onSubmit={() => {
        setSubmitted(true);
        if (subnetId === null || elasticIp === null) return;
        const address = privateIp.trim();
        submit(
          (current) =>
            createNatGateway(current, {
              subnetId,
              name: name.trim(),
              ...(address === '' ? {} : { privateIpAddress: address }),
            }),
          (created) => ({ href: LIST, selectId: created.natGatewayId }),
        );
      }}
    >
      <Container
        header={
          <Header
            variant="h2"
            info={
              <FidelityLabel fidelity="Inferred" ruleIds={['NAT-07']} note={t('sim.natCreate')} />
            }
          >
            NAT gateway settings
          </Header>
        }
      >
        <SpaceBetween size="l">
          <FormField
            label="Name - optional"
            description="Create a tag with a key of 'Name' and a value that you specify."
            constraintText="The name can be up to 256 characters long."
          >
            <Input
              value={name}
              placeholder="my-nat-gateway-01"
              onChange={({ detail }) => {
                setName(detail.value);
              }}
            />
          </FormField>
          <FormField
            label="Availability mode"
            description="Choose whether to deploy across all zones in the region or restrict to a single availability zone."
          >
            <PartlySupportedRadio
              ariaLabel="Availability mode"
              value="zonal"
              onChange={() => undefined}
              options={[
                {
                  value: 'regional',
                  label: 'Regional - new',
                  description:
                    'Scales automatically across all regional AZs, simplifying management for multi AZ deployments.',
                  supported: false,
                },
                {
                  value: 'zonal',
                  label: 'Zonal',
                  description:
                    'Provides granular control within a specific availability zone, adhering to subnet level settings.',
                  supported: true,
                },
              ]}
            />
          </FormField>
          <FormField
            label="Subnet"
            description="Select a subnet in which to create the NAT gateway."
            errorText={submitted && subnetId === null ? 'Choose a subnet.' : undefined}
          >
            <Select
              selectedOption={subnet === undefined ? null : { value: subnet.id, label: subnet.id }}
              placeholder="Select a subnet"
              empty="No subnets"
              // The console tags each option "use1-az1 (us-east-1a)"; R1 doesn't model zone IDs.
              options={topology.subnets.map((candidate) => ({
                value: candidate.id,
                label: candidate.id,
                description: candidate.name,
                tags: [candidate.availabilityZone],
              }))}
              onChange={({ detail }) => {
                setSubnetId(detail.selectedOption.value ?? null);
              }}
            />
          </FormField>
          <FormField
            label="Connectivity type"
            description="Select a connectivity type for the NAT gateway."
          >
            <PartlySupportedRadio
              ariaLabel="Connectivity type"
              value="public"
              onChange={() => undefined}
              options={[
                { value: 'public', label: 'Public', supported: true },
                { value: 'private', label: 'Private', supported: false },
              ]}
            />
          </FormField>
          <FormField
            label={
              <LabelWithFidelity
                label="Elastic IP allocation ID"
                badge={
                  <FidelityLabel
                    fidelity="Inferred"
                    ruleIds={['NAT-01', 'ADR-10']}
                    note={t('sim.natElasticIp')}
                  />
                }
              />
            }
            description="Assign an Elastic IP address to the NAT gateway."
            constraintText={
              subnetId === null ? 'Select a subnet to display the allocation IDs.' : undefined
            }
            errorText={
              submitted && subnetId !== null && elasticIp === null
                ? 'Choose an Elastic IP allocation ID.'
                : undefined
            }
          >
            <SpaceBetween direction="horizontal" size="xs">
              <Select
                disabled={subnetId === null}
                selectedOption={elasticIp}
                placeholder="Select an Elastic IP"
                empty={NO_ELASTIC_IPS}
                options={elasticIp === null ? [] : [elasticIp]}
                onChange={() => undefined}
                ariaLabel="Elastic IP allocation ID"
              />
              <Button
                formAction="none"
                disabled={subnetId === null}
                onClick={() => {
                  setAllocated(true);
                }}
              >
                Allocate Elastic IP
              </Button>
            </SpaceBetween>
          </FormField>
          <ExpandableSection headerText="Additional settings">
            <FormField
              label={
                <LabelWithFidelity
                  label="Primary private IPv4 address - optional"
                  badge={
                    <FidelityLabel
                      fidelity="Inferred"
                      ruleIds={['NAT-07']}
                      note={t('sim.firstFreeAddress')}
                    />
                  }
                />
              }
            >
              <Input
                value={privateIp}
                placeholder="10.0.0.10"
                onChange={({ detail }) => {
                  setPrivateIp(detail.value);
                }}
              />
            </FormField>
          </ExpandableSection>
        </SpaceBetween>
      </Container>
      <TagsUnsupported
        description="A tag is a label that you assign to an AWS resource. Each tag consists of a key and an optional value. You can use tags to search and filter your resources or track your AWS costs."
        emptyText="No tags associated with the resource."
        addLabel="Add new tag"
        remainingText="You can add 50 more tags."
      />
    </FormPage>
  );
}
