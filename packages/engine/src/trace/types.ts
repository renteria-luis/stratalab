import type { ClientType, PortRange } from '../model';
import type { Fidelity, RuleId } from '../rules';
import type { Issue, ResourceRef } from '../validate';

/**
 * What to trace (docs/specs/r0-engine.md section 5.1, docs/specs/r1-nat-gateway.md section 4.1).
 * Traces are TCP only.
 */
export interface TraceQuery {
  readonly protocol: 'tcp';
  readonly source:
    | { readonly type: 'internet'; readonly ipAddress: string }
    | { readonly type: 'instance'; readonly instanceId: string };
  readonly destination:
    | { readonly type: 'internet'; readonly ipAddress: string }
    | {
        readonly type: 'instance';
        readonly instanceId: string;
        readonly address: 'public' | 'private';
      };
  /** 1 to 65535. */
  readonly destinationPort: number;
  /** Default: the source instance's platform, or `linux` for an internet source (EPH-02). */
  readonly clientType?: ClientType;
  /** Default: the first port of the client range. Required for `custom` (EPH-02). */
  readonly sourcePort?: number;
  /**
   * The source port a NAT gateway gives the connection, 1024 to 65535 (NAT-04). Default 1024.
   * Ignored when the path has no NAT gateway.
   */
  readonly natSourcePort?: number;
}

/**
 * Reason codes a hop can fail with. All but the last three are Reachability Analyzer
 * explanation codes (TRC-04); `NO_LISTENER`, `NO_INTERNET_GATEWAY` and `UNSUPPORTED_FEATURE`
 * are our own. `UNSUPPORTED_FEATURE` marks a path the engine doesn't model, such as a route
 * to a NAT gateway where only an internet gateway works (Q15, Q16); it never ends `REACHED`.
 */
export const REASON_CODES = [
  'NO_ROUTE_TO_DESTINATION',
  'BAD_STATE_ROUTE',
  'MORE_SPECIFIC_ROUTE',
  'IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS',
  'IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS',
  'IGW_DESTINATION_ADDRESS_NOT_IN_RFC1918_EGRESS',
  'IGW_DESTINATION_ADDRESS_NOT_IN_RFC6598_EGRESS',
  'IGW_SOURCE_ADDRESS_NOT_IN_RFC1918_INGRESS',
  'IGW_SOURCE_ADDRESS_NOT_IN_RFC6598_INGRESS',
  'SUBNET_ACL_RESTRICTION',
  'ENI_SG_RULES_MISMATCH',
  'SG_HAS_NO_RULES',
  'NO_LISTENER',
  'NO_INTERNET_GATEWAY',
  'UNSUPPORTED_FEATURE',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export type Direction = 'forward' | 'return';

export type HopStep =
  | 'sg-egress'
  | 'nacl-outbound'
  | 'route-lookup'
  | 'igw-egress'
  | 'igw-ingress'
  | 'nat-gateway'
  | 'nacl-inbound'
  | 'sg-ingress'
  | 'host';

export interface Packet {
  readonly protocol: 'tcp';
  readonly sourceIp: string;
  readonly sourcePort: number;
  /** Null only when an internet client targets the public address of an instance that has none. */
  readonly destinationIp: string | null;
  readonly destinationPort: number;
}

export type HopMatch =
  | {
      readonly type: 'route';
      readonly routeTableId: string;
      readonly destinationCidrBlock: string;
      /** `local`, an internet gateway ID or a NAT gateway ID. */
      readonly target: string;
      readonly state: 'active' | 'blackhole';
    }
  | {
      readonly type: 'nacl-entry';
      readonly networkAclId: string;
      readonly ruleNumber: number | '*';
      readonly action: 'allow' | 'deny';
    }
  | { readonly type: 'sg-rule'; readonly securityGroupId: string; readonly ruleId: string }
  | { readonly type: 'service'; readonly port: number; readonly name: string };

export interface Hop {
  /** 0-based, contiguous across both directions. */
  readonly index: number;
  readonly direction: Direction;
  readonly step: HopStep;
  readonly component: {
    readonly type:
      | 'network-interface'
      | 'subnet'
      | 'route-table'
      | 'internet-gateway'
      | 'nat-gateway'
      | 'vpc'
      | 'instance';
    readonly id: string;
  };
  /** The packet as it arrives at this hop. */
  readonly packet: Packet;
  /**
   * The packet after address translation; internet gateway and NAT gateway hops that pass
   * only (IGW-02, ADR-10, NAT-04).
   */
  readonly translatedTo?: Packet;
  readonly outcome: 'pass' | 'fail' | 'skipped';
  readonly skippedBecause?: 'stateful-response' | 'same-subnet';
  readonly match?: HopMatch;
  /** Non-empty when `outcome` is `fail`. */
  readonly reasonCodes: readonly ReasonCode[];
  readonly ruleIds: readonly RuleId[];
  readonly fidelity: Fidelity;
}

export type Verdict = 'REACHED' | 'BROKE_AT_HOP' | 'ROUTED_THEN_DROPPED';

export interface TraceClient {
  readonly type: ClientType;
  readonly portRange: PortRange;
  readonly sourcePort: number;
}

export interface EvaluatedTrace {
  readonly status: 'evaluated';
  readonly flow: 'F0' | 'F1' | 'F2' | 'F3';
  readonly verdict: Verdict;
  /** Absent when the verdict is `REACHED`. */
  readonly failure?: {
    readonly direction: Direction;
    readonly hopIndex: number;
    readonly reasonCodes: readonly ReasonCode[];
  };
  readonly client: TraceClient;
  /** Forward hops, then return hops; ends at the failing hop. */
  readonly hops: readonly Hop[];
  /** The lowest fidelity among the hops. */
  readonly fidelity: Fidelity;
}

export const QUERY_ISSUE_CODES = [
  'UNKNOWN_REFERENCE',
  'INVALID_QUERY',
  'IGW_EXPECTS_PUBLIC_ADDRESS',
  'DISCONNECTED_VPCS',
  'UNSUPPORTED_FEATURE',
] as const;

export type QueryIssueCode = (typeof QUERY_ISSUE_CODES)[number];

/** A reason the query can't be traced (docs/specs/r0-engine.md section 5.3). */
export interface QueryIssue {
  readonly code: QueryIssueCode;
  readonly severity: 'error';
  readonly ruleIds: readonly RuleId[];
  readonly fidelity: Fidelity;
  /** Path into the query, for example `['query', 'destination', 'ipAddress']`. */
  readonly path: readonly ['query', ...(string | number)[]];
  readonly related?: readonly ResourceRef[];
  readonly params: Readonly<Record<string, string | number>>;
}

export interface BlockedTrace {
  readonly status: 'blocked';
  /** `validate()` errors first (topology), then query issues (path starts with `query`). */
  readonly issues: readonly (Issue | QueryIssue)[];
}

export type TraceResult = EvaluatedTrace | BlockedTrace;
