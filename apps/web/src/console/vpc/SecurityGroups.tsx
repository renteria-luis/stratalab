import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { createSecurityGroup, replaceSecurityGroupRules, type SecurityGroup } from '@sim/engine';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTopology } from '../../state/topologyStore';
import { useUi } from '../../state/uiStore';
import { andThen } from '../../topology/compose';
import { ActionsDropdown } from '../components/Actions';
import { DetailsPanel } from '../components/DetailsPanel';
import { FormPage } from '../components/FormPage';
import { NotFoundResource } from '../components/NotFoundResource';
import { ResourceTable, type ResourceColumn } from '../components/ResourceTable';
import { SgRulesEditor } from '../components/RuleEditors';
import { SecurityGroupRulesTable } from '../components/RuleTables';
import { TagsUnsupported } from '../components/TagsUnsupported';
import { unsupportedTab } from '../components/unsupportedTab';
import { useChange } from '../components/useChange';
import { single, useSelection } from '../components/useSelection';
import { DASH, OWNER_ID } from '../components/values';
import { VpcSelect } from '../components/VpcSelect';
import { useTopologyReady, useVpcFiltered } from '../data';
import {
  ANYWHERE_IPV4,
  hasErrors,
  rowKey,
  sgDraftOf,
  sgRowErrors,
  sgRowOf,
  type SgRuleRow,
} from '../ruleRows';

/**
 * Security groups, shared by the VPC console and the EC2 console (`base` is the list path).
 * The create page follows the capture
 * `vpc-security-security_groups-create_security_group.txt` (2026-11-03); the list, the
 * details tabs and the rule pages follow `vpc-security-security_groups*.txt` and
 * `ec2-network_and_security-security_groups.txt` (2026-11-05). The inbound 0.0.0.0/0 warning
 * isn't captured, so only the outbound one is shown. Rules: SG-02 to SG-06.
 */

/** "1 Permission entry" is captured; the plural for other counts is Inferred. */
function permissionEntries(count: number): string {
  return count === 1 ? '1 Permission entry' : `${String(count)} Permission entries`;
}

const OPEN_WARNING =
  'Rules with destination of 0.0.0.0/0 or ::/0 allow your instances to send traffic to any IPv4 or IPv6 address. We recommend setting security group rules to be more restrictive and to only allow traffic to specific known IP addresses.';

export function SecurityGroups({ base }: { base: string }) {
  const topology = useTopology();
  const ready = useTopologyReady();
  const navigate = useNavigate();
  const [selected, setSelected] = useSelection();
  const groups = useVpcFiltered(topology.securityGroups, (group) => group.vpcId);
  const currentId = single(selected);
  const current = topology.securityGroups.find((group) => group.id === currentId) ?? null;
  const names = new Map(topology.securityGroups.map((group) => [group.id, group.name]));

  const columns: ResourceColumn<SecurityGroup>[] = [
    { id: 'name', header: 'Name', value: () => DASH },
    { id: 'id', header: 'Security group ID', value: (group) => group.id },
    { id: 'group-name', header: 'Security group name', value: (group) => group.name },
    { id: 'vpc', header: 'VPC ID', value: (group) => group.vpcId },
    { id: 'description', header: 'Description', value: (group) => group.description },
    { id: 'owner', header: 'Owner', value: () => OWNER_ID },
    {
      id: 'inbound',
      header: 'Inbound rules count',
      value: (group) => permissionEntries(group.inboundRules.length),
    },
    {
      id: 'outbound',
      header: 'Outbound rules count',
      value: (group) => permissionEntries(group.outboundRules.length),
    },
  ];

  const go = (suffix: string) => {
    if (currentId !== null) void navigate(`${base}/${currentId}/${suffix}`);
  };
  const createPath = base.replace(/\/security-groups$/, '/create-security-group');
  const create = () => {
    void navigate(createPath);
  };
  const editButton = (label: string, suffix: string) => (
    <Button
      onClick={() => {
        go(suffix);
      }}
    >
      {label}
    </Button>
  );

  return (
    <SpaceBetween size="l">
      <ResourceTable
        title="Security Groups"
        resourceName="security groups"
        items={groups}
        columns={columns}
        trackBy={(group) => group.id}
        selectedIds={selected}
        onSelectionChange={setSelected}
        loading={!ready}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <ActionsDropdown
              actions={[
                { id: 'view', text: 'View details', supported: false },
                {
                  id: 'edit-inbound',
                  text: 'Edit inbound rules',
                  supported: true,
                  disabled: currentId === null,
                  onClick: () => {
                    go('edit-inbound-rules');
                  },
                },
                {
                  id: 'edit-outbound',
                  text: 'Edit outbound rules',
                  supported: true,
                  disabled: currentId === null,
                  onClick: () => {
                    go('edit-outbound-rules');
                  },
                },
                { id: 'tags', text: 'Manage tags', supported: false },
                { id: 'stale', text: 'Manage stale rules', supported: false },
                { id: 'copy', text: 'Copy to new security group', supported: false },
                { id: 'share', text: 'Share security group', supported: false },
                { id: 'delete', text: 'Delete security groups', supported: false },
              ]}
            />
            <ActionsDropdown
              label="Export security groups to CSV"
              actions={[
                { id: 'export', text: 'Export security groups to CSV', supported: false },
                {
                  id: 'export-rules',
                  text: 'Export security groups inbound/outbound rules to CSV',
                  supported: false,
                },
              ]}
            />
            <Button variant="primary" onClick={create}>
              Create security group
            </Button>
          </SpaceBetween>
        }
        empty={{
          title: 'No security groups',
          description: 'You do not have any security groups in this region',
          action: <Button onClick={create}>Create security group</Button>,
        }}
      />
      <DetailsPanel
        title={current === null ? null : `${current.id} - ${current.name}`}
        emptyText="Select a security group"
        tabs={
          current === null
            ? []
            : [
                {
                  id: 'details',
                  label: 'Details',
                  content: (
                    <KeyValuePairs
                      columns={4}
                      items={[
                        { label: 'Security group name', value: current.name },
                        { label: 'Security group ID', value: current.id },
                        { label: 'Description', value: current.description },
                        { label: 'VPC ID', value: current.vpcId },
                        { label: 'Owner', value: OWNER_ID },
                        {
                          label: 'Inbound rules count',
                          value: permissionEntries(current.inboundRules.length),
                        },
                        {
                          label: 'Outbound rules count',
                          value: permissionEntries(current.outboundRules.length),
                        },
                      ]}
                    />
                  ),
                },
                {
                  id: 'inbound',
                  label: 'Inbound rules',
                  content: (
                    <SecurityGroupRulesTable
                      direction="inbound"
                      rules={current.inboundRules}
                      groupNames={names}
                      header={
                        <Header
                          variant="h3"
                          counter={`(${String(current.inboundRules.length)})`}
                          actions={editButton('Edit inbound rules', 'edit-inbound-rules')}
                        >
                          Inbound rules
                        </Header>
                      }
                    />
                  ),
                },
                {
                  id: 'outbound',
                  label: 'Outbound rules',
                  content: (
                    <SecurityGroupRulesTable
                      direction="outbound"
                      rules={current.outboundRules}
                      groupNames={names}
                      header={
                        <Header
                          variant="h3"
                          counter={`(${String(current.outboundRules.length)})`}
                          actions={editButton('Edit outbound rules', 'edit-outbound-rules')}
                        >
                          Outbound rules
                        </Header>
                      }
                    />
                  ),
                },
                unsupportedTab('sharing', 'Sharing'),
                unsupportedTab('vpc-associations', 'VPC associations'),
                unsupportedTab('related', 'Related resources - new'),
                unsupportedTab('tags', 'Tags'),
              ]
        }
      />
    </SpaceBetween>
  );
}

const defaultOutbound = (): SgRuleRow[] => [
  {
    key: rowKey(),
    typeId: 'all-traffic',
    portRange: 'All',
    sourceType: 'custom',
    peer: ANYWHERE_IPV4,
    description: '',
  },
];

export function CreateSecurityGroupPage({ base }: { base: string }) {
  const topology = useTopology();
  const vpcFilter = useUi((state) => state.vpcFilter);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [vpcId, setVpcId] = useState<string | null>(vpcFilter ?? topology.vpcs[0]?.id ?? null);
  const [inbound, setInbound] = useState<SgRuleRow[]>([]);
  const [outbound, setOutbound] = useState<SgRuleRow[]>(defaultOutbound);
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  const groups = topology.securityGroups.filter((group) => group.vpcId === vpcId);
  const groupIds = new Set(groups.map((group) => group.id));
  const openOutbound = outbound.some((row) => row.peer.trim() === ANYWHERE_IPV4);

  return (
    <FormPage
      title="Create security group"
      description="A security group acts as a virtual firewall for your instance to control inbound and outbound traffic. To create a new security group, complete the fields below."
      cancelHref={base}
      submitLabel="Create security group"
      failure={failure}
      onSubmit={() => {
        setSubmitted(true);
        if (vpcId === null) return;
        if ([...inbound, ...outbound].some((row) => hasErrors(sgRowErrors(row, groupIds)))) return;
        submit(
          (t) =>
            andThen(
              createSecurityGroup(t, { vpcId, name: name.trim(), description }),
              (afterCreate, created) =>
                andThen(
                  replaceSecurityGroupRules(
                    afterCreate,
                    created.securityGroupId,
                    'inbound',
                    inbound.map(sgDraftOf),
                  ),
                  (afterInbound) =>
                    andThen(
                      replaceSecurityGroupRules(
                        afterInbound,
                        created.securityGroupId,
                        'outbound',
                        outbound.map(sgDraftOf),
                      ),
                      (final) => ({ ok: true, topology: final, created }),
                    ),
                ),
            ),
          (created) => ({ href: base, selectId: created.securityGroupId }),
        );
      }}
    >
      <Container header={<Header variant="h2">Basic details</Header>}>
        <SpaceBetween size="l">
          <FormField
            label="Security group name"
            constraintText="Name cannot be edited after creation."
          >
            <Input
              value={name}
              onChange={({ detail }) => {
                setName(detail.value);
              }}
            />
          </FormField>
          <FormField label="Description">
            <Input
              value={description}
              onChange={({ detail }) => {
                setDescription(detail.value);
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
      <Container header={<Header variant="h2">Inbound rules</Header>}>
        <SgRulesEditor
          rows={inbound}
          onChange={setInbound}
          direction="inbound"
          groups={groups}
          showErrors={submitted}
          emptyText="This security group has no inbound rules."
        />
      </Container>
      <Container header={<Header variant="h2">Outbound rules</Header>}>
        <SpaceBetween size="m">
          <SgRulesEditor
            rows={outbound}
            onChange={setOutbound}
            direction="outbound"
            groups={groups}
            showErrors={submitted}
            emptyText="This security group has no outbound rules."
          />
          {openOutbound && <Alert type="warning">{OPEN_WARNING}</Alert>}
        </SpaceBetween>
      </Container>
      <TagsUnsupported
        title="Tags - optional"
        description="A tag is a label that you assign to an AWS resource. Each tag consists of a key and an optional value. You can use tags to search and filter your resources or track your AWS costs."
        emptyText="No tags associated with the resource."
        addLabel="Add new tag"
        remainingText="You can add up to 50 more tags"
      />
    </FormPage>
  );
}

export function EditSecurityGroupRules({
  base,
  direction,
}: {
  base: string;
  direction: 'inbound' | 'outbound';
}) {
  const { securityGroupId = '' } = useParams();
  const topology = useTopology();
  const group = topology.securityGroups.find((candidate) => candidate.id === securityGroupId);
  const rules = direction === 'inbound' ? group?.inboundRules : group?.outboundRules;
  const [rows, setRows] = useState<SgRuleRow[]>((rules ?? []).map(sgRowOf));
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  if (group === undefined) {
    return <NotFoundResource id={securityGroupId} backHref={base} backLabel="Security Groups" />;
  }
  const groups = topology.securityGroups.filter((candidate) => candidate.vpcId === group.vpcId);
  const groupIds = new Set(groups.map((candidate) => candidate.id));
  const title = direction === 'inbound' ? 'Edit inbound rules' : 'Edit outbound rules';
  return (
    <FormPage
      title={title}
      description={
        direction === 'inbound'
          ? "Inbound rules control the incoming traffic that's allowed to reach the instance."
          : "Outbound rules control the outgoing traffic that's allowed to leave the instance."
      }
      cancelHref={base}
      submitLabel="Save rules"
      failure={failure}
      extraActions={
        <Button formAction="none" disabled>
          Preview changes
        </Button>
      }
      onSubmit={() => {
        setSubmitted(true);
        if (rows.some((row) => hasErrors(sgRowErrors(row, groupIds)))) return;
        submit(
          (t) => replaceSecurityGroupRules(t, group.id, direction, rows.map(sgDraftOf)),
          () => ({ href: base, selectId: group.id }),
        );
      }}
    >
      <Container
        header={
          <Header variant="h2" description={`${group.id} - ${group.name}`}>
            {direction === 'inbound' ? 'Inbound rules' : 'Outbound rules'}
          </Header>
        }
      >
        <SpaceBetween size="m">
          <SgRulesEditor
            rows={rows}
            onChange={setRows}
            direction={direction}
            groups={groups}
            showErrors={submitted}
            emptyText={`This security group has no ${direction} rules.`}
          />
          {direction === 'outbound' && rows.some((row) => row.peer.trim() === '0.0.0.0/0') && (
            <Alert type="warning">{OPEN_WARNING}</Alert>
          )}
        </SpaceBetween>
      </Container>
    </FormPage>
  );
}
