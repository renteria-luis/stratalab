import type { NetworkAclEntry, SecurityGroupRule } from '@sim/engine';

/**
 * Rule types of the security group and network ACL editors. Labels follow the captures
 * ("All traffic", "ssh" in the launch wizard) and the AWS docs procedures ("Custom TCP",
 * "SSH", "HTTP", "HTTPS"). R0 supports these types only.
 */
export type RuleTypeId =
  'custom-tcp' | 'custom-udp' | 'all-traffic' | 'all-icmp' | 'ssh' | 'http' | 'https';

export interface RuleType {
  readonly id: RuleTypeId;
  readonly label: string;
  readonly protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  /** Fixed port for named types. */
  readonly port?: number;
}

const RULE_TYPES_BY_ID: Readonly<Record<RuleTypeId, RuleType>> = {
  'custom-tcp': { id: 'custom-tcp', label: 'Custom TCP', protocol: 'tcp' },
  'custom-udp': { id: 'custom-udp', label: 'Custom UDP', protocol: 'udp' },
  'all-traffic': { id: 'all-traffic', label: 'All traffic', protocol: 'all' },
  'all-icmp': { id: 'all-icmp', label: 'All ICMP - IPv4', protocol: 'icmp' },
  ssh: { id: 'ssh', label: 'SSH', protocol: 'tcp', port: 22 },
  http: { id: 'http', label: 'HTTP', protocol: 'tcp', port: 80 },
  https: { id: 'https', label: 'HTTPS', protocol: 'tcp', port: 443 },
};

export const RULE_TYPES: readonly RuleType[] = Object.values(RULE_TYPES_BY_ID);

export function ruleType(id: RuleTypeId): RuleType {
  return RULE_TYPES_BY_ID[id];
}

type AnyRule = SecurityGroupRule | NetworkAclEntry;

/** The rule type a stored rule shows as. */
export function ruleTypeOf(rule: AnyRule): RuleType {
  switch (rule.protocol) {
    case 'all':
      return ruleType('all-traffic');
    case 'icmp':
      return ruleType('all-icmp');
    case 'udp':
      return ruleType('custom-udp');
    case 'tcp': {
      const named = RULE_TYPES.find(
        (type) =>
          type.port !== undefined && type.port === rule.fromPort && type.port === rule.toPort,
      );
      return named ?? ruleType('custom-tcp');
    }
  }
}

export const PROTOCOL_LABEL = { tcp: 'TCP', udp: 'UDP', icmp: 'ICMP', all: 'All' } as const;

/** "All", "80" or "1024 - 65535". */
export function portRangeOf(rule: AnyRule): string {
  if (rule.protocol !== 'tcp' && rule.protocol !== 'udp') return 'All';
  return rule.fromPort === rule.toPort
    ? String(rule.fromPort)
    : `${String(rule.fromPort)} - ${String(rule.toPort)}`;
}

/** Parses "80", "1024-65535" or "1024 - 65535". */
export function parsePortRange(text: string): { fromPort: number; toPort: number } | null {
  const match = /^\s*(\d{1,5})\s*(?:-\s*(\d{1,5})\s*)?$/.exec(text);
  if (match === null) return null;
  const fromPort = Number(match[1]);
  const toPort = match[2] === undefined ? fromPort : Number(match[2]);
  if (fromPort > 65535 || toPort > 65535 || fromPort > toPort) return null;
  return { fromPort, toPort };
}
