import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { cidr, createSubnet } from '@sim/engine';
import { useState } from 'react';
import { useT } from '../../i18n/useT';
import { useTopology } from '../../state/topologyStore';
import { useUi } from '../../state/uiStore';
import { FidelityLabel } from '../components/FidelityLabel';
import { FormPage } from '../components/FormPage';
import { LabelWithFidelity } from '../components/FormHelpers';
import { TagsUnsupported } from '../components/TagsUnsupported';
import { useChange } from '../components/useChange';
import { availabilityZones } from '../data';

const NO_PREFERENCE = '';

/**
 * VPC console › Create subnet. Labels from the capture
 * `vpc-virtual_private_cloud-subnets-create_subnet.txt` (2026-11-03). One subnet per
 * submit ("Add new subnet" is Unsupported). Defaults: RT-01, NACL-01, ADR-10.
 */
export function CreateSubnet() {
  const { t } = useT();
  const topology = useTopology();
  const vpcFilter = useUi((state) => state.vpcFilter);
  const [vpcId, setVpcId] = useState<string | null>(vpcFilter ?? topology.vpcs[0]?.id ?? null);
  const [name, setName] = useState('');
  const [zone, setZone] = useState(NO_PREFERENCE);
  const [cidrBlock, setCidrBlock] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  const vpc = topology.vpcs.find((candidate) => candidate.id === vpcId);
  const cidrValid = cidr.parseCidr(cidrBlock.trim()) !== null;
  const zones = availabilityZones(topology.region);

  return (
    <FormPage
      title="Create subnet"
      cancelHref="/vpc/subnets"
      submitLabel="Create subnet"
      failure={failure}
      onSubmit={() => {
        setSubmitted(true);
        if (vpc === undefined || !cidrValid) return;
        submit(
          (current) =>
            createSubnet(current, {
              vpcId: vpc.id,
              cidrBlock: cidrBlock.trim(),
              name: name.trim(),
              ...(zone === NO_PREFERENCE ? {} : { availabilityZone: zone }),
            }),
          (created) => ({ href: '/vpc/subnets', selectId: created.subnetId }),
        );
      }}
    >
      <Container header={<Header variant="h2">VPC</Header>}>
        <SpaceBetween size="l">
          <FormField
            label="VPC ID"
            description="Create subnets in this VPC."
            errorText={submitted && vpc === undefined ? 'Choose a VPC.' : undefined}
          >
            <Select
              selectedOption={
                vpc === undefined ? null : { value: vpc.id, label: vpc.id, description: vpc.name }
              }
              options={topology.vpcs.map((option) => ({
                value: option.id,
                label: option.id,
                description: option.name,
              }))}
              placeholder="Select a VPC"
              empty="No VPCs"
              onChange={({ detail }) => {
                setVpcId(detail.selectedOption.value ?? null);
              }}
            />
          </FormField>
          {vpc !== undefined && (
            <FormField label="Associated VPC CIDRs">
              <Box variant="awsui-key-label">IPv4 CIDRs</Box>
              <Box>{vpc.cidrBlock}</Box>
            </FormField>
          )}
        </SpaceBetween>
      </Container>
      <Container
        header={
          <Header
            variant="h2"
            description="Specify the CIDR blocks and Availability Zone for the subnet."
          >
            Subnet settings
          </Header>
        }
      >
        <SpaceBetween size="l">
          <Box variant="h3">Subnet 1 of 1</Box>
          <FormField
            label="Subnet name"
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
          <FormField
            label={
              <LabelWithFidelity
                label="Availability Zone"
                badge={<FidelityLabel fidelity="Inferred" note={t('sim.zoneNoPreference')} />}
              />
            }
            description="Choose the zone in which your subnet will reside, or let Amazon choose one for you."
          >
            <Select
              selectedOption={{
                value: zone,
                label: zone === NO_PREFERENCE ? 'No preference' : zone,
              }}
              options={[
                { value: NO_PREFERENCE, label: 'No preference' },
                ...zones.map((option) => ({ value: option, label: option })),
              ]}
              onChange={({ detail }) => {
                setZone(detail.selectedOption.value ?? NO_PREFERENCE);
              }}
            />
          </FormField>
          <FormField
            label="IPv4 VPC CIDR block"
            description="Choose the VPC's IPv4 CIDR block for the subnet. The subnet's IPv4 CIDR must lie within this block."
          >
            <Select
              disabled={vpc === undefined}
              selectedOption={
                vpc === undefined ? null : { value: vpc.cidrBlock, label: vpc.cidrBlock }
              }
              options={vpc === undefined ? [] : [{ value: vpc.cidrBlock, label: vpc.cidrBlock }]}
              onChange={() => undefined}
            />
          </FormField>
          <FormField
            label="IPv4 subnet CIDR block"
            errorText={submitted && !cidrValid ? 'Enter a valid IPv4 CIDR block.' : undefined}
          >
            <Input
              value={cidrBlock}
              placeholder={vpc?.cidrBlock ?? '10.0.1.0/24'}
              onChange={({ detail }) => {
                setCidrBlock(detail.value);
              }}
            />
          </FormField>
          <TagsUnsupported
            title="Tags - optional"
            emptyText="No tags associated with the resource."
            addLabel="Add new tag"
            remainingText="You can add 50 more tags."
          />
          <Button formAction="none" disabled>
            Add new subnet
          </Button>
        </SpaceBetween>
      </Container>
    </FormPage>
  );
}
