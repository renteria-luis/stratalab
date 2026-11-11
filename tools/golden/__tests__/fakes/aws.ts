import type { GoldenScenario } from '@sim/engine/golden';
import type {
  AwsPorts,
  Clock,
  FixtureStore,
  InventorySnapshot,
  Output,
  PathRequest,
  Prompt,
  RawAnalysis,
  StackResource,
  Tag,
  TaggedResource,
} from '../../src/aws/ports';

/**
 * Hand-written fakes of the AWS ports (docs/specs/p9-golden.md section 0). They record every
 * call in `calls` and never touch the network. Real-looking IDs are generated
 * deterministically so tests can check that none of them reaches a fixture.
 */

const TYPE_PREFIX: Record<string, string> = {
  'AWS::EC2::VPC': 'vpc',
  'AWS::EC2::Subnet': 'subnet',
  'AWS::EC2::RouteTable': 'rtb',
  'AWS::EC2::InternetGateway': 'igw',
  'AWS::EC2::SecurityGroup': 'sg',
  'AWS::EC2::NetworkAcl': 'acl',
  'AWS::EC2::Instance': 'i',
};

/** A real-looking 17-hex-character ID for a scenario ID (`vpc-0a1b2c3d` → `vpc-0f0000000000a1b2c3d`-like). */
export function realId(scenarioId: string): string {
  const [prefix, hex] = scenarioId.split('-');
  return `${prefix ?? 'x'}-0f${(hex ?? '').padStart(15, 'e')}`;
}

/** A real-looking Amazon public address for a scenario public address. */
export function realPublicIp(scenarioIp: string): string {
  return `54.0.0.${scenarioIp.split('.').at(-1) ?? '1'}`;
}

export interface Deployment {
  readonly resources: StackResource[];
  readonly snapshot: InventorySnapshot;
}

/** What a successful deploy of `topology` looks like to the tool. */
export function deploymentOf(
  scenario: GoldenScenario,
  logicalIds: ReadonlyMap<string, string>,
  types: ReadonlyMap<string, string>,
  routeStates: Readonly<Record<string, string>> = {},
): Deployment {
  const topology = scenario.topology;
  const resources: StackResource[] = [];
  for (const [logicalId, topologyId] of logicalIds) {
    const type = types.get(logicalId) ?? '';
    if (TYPE_PREFIX[type] !== undefined)
      resources.push({ logicalId, physicalId: realId(topologyId), type });
  }
  const snapshot: InventorySnapshot = {
    vpcs: topology.vpcs.map((vpc) => ({
      vpcId: realId(vpc.id),
      cidrBlock: vpc.cidrBlock,
      mainRouteTableId: realId(vpc.mainRouteTableId),
      defaultNetworkAclId: realId(vpc.defaultNetworkAclId),
      defaultSecurityGroupId: realId(vpc.defaultSecurityGroupId),
    })),
    subnets: topology.subnets.map((subnet) => ({
      subnetId: realId(subnet.id),
      cidrBlock: subnet.cidrBlock,
    })),
    routes: topology.routeTables.flatMap((table) =>
      table.routes.map((route) => {
        // Golden scenarios have only internet gateway routes (GOLDEN_NAT_GATEWAY).
        const gatewayId =
          route.target.type === 'internet-gateway' ? route.target.internetGatewayId : '';
        const igw = topology.internetGateways.find((gateway) => gateway.id === gatewayId);
        const fallback = igw?.attachedVpcId === undefined ? 'blackhole' : 'active';
        return {
          routeTableId: realId(table.id),
          destinationCidrBlock: route.destinationCidrBlock,
          gatewayId: realId(gatewayId),
          state: routeStates[route.destinationCidrBlock] ?? fallback,
        };
      }),
    ),
    instances: topology.instances.map((instance) => {
      const nic = instance.primaryNetworkInterface;
      return {
        instanceId: realId(instance.id),
        networkInterfaceId: realId(nic.id),
        privateIpAddress: nic.privateIpAddress,
        ...(nic.publicIp === undefined
          ? {}
          : { publicIpAddress: realPublicIp(nic.publicIp.address) }),
      };
    }),
  };
  return { resources, snapshot };
}

export class FakeAws implements AwsPorts {
  readonly calls: string[] = [];
  account = '000000000000';
  regionName = 'us-east-1';
  stackExists = false;
  /** Paths and analyses still tagged when the tool looks. */
  taggedPaths: string[] = [];
  taggedAnalyses: string[] = [];
  taggedResources: TaggedResource[] = [];
  goldenStacks: string[] = [];
  deployment: Deployment = {
    resources: [],
    snapshot: { vpcs: [], subnets: [], routes: [], instances: [] },
  };
  /** The analysis result for a path request (real IDs). */
  answer: (request: PathRequest) => RawAnalysis = () => ({
    Status: 'succeeded',
    NetworkPathFound: true,
  });
  /** Call names that throw, for example `stacks.create`. */
  readonly failOn = new Set<string>();
  readonly templates: string[] = [];
  readonly requests: PathRequest[] = [];
  readonly tagsSeen: (readonly Tag[])[] = [];
  private nextPath = 1;
  private nextAnalysis = 1;
  private readonly paths = new Map<string, PathRequest>();

  private log(name: string, detail?: string) {
    this.calls.push(detail === undefined ? name : `${name} ${detail}`);
    if (this.failOn.has(name)) throw new Error(`fake failure in ${name}`);
  }

  readonly identity = {
    accountId: () => {
      this.log('identity.accountId');
      return Promise.resolve(this.account);
    },
    region: () => {
      this.log('identity.region');
      return Promise.resolve(this.regionName);
    },
  };

  readonly stacks = {
    exists: (stackName: string) => {
      this.log('stacks.exists', stackName);
      return Promise.resolve(this.stackExists);
    },
    create: (stackName: string, templateBody: string, tags: readonly Tag[]) => {
      this.templates.push(templateBody);
      this.tagsSeen.push(tags);
      this.log('stacks.create', stackName);
      this.stackExists = true;
      return Promise.resolve();
    },
    update: (stackName: string, templateBody: string) => {
      this.templates.push(templateBody);
      this.log('stacks.update', stackName);
      return Promise.resolve();
    },
    remove: (stackName: string) => {
      this.log('stacks.remove', stackName);
      this.stackExists = false;
      this.goldenStacks = this.goldenStacks.filter((name) => name !== stackName);
      return Promise.resolve();
    },
    resources: (stackName: string) => {
      this.log('stacks.resources', stackName);
      return Promise.resolve(this.deployment.resources);
    },
    listGolden: () => {
      this.log('stacks.listGolden');
      return Promise.resolve([...this.goldenStacks]);
    },
  };

  readonly inventory = {
    describe: (vpcIds: readonly string[]) => {
      this.log('inventory.describe', vpcIds.join(','));
      return Promise.resolve(this.deployment.snapshot);
    },
    listTagged: () => {
      this.log('inventory.listTagged');
      return Promise.resolve([...this.taggedResources]);
    },
    remove: (resource: TaggedResource) => {
      this.log('inventory.remove', `${resource.kind} ${resource.id}`);
      this.taggedResources = this.taggedResources.filter((item) => item.id !== resource.id);
      return Promise.resolve();
    },
  };

  readonly reachability = {
    createPath: (request: PathRequest, tags: readonly Tag[]) => {
      this.log('reachability.createPath');
      this.requests.push(request);
      this.tagsSeen.push(tags);
      const id = `nip-0${String(this.nextPath++).padStart(16, '0')}`;
      this.paths.set(id, request);
      this.taggedPaths.push(id);
      return Promise.resolve(id);
    },
    startAnalysis: (pathId: string, tags: readonly Tag[]) => {
      this.log('reachability.startAnalysis', pathId);
      this.tagsSeen.push(tags);
      const id = `nia-0${String(this.nextAnalysis++).padStart(16, '0')}`;
      this.paths.set(id, this.paths.get(pathId) ?? this.requests[0] ?? ({} as PathRequest));
      this.taggedAnalyses.push(id);
      return Promise.resolve(id);
    },
    waitForAnalysis: (analysisId: string) => {
      this.log('reachability.waitForAnalysis', analysisId);
      const request = this.paths.get(analysisId);
      if (request === undefined) throw new Error('unknown analysis');
      return Promise.resolve(this.answer(request));
    },
    deleteAnalysis: (analysisId: string) => {
      this.log('reachability.deleteAnalysis', analysisId);
      this.taggedAnalyses = this.taggedAnalyses.filter((id) => id !== analysisId);
      return Promise.resolve();
    },
    deletePath: (pathId: string) => {
      this.log('reachability.deletePath', pathId);
      this.taggedPaths = this.taggedPaths.filter((id) => id !== pathId);
      return Promise.resolve();
    },
    listTagged: () => {
      this.log('reachability.listTagged');
      return Promise.resolve({ paths: [...this.taggedPaths], analyses: [...this.taggedAnalyses] });
    },
  };
}

export class FakeFixtureStore implements FixtureStore {
  readonly written: { scenarioId: string; json: string }[] = [];
  readonly diagnostics: { name: string; json: string }[] = [];
  write(scenarioId: string, json: string) {
    this.written.push({ scenarioId, json });
    return Promise.resolve(`fixtures/${scenarioId}.json`);
  }
  writeDiagnostics(name: string, json: string) {
    this.diagnostics.push({ name, json });
    return Promise.resolve(`/tmp/${name}.json`);
  }
}

export class FakePrompt implements Prompt {
  readonly asked: string[] = [];
  readonly interactive: boolean;
  private readonly typed: string;
  constructor(interactive = true, typed = '') {
    this.interactive = interactive;
    this.typed = typed;
  }
  confirm(message: string, expected: string) {
    this.asked.push(message);
    return Promise.resolve(this.typed === expected);
  }
}

export class FakeOutput implements Output {
  readonly lines: string[] = [];
  line(text: string) {
    this.lines.push(text);
  }
  get text() {
    return this.lines.join('\n');
  }
}

export const fixedClock: Clock = { now: () => new Date('2026-11-05T12:00:00.000Z') };
