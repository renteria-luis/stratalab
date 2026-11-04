import { mustGet } from '../internal/lookup';
import type { Model } from '../model';
import type { RuleId } from '../rules';
import type { Issue, ResourceRef } from './issue';

/**
 * `VPC_MISMATCH`: a resource points to a route table, network ACL or security group that
 * belongs to another VPC.
 *
 * Rules:
 * - RT-01 route table associations: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html
 * - NACL-01 network ACL associations: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html
 * - SG-04 security group references (cross-VPC references need peering, R2):
 *   https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
 * - SG-06 security groups are assigned within their VPC: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html
 */
export function checkReferences(model: Model): Issue[] {
  const { topology } = model;
  const issues: Issue[] = [];

  const check = (
    resource: ResourceRef,
    path: Issue['path'],
    related: ResourceRef & { vpcId: string },
    ruleId: RuleId,
    vpcId: string,
  ) => {
    if (related.vpcId === vpcId) return;
    issues.push({
      code: 'VPC_MISMATCH',
      severity: 'error',
      ruleIds: [ruleId],
      fidelity: 'Exact',
      resource,
      path,
      related: [{ type: related.type, id: related.id }],
      params: { vpcId, otherVpcId: related.vpcId },
    });
  };
  const ref = <T extends ResourceRef['type']>(type: T, item: { id: string; vpcId: string }) => ({
    type,
    id: item.id,
    vpcId: item.vpcId,
  });
  const routeTable = (id: string) => ref('route-table', mustGet(model.routeTables, id));
  const networkAcl = (id: string) => ref('network-acl', mustGet(model.networkAcls, id));
  const securityGroup = (id: string) => ref('security-group', mustGet(model.securityGroups, id));

  topology.vpcs.forEach((vpc, i) => {
    const resource = { type: 'vpc', id: vpc.id } as const;
    const { mainRouteTableId, defaultNetworkAclId, defaultSecurityGroupId } = vpc;
    check(resource, ['vpcs', i, 'mainRouteTableId'], routeTable(mainRouteTableId), 'RT-01', vpc.id);
    check(
      resource,
      ['vpcs', i, 'defaultNetworkAclId'],
      networkAcl(defaultNetworkAclId),
      'NACL-01',
      vpc.id,
    );
    check(
      resource,
      ['vpcs', i, 'defaultSecurityGroupId'],
      securityGroup(defaultSecurityGroupId),
      'SG-06',
      vpc.id,
    );
  });

  topology.subnets.forEach((subnet, i) => {
    const resource = { type: 'subnet', id: subnet.id } as const;
    if (subnet.routeTableId !== undefined) {
      const related = routeTable(subnet.routeTableId);
      check(resource, ['subnets', i, 'routeTableId'], related, 'RT-01', subnet.vpcId);
    }
    if (subnet.networkAclId !== undefined) {
      const related = networkAcl(subnet.networkAclId);
      check(resource, ['subnets', i, 'networkAclId'], related, 'NACL-01', subnet.vpcId);
    }
  });

  topology.securityGroups.forEach((group, i) => {
    const resource = { type: 'security-group', id: group.id } as const;
    for (const direction of ['inboundRules', 'outboundRules'] as const) {
      group[direction].forEach((rule, j) => {
        if (rule.peer.type !== 'security-group') return;
        const path = ['securityGroups', i, direction, j, 'peer', 'securityGroupId'] as const;
        check(resource, path, securityGroup(rule.peer.securityGroupId), 'SG-04', group.vpcId);
      });
    }
  });

  topology.instances.forEach((instance, i) => {
    const eni = instance.primaryNetworkInterface;
    const resource = { type: 'network-interface', id: eni.id } as const;
    const { vpcId } = mustGet(model.subnets, eni.subnetId);
    eni.securityGroupIds.forEach((groupId, k) => {
      const path = ['instances', i, 'primaryNetworkInterface', 'securityGroupIds', k] as const;
      check(resource, path, securityGroup(groupId), 'SG-06', vpcId);
    });
  });

  return issues;
}
