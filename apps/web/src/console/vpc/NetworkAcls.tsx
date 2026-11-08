import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import TokenGroup from '@cloudscape-design/components/token-group';
import {
  associateNetworkAcl,
  createNetworkAcl,
  replaceNetworkAclEntries,
  setNameTag,
  type HelperResult,
  type NetworkAcl,
  type Subnet,
  type Topology,
} from '@sim/engine';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTopology } from '../../state/topologyStore';
import { useUi } from '../../state/uiStore';
import { andThen } from '../../topology/compose';
import { ActionsDropdown } from '../components/Actions';
import { ColumnPairs } from '../components/ColumnPairs';
import { DetailsPanel } from '../components/DetailsPanel';
import { FidelityLabel } from '../components/FidelityLabel';
import { FormPage } from '../components/FormPage';
import { NotFoundResource } from '../components/NotFoundResource';
import { NaclEntriesEditor } from '../components/RuleEditors';
import { NaclEntriesTable } from '../components/RuleTables';
import { ResourceTable, type ResourceColumn } from '../components/ResourceTable';
import { TagsUnsupported } from '../components/TagsUnsupported';
import { unsupportedTab } from '../components/unsupportedTab';
import { useChange } from '../components/useChange';
import { single, useSelection } from '../components/useSelection';
import { DASH, OWNER_ID, orDash, titleOf, yesNo } from '../components/values';
import { VpcSelect } from '../components/VpcSelect';
import { applyChange, useStatus, useTopologyReady, useVpcFiltered } from '../data';
import { hasErrors, naclEntryOf, naclRowErrors, naclRowOf, type NaclEntryRow } from '../ruleRows';

/**
 * VPC console › Network ACLs and its forms. Labels from the captures (2026-11-05)
 * `vpc-security-network_acls*.txt`; the empty list and validation messages aren't captured
 * and follow the AWS docs procedures (vpc-network-acls.html, create-network-acl.html,
 * nacl-rules.html). Rules: NACL-01 (associations), NACL-02 (order, `*`), NACL-05 (defaults),
 * NACL-08 (unique rule numbers).
 */

const DEFAULT_ACL_RULES_NOTICE =
  "You're editing the VPC's default network ACL. All subnets share this ACL's rules unless they are associated with a custom ACL of their own.";
const DEFAULT_ACL_ASSOCIATIONS_NOTICE =
  "This is the default network ACL for this VPC. You can't disassociate its subnets using this page. Instead, edit the subnet associations from the network ACL page.";

const LIST = '/vpc/network-acls';

export function NetworkAcls() {
  const topology = useTopology();
  const status = useStatus();
  const ready = useTopologyReady();
  const navigate = useNavigate();
  const [selected, setSelected] = useSelection();
  const acls = useVpcFiltered(topology.networkAcls, (acl) => acl.vpcId);
  const currentId = single(selected);
  const current = topology.networkAcls.find((acl) => acl.id === currentId) ?? null;
  const isDefault = (acl: NetworkAcl) =>
    topology.vpcs.some((vpc) => vpc.defaultNetworkAclId === acl.id);
  const associated = (acl: NetworkAcl) =>
    topology.subnets.filter((subnet) => status.subnets[subnet.id]?.networkAclId === acl.id);
  // "6 Subnets", as captured for the list and the Details tab (2026-11-05); other counts Inferred.
  const associatedText = (acl: NetworkAcl) => {
    const count = associated(acl).length;
    return count === 0 ? DASH : `${String(count)} Subnets`;
  };

  const columns: ResourceColumn<NetworkAcl>[] = [
    {
      id: 'name',
      header: 'Name',
      value: (acl) => orDash(acl.name),
      editName: (acl, name) => {
        applyChange((t) => setNameTag(t, { type: 'network-acl', id: acl.id }, name));
      },
    },
    { id: 'id', header: 'Network ACL ID', value: (acl) => acl.id },
    {
      id: 'associated',
      header: 'Associated with',
      value: associatedText,
    },
    { id: 'default', header: 'Default', value: (acl) => yesNo(isDefault(acl)) },
    { id: 'vpc', header: 'VPC ID', value: (acl) => acl.vpcId },
    {
      id: 'inbound',
      header: 'Inbound rules count',
      value: (acl) => `${String(acl.inboundEntries.length + 1)} Inbound rules`,
    },
    {
      id: 'outbound',
      header: 'Outbound rules count',
      value: (acl) => `${String(acl.outboundEntries.length + 1)} Outbound rules`,
    },
    { id: 'owner', header: 'Owner', value: () => OWNER_ID },
  ];

  const go = (suffix: string) => {
    if (currentId !== null) void navigate(`${LIST}/${currentId}/${suffix}`);
  };
  const create = () => {
    void navigate('/vpc/create-network-acl');
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
        title="Network ACLs"
        resourceName="network ACLs"
        items={acls}
        columns={columns}
        trackBy={(acl) => acl.id}
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
                {
                  id: 'edit-associations',
                  text: 'Edit subnet associations',
                  supported: true,
                  disabled: currentId === null,
                  onClick: () => {
                    go('edit-subnet-associations');
                  },
                },
                { id: 'tags', text: 'Manage tags', supported: false },
                { id: 'delete', text: 'Delete network ACLs', supported: false },
              ]}
            />
            <Button variant="primary" onClick={create}>
              Create network ACL
            </Button>
          </SpaceBetween>
        }
        empty={{
          title: 'No network ACLs',
          description: 'You do not have any network ACLs in this region',
          action: <Button onClick={create}>Create network ACL</Button>,
        }}
      />
      <DetailsPanel
        title={current === null ? null : titleOf(current.id, current.name)}
        emptyText="Select a network ACL"
        tabs={
          current === null
            ? []
            : [
                {
                  id: 'details',
                  label: 'Details',
                  content: (
                    <ColumnPairs
                      columns={[
                        [
                          ['Network ACL ID', current.id],
                          ['Owner', OWNER_ID],
                        ],
                        [['Associated with', associatedText(current)]],
                        [['Default', yesNo(isDefault(current))]],
                        [['VPC ID', current.vpcId]],
                      ]}
                    />
                  ),
                },
                {
                  id: 'inbound',
                  label: 'Inbound rules',
                  content: (
                    <NaclEntriesTable
                      direction="inbound"
                      entries={current.inboundEntries}
                      header={
                        <Header
                          variant="h3"
                          counter={`(${String(current.inboundEntries.length + 1)})`}
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
                    <NaclEntriesTable
                      direction="outbound"
                      entries={current.outboundEntries}
                      header={
                        <Header
                          variant="h3"
                          counter={`(${String(current.outboundEntries.length + 1)})`}
                          actions={editButton('Edit outbound rules', 'edit-outbound-rules')}
                        >
                          Outbound rules
                        </Header>
                      }
                    />
                  ),
                },
                {
                  id: 'subnet-associations',
                  label: 'Subnet associations',
                  content: (
                    <Table<Subnet>
                      variant="embedded"
                      items={associated(current)}
                      trackBy="id"
                      empty="No subnet associations"
                      header={
                        <Header
                          variant="h3"
                          counter={`(${String(associated(current).length)})`}
                          actions={editButton(
                            'Edit subnet associations',
                            'edit-subnet-associations',
                          )}
                        >
                          Subnet associations
                        </Header>
                      }
                      columnDefinitions={[
                        { id: 'name', header: 'Name', cell: (subnet) => orDash(subnet.name) },
                        { id: 'id', header: 'Subnet ID', cell: (subnet) => subnet.id },
                        { id: 'ipv4', header: 'IPv4 CIDR', cell: (subnet) => subnet.cidrBlock },
                        { id: 'ipv6', header: 'IPv6 CIDR', cell: () => DASH },
                      ]}
                    />
                  ),
                },
                unsupportedTab('tags', 'Tags'),
              ]
        }
      />
    </SpaceBetween>
  );
}

export function CreateNetworkAclPage() {
  const topology = useTopology();
  const vpcFilter = useUi((state) => state.vpcFilter);
  const [name, setName] = useState('');
  const [vpcId, setVpcId] = useState<string | null>(vpcFilter ?? topology.vpcs[0]?.id ?? null);
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  return (
    <FormPage
      title="Create network ACL"
      description="A network ACL is an optional layer of security that acts as a firewall for controlling traffic in and out of a subnet."
      cancelHref={LIST}
      submitLabel="Create network ACL"
      failure={failure}
      onSubmit={() => {
        setSubmitted(true);
        if (vpcId === null) return;
        submit(
          (t) => createNetworkAcl(t, { vpcId, name: name.trim() }),
          (created) => ({ href: LIST, selectId: created.networkAclId }),
        );
      }}
    >
      <Container header={<Header variant="h2">Network ACL settings</Header>}>
        <SpaceBetween size="l">
          <FormField
            label="Name - optional"
            description="Creates a tag with a key of 'Name' and a value that you specify."
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
            description="VPC to use for this network ACL."
            errorText={submitted && vpcId === null ? 'Choose a VPC.' : undefined}
          >
            <VpcSelect value={vpcId} onChange={setVpcId} />
          </FormField>
        </SpaceBetween>
      </Container>
      {/* This page writes these three texts without a final period (captured). */}
      <TagsUnsupported
        emptyText="No tags associated with the resource"
        addLabel="Add tag"
        remainingText="You can add 50 more tags"
      />
    </FormPage>
  );
}

export function EditNetworkAclRules({ direction }: { direction: 'inbound' | 'outbound' }) {
  const { networkAclId = '' } = useParams();
  const topology = useTopology();
  const acl = topology.networkAcls.find((candidate) => candidate.id === networkAclId);
  const entries = direction === 'inbound' ? acl?.inboundEntries : acl?.outboundEntries;
  const [rows, setRows] = useState<NaclEntryRow[]>(
    (entries ?? []).toSorted((a, b) => a.ruleNumber - b.ruleNumber).map(naclRowOf),
  );
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  if (acl === undefined) {
    return <NotFoundResource id={networkAclId} backHref={LIST} backLabel="Network ACLs" />;
  }
  const title = direction === 'inbound' ? 'Edit inbound rules' : 'Edit outbound rules';
  const isDefault = topology.vpcs.some((vpc) => vpc.defaultNetworkAclId === acl.id);
  return (
    <FormPage
      title={title}
      description={
        direction === 'inbound'
          ? "Inbound rules control the incoming traffic that's allowed to reach the VPC."
          : "Outbound rules control the outgoing traffic that's allowed to leave the VPC."
      }
      cancelHref={LIST}
      submitLabel="Save changes"
      extraActions={
        <SpaceBetween direction="horizontal" size="xxs" alignItems="center">
          <Button formAction="none" disabled>
            Preview changes
          </Button>
          <FidelityLabel fidelity="Unsupported" />
        </SpaceBetween>
      }
      failure={failure}
      onSubmit={() => {
        setSubmitted(true);
        if (rows.some((row) => hasErrors(naclRowErrors(row)))) return;
        submit(
          (t) => replaceNetworkAclEntries(t, acl.id, direction, rows.map(naclEntryOf)),
          () => ({ href: LIST, selectId: acl.id }),
        );
      }}
    >
      <Container
        header={
          <Header variant="h2" description={acl.id}>
            {direction === 'inbound' ? 'Inbound rules' : 'Outbound rules'}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {isDefault && <Alert type="info">{DEFAULT_ACL_RULES_NOTICE}</Alert>}
          <NaclEntriesEditor
            rows={rows}
            onChange={setRows}
            direction={direction}
            showErrors={submitted}
          />
          <Button
            formAction="none"
            onClick={() => {
              // Rows with a rule number that isn't a number keep their place at the end.
              const order = (row: NaclEntryRow) => {
                const value = Number(row.ruleNumber);
                return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
              };
              setRows(rows.toSorted((a, b) => order(a) - order(b)));
            }}
          >
            Sort by rule number
          </Button>
          {/* The `*` rule, which can't be edited (NACL-02). */}
          <NaclEntriesTable direction={direction} entries={[]} />
        </SpaceBetween>
      </Container>
    </FormPage>
  );
}

/** Checked subnets use this network ACL; unchecking one returns it to the VPC default (NACL-01). */
export function EditNetworkAclAssociations() {
  const { networkAclId = '' } = useParams();
  const topology = useTopology();
  const status = useStatus();
  const acl = topology.networkAcls.find((candidate) => candidate.id === networkAclId);
  const subnets = topology.subnets.filter((subnet) => subnet.vpcId === acl?.vpcId);
  const [checked, setChecked] = useState<Subnet[]>(
    subnets.filter((subnet) => status.subnets[subnet.id]?.networkAclId === networkAclId),
  );
  const { failure, submit } = useChange();
  if (acl === undefined) {
    return <NotFoundResource id={networkAclId} backHref={LIST} backLabel="Network ACLs" />;
  }
  const defaultAclId =
    topology.vpcs.find((vpc) => vpc.id === acl.vpcId)?.defaultNetworkAclId ?? acl.id;
  return (
    <FormPage
      title="Edit subnet associations"
      description="Change which subnets are associated with this network ACL."
      cancelHref={LIST}
      submitLabel="Save changes"
      failure={failure}
      onSubmit={() => {
        const ids = new Set(checked.map((subnet) => subnet.id));
        submit(
          (start) =>
            subnets.reduce<HelperResult>(
              (result, subnet) =>
                andThen(result, (t: Topology) => {
                  if (ids.has(subnet.id)) return associateNetworkAcl(t, subnet.id, acl.id);
                  if (status.subnets[subnet.id]?.networkAclId === acl.id) {
                    return associateNetworkAcl(t, subnet.id, defaultAclId);
                  }
                  return { ok: true, topology: t, created: {} };
                }),
              { ok: true, topology: start, created: {} },
            ),
          () => ({ href: LIST, selectId: acl.id }),
        );
      }}
    >
      {acl.id === defaultAclId && <Alert type="info">{DEFAULT_ACL_ASSOCIATIONS_NOTICE}</Alert>}
      <Table<Subnet>
        header={
          <Header counter={`(${String(checked.length)}/${String(subnets.length)})`}>
            Available subnets
          </Header>
        }
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
          {
            id: 'acl',
            header: 'Associated with',
            cell: (subnet) => status.subnets[subnet.id]?.networkAclId ?? DASH,
          },
          // The console shows "use1-az1 (us-east-1a)"; R0 doesn't model zone IDs.
          { id: 'az', header: 'Availability Zone', cell: (subnet) => subnet.availabilityZone },
          { id: 'ipv4', header: 'IPv4 CIDR', cell: (subnet) => subnet.cidrBlock },
          { id: 'ipv6', header: 'IPv6 CIDR', cell: () => DASH },
        ]}
      />
      <Container header={<Header variant="h2">Selected subnets</Header>}>
        <TokenGroup
          items={checked.map((subnet) => ({ label: subnet.id }))}
          onDismiss={({ detail }) => {
            setChecked(checked.filter((_, index) => index !== detail.itemIndex));
          }}
        />
      </Container>
    </FormPage>
  );
}
