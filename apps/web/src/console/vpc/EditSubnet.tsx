import Checkbox from '@cloudscape-design/components/checkbox';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import {
  associateNetworkAcl,
  associateRouteTable,
  disassociateRouteTable,
  setMapPublicIpOnLaunch,
} from '@sim/engine';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useTopology } from '../../state/topologyStore';
import { FormPage } from '../components/FormPage';
import { NotFoundResource } from '../components/NotFoundResource';
import { RoutesTable } from '../components/RoutesTable';
import { NaclEntriesTable } from '../components/RuleTables';
import { useChange } from '../components/useChange';
import { useStatus } from '../data';

/**
 * Subnet actions with their own pages. No capture of these pages exists yet; labels follow
 * the AWS docs procedures (subnet-public-ip.html, WorkWithRouteTables.html,
 * network-acls.html). Rules: ADR-10, RT-01, NACL-01.
 */

function useSubnet() {
  const { subnetId = '' } = useParams();
  const topology = useTopology();
  return { subnetId, subnet: topology.subnets.find((subnet) => subnet.id === subnetId) };
}

const back = (selectId: string) => ({ href: '/vpc/subnets', selectId });

export function EditSubnetSettings() {
  const { subnetId, subnet } = useSubnet();
  const [mapPublic, setMapPublic] = useState(subnet?.mapPublicIpOnLaunch ?? false);
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
          (t) => setMapPublicIpOnLaunch(t, subnet.id, mapPublic),
          () => back(subnet.id),
        );
      }}
    >
      <Container header={<Header variant="h2">Subnet</Header>}>
        <FormField label="Subnet ID">{subnet.id}</FormField>
      </Container>
      <Container header={<Header variant="h2">Auto-assign IP settings</Header>}>
        <Checkbox
          checked={mapPublic}
          onChange={({ detail }) => {
            setMapPublic(detail.checked);
          }}
        >
          Enable auto-assign public IPv4 address
        </Checkbox>
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
      title="Edit route table association"
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
          <RoutesTable routes={preview?.routes ?? []} />
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
      title="Edit network ACL association"
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
          <FormField label="Network ACL ID">
            <Select
              selectedOption={aclId === null ? null : { value: aclId, label: aclId }}
              options={acls.map((acl) => ({ value: acl.id, label: acl.id, description: acl.name }))}
              onChange={({ detail }) => {
                setAclId(detail.selectedOption.value ?? null);
              }}
            />
          </FormField>
          <NaclEntriesTable direction="inbound" entries={preview?.inboundEntries ?? []} />
          <NaclEntriesTable direction="outbound" entries={preview?.outboundEntries ?? []} />
        </SpaceBetween>
      </Container>
    </FormPage>
  );
}
