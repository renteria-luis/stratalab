import type { Fidelity, RuleId } from '../rules';

/**
 * Issue codes in the row order of docs/specs/r0-engine.md section 4. That order is the
 * tie-breaker when one resource has several issues. Add new codes in the same order.
 */
export const ISSUE_CODES = [
  'VPC_SIZE_INVALID',
  'VPC_CIDR_RESTRICTED',
  'SUBNET_SIZE_INVALID',
  'SUBNET_CIDR_OUT_OF_VPC',
  'CIDR_OVERLAP',
  'IP_OUT_OF_SUBNET',
  'IP_RESERVED',
  'IP_DUPLICATE',
  'PUBLIC_IP_INVALID',
  'VPC_MISMATCH',
  'ROUTE_DUPLICATE_DESTINATION',
  'ROUTE_DESTINATION_RESERVED',
  'LOCAL_ROUTE_CONFLICT',
  'IGW_MULTIPLE_ATTACHED',
  'NAT_SUBNET_NOT_PUBLIC',
  'NAT_VPC_NO_INTERNET_GATEWAY',
  'SG_NAME_INVALID',
  'SG_NAME_DUPLICATE',
  'NACL_RULE_NUMBER_DUPLICATE',
  'QUOTA_EXCEEDED',
] as const;

export type IssueCode = (typeof ISSUE_CODES)[number];

export type ResourceType =
  | 'vpc'
  | 'subnet'
  | 'route-table'
  | 'internet-gateway'
  | 'nat-gateway'
  | 'security-group'
  | 'network-acl'
  | 'instance'
  | 'network-interface';

export interface ResourceRef {
  readonly type: ResourceType;
  readonly id: string;
}

/** Collection keys of `Topology`, in key order. Issues are sorted by this first. */
export const TOPOLOGY_COLLECTIONS = [
  'vpcs',
  'subnets',
  'routeTables',
  'internetGateways',
  'natGateways',
  'securityGroups',
  'networkAcls',
  'instances',
] as const;

export type TopologyCollection = (typeof TOPOLOGY_COLLECTIONS)[number];

/**
 * A problem `validate()` found. The engine returns no user-facing text: the UI translates
 * `issue.<code>` with `params` through i18n.
 */
export interface Issue {
  readonly code: IssueCode;
  readonly severity: 'error' | 'warning';
  readonly ruleIds: readonly RuleId[];
  readonly fidelity: Fidelity;
  readonly resource: ResourceRef;
  /** Path into the topology, starting with the collection key and the array index. */
  readonly path: readonly [TopologyCollection, number, ...(string | number)[]];
  readonly related?: readonly ResourceRef[];
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * Sorts issues by collection, then array index, then code row order. The sort is stable,
 * so issues with the same key keep the order the checks produced them in.
 */
export function sortIssues(issues: readonly Issue[]): Issue[] {
  const key = (issue: Issue) =>
    [
      TOPOLOGY_COLLECTIONS.indexOf(issue.path[0]),
      issue.path[1],
      ISSUE_CODES.indexOf(issue.code),
    ] as const;
  return issues.toSorted((a, b) => {
    const [ac, ai, ak] = key(a);
    const [bc, bi, bk] = key(b);
    return ac - bc || ai - bi || ak - bk;
  });
}
