import type { Topology } from '../schema';
import type { Issue } from './issue';

/** Default quotas (SG-07, NACL-09). Adjusted quotas are Unsupported. */
const RULES_PER_SECURITY_GROUP = 60;
const SECURITY_GROUPS_PER_INTERFACE = 5;
const RULES_PER_NETWORK_ACL = 20;

/**
 * `QUOTA_EXCEEDED` warnings for the default VPC quotas. R0 is IPv4 only, so every rule counts
 * against the IPv4 quota. Network ACLs count numbered entries; the `*` entry is implicit.
 *
 * Rules: SG-07, NACL-09 · https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html
 */
export function checkQuotas(topology: Topology): Issue[] {
  const issues: Issue[] = [];

  topology.securityGroups.forEach((group, i) => {
    for (const [key, direction] of [
      ['inboundRules', 'inbound'],
      ['outboundRules', 'outbound'],
    ] as const) {
      const count = group[key].length;
      if (count <= RULES_PER_SECURITY_GROUP) continue;
      issues.push({
        code: 'QUOTA_EXCEEDED',
        severity: 'warning',
        ruleIds: ['SG-07'],
        fidelity: 'Exact',
        resource: { type: 'security-group', id: group.id },
        path: ['securityGroups', i, key],
        params: {
          quota: 'rules-per-security-group',
          direction,
          limit: RULES_PER_SECURITY_GROUP,
          count,
        },
      });
    }
  });

  topology.networkAcls.forEach((acl, i) => {
    for (const [key, direction] of [
      ['inboundEntries', 'inbound'],
      ['outboundEntries', 'outbound'],
    ] as const) {
      const count = acl[key].length;
      if (count <= RULES_PER_NETWORK_ACL) continue;
      issues.push({
        code: 'QUOTA_EXCEEDED',
        severity: 'warning',
        ruleIds: ['NACL-09'],
        fidelity: 'Exact',
        resource: { type: 'network-acl', id: acl.id },
        path: ['networkAcls', i, key],
        params: { quota: 'rules-per-network-acl', direction, limit: RULES_PER_NETWORK_ACL, count },
      });
    }
  });

  topology.instances.forEach((instance, i) => {
    const eni = instance.primaryNetworkInterface;
    const count = eni.securityGroupIds.length;
    if (count <= SECURITY_GROUPS_PER_INTERFACE) return;
    issues.push({
      code: 'QUOTA_EXCEEDED',
      severity: 'warning',
      ruleIds: ['SG-07'],
      fidelity: 'Exact',
      resource: { type: 'network-interface', id: eni.id },
      path: ['instances', i, 'primaryNetworkInterface', 'securityGroupIds'],
      params: {
        quota: 'security-groups-per-network-interface',
        limit: SECURITY_GROUPS_PER_INTERFACE,
        count,
      },
    });
  });

  return issues;
}
