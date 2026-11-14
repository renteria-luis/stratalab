import type { GoldenScenario } from '@sim/engine/golden';
import type { InventorySnapshot, StackResource } from './aws/ports';

/**
 * Real AWS values → scenario values (docs/specs/p9-golden.md section 5.1), built after the
 * last stage from the stack's resources and read-only describes. Before any analysis it also
 * checks that what was deployed is what the topology says.
 */

export interface IdMap {
  /** Real resource ID → scenario ID. */
  readonly ids: ReadonlyMap<string, string>;
  /** Real public IPv4 address → scenario public address. */
  readonly addresses: ReadonlyMap<string, string>;
}

export type IdMapResult =
  { readonly ok: true; readonly map: IdMap } | { readonly ok: false; readonly problems: string[] };

const PRIMARY_TYPES = new Set([
  'AWS::EC2::VPC',
  'AWS::EC2::Subnet',
  'AWS::EC2::RouteTable',
  'AWS::EC2::InternetGateway',
  'AWS::EC2::SecurityGroup',
  'AWS::EC2::NetworkAcl',
  'AWS::EC2::Instance',
  'AWS::EC2::NatGateway',
]);

export function buildIdMap(
  scenario: GoldenScenario,
  logicalIds: ReadonlyMap<string, string>,
  resources: readonly StackResource[],
  snapshot: InventorySnapshot,
): IdMapResult {
  const { topology } = scenario;
  const ids = new Map<string, string>();
  const addresses = new Map<string, string>();
  const problems: string[] = [];
  const realOf = new Map<string, string>();

  for (const resource of resources) {
    if (!PRIMARY_TYPES.has(resource.type)) continue;
    const topologyId = logicalIds.get(resource.logicalId);
    if (topologyId === undefined) {
      problems.push(`stack resource ${resource.logicalId} has no topology ID`);
      continue;
    }
    ids.set(resource.physicalId, topologyId);
    realOf.set(topologyId, resource.physicalId);
  }

  for (const vpc of topology.vpcs) {
    const facts = snapshot.vpcs.find((candidate) => candidate.vpcId === realOf.get(vpc.id));
    if (facts === undefined) {
      problems.push(`${vpc.id}: not found after deploy`);
      continue;
    }
    if (facts.cidrBlock !== vpc.cidrBlock) {
      problems.push(`${vpc.id}: deployed CIDR ${facts.cidrBlock}, topology ${vpc.cidrBlock}`);
    }
    ids.set(facts.mainRouteTableId, vpc.mainRouteTableId);
    ids.set(facts.defaultNetworkAclId, vpc.defaultNetworkAclId);
    ids.set(facts.defaultSecurityGroupId, vpc.defaultSecurityGroupId);
  }

  for (const subnet of topology.subnets) {
    const facts = snapshot.subnets.find(
      (candidate) => candidate.subnetId === realOf.get(subnet.id),
    );
    if (facts === undefined) problems.push(`${subnet.id}: not found after deploy`);
    else if (facts.cidrBlock !== subnet.cidrBlock) {
      problems.push(`${subnet.id}: deployed CIDR ${facts.cidrBlock}, topology ${subnet.cidrBlock}`);
    }
  }

  for (const instance of topology.instances) {
    const nic = instance.primaryNetworkInterface;
    const facts = snapshot.instances.find(
      (candidate) => candidate.instanceId === realOf.get(instance.id),
    );
    if (facts === undefined) {
      problems.push(`${instance.id}: not found after deploy`);
      continue;
    }
    ids.set(facts.networkInterfaceId, nic.id);
    if (facts.privateIpAddress !== nic.privateIpAddress) {
      problems.push(
        `${instance.id}: deployed private address ${facts.privateIpAddress}, topology ${nic.privateIpAddress}`,
      );
    }
    if ((facts.publicIpAddress === undefined) !== (nic.publicIp === undefined)) {
      problems.push(
        `${instance.id}: public IPv4 address ${facts.publicIpAddress === undefined ? 'missing' : 'unexpected'} after deploy`,
      );
    } else if (facts.publicIpAddress !== undefined && nic.publicIp !== undefined) {
      addresses.set(facts.publicIpAddress, nic.publicIp.address);
    }
  }

  // Section 15.3: the NAT gateway's interface and Elastic IP allocation have no topology ID of
  // their own, so they map to the NAT gateway (NAT-04, NAT-07).
  for (const nat of topology.natGateways ?? []) {
    const facts = snapshot.natGateways.find(
      (candidate) => candidate.natGatewayId === realOf.get(nat.id),
    );
    if (facts === undefined) {
      problems.push(`${nat.id}: not found after deploy`);
      continue;
    }
    if (facts.state !== 'available')
      problems.push(`${nat.id}: deployed state ${facts.state}, expected available`);
    if (facts.subnetId !== realOf.get(nat.subnetId))
      problems.push(`${nat.id}: deployed in another subnet than ${nat.subnetId}`);
    if (facts.privateIpAddress !== nat.privateIpAddress) {
      problems.push(
        `${nat.id}: deployed private address ${facts.privateIpAddress}, topology ${nat.privateIpAddress}`,
      );
    }
    if (facts.publicIpAddress === undefined) problems.push(`${nat.id}: no Elastic IP after deploy`);
    else addresses.set(facts.publicIpAddress, nat.elasticIpAddress);
    ids.set(facts.networkInterfaceId, nat.id);
    if (facts.allocationId !== undefined) ids.set(facts.allocationId, nat.id);
  }

  return problems.length === 0 ? { ok: true, map: { ids, addresses } } : { ok: false, problems };
}

/**
 * Each route's deployed state must be `active`, or `blackhole` when its gateway is detached
 * (RT-08). A route to a NAT gateway is always `active` (RT-05, section 15.3).
 */
export function routeStateProblems(
  scenario: GoldenScenario,
  snapshot: InventorySnapshot,
  map: IdMap,
): string[] {
  const { topology } = scenario;
  const problems: string[] = [];
  const scenarioIdOf = (realId: string) => map.ids.get(realId);
  for (const table of topology.routeTables) {
    for (const route of table.routes) {
      const { target } = route;
      const gateway =
        target.type === 'internet-gateway'
          ? topology.internetGateways.find((candidate) => candidate.id === target.internetGatewayId)
          : undefined;
      const expected =
        target.type === 'nat-gateway' || gateway?.attachedVpcId === table.vpcId
          ? 'active'
          : 'blackhole';
      const deployed = snapshot.routes.find(
        (candidate) =>
          scenarioIdOf(candidate.routeTableId) === table.id &&
          candidate.destinationCidrBlock === route.destinationCidrBlock,
      );
      if (deployed === undefined) {
        problems.push(`${table.id} ${route.destinationCidrBlock}: route not found after deploy`);
      } else if (deployed.state !== expected) {
        problems.push(
          `${table.id} ${route.destinationCidrBlock}: deployed state ${deployed.state}, expected ${expected}`,
        );
      }
    }
  }
  return problems;
}
