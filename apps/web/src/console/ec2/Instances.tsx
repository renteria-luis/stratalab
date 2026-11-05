import Button from '@cloudscape-design/components/button';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import { setNameTag, type Instance } from '@sim/engine';
import { useNavigate } from 'react-router';
import { useT } from '../../i18n/useT';
import { useTopology } from '../../state/topologyStore';
import { ActionsDropdown } from '../components/Actions';
import { DetailsPanel } from '../components/DetailsPanel';
import { FidelityLabel } from '../components/FidelityLabel';
import { LabelWithFidelity } from '../components/FormHelpers';
import { ResourceTable, type ResourceColumn } from '../components/ResourceTable';
import { unsupportedTab } from '../components/unsupportedTab';
import { single, useSelection } from '../components/useSelection';
import { DASH, OWNER_ID, orDash, titleOf } from '../components/values';
import { applyChange, useTopologyReady } from '../data';

/**
 * EC2 console › Instances. Columns, buttons, empty state and the Actions menu from the
 * capture `ec2-instances-instances.txt` (2026-11-03). Every R0 instance is running
 * (r0-engine.md 3.7); instance types, key pairs, monitoring and launch time aren't modeled.
 * "Platform details" values: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/billing-info-fields.html
 * The details tabs follow the AWS docs until a capture of them exists.
 */

const PLATFORM_DETAILS = { linux: 'Linux/UNIX', windows: 'Windows' } as const;

export function Instances() {
  const { t } = useT();
  const topology = useTopology();
  const ready = useTopologyReady();
  const navigate = useNavigate();
  const [selected, setSelected] = useSelection();
  const currentId = single(selected);
  const current = topology.instances.find((instance) => instance.id === currentId) ?? null;
  const groupName = (id: string) =>
    topology.securityGroups.find((group) => group.id === id)?.name ?? id;
  const zoneOf = (instance: Instance) =>
    topology.subnets.find((subnet) => subnet.id === instance.primaryNetworkInterface.subnetId)
      ?.availabilityZone ?? DASH;
  const publicAddress = (instance: Instance) => instance.primaryNetworkInterface.publicIp?.address;
  const elasticIp = (instance: Instance) => {
    const publicIp = instance.primaryNetworkInterface.publicIp;
    return publicIp?.kind === 'elastic-ip' ? publicIp.address : undefined;
  };

  const columns: ResourceColumn<Instance>[] = [
    {
      id: 'name',
      header: 'Name',
      value: (instance) => orDash(instance.name),
      editName: (instance, name) => {
        applyChange((current) => setNameTag(current, { type: 'instance', id: instance.id }, name));
      },
    },
    { id: 'id', header: 'Instance ID', value: (instance) => instance.id },
    {
      id: 'state',
      header: 'Instance state',
      value: () => 'Running',
      render: () => <StatusIndicator type="success">Running</StatusIndicator>,
    },
    { id: 'type', header: 'Instance type', value: () => DASH },
    { id: 'status-check', header: 'Status check', value: () => DASH },
    { id: 'az', header: 'Availability Zone', value: zoneOf },
    { id: 'public-dns', header: 'Public IPv4 DNS', value: () => DASH },
    {
      id: 'public-ip',
      header: 'Public IPv4 address',
      value: (instance) => orDash(publicAddress(instance)),
    },
    { id: 'elastic-ip', header: 'Elastic IP', value: (instance) => orDash(elasticIp(instance)) },
    { id: 'ipv6', header: 'IPv6 IPs', value: () => DASH },
    { id: 'monitoring', header: 'Monitoring', value: () => DASH },
    {
      id: 'security-groups',
      header: 'Security group name',
      value: (instance) =>
        instance.primaryNetworkInterface.securityGroupIds.map(groupName).join(', '),
    },
    { id: 'key', header: 'Key name', value: () => DASH },
    { id: 'launch-time', header: 'Launch time', value: () => DASH },
    {
      id: 'platform',
      header: 'Platform details',
      value: (instance) => PLATFORM_DETAILS[instance.platform],
    },
    { id: 'managed', header: 'Managed', value: () => DASH },
    { id: 'operator', header: 'Operator', value: () => DASH },
  ];

  const launch = () => {
    void navigate('/ec2/launch-instances');
  };
  const unsupported = (texts: readonly string[]) =>
    texts.map((text) => ({ id: text, text, supported: false }));

  return (
    <SpaceBetween size="l">
      <ResourceTable
        title="Instances"
        resourceName="instances"
        items={topology.instances}
        columns={columns}
        trackBy={(instance) => instance.id}
        selectedIds={selected}
        onSelectionChange={setSelected}
        loading={!ready}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled>Connect</Button>
            <ActionsDropdown
              label="Instance state"
              actions={unsupported([
                'Stop instance',
                'Start instance',
                'Reboot instance',
                'Hibernate instance',
                'Terminate (delete) instance',
              ])}
            />
            <ActionsDropdown
              actions={[
                ...unsupported(['Connect', 'Instance diagnostics']),
                {
                  text: 'Instance settings',
                  items: unsupported([
                    'Attach to Auto Scaling Group',
                    'Change stop protection',
                    'Change termination protection',
                    'Change shutdown behavior',
                    'Change auto-recovery behavior',
                    'Change instance migration on reboot',
                    'Protect with Elastic Disaster Recovery',
                    'Change instance type',
                    'Change CPU options',
                    'Modify instance placement',
                    'Modify Capacity Reservation settings',
                    'Change Nitro Enclaves',
                    'Connect RDS database',
                    'Change credit specification',
                    'Change resource based naming options',
                    'Edit user data',
                    'Modify SQL High Availability settings',
                    'Allow tags in instance metadata',
                    'Modify instance metadata options',
                    'Manage tags',
                  ]),
                },
                {
                  text: 'Networking',
                  items: unsupported([
                    'Attach network interface',
                    'Detach network interface',
                    'Manage IP addresses',
                    'Disassociate Elastic IP address',
                    'Change source/destination check',
                    'Manage ENA express',
                    'Manage ENA queues',
                    'Manage bandwidth',
                  ]),
                },
                {
                  text: 'Security',
                  items: unsupported([
                    'Change security groups',
                    'Modify IAM role',
                    'Get Windows password',
                  ]),
                },
                {
                  text: 'Image and templates',
                  items: unsupported([
                    'Create image',
                    'Create template from instance',
                    'Launch more like this',
                  ]),
                },
                {
                  text: 'Storage',
                  items: unsupported(['Attach volume', 'Detach volume', 'Replace root volume']),
                },
                {
                  text: 'Monitor and troubleshoot',
                  items: unsupported([
                    'Manage detailed monitoring',
                    'Manage CloudWatch alarms',
                    'Configure CloudWatch agent',
                    'Get system log',
                    'Get instance screenshot',
                    'Connect to serial port',
                    'Visit SSM Fleet Manager',
                  ]),
                },
              ]}
            />
            <ButtonDropdown
              variant="primary"
              mainAction={{ text: 'Launch instances', onClick: launch }}
              items={[
                {
                  id: 'template',
                  text: 'Launch instance from template',
                  disabled: true,
                  disabledReason: t('fidelity.notSimulated'),
                },
                {
                  id: 'migrate',
                  text: 'Migrate a server',
                  disabled: true,
                  disabledReason: t('fidelity.notSimulated'),
                },
              ]}
              ariaLabel="Launch instances options"
            />
          </SpaceBetween>
        }
        empty={{
          title: 'No instances',
          description: 'You do not have any instances in this region',
          action: <Button onClick={launch}>Launch instances</Button>,
        }}
      />
      <DetailsPanel
        title={current === null ? null : titleOf(current.id, current.name)}
        emptyText="Select an instance"
        tabs={
          current === null
            ? []
            : [
                {
                  id: 'details',
                  label: 'Details',
                  content: (
                    <KeyValuePairs
                      columns={3}
                      items={[
                        { label: 'Instance ID', value: current.id },
                        { label: 'Public IPv4 address', value: orDash(publicAddress(current)) },
                        {
                          label: 'Private IPv4 addresses',
                          value: current.primaryNetworkInterface.privateIpAddress,
                        },
                        {
                          label: 'Instance state',
                          value: <StatusIndicator type="success">Running</StatusIndicator>,
                        },
                        { label: 'Platform details', value: PLATFORM_DETAILS[current.platform] },
                        {
                          label: 'Launch time',
                          value: (
                            <LabelWithFidelity
                              label={DASH}
                              badge={
                                <FidelityLabel fidelity="Unsupported" note={t('sim.launchTime')} />
                              }
                            />
                          ),
                        },
                        { label: 'Owner', value: OWNER_ID },
                      ]}
                    />
                  ),
                },
                unsupportedTab('status', 'Status and alarms'),
                unsupportedTab('monitoring', 'Monitoring'),
                {
                  id: 'security',
                  label: 'Security',
                  content: (
                    <KeyValuePairs
                      columns={2}
                      items={[
                        {
                          label: 'Security groups',
                          value: current.primaryNetworkInterface.securityGroupIds
                            .map((id) => `${id} (${groupName(id)})`)
                            .join(', '),
                        },
                        { label: 'IAM Role', value: DASH },
                      ]}
                    />
                  ),
                },
                {
                  id: 'networking',
                  label: 'Networking',
                  content: (
                    <SpaceBetween size="l">
                      <KeyValuePairs
                        columns={3}
                        items={[
                          { label: 'Public IPv4 address', value: orDash(publicAddress(current)) },
                          {
                            label: 'Private IPv4 addresses',
                            value: current.primaryNetworkInterface.privateIpAddress,
                          },
                          {
                            label: 'VPC ID',
                            value: orDash(
                              topology.subnets.find(
                                (subnet) => subnet.id === current.primaryNetworkInterface.subnetId,
                              )?.vpcId,
                            ),
                          },
                          { label: 'Subnet ID', value: current.primaryNetworkInterface.subnetId },
                          { label: 'Availability Zone', value: zoneOf(current) },
                          { label: 'Elastic IP addresses', value: orDash(elasticIp(current)) },
                        ]}
                      />
                      <Table
                        variant="embedded"
                        header="Network interfaces"
                        items={[current.primaryNetworkInterface]}
                        trackBy="id"
                        columnDefinitions={[
                          { id: 'id', header: 'Interface ID', cell: (eni) => eni.id },
                          { id: 'subnet', header: 'Subnet ID', cell: (eni) => eni.subnetId },
                          {
                            id: 'private',
                            header: 'Private IPv4 address',
                            cell: (eni) => eni.privateIpAddress,
                          },
                          {
                            id: 'public',
                            header: 'Public IPv4 address',
                            cell: (eni) => orDash(eni.publicIp?.address),
                          },
                        ]}
                      />
                    </SpaceBetween>
                  ),
                },
                unsupportedTab('storage', 'Storage'),
                unsupportedTab('tags', 'Tags'),
              ]
        }
      />
    </SpaceBetween>
  );
}
