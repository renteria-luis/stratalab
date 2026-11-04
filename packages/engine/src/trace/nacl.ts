import { contains, mustParseCidr, type Ipv4Address } from '../cidr';
import type { NetworkAcl, NetworkAclEntry } from '../schema';
import type { HopMatch } from './types';

export interface NaclDecision {
  readonly allowed: boolean;
  readonly match: Extract<HopMatch, { type: 'nacl-entry' }>;
}

/**
 * Evaluates one direction of a network ACL for a TCP packet. Entries are checked from the
 * lowest rule number up and the first match decides; with no match the implicit `*` entry
 * denies. An entry matches when its protocol is `tcp` or `all`, the port is in its range
 * (`all` matches every port) and its CIDR contains the remote address: the source on
 * inbound, the destination on outbound. Responses are checked like any other packet.
 *
 * Rules:
 * - NACL-02 rule order and the `*` entry: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html
 * - NACL-03 stateless: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html
 */
export function evaluateNacl(
  acl: NetworkAcl,
  direction: 'inbound' | 'outbound',
  remoteIp: Ipv4Address,
  port: number,
): NaclDecision {
  const entries = direction === 'inbound' ? acl.inboundEntries : acl.outboundEntries;
  const ordered = entries.toSorted((a, b) => a.ruleNumber - b.ruleNumber);
  const entry = ordered.find((candidate) => matches(candidate, remoteIp, port));
  if (entry === undefined) {
    return {
      allowed: false,
      match: { type: 'nacl-entry', networkAclId: acl.id, ruleNumber: '*', action: 'deny' },
    };
  }
  return {
    allowed: entry.action === 'allow',
    match: {
      type: 'nacl-entry',
      networkAclId: acl.id,
      ruleNumber: entry.ruleNumber,
      action: entry.action,
    },
  };
}

function matches(entry: NetworkAclEntry, remoteIp: Ipv4Address, port: number): boolean {
  if (!contains(mustParseCidr(entry.cidrBlock), remoteIp)) return false;
  switch (entry.protocol) {
    case 'all':
      return true;
    case 'tcp':
      return port >= entry.fromPort && port <= entry.toPort;
    case 'udp':
    case 'icmp':
      return false;
  }
}
