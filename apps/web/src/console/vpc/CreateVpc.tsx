import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { cidr, createVpc } from '@sim/engine';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChangeErrors } from '../components/ChangeErrors';
import { failureOf, type ChangeFailure } from '../components/failure';
import { ConsolePageLayout } from '../components/ConsolePageLayout';
import { FidelityLabel } from '../components/FidelityLabel';
import { LabelWithFidelity, PartlySupportedRadio } from '../components/FormHelpers';
import { TagsUnsupported } from '../components/TagsUnsupported';
import type { SelectState } from '../components/useSelection';
import { applyChange } from '../data';

/**
 * VPC console › Create VPC ("VPC only"). Labels from the capture
 * `vpc-virtual_private_cloud-your_vpcs-create_vpc-vpc_only.txt` (2026-11-03).
 * Defaults: RT-01, NACL-05, SG-05 (engine helper `createVpc`).
 */
export function CreateVpc() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [cidrBlock, setCidrBlock] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<ChangeFailure | null>(null);
  const cidrValid = cidr.parseCidr(cidrBlock.trim()) !== null;

  const submit = () => {
    setSubmitted(true);
    if (!cidrValid) return;
    const outcome = applyChange((topology) =>
      createVpc(topology, { cidrBlock: cidrBlock.trim(), name: name.trim() }),
    );
    setFailure(failureOf(outcome));
    if (outcome.ok) {
      void navigate('/vpc/your-vpcs', {
        state: { selectId: outcome.created.vpcId } satisfies SelectState,
      });
    }
  };

  return (
    <ConsolePageLayout
      title="Create VPC"
      description="A VPC is an isolated portion of the AWS Cloud populated by AWS objects, such as Amazon EC2 instances."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Form
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                formAction="none"
                onClick={() => {
                  void navigate('/vpc/your-vpcs');
                }}
              >
                Cancel
              </Button>
              <Button formAction="none" disabled>
                Preview code
              </Button>
              <Button variant="primary">Create VPC</Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <ChangeErrors failure={failure} />
            <Container header={<Header variant="h2">VPC settings</Header>}>
              <SpaceBetween size="l">
                <FormField
                  label="Resources to create"
                  description="Create only the VPC resource or the VPC and other networking resources."
                >
                  <PartlySupportedRadio
                    value="vpc-only"
                    onChange={() => undefined}
                    options={[
                      { value: 'vpc-only', label: 'VPC only', supported: true },
                      { value: 'vpc-and-more', label: 'VPC and more', supported: false },
                    ]}
                  />
                </FormField>
                <FormField
                  label="Name tag - optional"
                  description="Creates a tag with a key of 'Name' and a value that you specify."
                >
                  <Input
                    value={name}
                    onChange={({ detail }) => {
                      setName(detail.value);
                    }}
                  />
                </FormField>
                <FormField label="IPv4 CIDR block">
                  <PartlySupportedRadio
                    value="manual"
                    onChange={() => undefined}
                    options={[
                      { value: 'manual', label: 'IPv4 CIDR manual input', supported: true },
                      { value: 'ipam', label: 'IPAM-allocated IPv4 CIDR block', supported: false },
                    ]}
                  />
                </FormField>
                <FormField
                  label="IPv4 CIDR"
                  constraintText="CIDR block size must be between /16 and /28."
                  errorText={submitted && !cidrValid ? 'Enter a valid IPv4 CIDR block.' : undefined}
                >
                  <Input
                    value={cidrBlock}
                    placeholder="10.0.0.0/16"
                    onChange={({ detail }) => {
                      setCidrBlock(detail.value);
                    }}
                  />
                </FormField>
                <FormField label="IPv6 CIDR block">
                  <PartlySupportedRadio
                    value="none"
                    onChange={() => undefined}
                    options={[
                      { value: 'none', label: 'No IPv6 CIDR block', supported: true },
                      { value: 'ipam', label: 'IPAM-allocated IPv6 CIDR block', supported: false },
                      {
                        value: 'amazon',
                        label: 'Amazon-provided IPv6 CIDR block',
                        supported: false,
                      },
                      { value: 'byoip', label: 'IPv6 CIDR owned by me', supported: false },
                    ]}
                  />
                </FormField>
                <FormField
                  label={
                    <LabelWithFidelity
                      label="Tenancy"
                      badge={<FidelityLabel fidelity="Unsupported" />}
                    />
                  }
                >
                  <Select
                    disabled
                    selectedOption={{ value: 'default', label: 'Default' }}
                    options={[{ value: 'default', label: 'Default' }]}
                    onChange={() => undefined}
                  />
                </FormField>
                <FormField
                  label="VPC encryption control ($)"
                  description="Monitor mode provides visibility into encryption status without blocking traffic. Enforce mode prevents unencrypted traffic. Additional charges apply"
                >
                  <PartlySupportedRadio
                    value="none"
                    onChange={() => undefined}
                    options={[
                      { value: 'none', label: 'None', supported: true },
                      {
                        value: 'monitor',
                        label: 'Monitor mode',
                        description:
                          'See which resources in your VPC are unencrypted but allow the creation of unencrypted resources.',
                        supported: false,
                      },
                      {
                        value: 'enforce',
                        label: 'Enforce mode',
                        description:
                          'Requires all resources, except exclusions, in your VPC to be encryption-capable and blocks creation of unencrypted resources.',
                        supported: false,
                      },
                    ]}
                  />
                </FormField>
              </SpaceBetween>
            </Container>
            <TagsUnsupported
              description="A tag is a label that you assign to an AWS resource. Each tag consists of a key and an optional value. You can use tags to search and filter your resources or track your AWS costs."
              emptyText="No tags associated with the resource"
              addLabel="Add tag"
              remainingText="You can add 50 more tags"
            />
            <Box />
          </SpaceBetween>
        </Form>
      </form>
    </ConsolePageLayout>
  );
}
