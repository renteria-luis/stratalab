import type { TopologyShape } from './topology';

/** Structural codes (docs/specs/r0-engine.md section 2). They are schema errors, not AWS rules. */
export type StructuralCode =
  'DUPLICATE_ID' | 'UNKNOWN_REFERENCE' | 'DUPLICATE_SERVICE_PORT' | 'AZ_NOT_IN_REGION';

export type ReferenceType =
  'vpc' | 'subnet' | 'route-table' | 'internet-gateway' | 'security-group' | 'network-acl';

export interface StructuralIssue {
  readonly code: StructuralCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
  readonly params: Readonly<Record<string, string | number>>;
}

type Path = readonly (string | number)[];

/**
 * Checks that every ID is unique and every reference resolves, so lookups after parsing
 * can't fail. Issues come in collection order, then array order, then field order.
 */
export function checkStructure(topology: TopologyShape): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  const ids = {
    vpc: new Set(topology.vpcs.map((vpc) => vpc.id)),
    subnet: new Set(topology.subnets.map((subnet) => subnet.id)),
    'route-table': new Set(topology.routeTables.map((table) => table.id)),
    'internet-gateway': new Set(topology.internetGateways.map((igw) => igw.id)),
    'security-group': new Set(topology.securityGroups.map((group) => group.id)),
    'network-acl': new Set(topology.networkAcls.map((acl) => acl.id)),
  } satisfies Record<ReferenceType, Set<string>>;

  const seenIds = new Set<string>();
  const unique = (id: string, path: Path) => {
    if (seenIds.has(id)) {
      issues.push({ code: 'DUPLICATE_ID', message: `Duplicate ID ${id}`, path, params: { id } });
    }
    seenIds.add(id);
  };
  const reference = (referenceType: ReferenceType, id: string | undefined, path: Path) => {
    if (id !== undefined && !ids[referenceType].has(id)) {
      issues.push({
        code: 'UNKNOWN_REFERENCE',
        message: `Unknown ${referenceType} ${id}`,
        path,
        params: { referenceType, id },
      });
    }
  };

  topology.vpcs.forEach((vpc, i) => {
    unique(vpc.id, ['vpcs', i, 'id']);
    reference('route-table', vpc.mainRouteTableId, ['vpcs', i, 'mainRouteTableId']);
    reference('network-acl', vpc.defaultNetworkAclId, ['vpcs', i, 'defaultNetworkAclId']);
    reference('security-group', vpc.defaultSecurityGroupId, ['vpcs', i, 'defaultSecurityGroupId']);
  });

  topology.subnets.forEach((subnet, i) => {
    unique(subnet.id, ['subnets', i, 'id']);
    reference('vpc', subnet.vpcId, ['subnets', i, 'vpcId']);
    reference('route-table', subnet.routeTableId, ['subnets', i, 'routeTableId']);
    reference('network-acl', subnet.networkAclId, ['subnets', i, 'networkAclId']);
    const zone = subnet.availabilityZone;
    if (!zone.startsWith(topology.region) || zone.length === topology.region.length) {
      issues.push({
        code: 'AZ_NOT_IN_REGION',
        message: `Availability Zone ${zone} is not in ${topology.region}`,
        path: ['subnets', i, 'availabilityZone'],
        params: { availabilityZone: zone, region: topology.region },
      });
    }
  });

  topology.routeTables.forEach((table, i) => {
    unique(table.id, ['routeTables', i, 'id']);
    reference('vpc', table.vpcId, ['routeTables', i, 'vpcId']);
    table.routes.forEach((route, j) => {
      reference('internet-gateway', route.target.internetGatewayId, [
        'routeTables',
        i,
        'routes',
        j,
        'target',
        'internetGatewayId',
      ]);
    });
  });

  topology.internetGateways.forEach((igw, i) => {
    unique(igw.id, ['internetGateways', i, 'id']);
    reference('vpc', igw.attachedVpcId, ['internetGateways', i, 'attachedVpcId']);
  });

  topology.securityGroups.forEach((group, i) => {
    unique(group.id, ['securityGroups', i, 'id']);
    reference('vpc', group.vpcId, ['securityGroups', i, 'vpcId']);
    for (const direction of ['inboundRules', 'outboundRules'] as const) {
      group[direction].forEach((rule, j) => {
        unique(rule.id, ['securityGroups', i, direction, j, 'id']);
        if (rule.peer.type === 'security-group') {
          reference('security-group', rule.peer.securityGroupId, [
            'securityGroups',
            i,
            direction,
            j,
            'peer',
            'securityGroupId',
          ]);
        }
      });
    }
  });

  topology.networkAcls.forEach((acl, i) => {
    unique(acl.id, ['networkAcls', i, 'id']);
    reference('vpc', acl.vpcId, ['networkAcls', i, 'vpcId']);
  });

  topology.instances.forEach((instance, i) => {
    const eni = instance.primaryNetworkInterface;
    const eniPath = ['instances', i, 'primaryNetworkInterface'] as const;
    unique(instance.id, ['instances', i, 'id']);
    unique(eni.id, [...eniPath, 'id']);
    reference('subnet', eni.subnetId, [...eniPath, 'subnetId']);
    eni.securityGroupIds.forEach((groupId, k) => {
      reference('security-group', groupId, [...eniPath, 'securityGroupIds', k]);
    });
    const ports = new Set<number>();
    instance.runningServices.forEach((service, j) => {
      if (ports.has(service.port)) {
        issues.push({
          code: 'DUPLICATE_SERVICE_PORT',
          message: `Two services listen on port ${String(service.port)}`,
          path: ['instances', i, 'runningServices', j, 'port'],
          params: { port: service.port },
        });
      }
      ports.add(service.port);
    });
  });

  return issues;
}
