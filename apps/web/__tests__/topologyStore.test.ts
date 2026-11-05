import { createInternetGateway, createSubnet, createVpc, type Topology } from '@sim/engine';
import { describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { createMemoryKeyValue } from '../src/state/keyValue';
import {
  SANDBOX_WORKSPACE,
  TOPOLOGY_STORE_KEY,
  TOPOLOGY_STORE_VERSION,
  activeTopology,
  createTopologyStore,
  type TopologyState,
} from '../src/state/topologyStore';
import { EMPTY_TOPOLOGY } from '../src/topology/emptyTopology';

async function hydrated(store: StoreApi<TopologyState>): Promise<TopologyState> {
  await vi.waitFor(() => {
    expect(store.getState().hydrated).toBe(true);
  });
  return store.getState();
}

function vpcTopology(): Topology {
  const result = createVpc(EMPTY_TOPOLOGY, { cidrBlock: '10.0.0.0/16' });
  if (!result.ok) throw new Error(result.error.code);
  return result.topology;
}

const backups = (kv: ReturnType<typeof createMemoryKeyValue>) =>
  [...kv.entries.keys()].filter((key) => key.startsWith(`${TOPOLOGY_STORE_KEY}-backup-`));

describe('topology store persistence', () => {
  it('PERSIST: saves and reloads the workspaces and the active one', async () => {
    const kv = createMemoryKeyValue();
    const first = await hydrated(createTopologyStore(kv));
    first.apply((t) => createVpc(t, { cidrBlock: '10.0.0.0/16', name: 'lab-vpc' }));
    await vi.waitFor(() => {
      expect(kv.entries.get(TOPOLOGY_STORE_KEY)).toMatchObject({ version: TOPOLOGY_STORE_VERSION });
    });
    const second = await hydrated(createTopologyStore(kv));
    expect(second.storageProblem).toBeNull();
    expect(activeTopology(second).vpcs.map((vpc) => vpc.name)).toEqual(['lab-vpc']);
  });

  it.each([
    [
      'a topology the schema rejects',
      { activeWorkspaceId: 'sandbox', workspaces: { sandbox: { schemaVersion: 2 } } },
    ],
    [
      'an active workspace that does not exist',
      { activeWorkspaceId: 'lab-01', workspaces: { sandbox: EMPTY_TOPOLOGY } },
    ],
    [
      'an unknown key',
      { activeWorkspaceId: 'sandbox', workspaces: { sandbox: EMPTY_TOPOLOGY }, extra: 1 },
    ],
  ])('PERSIST: %s is backed up and the sandbox starts empty', async (_name, state) => {
    const kv = createMemoryKeyValue({ [TOPOLOGY_STORE_KEY]: { state, version: 1 } });
    const loaded = await hydrated(createTopologyStore(kv));
    expect(loaded.storageProblem).toBe('backed-up');
    expect(loaded.activeWorkspaceId).toBe(SANDBOX_WORKSPACE);
    expect(activeTopology(loaded)).toEqual(EMPTY_TOPOLOGY);
    expect(backups(kv)).toHaveLength(1);
  });

  it('PERSIST: an unknown version is backed up', async () => {
    const kv = createMemoryKeyValue({
      [TOPOLOGY_STORE_KEY]: {
        state: { activeWorkspaceId: 'sandbox', workspaces: { sandbox: EMPTY_TOPOLOGY } },
        version: 99,
      },
    });
    expect((await hydrated(createTopologyStore(kv))).storageProblem).toBe('backed-up');
  });
});

describe('topology store changes', () => {
  it('HELPERS: a change that adds validate() errors is rejected and not committed', async () => {
    const store = createTopologyStore(createMemoryKeyValue());
    await hydrated(store);
    store.getState().replaceActiveTopology(vpcTopology());
    const vpcId = activeTopology(store.getState()).vpcs[0]?.id ?? '';
    expect(
      store.getState().apply((t) => createSubnet(t, { vpcId, cidrBlock: '10.0.1.0/24' })).ok,
    ).toBe(true);

    const overlap = store
      .getState()
      .apply((t) => createSubnet(t, { vpcId, cidrBlock: '10.0.1.0/25' }));
    expect(overlap.ok).toBe(false);
    expect('issues' in overlap ? overlap.issues.map((issue) => issue.code) : []).toContain(
      'CIDR_OVERLAP',
    );
    expect(activeTopology(store.getState()).subnets).toHaveLength(1);
  });

  it('HELPERS: a helper error is returned and nothing changes', async () => {
    const store = createTopologyStore(createMemoryKeyValue());
    await hydrated(store);
    const before = activeTopology(store.getState());
    const outcome = store
      .getState()
      .apply((t) => createSubnet(t, { vpcId: 'vpc-0000ffff', cidrBlock: '10.0.1.0/24' }));
    expect(outcome).toMatchObject({ ok: false, error: { code: 'UNKNOWN_REFERENCE' } });
    expect(activeTopology(store.getState())).toBe(before);
  });

  it('HELPERS: opening a lab workspace keeps the sandbox', async () => {
    const store = createTopologyStore(createMemoryKeyValue());
    await hydrated(store);
    store.getState().apply((t) => createInternetGateway(t, {}));
    store.getState().openWorkspace('lab-01', vpcTopology());
    expect(activeTopology(store.getState()).vpcs).toHaveLength(1);
    store.getState().openWorkspace(SANDBOX_WORKSPACE, EMPTY_TOPOLOGY);
    expect(activeTopology(store.getState()).internetGateways).toHaveLength(1);
  });
});
