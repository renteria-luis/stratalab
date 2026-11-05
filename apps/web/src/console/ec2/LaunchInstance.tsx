import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import FormField from '@cloudscape-design/components/form-field';
import Grid from '@cloudscape-design/components/grid';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Multiselect from '@cloudscape-design/components/multiselect';
import RadioGroup from '@cloudscape-design/components/radio-group';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import {
  createSecurityGroup,
  launchInstance,
  replaceSecurityGroupRules,
  type HelperResult,
  type LaunchedInstance,
  type RunningServiceInput,
  type Topology,
} from '@sim/engine';
import { useState } from 'react';
import { useT } from '../../i18n/useT';
import { useTopology } from '../../state/topologyStore';
import { useUi } from '../../state/uiStore';
import { andThen } from '../../topology/compose';
import { UnsupportedNotice } from '../components/DetailsPanel';
import { FidelityLabel } from '../components/FidelityLabel';
import { FormPage } from '../components/FormPage';
import { LabelWithFidelity, PartlySupportedRadio } from '../components/FormHelpers';
import { SgRulesEditor } from '../components/RuleEditors';
import { useChange } from '../components/useChange';
import { DASH } from '../components/values';
import { VpcSelect } from '../components/VpcSelect';
import { hasErrors, rowKey, sgDraftOf, sgRowErrors, type SgRuleRow } from '../ruleRows';

/**
 * EC2 console › Launch an instance. Sections, labels and defaults from the capture
 * `ec2-instances-instances-launch_an_instance.txt` (2026-11-03). Prices are left out
 * (AGENTS.md, rule 10). Instance type, key pair, storage and advanced details are
 * Unsupported. "Simulated software" is the simulator's own field (Inferred).
 * Rules: ADR-09, ADR-10 (addresses), SG-05 (default group), EPH-01 (platform).
 */

const LIST = '/ec2/instances';
const NO_PREFERENCE = '';

const QUICK_START = [
  { value: 'amazon-linux', label: 'Amazon Linux', platform: 'linux' },
  { value: 'macos', label: 'macOS', platform: null },
  { value: 'ubuntu', label: 'Ubuntu', platform: 'linux' },
  { value: 'windows', label: 'Windows', platform: 'windows' },
  { value: 'red-hat', label: 'Red Hat', platform: 'linux' },
  { value: 'suse', label: 'SUSE Linux', platform: 'linux' },
  { value: 'debian', label: 'Debian', platform: 'linux' },
] as const;

type Software = 'none' | 'web-server';

const WEB_SERVER: RunningServiceInput = {
  protocol: 'tcp',
  port: 80,
  name: 'nginx',
  responseHtml: '<h1>It works</h1>',
};

const sshRule = (): SgRuleRow => ({
  key: rowKey(),
  typeId: 'ssh',
  portRange: '22',
  sourceType: 'anywhere-ipv4',
  peer: '0.0.0.0/0',
  description: '',
});

/** `launch-wizard-<n>` with the smallest n not used in the VPC, as the wizard names new groups. */
function launchWizardName(topology: Topology, vpcId: string | null): string {
  const names = new Set(
    topology.securityGroups.filter((group) => group.vpcId === vpcId).map((group) => group.name),
  );
  let n = 1;
  while (names.has(`launch-wizard-${String(n)}`)) n += 1;
  return `launch-wizard-${String(n)}`;
}

export function LaunchInstance() {
  const { t, locale } = useT();
  const topology = useTopology();
  const vpcFilter = useUi((state) => state.vpcFilter);
  const [name, setName] = useState('');
  const [image, setImage] = useState<string>('amazon-linux');
  const [vpcId, setVpcId] = useState<string | null>(vpcFilter ?? topology.vpcs[0]?.id ?? null);
  const [subnetChoice, setSubnetChoice] = useState(NO_PREFERENCE);
  const [publicIpChoice, setPublicIpChoice] = useState<'subnet' | 'enable' | 'disable'>('subnet');
  const [firewall, setFirewall] = useState<'create' | 'existing'>('create');
  const [groupName, setGroupName] = useState(() => launchWizardName(topology, vpcId));
  const [groupDescription, setGroupDescription] = useState(
    () => `${launchWizardName(topology, vpcId)} created ${new Date().toISOString()}`,
  );
  const [rules, setRules] = useState<SgRuleRow[]>(() => [sshRule()]);
  const [existing, setExisting] = useState<string[]>([]);
  const [software, setSoftware] = useState<Software>('none');
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();

  const subnets = topology.subnets.filter((subnet) => subnet.vpcId === vpcId);
  // "No preference" picks the first subnet of the VPC (Inferred, sim.subnetNoPreference).
  const subnet =
    subnetChoice === NO_PREFERENCE
      ? subnets[0]
      : subnets.find((candidate) => candidate.id === subnetChoice);
  const autoAssign =
    publicIpChoice === 'subnet'
      ? (subnet?.mapPublicIpOnLaunch ?? false)
      : publicIpChoice === 'enable';
  const groups = topology.securityGroups.filter((group) => group.vpcId === vpcId);
  const groupIds = new Set(groups.map((group) => group.id));
  const platform = QUICK_START.find((option) => option.value === image)?.platform ?? 'linux';
  const imageLabel = QUICK_START.find((option) => option.value === image)?.label ?? DASH;

  const launch = (current: Topology, securityGroupIds: string[]): HelperResult<LaunchedInstance> =>
    launchInstance(current, {
      subnetId: subnet?.id ?? '',
      platform,
      name: name.trim(),
      autoAssignPublicIp: autoAssign,
      securityGroupIds,
      runningServices: software === 'web-server' ? [WEB_SERVER] : [],
    });

  return (
    <FormPage
      title="Launch an instance"
      description="Amazon EC2 allows you to create virtual machines, or instances, that run on the AWS Cloud. Quickly get started by following the simple steps below."
      cancelHref={LIST}
      submitLabel="Launch instance"
      failure={failure}
      extraActions={
        <Button formAction="none" disabled>
          Preview code
        </Button>
      }
      onSubmit={() => {
        setSubmitted(true);
        if (vpcId === null || subnet === undefined) return;
        if (firewall === 'create' && rules.some((row) => hasErrors(sgRowErrors(row, groupIds))))
          return;
        submit(
          (current) =>
            firewall === 'existing'
              ? launch(current, existing)
              : andThen(
                  createSecurityGroup(current, {
                    vpcId,
                    name: groupName.trim(),
                    description: groupDescription,
                  }),
                  (afterGroup, created) =>
                    andThen(
                      replaceSecurityGroupRules(
                        afterGroup,
                        created.securityGroupId,
                        'inbound',
                        rules.map(sgDraftOf),
                      ),
                      (afterRules) => launch(afterRules, [created.securityGroupId]),
                    ),
                ),
          (created) => ({ href: LIST, selectId: created.instanceId }),
        );
      }}
    >
      <Grid
        gridDefinition={[{ colspan: { default: 12, l: 8 } }, { colspan: { default: 12, l: 4 } }]}
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Name and tags</Header>}>
            <SpaceBetween size="s">
              <FormField label="Name">
                <Input
                  value={name}
                  onChange={({ detail }) => {
                    setName(detail.value);
                  }}
                />
              </FormField>
              <Button formAction="none" disabled>
                Add additional tags
              </Button>
            </SpaceBetween>
          </Container>

          <Container
            header={
              <Header
                variant="h2"
                description="An AMI contains the operating system, application server, and applications for your instance. If you don't see a suitable AMI below, use the search field or choose Browse more AMIs."
                info={<FidelityLabel fidelity="Inferred" note={t('sim.amiPlatform')} />}
              >
                Application and OS Images (Amazon Machine Image)
              </Header>
            }
          >
            <FormField label="Quick Start">
              <PartlySupportedRadio
                value={image}
                onChange={setImage}
                options={QUICK_START.map((option) => ({
                  value: option.value,
                  label: option.label,
                  supported: option.platform !== null,
                }))}
              />
            </FormField>
          </Container>

          <Container
            header={
              <Header variant="h2" info={<FidelityLabel fidelity="Unsupported" />}>
                Instance type
              </Header>
            }
          >
            <FormField label="Instance type">
              <Select
                disabled
                selectedOption={{ value: 't3.micro', label: 't3.micro' }}
                options={[{ value: 't3.micro', label: 't3.micro' }]}
                onChange={() => undefined}
              />
            </FormField>
          </Container>

          <Container
            header={
              <Header
                variant="h2"
                description="You can use a key pair to securely connect to your instance. Ensure that you have access to the selected key pair before you launch the instance."
                info={<FidelityLabel fidelity="Unsupported" />}
              >
                Key pair (login)
              </Header>
            }
          >
            <FormField label="Key pair name - required">
              <Select disabled selectedOption={null} options={[]} onChange={() => undefined} />
            </FormField>
          </Container>

          <Container header={<Header variant="h2">Network settings</Header>}>
            <SpaceBetween size="l">
              <FormField
                label="VPC - required"
                errorText={submitted && vpcId === null ? 'Choose a VPC.' : undefined}
              >
                <VpcSelect
                  value={vpcId}
                  onChange={(next) => {
                    setVpcId(next);
                    setSubnetChoice(NO_PREFERENCE);
                    setExisting([]);
                    const nextName = launchWizardName(topology, next);
                    setGroupName(nextName);
                    setGroupDescription(`${nextName} created ${new Date().toISOString()}`);
                  }}
                />
              </FormField>
              <FormField
                label={
                  <LabelWithFidelity
                    label="Subnet"
                    badge={<FidelityLabel fidelity="Inferred" note={t('sim.subnetNoPreference')} />}
                  />
                }
                errorText={
                  submitted && subnet === undefined
                    ? 'This VPC has no subnets. Create a subnet first.'
                    : undefined
                }
              >
                <Select
                  selectedOption={
                    subnetChoice === NO_PREFERENCE
                      ? { value: NO_PREFERENCE, label: 'No preference' }
                      : { value: subnetChoice, label: subnetChoice }
                  }
                  options={[
                    { value: NO_PREFERENCE, label: 'No preference' },
                    ...subnets.map((option) => ({
                      value: option.id,
                      label: option.id,
                      description: [option.name, option.availabilityZone, option.cidrBlock]
                        .filter((part) => part !== undefined)
                        .join(' | '),
                    })),
                  ]}
                  onChange={({ detail }) => {
                    setSubnetChoice(detail.selectedOption.value ?? NO_PREFERENCE);
                  }}
                />
              </FormField>
              <FormField label="Availability Zone">
                <Box>
                  {subnetChoice === NO_PREFERENCE
                    ? 'No preference'
                    : (subnet?.availabilityZone ?? DASH)}
                </Box>
              </FormField>
              <FormField
                label={
                  <LabelWithFidelity
                    label="Auto-assign public IP"
                    badge={
                      <FidelityLabel
                        fidelity="Inferred"
                        ruleIds={['ADR-10']}
                        note={t('sim.publicPool')}
                      />
                    }
                  />
                }
              >
                <Select
                  selectedOption={{
                    value: autoAssign ? 'enable' : 'disable',
                    label: autoAssign ? 'Enable' : 'Disable',
                  }}
                  options={[
                    { value: 'enable', label: 'Enable' },
                    { value: 'disable', label: 'Disable' },
                  ]}
                  onChange={({ detail }) => {
                    setPublicIpChoice(
                      detail.selectedOption.value === 'enable' ? 'enable' : 'disable',
                    );
                  }}
                />
              </FormField>
              <FormField
                label="Firewall (security groups)"
                description="A security group is a set of firewall rules that control the traffic for your instance. Add rules to allow specific traffic to reach your instance."
              >
                <RadioGroup
                  value={firewall}
                  items={[
                    { value: 'create', label: 'Create security group' },
                    { value: 'existing', label: 'Select existing security group' },
                  ]}
                  onChange={({ detail }) => {
                    setFirewall(detail.value === 'existing' ? 'existing' : 'create');
                  }}
                />
              </FormField>
              {firewall === 'create' ? (
                <SpaceBetween size="l">
                  <FormField
                    label="Security group name - required"
                    constraintText="This security group will be added to all network interfaces. The name can't be edited after the security group is created. Max length is 255 characters. Valid characters: a-z, A-Z, 0-9, spaces, and ._-:/()#,@[]+=&;{}!$*"
                  >
                    <Input
                      value={groupName}
                      onChange={({ detail }) => {
                        setGroupName(detail.value);
                      }}
                    />
                  </FormField>
                  <FormField label="Description - required">
                    <Input
                      value={groupDescription}
                      onChange={({ detail }) => {
                        setGroupDescription(detail.value);
                      }}
                    />
                  </FormField>
                  <FormField label="Inbound Security Group Rules">
                    <SgRulesEditor
                      rows={rules}
                      onChange={setRules}
                      direction="inbound"
                      groups={groups}
                      showErrors={submitted}
                      emptyText="This security group has no inbound rules."
                    />
                  </FormField>
                </SpaceBetween>
              ) : (
                <FormField label="Security groups">
                  <Multiselect
                    selectedOptions={existing.map((id) => ({ value: id, label: id }))}
                    options={groups.map((group) => ({
                      value: group.id,
                      label: group.id,
                      description: group.name,
                    }))}
                    placeholder="Select security groups"
                    empty="No security groups"
                    onChange={({ detail }) => {
                      setExisting(
                        detail.selectedOptions.flatMap((option) =>
                          option.value === undefined ? [] : [option.value],
                        ),
                      );
                    }}
                  />
                </FormField>
              )}
            </SpaceBetween>
          </Container>

          <Container
            header={
              <Header variant="h2" info={<FidelityLabel fidelity="Unsupported" />}>
                Configure storage
              </Header>
            }
          >
            <UnsupportedNotice />
          </Container>

          <Container>
            <ExpandableSection headerText="Advanced details">
              <UnsupportedNotice />
            </ExpandableSection>
          </Container>

          <div lang={locale}>
            <Container
              header={
                <Header
                  variant="h2"
                  description={t('sim.software.description')}
                  info={<FidelityLabel fidelity="Inferred" ruleIds={['TRC-01']} />}
                >
                  {t('sim.software.title')}
                </Header>
              }
            >
              <RadioGroup
                value={software}
                items={[
                  { value: 'none', label: t('sim.software.none') },
                  { value: 'web-server', label: t('sim.software.webServer') },
                ]}
                onChange={({ detail }) => {
                  setSoftware(detail.value === 'web-server' ? 'web-server' : 'none');
                }}
              />
            </Container>
          </div>
        </SpaceBetween>

        <Container header={<Header variant="h2">Summary</Header>}>
          <KeyValuePairs
            columns={1}
            items={[
              { label: 'Number of instances', value: '1' },
              { label: 'Software Image (AMI)', value: imageLabel },
              { label: 'Virtual server type (instance type)', value: 't3.micro' },
              {
                label: 'Firewall (security group)',
                value: firewall === 'create' ? 'New security group' : orNone(existing),
              },
              { label: 'Storage (volumes)', value: DASH },
            ]}
          />
        </Container>
      </Grid>
    </FormPage>
  );
}

function orNone(ids: readonly string[]): string {
  return ids.length === 0 ? DASH : ids.join(', ');
}
