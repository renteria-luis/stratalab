import { goldenScenarioSchema, type GoldenScenario, type GoldenScenarioInput } from '../scenario';
import { lab1Topology } from './lab1';
import {
  CLIENT_IP,
  CLIENT_PORT,
  clone,
  fromInternet,
  toInternet,
  type TopologyInput,
} from './shared';

/**
 * Golden scenarios S1 to S5 (docs/specs/p9-golden.md section 2.4). Expected results are the
 * engine's results on 2026-11-05; Reachability Analyzer fixtures are the oracle.
 */

type ExpectedInput = GoldenScenarioInput['queries'][number]['expected'];

/** The web group has no inbound rule for the port (SG-02). */
const sgDrop = (): ExpectedInput => ({
  verdict: 'ROUTED_THEN_DROPPED',
  direction: 'forward',
  hopIndex: 2,
  reasonCodes: ['ENI_SG_RULES_MISMATCH'],
});

const s1: GoldenScenarioInput = {
  id: 's1-f1-internet-to-web',
  title:
    'F1: internet → web server on TCP 80, split into gateway → instance and instance → gateway',
  topology: lab1Topology(true),
  queries: [
    {
      id: 'igw-to-web-80',
      label: `${CLIENT_IP}:${String(CLIENT_PORT)} → web-1 public :80`,
      ruleIds: ['TRC-06', 'IGW-02', 'IGW-04'],
      leg: 'request',
      query: fromInternet('i-0000000a', 80),
      expected: { verdict: 'REACHED' },
    },
    {
      id: 'web-80-to-igw',
      label: `Reply leg: web-1 :80 → ${CLIENT_IP}:${String(CLIENT_PORT)}`,
      ruleIds: ['IGW-04', 'IGW-01', 'EPH-02'],
      leg: 'reply',
      query: toInternet('i-0000000a', CLIENT_IP, CLIENT_PORT, {
        clientType: 'custom',
        sourcePort: 80,
      }),
      expected: { verdict: 'REACHED' },
    },
    {
      id: 'igw-to-web-22',
      label: `Guard: ${CLIENT_IP}:${String(CLIENT_PORT)} → web-1 public :22 stays blocked`,
      ruleIds: ['SG-02'],
      leg: 'request',
      query: fromInternet('i-0000000a', 22),
      expected: sgDrop(),
    },
  ],
};

const s2: GoldenScenarioInput = {
  id: 's2-f2-web-to-internet',
  title:
    'F2: web server → internet on TCP 443, split into instance → gateway and gateway → instance',
  topology: lab1Topology(true),
  queries: [
    {
      id: 'web-to-igw-443',
      label: `web-1:${String(CLIENT_PORT)} → ${CLIENT_IP}:443`,
      ruleIds: ['IGW-01', 'EPH-01', 'SG-01'],
      leg: 'request',
      query: toInternet('i-0000000a', CLIENT_IP, 443),
      expected: { verdict: 'REACHED' },
    },
    {
      id: 'igw-443-to-web',
      label: `Reply leg as a new connection: ${CLIENT_IP}:443 → web-1 public :${String(CLIENT_PORT)}`,
      ruleIds: ['SG-01', 'SG-02'],
      leg: 'reply',
      query: fromInternet('i-0000000a', CLIENT_PORT, { clientType: 'custom', sourcePort: 443 }),
      expected: sgDrop(),
    },
  ],
};

function s3Topology(): TopologyInput {
  const topology = lab1Topology(true);
  topology.subnets.push({
    id: 'subnet-0000000b',
    name: 'no-route-b',
    vpcId: 'vpc-0a1b2c3d',
    cidrBlock: '10.0.2.0/24',
    availabilityZone: 'us-east-1a',
    mapPublicIpOnLaunch: true,
  });
  const [webA] = topology.instances;
  if (webA === undefined) throw new Error('lab 1 has web-1');
  webA.name = 'web-a';
  webA.runningServices = webA.runningServices.filter((service) => service.port === 80);
  const webB = clone(webA);
  webB.id = 'i-0000000b';
  webB.name = 'web-b';
  webB.primaryNetworkInterface = {
    ...webB.primaryNetworkInterface,
    id: 'eni-0000000b',
    subnetId: 'subnet-0000000b',
    privateIpAddress: '10.0.2.10',
    publicIp: { kind: 'auto-assigned', address: '203.0.113.26' },
  };
  topology.instances.push(webB);
  return topology;
}

const s3: GoldenScenarioInput = {
  id: 's3-q1-return-route',
  title:
    'Q1, IGW-04: gateway → instance with and without 0.0.0.0/0 → igw in the subnet route table',
  topology: s3Topology(),
  queries: [
    {
      id: 'igw-to-web-a-80',
      label: `${CLIENT_IP}:${String(CLIENT_PORT)} → web-a public :80 (public-rt)`,
      ruleIds: ['RT-02', 'IGW-04'],
      leg: 'request',
      query: fromInternet('i-0000000a', 80),
      expected: { verdict: 'REACHED' },
    },
    {
      id: 'igw-to-web-b-80',
      label: `${CLIENT_IP}:${String(CLIENT_PORT)} → web-b public :80 (main table, local route only)`,
      ruleIds: ['IGW-04', 'RT-02'],
      leg: 'request',
      query: fromInternet('i-0000000b', 80),
      expected: {
        verdict: 'BROKE_AT_HOP',
        direction: 'return',
        hopIndex: 6,
        reasonCodes: ['NO_ROUTE_TO_DESTINATION'],
      },
    },
  ],
};

function s4Topology(): TopologyInput {
  const topology = lab1Topology(true);
  topology.internetGateways.push({ id: 'igw-0000000b', name: 'spare-igw' });
  const publicRt = topology.routeTables.find((table) => table.id === 'rtb-00000002');
  if (publicRt === undefined) throw new Error('lab 1 has public-rt');
  publicRt.routes.push({
    destinationCidrBlock: '198.51.100.0/24',
    target: { type: 'internet-gateway', internetGatewayId: 'igw-0000000b' },
  });
  return topology;
}

const s4: GoldenScenarioInput = {
  id: 's4-q8-blackhole',
  title: 'Q8, RT-08: blackhole more-specific route vs an active default route',
  topology: s4Topology(),
  queries: [
    {
      id: 'web-to-198-51-100-10-443',
      label: `web-1:${String(CLIENT_PORT)} → 198.51.100.10:443 (198.51.100.0/24 → detached spare-igw)`,
      ruleIds: ['RT-08', 'RT-04'],
      leg: 'request',
      query: toInternet('i-0000000a', '198.51.100.10', 443),
      expected: {
        verdict: 'BROKE_AT_HOP',
        direction: 'forward',
        hopIndex: 2,
        reasonCodes: ['MORE_SPECIFIC_ROUTE'],
      },
    },
    {
      id: 'web-to-192-0-2-10-443',
      label: `Control: web-1:${String(CLIENT_PORT)} → 192.0.2.10:443 (default route)`,
      ruleIds: ['RT-04'],
      leg: 'request',
      query: toInternet('i-0000000a', '192.0.2.10', 443),
      expected: { verdict: 'REACHED' },
    },
  ],
};

const s5: GoldenScenarioInput = {
  id: 's5-lab1-initial',
  title: 'Lab 1 initial topology: security group allows only 443, subnet on the main route table',
  topology: lab1Topology(false),
  queries: [
    {
      id: 'igw-to-web-80',
      label: `${CLIENT_IP}:${String(CLIENT_PORT)} → web-1 public :80 (two stacked faults)`,
      ruleIds: ['SG-02'],
      leg: 'request',
      query: fromInternet('i-0000000a', 80),
      expected: sgDrop(),
    },
    {
      id: 'igw-to-web-22',
      label: `${CLIENT_IP}:${String(CLIENT_PORT)} → web-1 public :22`,
      ruleIds: ['SG-02'],
      leg: 'request',
      query: fromInternet('i-0000000a', 22),
      expected: sgDrop(),
    },
    {
      id: 'web-80-to-igw',
      label: `Reply leg: web-1 :80 → ${CLIENT_IP}:${String(CLIENT_PORT)} (no route to the gateway)`,
      ruleIds: ['RT-01', 'IGW-04'],
      leg: 'reply',
      query: toInternet('i-0000000a', CLIENT_IP, CLIENT_PORT, {
        clientType: 'custom',
        sourcePort: 80,
      }),
      expected: {
        verdict: 'BROKE_AT_HOP',
        direction: 'forward',
        hopIndex: 2,
        reasonCodes: ['NO_ROUTE_TO_DESTINATION'],
      },
    },
  ],
};

/** Scenario inputs, as written. */
export const GOLDEN_SCENARIO_INPUTS: readonly GoldenScenarioInput[] = [s1, s2, s3, s4, s5];

/** Parsed scenarios (canonical CIDRs). Parsing fails loudly if a scenario is malformed. */
export const GOLDEN_SCENARIOS: readonly GoldenScenario[] = GOLDEN_SCENARIO_INPUTS.map((input) =>
  goldenScenarioSchema.parse(input),
);

export function findScenario(id: string): GoldenScenario | undefined {
  return GOLDEN_SCENARIOS.find((scenario) => scenario.id === id);
}
