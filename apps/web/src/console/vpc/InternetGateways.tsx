import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Modal from '@cloudscape-design/components/modal';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import {
  attachInternetGateway,
  createInternetGateway,
  detachInternetGateway,
  setNameTag,
  type InternetGateway,
} from '@sim/engine';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTopology } from '../../state/topologyStore';
import { ActionsDropdown } from '../components/Actions';
import { ChangeErrors } from '../components/ChangeErrors';
import { DetailsPanel } from '../components/DetailsPanel';
import { failureOf, type ChangeFailure } from '../components/failure';
import { FormPage } from '../components/FormPage';
import { NotFoundResource } from '../components/NotFoundResource';
import { ResourceTable, type ResourceColumn } from '../components/ResourceTable';
import { TagsUnsupported } from '../components/TagsUnsupported';
import { unsupportedTab } from '../components/unsupportedTab';
import { useChange } from '../components/useChange';
import { single, useSelection } from '../components/useSelection';
import { OWNER_ID, orDash, titleOf } from '../components/values';
import { applyChange, useStatus, useTopologyReady, useVpcFiltered } from '../data';

/**
 * VPC console › Internet gateways, Create internet gateway, Attach to VPC and Detach from
 * VPC. Only a screenshot of these pages exists; labels follow the AWS docs procedures
 * (VPC_Internet_Gateway.html, delete-igw.html). Rules: IGW-05 (one per VPC), IGW-07 (detach).
 */

const LIST = '/vpc/internet-gateways';
const STATE_LABEL = { attached: 'Attached', detached: 'Detached' } as const;

export function InternetGateways() {
  const topology = useTopology();
  const status = useStatus();
  const ready = useTopologyReady();
  const navigate = useNavigate();
  const [selected, setSelected] = useSelection();
  const [confirmDetach, setConfirmDetach] = useState(false);
  const [failure, setFailure] = useState<ChangeFailure | null>(null);
  const gateways = useVpcFiltered(topology.internetGateways, (igw) => igw.attachedVpcId);
  const currentId = single(selected);
  const current = topology.internetGateways.find((igw) => igw.id === currentId) ?? null;
  const stateOf = (igw: InternetGateway) =>
    STATE_LABEL[status.internetGateways[igw.id]?.state ?? 'detached'];

  const columns: ResourceColumn<InternetGateway>[] = [
    {
      id: 'name',
      header: 'Name',
      value: (igw) => orDash(igw.name),
      editName: (igw, name) => {
        applyChange((t) => setNameTag(t, { type: 'internet-gateway', id: igw.id }, name));
      },
    },
    { id: 'id', header: 'Internet gateway ID', value: (igw) => igw.id },
    { id: 'state', header: 'State', value: stateOf },
    { id: 'vpc', header: 'VPC ID', value: (igw) => orDash(igw.attachedVpcId) },
    { id: 'owner', header: 'Owner', value: () => OWNER_ID },
  ];
  const create = () => {
    void navigate('/vpc/create-internet-gateway');
  };

  return (
    <SpaceBetween size="l">
      <ChangeErrors failure={failure} />
      <ResourceTable
        title="Internet gateways"
        resourceName="internet gateways"
        items={gateways}
        columns={columns}
        trackBy={(igw) => igw.id}
        selectedIds={selected}
        onSelectionChange={setSelected}
        loading={!ready}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <ActionsDropdown
              actions={[
                { id: 'view', text: 'View details', supported: false },
                {
                  id: 'attach',
                  text: 'Attach to VPC',
                  supported: true,
                  disabled: current === null || current.attachedVpcId !== undefined,
                  onClick: () => {
                    if (current !== null) void navigate(`${LIST}/${current.id}/attach-to-vpc`);
                  },
                },
                {
                  id: 'detach',
                  text: 'Detach from VPC',
                  supported: true,
                  disabled: current?.attachedVpcId === undefined,
                  onClick: () => {
                    setConfirmDetach(true);
                  },
                },
                { id: 'tags', text: 'Manage tags', supported: false },
                { id: 'delete', text: 'Delete internet gateway', supported: false },
              ]}
            />
            <Button variant="primary" onClick={create}>
              Create internet gateway
            </Button>
          </SpaceBetween>
        }
        empty={{
          title: 'No internet gateways',
          description: 'You do not have any internet gateways in this region',
          action: <Button onClick={create}>Create internet gateway</Button>,
        }}
      />
      <DetailsPanel
        title={current === null ? null : titleOf(current.id, current.name)}
        emptyText="Select an internet gateway above"
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
                        { label: 'Internet gateway ID', value: current.id },
                        { label: 'State', value: stateOf(current) },
                        { label: 'VPC ID', value: orDash(current.attachedVpcId) },
                        { label: 'Owner', value: OWNER_ID },
                      ]}
                    />
                  ),
                },
                unsupportedTab('tags', 'Tags'),
              ]
        }
      />
      <Modal
        visible={confirmDetach && current !== null}
        header="Detach from VPC"
        onDismiss={() => {
          setConfirmDetach(false);
        }}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                onClick={() => {
                  setConfirmDetach(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (current !== null) {
                    setFailure(failureOf(applyChange((t) => detachInternetGateway(t, current.id))));
                  }
                  setConfirmDetach(false);
                }}
              >
                Detach internet gateway
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {current === null ? null : `Detach ${current.id} from ${current.attachedVpcId ?? ''}?`}
      </Modal>
    </SpaceBetween>
  );
}

export function CreateInternetGatewayPage() {
  const [name, setName] = useState('');
  const { failure, submit } = useChange();
  return (
    <FormPage
      title="Create internet gateway"
      cancelHref={LIST}
      submitLabel="Create internet gateway"
      failure={failure}
      onSubmit={() => {
        submit(
          (t) => createInternetGateway(t, { name: name.trim() }),
          (created) => ({ href: LIST, selectId: created.internetGatewayId }),
        );
      }}
    >
      <Container header={<Header variant="h2">Internet gateway settings</Header>}>
        <FormField
          label="Name tag"
          description="Creates a tag with a key of 'Name' and a value that you specify."
        >
          <Input
            value={name}
            onChange={({ detail }) => {
              setName(detail.value);
            }}
          />
        </FormField>
      </Container>
      <TagsUnsupported
        title="Tags - optional"
        emptyText="No tags associated with the resource."
        addLabel="Add new tag"
        remainingText="You can add 50 more tags."
      />
    </FormPage>
  );
}

export function AttachInternetGateway() {
  const { internetGatewayId = '' } = useParams();
  const topology = useTopology();
  const status = useStatus();
  const gateway = topology.internetGateways.find((igw) => igw.id === internetGatewayId);
  const available = topology.vpcs.filter((vpc) => status.vpcs[vpc.id]?.internetGatewayId === null);
  const [vpcId, setVpcId] = useState<string | null>(available[0]?.id ?? null);
  const [submitted, setSubmitted] = useState(false);
  const { failure, submit } = useChange();
  if (gateway === undefined) {
    return (
      <NotFoundResource id={internetGatewayId} backHref={LIST} backLabel="Internet gateways" />
    );
  }
  return (
    <FormPage
      title={`Attach to VPC (${gateway.id})`}
      cancelHref={LIST}
      submitLabel="Attach internet gateway"
      failure={failure}
      onSubmit={() => {
        setSubmitted(true);
        if (vpcId === null) return;
        submit(
          (t) => attachInternetGateway(t, gateway.id, vpcId),
          () => ({ href: LIST, selectId: gateway.id }),
        );
      }}
    >
      <Container header={<Header variant="h2">VPC</Header>}>
        <FormField
          label="Available VPCs"
          description="Attach the internet gateway to this VPC."
          errorText={submitted && vpcId === null ? 'Choose a VPC.' : undefined}
        >
          <Select
            selectedOption={vpcId === null ? null : { value: vpcId, label: vpcId }}
            options={available.map((vpc) => ({
              value: vpc.id,
              label: vpc.id,
              description: vpc.name,
            }))}
            placeholder="Select a VPC"
            empty="No VPCs without an internet gateway"
            onChange={({ detail }) => {
              setVpcId(detail.selectedOption.value ?? null);
            }}
          />
        </FormField>
      </Container>
    </FormPage>
  );
}
