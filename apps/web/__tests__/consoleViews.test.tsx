import createWrapper from '@cloudscape-design/components/test-utils/dom';
import {
  attachInternetGateway,
  createInternetGateway,
  createNatGateway,
  createRouteTable,
  createSubnet,
  createVpc,
  launchInstance,
  setMapPublicIpOnLaunch,
  type HelperResult,
  type Topology,
} from '@sim/engine';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FUNCTIONAL_VIEWS } from '../src/console/registry';
import { en } from '../src/i18n/messages/en';
import { consolePages } from '../src/routes/appRoutes';
import { activeTopology, topologyStore } from '../src/state/topologyStore';
import { EMPTY_TOPOLOGY } from '../src/topology/emptyTopology';
import { renderApp } from './renderApp';

function ok<T>(result: HelperResult<T>): { topology: Topology; created: T } {
  if (!result.ok) throw new Error(`Helper failed: ${result.error.code}`);
  return result;
}

/** VPC 10.0.0.0/16 with subnet 10.0.1.0/24 (public IPs on launch) and an attached IGW. */
function lab() {
  const vpc = ok(createVpc(EMPTY_TOPOLOGY, { cidrBlock: '10.0.0.0/16', name: 'lab-vpc' }));
  const { vpcId } = vpc.created;
  const subnet = ok(createSubnet(vpc.topology, { vpcId, cidrBlock: '10.0.1.0/24' }));
  const { subnetId } = subnet.created;
  const mapped = ok(setMapPublicIpOnLaunch(subnet.topology, subnetId, true));
  const igw = ok(createInternetGateway(mapped.topology, {}));
  const { internetGatewayId } = igw.created;
  const attached = ok(attachInternetGateway(igw.topology, internetGatewayId, vpcId));
  const table = ok(createRouteTable(attached.topology, { vpcId, name: 'public-rt' }));
  return {
    topology: table.topology,
    vpcId,
    subnetId,
    internetGatewayId,
    routeTableId: table.created.routeTableId,
  };
}

function seed(topology: Topology) {
  act(() => {
    topologyStore.getState().replaceActiveTopology(topology);
  });
}

const current = () => activeTopology(topologyStore.getState());
const page = () => createWrapper(document.body);

/** Create NAT gateway: picks the subnet in the "Select a subnet" select. */
function chooseSubnet(subnetId: string) {
  const select = page()
    .findAllSelects()
    .find((candidate) => candidate.findTrigger().getElement().textContent === 'Select a subnet');
  if (select === undefined) throw new Error('No subnet select');
  select.openDropdown();
  select.selectOptionByValue(subnetId);
}

/** The form's submit button (the list page also has a "Create NAT gateway" button). */
function createNatButton(which: 'first' | 'last' = 'last'): HTMLElement {
  const buttons = screen.getAllByRole('button', { name: 'Create NAT gateway' });
  const button = which === 'first' ? buttons[0] : buttons.at(-1);
  if (button === undefined) throw new Error('No Create NAT gateway button');
  return button;
}

describe('console views', () => {
  it('CAT-05: every functional console page has a view', () => {
    const functional = consolePages().filter((p) => p.kind === 'functional');
    expect(functional.length).toBeGreaterThan(0);
    for (const consolePage of functional) {
      expect(FUNCTIONAL_VIEWS[consolePage.path], consolePage.path).toBeDefined();
    }
  });

  it('RT-01: Create VPC builds the VPC with its main route table, default ACL and group', async () => {
    const { router } = renderApp('/vpc/create-vpc');
    fireEvent.change(await screen.findByRole('textbox', { name: 'IPv4 CIDR' }), {
      target: { value: '10.0.0.0/16' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create VPC' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vpc/your-vpcs');
    });
    const topology = current();
    expect(topology.vpcs).toHaveLength(1);
    expect(topology.routeTables).toHaveLength(1);
    expect(topology.networkAcls[0]?.inboundEntries).toHaveLength(1);
    expect(topology.securityGroups[0]?.name).toBe('default');
    // The list opens with the new VPC selected and its details below.
    expect(await screen.findByRole('heading', { level: 2, name: 'vpc-00000001' })).toBeDefined();
  });

  it('ADR-03: Create subnet rejects an overlapping CIDR and says why', async () => {
    const { topology } = lab();
    seed(topology);
    renderApp('/vpc/create-subnet');
    fireEvent.change(await screen.findByRole('textbox', { name: 'IPv4 subnet CIDR block' }), {
      target: { value: '10.0.1.0/25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create subnet' }));

    expect(await screen.findByText(en['change.rejected'])).toBeDefined();
    expect(screen.getByText(/overlaps 10\.0\.1\.0\/24/)).toBeDefined();
    expect(current().subnets).toHaveLength(1);
  });

  it('IGW-04: Edit routes adds 0.0.0.0/0 to the internet gateway', async () => {
    const { topology, routeTableId, internetGatewayId } = lab();
    seed(topology);
    const { router } = renderApp(`/vpc/route-tables/${routeTableId}/edit-routes`);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: `Edit routes: ${routeTableId} / public-rt`,
      }),
    ).toBeDefined();
    // Row 1 is the local route, as captured; it has no Remove button.
    const editor = () => page().findAttributeEditor();
    expect(editor()?.findRow(1)?.findRemoveButton()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add route' }));
    const row = editor()?.findRow(2);
    row?.findField(1)?.findControl()?.findAutosuggest()?.setInputValue('0.0.0.0/0');
    const targetType = row?.findField(2)?.findControl()?.findSelect();
    targetType?.openDropdown();
    targetType?.selectOptionByValue('internet-gateway');
    const target = editor()?.findRow(2)?.findField(2)?.findControl()?.findAutosuggest();
    // Choosing the type fills in the ID prefix, as the console does.
    expect(target?.findNativeInput().getElement().value).toBe('igw-');
    target?.focus();
    target?.selectSuggestionByValue(internetGatewayId);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vpc/route-tables');
    });
    expect(current().routeTables.find((table) => table.id === routeTableId)?.routes).toEqual([
      {
        destinationCidrBlock: '0.0.0.0/0',
        target: { type: 'internet-gateway', internetGatewayId },
      },
    ]);
  });

  it('RT-05: Edit routes lists every captured target type and sends 0.0.0.0/0 to a NAT gateway', async () => {
    const base = lab();
    const nat = ok(createNatGateway(base.topology, { subnetId: base.subnetId, name: 'nat-a' }));
    const { natGatewayId } = nat.created;
    seed(nat.topology);
    const { router } = renderApp(`/vpc/route-tables/${base.routeTableId}/edit-routes`);
    fireEvent.click(await screen.findByRole('button', { name: 'Add route' }));
    const row = () => page().findAttributeEditor()?.findRow(2);
    row()?.findField(1)?.findControl()?.findAutosuggest()?.setInputValue('0.0.0.0/0');
    const targetType = row()?.findField(2)?.findControl()?.findSelect();
    targetType?.openDropdown();
    const labels = targetType
      ?.findDropdown()
      .findOptions()
      .map((option) => option.findLabel().getElement().textContent);
    expect(labels).toEqual([
      'Carrier Gateway',
      'Core Network',
      'Egress Only Internet Gateway',
      'Gateway Load Balancer Endpoint',
      'Instance',
      'Internet Gateway',
      'local',
      'NAT Gateway',
      'Network Interface',
      'Outpost Local Gateway',
      'Peering Connection',
      'ODB Network',
      'Transit Gateway',
      'Virtual Private Gateway',
    ]);
    // Types R1 doesn't simulate stay listed, disabled (AGENTS.md, rule 8).
    expect(targetType?.findDropdown().findDisabledOptions()).toHaveLength(12);
    targetType?.selectOptionByValue('nat-gateway');
    const target = row()?.findField(2)?.findControl()?.findAutosuggest();
    expect(target?.findNativeInput().getElement().value).toBe('nat-');
    target?.focus();
    // As captured: 'Use: "nat-"' first, then "id (name)" for each NAT gateway of the VPC.
    expect(target?.findEnteredTextOption()?.getElement().textContent).toBe('Use: "nat-"');
    const suggestions = target
      ?.findDropdown()
      .findOptions()
      .map((option) => option.getElement().textContent);
    expect(suggestions).toEqual([`${natGatewayId} (nat-a)`]);
    target?.selectSuggestionByValue(natGatewayId);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vpc/route-tables');
    });
    expect(current().routeTables.find((table) => table.id === base.routeTableId)?.routes).toEqual([
      { destinationCidrBlock: '0.0.0.0/0', target: { type: 'nat-gateway', natGatewayId } },
    ]);
  });

  it('NAT-01: Create NAT gateway allocates an Elastic IP and lists the NAT gateway as Available', async () => {
    const { topology, subnetId, vpcId } = lab();
    seed(topology);
    const { router } = renderApp('/vpc/nat-gateways');
    expect(await screen.findByText('No NAT gateways found')).toBeDefined();
    expect(screen.getByText('Select a NAT gateway')).toBeDefined();
    fireEvent.click(createNatButton('first'));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vpc/create-nat-gateway');
    });

    // Before a subnet is chosen, the Elastic IP controls are disabled, as captured.
    const allocate = await screen.findByRole('button', { name: 'Allocate Elastic IP' });
    expect(allocate.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Select a subnet to display the allocation IDs.')).toBeDefined();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name - optional' }), {
      target: { value: 'nat-a' },
    });
    chooseSubnet(subnetId);
    fireEvent.click(screen.getByRole('button', { name: 'Allocate Elastic IP' }));
    expect(screen.getByText('203.0.113.1')).toBeDefined();
    fireEvent.click(createNatButton());

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/vpc/nat-gateways');
    });
    expect(current().natGateways).toEqual([
      {
        id: 'nat-00000001',
        name: 'nat-a',
        subnetId,
        connectivityType: 'public',
        privateIpAddress: '10.0.1.4',
        elasticIpAddress: '203.0.113.1',
      },
    ]);
    const table = page().findTable();
    const cells = (table?.findRows()[0]?.findAll('td') ?? []).map(
      (cell) => cell.getElement().textContent,
    );
    expect(cells.slice(1)).toEqual([
      'nat-a',
      'nat-00000001',
      'Public',
      'Available',
      '–',
      'Zonal',
      '–',
      '203.0.113.1',
      '10.0.1.4',
      '–',
      `${vpcId} | lab-vpc`,
      subnetId,
      '–',
      '–',
    ]);
    // The new NAT gateway opens selected, with its details below.
    expect(
      await screen.findByRole('heading', { level: 2, name: 'nat-00000001 / nat-a' }),
    ).toBeDefined();
  });

  it('NAT-01: Create NAT gateway needs a subnet and an Elastic IP', async () => {
    const { topology, subnetId } = lab();
    seed(topology);
    renderApp('/vpc/create-nat-gateway');
    await screen.findByRole('button', { name: 'Allocate Elastic IP' });
    fireEvent.click(createNatButton());
    expect(await screen.findByText('Choose a subnet.')).toBeDefined();

    chooseSubnet(subnetId);
    fireEvent.click(createNatButton());
    expect(await screen.findByText('Choose an Elastic IP allocation ID.')).toBeDefined();
    expect(current().natGateways).toBeUndefined();
  });

  it('NAT-07: Create NAT gateway is rejected in a VPC without an internet gateway', async () => {
    const vpc = ok(createVpc(EMPTY_TOPOLOGY, { cidrBlock: '10.0.0.0/16' }));
    const subnet = ok(
      createSubnet(vpc.topology, { vpcId: vpc.created.vpcId, cidrBlock: '10.0.1.0/24' }),
    );
    seed(subnet.topology);
    renderApp('/vpc/create-nat-gateway');
    await screen.findByRole('button', { name: 'Allocate Elastic IP' });
    chooseSubnet(subnet.created.subnetId);
    fireEvent.click(screen.getByRole('button', { name: 'Allocate Elastic IP' }));
    fireEvent.click(createNatButton());

    expect(await screen.findByText(en['change.failed'])).toBeDefined();
    expect(screen.getByText(/has no internet gateway attached/)).toBeDefined();
    expect(current().natGateways).toBeUndefined();
  });

  it('IGW-07: Detach from VPC is rejected while an instance has a public address', async () => {
    const base = lab();
    seed(
      ok(launchInstance(base.topology, { subnetId: base.subnetId, platform: 'linux' })).topology,
    );
    renderApp('/vpc/internet-gateways');
    await screen.findByRole('heading', { level: 1, name: /Internet gateways/ });
    page().findTable()?.findRowSelectionArea(1)?.click();
    const actions = page().findButtonDropdown();
    actions?.openDropdown();
    actions?.findItemById('detach')?.click();
    fireEvent.click(await screen.findByRole('button', { name: 'Detach internet gateway' }));

    expect(await screen.findByText(/can't be detached/)).toBeDefined();
    expect(current().internetGateways[0]?.attachedVpcId).toBe(base.vpcId);
  });

  it('ADR-10: Launch instance creates launch-wizard-1 and a web server with a public address', async () => {
    const { topology } = lab();
    seed(topology);
    const { router } = renderApp('/ec2/launch-instances');
    fireEvent.click(await screen.findByLabelText(en['sim.software.webServer']));
    fireEvent.click(screen.getByRole('button', { name: 'Launch instance' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/ec2/instances');
    });
    const after = current();
    const group = after.securityGroups.find((candidate) => candidate.name === 'launch-wizard-1');
    expect(group?.inboundRules).toMatchObject([{ protocol: 'tcp', fromPort: 22, toPort: 22 }]);
    expect(after.instances[0]?.primaryNetworkInterface).toMatchObject({
      privateIpAddress: '10.0.1.4',
      publicIp: { kind: 'auto-assigned', address: '203.0.113.1' },
      securityGroupIds: [group?.id],
    });
    expect(after.instances[0]?.runningServices).toMatchObject([{ port: 80, name: 'nginx' }]);
  });

  it('ADR-10: instance details show the auto-assigned address, the group rules and the interface', async () => {
    const base = lab();
    const launched = ok(
      launchInstance(base.topology, { subnetId: base.subnetId, platform: 'linux', name: 'web-1' }),
    );
    seed(launched.topology);
    renderApp('/ec2/instances');
    await screen.findByRole('heading', { level: 1, name: /Instances/ });
    page().findTable()?.findRowSelectionArea(1)?.click();

    const instanceId = launched.topology.instances[0]?.id ?? '';
    expect(await screen.findByText(`Instance summary for ${instanceId} (web-1)`)).toBeDefined();
    expect(screen.getByText('203.0.113.1 [Public IP]')).toBeDefined();
    expect(screen.getByText('RunInstances')).toBeDefined();

    page().findTabs()?.findTabLinkById('security')?.click();
    expect(await screen.findByText('Security details')).toBeDefined();
    expect(screen.getByText('Inbound rules')).toBeDefined();

    page().findTabs()?.findTabLinkById('networking')?.click();
    // Table headers render twice (the sticky copy), so count instead of expecting one.
    expect((await screen.findAllByText('Network Interfaces')).length).toBeGreaterThan(0);
    expect(
      screen.getByText('No Elastic IP addresses are associated with this instance'),
    ).toBeDefined();

    page().findTabs()?.findTabLinkById('tags')?.click();
    await screen.findByRole('button', { name: 'Manage tags' });
    const tagsTab = page().findTabs()?.findTabContent()?.getElement();
    expect(tagsTab && within(tagsTab).getAllByText('web-1').length).toBeGreaterThan(0);
  });

  it('RT-09: Subnets shows Internet access and the captured details, column by column', async () => {
    const { topology, subnetId } = lab();
    seed(topology);
    renderApp('/vpc/subnets');
    await screen.findByText('10.0.1.0/24');
    expect(screen.getAllByText('No (private)').length).toBeGreaterThan(0);
    page().findTable()?.findRowSelectionArea(1)?.click();

    await screen.findByText('Subnet ARN');
    const tab = page().findTabs()?.findTabContent()?.getElement();
    // One nested list per column; each starts with the column's first captured label.
    const groups = [...(tab?.querySelectorAll('dl dl') ?? [])].map(
      (group) => group.querySelector('dt')?.textContent,
    );
    expect(groups).toEqual(['Subnet ID', 'Subnet ARN', 'State', 'Block Public Access']);
    expect(screen.getByText(`arn:aws:ec2:us-east-1:000000000000:subnet/${subnetId}`)).toBeDefined();
    expect(screen.getByText('Hostname type')).toBeDefined();
  });

  it('RT-01: VPC details show the captured fields column by column', async () => {
    seed(lab().topology);
    renderApp('/vpc/your-vpcs');
    await screen.findByText('10.0.0.0/16');
    page().findTable()?.findRowSelectionArea(1)?.click();

    await screen.findByText('Network Address Usage metrics');
    const tab = page().findTabs()?.findTabContent()?.getElement();
    const groups = [...(tab?.querySelectorAll('dl dl') ?? [])].map(
      (group) => group.querySelector('dt')?.textContent,
    );
    expect(groups).toEqual(['VPC ID', 'State', 'Block Public Access', 'DNS hostnames']);
  });

  it('SHELL: Filter by VPC lists the topology VPCs and filters the subnets', async () => {
    const first = lab();
    const second = ok(createVpc(first.topology, { cidrBlock: '10.1.0.0/16', name: 'other' }));
    seed(
      ok(createSubnet(second.topology, { vpcId: second.created.vpcId, cidrBlock: '10.1.1.0/24' }))
        .topology,
    );
    renderApp('/vpc/subnets');
    await screen.findByText('10.1.1.0/24');
    const filter = page().findSideNavigation()?.findItemsControl()?.findSelect();
    filter?.openDropdown();
    filter?.selectOptionByValue(first.vpcId);

    await waitFor(() => {
      expect(screen.queryByText('10.1.1.0/24')).toBeNull();
    });
    expect(screen.getAllByText('10.0.1.0/24').length).toBeGreaterThan(0);
  });

  it('I18N: Topology health translates validate() issues of the active topology', async () => {
    const { topology, vpcId } = lab();
    const overlap = ok(createSubnet(topology, { vpcId, cidrBlock: '10.0.1.0/25' })).topology;
    seed(overlap);
    renderApp('/');
    const health = await screen.findByRole('heading', { level: 2, name: en['home.health.title'] });
    const widget = health.closest('[class*="board-item"]') ?? document.body;
    expect(within(widget as HTMLElement).getAllByText(/overlaps/).length).toBeGreaterThan(0);
  });
});
