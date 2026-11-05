import createWrapper from '@cloudscape-design/components/test-utils/dom';
import {
  attachInternetGateway,
  createInternetGateway,
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
    fireEvent.click(await screen.findByRole('button', { name: 'Add route' }));
    const row = page().findAttributeEditor()?.findRow(1);
    const destination = row?.findField(1)?.findControl()?.findInput();
    destination?.setInputValue('0.0.0.0/0');
    const target = row?.findField(2)?.findControl()?.findSelect();
    target?.openDropdown();
    target?.selectOptionByValue(internetGatewayId);
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
