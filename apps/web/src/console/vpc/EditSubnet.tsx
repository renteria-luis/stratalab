import Checkbox from '@cloudscape-design/components/checkbox';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import RadioGroup from '@cloudscape-design/components/radio-group';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import {
  associateNetworkAcl,
  associateRouteTable,
  disassociateRouteTable,
  setMapPublicIpOnLaunch,
  setNameTag,
} from '@sim/engine';
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useTopology } from '../../state/topologyStore';
import { FidelityLabel } from '../components/FidelityLabel';
import { FormPage } from '../components/FormPage';
import { NotFoundResource } from '../components/NotFoundResource';
import { RoutesTable } from '../components/RoutesTable';
import { NaclEntriesTable } from '../components/RuleTables';
import { useChange } from '../components/useChange';
import { useStatus } from '../data';
import { andThen } from '../../topology/compose';

/**
 * Subnet actions with their own pages. Labels from the captures (2026-11-05, us-east-1)
 * `vpc-virtual_private_cloud-subnets-selection-edit_subnet_settings.txt`,
 * `…-replace_route_table.txt` and `…-replace_network_acl.txt`. The 2026-11-03 capture
 * (us-east-2) still named the last two "Edit route table association" and "Edit network ACL
 * association"; AWS seems to be rolling the new names out by region.
 * Rules: ADR-10, RT-01, NACL-01.
 */

/** A captured control R0 doesn't simulate: visible, disabled, labeled Unsupported. */
function Unsupported({ children }: { children: ReactNode }) {
  return (
    <SpaceBetween direction="horizontal" size="xs" alignItems="center">
      {children}
      <FidelityLabel fidelity="Unsupported" />
    </SpaceBetween>
  );
}

function useSubnet() {
  const { subnetId = '' } = useParams();
  const topology = useTopology();
  return { subnetId, subnet: topology.subnets.find((subnet) => subnet.id === subnetId) };
}

const back = (selectId: string) => ({ href: '/vpc/subnets', selectId });

export function EditSubnetSettings() {
  const { subnetId, subnet } = useSubnet();
  const [mapPublic, setMapPublic] = useState(subnet?.mapPublicIpOnLaunch ?? false);
  const [name, setName] = useState(subnet?.name ?? '');
  const { failure, submit } = useChange();
  if (subnet === undefined) {
    return <NotFoundResource id={subnetId} backHref="/vpc/subnets" backLabel="Subnets" />;
  }
  return (
    <FormPage
      title="Edit subnet settings"
      cancelHref="/vpc/subnets"
      submitLabel="Save"
      failure={failure}
      onSubmit={() => {
        submit(
          (t) =>
            andThen(setMapPublicIpOnLaunch(t, subnet.id, mapPublic), (next) =>
              name.trim() === (subnet.name ?? '')
                ? { ok: true, topology: next, created: {} }
                : setNameTag(next, { type: 'subnet', id: subnet.id }, name.trim()),
            ),
          () => back(subnet.id),
        );
      }}
    >
      <Container header={<Header variant="h2">Subnet</Header>}>
        <SpaceBetween size="l">
          <FormField label="Subnet ID">{subnet.id}</FormField>
          <FormField
            label="Name tag"
            description="Create a tag with a key of 'Name' and a value that you specify."
            constraintText="The name can be up to 256 characters long."
          >
            <Input
              value={name}
              onChange={({ detail }) => {
                setName(detail.value);
              }}
            />
          </FormField>
        </SpaceBetween>
      </Container>
      <Container
        header={
          <Header
            variant="h2"
            description="Enable AWS to automatically assign a public IPv4 or IPv6 address to a new primary network interface for an instance in this subnet."
          >
            Auto-assign IP settings
          </Header>
        }
      >
        <SpaceBetween size="s">
          <Checkbox
            checked={mapPublic}
            onChange={({ detail }) => {
              setMapPublic(detail.checked);
            }}
          >
            Enable auto-assign public IPv4 address
          </Checkbox>
          <Checkbox
            checked={false}
            disabled
            description="Option disabled because no customer owned pools found."
          >
            Enable auto-assign customer-owned IPv4 address
          </Checkbox>
        </SpaceBetween>
      </Container>
      <Container
        header={
          <Header
            variant="h2"
            description="Specify the hostname type for EC2 instances in this subnet and optional RBN DNS query settings."
          >
            Resource-based name (RBN) settings
          </Header>
        }
      >
        <SpaceBetween size="s">
          <Unsupported>
            <Checkbox checked={false} disabled>
              Enable resource name DNS A record on launch
            </Checkbox>
          </Unsupported>
          <Unsupported>
            <Checkbox checked={false} disabled>
              Enable resource name DNS AAAA record on launch
            </Checkbox>
          </Unsupported>
          <FormField label={<Unsupported>Hostname type</Unsupported>}>
            <RadioGroup
              value="ip-name"
              items={[
                { value: 'resource-name', label: 'Resource name', disabled: true },
                { value: 'ip-name', label: 'IP name', disabled: true },
              ]}
            />
          </FormField>
        </SpaceBetween>
      </Container>
      <Container
        header={
          <Header
            variant="h2"
            description="Enable DNS64 to allow IPv6-only services in Amazon VPC to communicate with IPv4-only services and networks."
          >
            DNS64 settings
          </Header>
        }
      >
        <Unsupported>
          <Checkbox checked={false} disabled>
            Enable DNS64
          </Checkbox>
        </Unsupported>
      </Container>
    </FormPage>
  );
}

export function EditSubnetRouteTable() {
  const { subnetId, subnet } = useSubnet();
  const topology = useTopology();
  const status = useStatus();
  const currentTableId = status.subnets[subnetId]?.routeTableId;
  const [tableId, setTableId] = useState(currentTableId ?? null);
  const { failure, submit } = useChange();
  if (subnet === undefined) {
    return <NotFoundResource id={subnetId} backHref="/vpc/subnets" backLabel="Subnets" />;
  }
  const vpc = topology.vpcs.find((candidate) => candidate.id === subnet.vpcId);
  const tables = topology.routeTables.filter((table) => table.vpcId === subnet.vpcId);
  const preview = tableId === null ? undefined : status.routeTables[tableId];
  return (
    <FormPage
      title="Replace route table"
      cancelHref="/vpc/subnets"
      submitLabel="Save"
      failure={failure}
      onSubmit={() => {
        if (tableId === null) return;
        submit(
          (t) =>
            // Choosing the main table keeps an implicit association unless the subnet
            // already had an explicit one (RT-01).
            tableId === vpc?.mainRouteTableId && subnet.routeTableId === undefined
              ? disassociateRouteTable(t, subnet.id)
              : associateRouteTable(t, subnet.id, tableId),
          () => back(subnet.id),
        );
      }}
    >
      <Container header={<Header variant="h2">Subnet route table settings</Header>}>
        <SpaceBetween size="l">
          <FormField label="Subnet ID">{subnet.id}</FormField>
          <FormField label="Route table ID">
            <Select
              selectedOption={tableId === null ? null : { value: tableId, label: tableId }}
              options={tables.map((table) => ({
                value: table.id,
                label: table.id,
                description: [table.name, table.id === vpc?.mainRouteTableId ? 'Main' : undefined]
                  .filter((part) => part !== undefined)
                  .join(' | '),
              }))}
              onChange={({ detail }) => {
                setTableId(detail.selectedOption.value ?? null);
              }}
            />
          </FormField>
          <RoutesTable
            routes={preview?.routes ?? []}
            columns="destination-target"
            header={
              <Header variant="h3" counter={`(${String(preview?.routes.length ?? 0)})`}>
                Routes
              </Header>
            }
          />
        </SpaceBetween>
      </Container>
    </FormPage>
  );
}

export function EditSubnetNetworkAcl() {
  const { subnetId, subnet } = useSubnet();
  const topology = useTopology();
  const status = useStatus();
  const [aclId, setAclId] = useState(status.subnets[subnetId]?.networkAclId ?? null);
  const { failure, submit } = useChange();
  if (subnet === undefined) {
    return <NotFoundResource id={subnetId} backHref="/vpc/subnets" backLabel="Subnets" />;
  }
  const acls = topology.networkAcls.filter((acl) => acl.vpcId === subnet.vpcId);
  const preview = acls.find((acl) => acl.id === aclId);
  return (
    <FormPage
      title="Replace network ACL"
      cancelHref="/vpc/subnets"
      submitLabel="Save"
      failure={failure}
      onSubmit={() => {
        if (aclId === null) return;
        submit(
          (t) => associateNetworkAcl(t, subnet.id, aclId),
          () => back(subnet.id),
        );
      }}
    >
      <Container header={<Header variant="h2">Subnet network ACL settings</Header>}>
        <SpaceBetween size="l">
          <FormField label="Subnet ID">{subnet.id}</FormField>
          <FormField label="Current network ACL">
            {status.subnets[subnetId]?.networkAclId}
          </FormField>
          <FormField label="Network ACL ID">
            <Select
              selectedOption={aclId === null ? null : { value: aclId, label: aclId }}
              options={acls.map((acl) => ({ value: acl.id, label: acl.id, description: acl.name }))}
              onChange={({ detail }) => {
                setAclId(detail.selectedOption.value ?? null);
              }}
            />
          </FormField>
          {(['inbound', 'outbound'] as const).map((direction) => {
            const entries =
              (direction === 'inbound' ? preview?.inboundEntries : preview?.outboundEntries) ?? [];
            return (
              <NaclEntriesTable
                key={direction}
                direction={direction}
                entries={entries}
                header={
                  // The count includes the `*` rule, as captured ("Inbound rules (2)").
                  <Header variant="h3" counter={`(${String(entries.length + 1)})`}>
                    {direction === 'inbound' ? 'Inbound rules' : 'Outbound rules'}
                  </Header>
                }
              />
            );
          })}
        </SpaceBetween>
      </Container>
    </FormPage>
  );
}
