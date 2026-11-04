import { contains, mustParseCidr, type Ipv4Address } from '../cidr';
import { mustGet } from '../internal/lookup';
import type { Model } from '../model';
import type { NetworkInterface, SecurityGroupRule } from '../schema';
import type { HopMatch, ReasonCode } from './types';

/** The other end of the connection, as the security group sees it. */
export interface Remote {
  readonly ip: Ipv4Address;
  /**
   * The network interface behind `ip` when it is reached by its private address in the same
   * VPC (F0). Null for internet addresses, which never match a security group reference.
   */
  readonly networkInterface: NetworkInterface | null;
}

export type SgDecision =
  | { readonly allowed: true; readonly match: Extract<HopMatch, { type: 'sg-rule' }> }
  | {
      readonly allowed: false;
      readonly reasonCode: Extract<ReasonCode, 'SG_HAS_NO_RULES' | 'ENI_SG_RULES_MISMATCH'>;
    };

/**
 * Evaluates the security groups of a network interface for a new TCP connection. The rules of
 * all groups are aggregated and any matching rule allows it; there are no deny rules. The
 * first matching rule, in group order then rule order, is reported. Responses never reach
 * this function: the caller skips them (SG-01).
 *
 * A rule matches when its protocol is `tcp` or `all`, the port is in its range and its peer
 * matches: a CIDR that contains the remote address, or a security group that the remote
 * network interface belongs to (only for private traffic in the same VPC).
 *
 * `SG_HAS_NO_RULES` when no group has a rule in this direction, else `ENI_SG_RULES_MISMATCH`
 * (Inferred mapping, SG-02).
 *
 * Rules:
 * - SG-02 allow rules only: https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
 * - SG-03 aggregated rules per interface: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/changing-security-group.html
 * - SG-04 rule peers and group references: https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
 */
export function evaluateSecurityGroups(
  model: Model,
  networkInterface: NetworkInterface,
  direction: 'inbound' | 'outbound',
  remote: Remote,
  port: number,
): SgDecision {
  const key = direction === 'inbound' ? 'inboundRules' : 'outboundRules';
  const groups = networkInterface.securityGroupIds.map((id) => mustGet(model.securityGroups, id));
  for (const group of groups) {
    const rule = group[key].find((candidate) => matches(candidate, remote, port));
    if (rule !== undefined) {
      return {
        allowed: true,
        match: { type: 'sg-rule', securityGroupId: group.id, ruleId: rule.id },
      };
    }
  }
  const hasRules = groups.some((group) => group[key].length > 0);
  return { allowed: false, reasonCode: hasRules ? 'ENI_SG_RULES_MISMATCH' : 'SG_HAS_NO_RULES' };
}

function matches(rule: SecurityGroupRule, remote: Remote, port: number): boolean {
  if (!protocolMatches(rule, port)) return false;
  if (rule.peer.type === 'cidr') return contains(mustParseCidr(rule.peer.cidrBlock), remote.ip);
  return remote.networkInterface?.securityGroupIds.includes(rule.peer.securityGroupId) ?? false;
}

function protocolMatches(rule: SecurityGroupRule, port: number): boolean {
  switch (rule.protocol) {
    case 'all':
      return true;
    case 'tcp':
      return port >= rule.fromPort && port <= rule.toPort;
    case 'udp':
    case 'icmp':
      return false;
  }
}
