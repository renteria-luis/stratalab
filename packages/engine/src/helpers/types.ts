import type { RuleId } from '../rules';
import type { Topology, TopologyInput } from '../schema';

/**
 * Helper error codes (docs/specs/r0-engine.md sections 3.8 and 3.10, docs/specs/r1-nat-gateway.md
 * section 5). Helpers check only
 * lookups and state changes; AWS rules between resources stay in `validate()`.
 */
export const HELPER_ERROR_CODES = [
  'UNKNOWN_REFERENCE',
  'INVALID_INPUT',
  'NO_FREE_PRIVATE_ADDRESS',
  'PUBLIC_POOL_EXHAUSTED',
  'IGW_ALREADY_ATTACHED',
  'VPC_ALREADY_HAS_IGW',
  'IGW_NOT_ATTACHED',
  'IGW_HAS_PUBLIC_ADDRESSES',
  'NAT_VPC_NO_INTERNET_GATEWAY',
] as const;

export type HelperErrorCode = (typeof HELPER_ERROR_CODES)[number];

/** A helper failure. The UI translates `helper.<code>` with `params`. */
export interface HelperError {
  readonly code: HelperErrorCode;
  readonly ruleIds: readonly RuleId[];
  readonly params: Readonly<Record<string, string | number>>;
  /** Schema problems, for `INVALID_INPUT` only. */
  readonly issues?: readonly HelperInputIssue[];
}

export interface HelperInputIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/** What an edit helper creates: nothing. */
export type NothingCreated = Readonly<Record<string, never>>;

/** A new topology and the IDs it created, or why the change can't be made. */
export type HelperResult<T = NothingCreated> =
  | { readonly ok: true; readonly topology: Topology; readonly created: T }
  | { readonly ok: false; readonly error: HelperError };

/** Prefixes of the fake AWS-style IDs (r0-engine.md section 2). */
export type IdPrefix =
  'vpc' | 'subnet' | 'rtb' | 'igw' | 'nat' | 'sg' | 'sgr' | 'acl' | 'i' | 'eni';

/** A rule or entry direction, as the console's "Inbound rules" and "Outbound rules" tabs. */
export type RuleDirection = 'inbound' | 'outbound';

type RouteTableInput = TopologyInput['routeTables'][number];
type SecurityGroupInput = TopologyInput['securityGroups'][number];
type NetworkAclInput = TopologyInput['networkAcls'][number];
type InstanceInput = TopologyInput['instances'][number];

export type RouteInput = RouteTableInput['routes'][number];
export type SecurityGroupRuleInput = SecurityGroupInput['inboundRules'][number];
export type NetworkAclEntryInput = NetworkAclInput['inboundEntries'][number];
export type RunningServiceInput = InstanceInput['runningServices'][number];

/** A security group rule from the edit form: `id` only for rules that already exist. */
export type SecurityGroupRuleDraft = DistributiveOmit<SecurityGroupRuleInput, 'id'> & {
  readonly id?: string;
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Resources with a Name tag. A security group's name is its group name (SG-06). */
export interface NameTagResource {
  readonly type:
    | 'vpc'
    | 'subnet'
    | 'route-table'
    | 'internet-gateway'
    | 'nat-gateway'
    | 'network-acl'
    | 'instance';
  readonly id: string;
}
