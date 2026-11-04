import type { Topology } from '../schema';
import type { Issue } from './issue';

/** SG-06: names and descriptions use only these characters (CreateSecurityGroup). */
const SG_TEXT_CHARACTERS = /^[a-zA-Z0-9 ._\-:/()#,@[\]+=&;{}!$*]*$/;
const SG_TEXT_MAX_LENGTH = 255;

type SgTextField = 'name' | 'description';
type SgTextProblem = 'empty' | 'too-long' | 'invalid-characters' | 'sg-prefix';

/**
 * Security group and network ACL checks of `validate()`.
 *
 * Rules:
 * - SG-06 names and descriptions: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html
 *   and https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateSecurityGroup.html
 * - NACL-08 unique rule numbers: https://docs.aws.amazon.com/ec2/latest/devguide/errors-overview.html
 */
export function checkFiltering(topology: Topology): Issue[] {
  return [...checkSecurityGroups(topology), ...checkNetworkAcls(topology)];
}

/**
 * The name is stored without trailing spaces, as AWS stores it; the description as written.
 * The checks run in this order and the first problem is reported.
 */
function sgTextProblem(field: SgTextField, value: string): SgTextProblem | null {
  const stored = field === 'name' ? value.trimEnd() : value;
  if (stored.length === 0) return 'empty';
  if (stored.length > SG_TEXT_MAX_LENGTH) return 'too-long';
  if (!SG_TEXT_CHARACTERS.test(stored)) return 'invalid-characters';
  if (field === 'name' && stored.startsWith('sg-')) return 'sg-prefix';
  return null;
}

function checkSecurityGroups(topology: Topology): Issue[] {
  const issues: Issue[] = [];
  /** First group per "vpcId name", with the name trimmed and lowercased (not case-sensitive). */
  const firstByName = new Map<string, string>();

  topology.securityGroups.forEach((group, i) => {
    const resource = { type: 'security-group', id: group.id } as const;
    for (const field of ['name', 'description'] as const) {
      const reason = sgTextProblem(field, group[field]);
      if (reason === null) continue;
      issues.push({
        code: 'SG_NAME_INVALID',
        severity: 'error',
        ruleIds: ['SG-06'],
        fidelity: 'Exact',
        resource,
        path: ['securityGroups', i, field],
        params: { field, reason, maxLength: SG_TEXT_MAX_LENGTH },
      });
    }

    const name = group.name.trimEnd();
    if (name.length === 0) return;
    const key = `${group.vpcId} ${name.toLowerCase()}`;
    const first = firstByName.get(key);
    if (first === undefined) {
      firstByName.set(key, group.id);
      return;
    }
    issues.push({
      code: 'SG_NAME_DUPLICATE',
      severity: 'error',
      ruleIds: ['SG-06'],
      fidelity: 'Exact',
      resource,
      path: ['securityGroups', i, 'name'],
      related: [{ type: 'security-group', id: first }],
      params: { name: group.name, vpcId: group.vpcId },
    });
  });
  return issues;
}

function checkNetworkAcls(topology: Topology): Issue[] {
  const issues: Issue[] = [];
  topology.networkAcls.forEach((acl, i) => {
    for (const [key, direction] of [
      ['inboundEntries', 'inbound'],
      ['outboundEntries', 'outbound'],
    ] as const) {
      const seen = new Set<number>();
      acl[key].forEach((entry, j) => {
        if (!seen.has(entry.ruleNumber)) {
          seen.add(entry.ruleNumber);
          return;
        }
        issues.push({
          code: 'NACL_RULE_NUMBER_DUPLICATE',
          severity: 'error',
          ruleIds: ['NACL-08'],
          fidelity: 'Exact',
          resource: { type: 'network-acl', id: acl.id },
          path: ['networkAcls', i, key, j, 'ruleNumber'],
          params: { ruleNumber: entry.ruleNumber, direction },
        });
      });
    }
  });
  return issues;
}
