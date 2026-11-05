import {
  cidr,
  type NetworkAclEntry,
  type NetworkAclEntryInput,
  type SecurityGroupRule,
  type SecurityGroupRuleDraft,
} from '@sim/engine';
import { parsePortRange, ruleType, ruleTypeOf, type RuleTypeId } from './rules';

/** Rows of the rule editors, as text the learner types. */

export type SourceType = 'custom' | 'anywhere-ipv4';
export const ANYWHERE_IPV4 = '0.0.0.0/0';

export interface SgRuleRow {
  readonly key: string;
  readonly id?: string;
  readonly typeId: RuleTypeId;
  readonly portRange: string;
  readonly sourceType: SourceType;
  readonly peer: string;
  readonly description: string;
}

export interface NaclEntryRow {
  readonly key: string;
  readonly ruleNumber: string;
  readonly typeId: RuleTypeId;
  readonly portRange: string;
  readonly cidrBlock: string;
  readonly action: 'allow' | 'deny';
}

let nextKey = 0;
export const rowKey = () => {
  nextKey += 1;
  return `row-${String(nextKey)}`;
};

/** Port text a type shows: fixed for named types, editable for custom ones. */
export function portTextFor(typeId: RuleTypeId, current: string): string {
  const type = ruleType(typeId);
  if (type.protocol === 'all' || type.protocol === 'icmp') return 'All';
  return type.port === undefined ? current : String(type.port);
}

export const portEditable = (typeId: RuleTypeId) =>
  typeId === 'custom-tcp' || typeId === 'custom-udp';

export function sgRowOf(rule: SecurityGroupRule): SgRuleRow {
  const peer = rule.peer.type === 'cidr' ? rule.peer.cidrBlock : rule.peer.securityGroupId;
  const type = ruleTypeOf(rule);
  return {
    key: rowKey(),
    id: rule.id,
    typeId: type.id,
    portRange:
      rule.protocol === 'tcp' || rule.protocol === 'udp'
        ? rule.fromPort === rule.toPort
          ? String(rule.fromPort)
          : `${String(rule.fromPort)}-${String(rule.toPort)}`
        : 'All',
    sourceType: peer === ANYWHERE_IPV4 ? 'anywhere-ipv4' : 'custom',
    peer,
    description: rule.description ?? '',
  };
}

export function naclRowOf(entry: NetworkAclEntry): NaclEntryRow {
  return {
    key: rowKey(),
    ruleNumber: String(entry.ruleNumber),
    typeId: ruleTypeOf(entry).id,
    portRange:
      entry.protocol === 'tcp' || entry.protocol === 'udp'
        ? entry.fromPort === entry.toPort
          ? String(entry.fromPort)
          : `${String(entry.fromPort)}-${String(entry.toPort)}`
        : 'All',
    cidrBlock: entry.cidrBlock,
    action: entry.action,
  };
}

interface Ports {
  protocol: 'tcp' | 'udp';
  fromPort: number;
  toPort: number;
}
type Protocol = Ports | { protocol: 'all' } | { protocol: 'icmp' };

function protocolOf(typeId: RuleTypeId, portRange: string): Protocol | null {
  const type = ruleType(typeId);
  if (type.protocol === 'all') return { protocol: 'all' };
  if (type.protocol === 'icmp') return { protocol: 'icmp' };
  if (type.port !== undefined)
    return { protocol: type.protocol, fromPort: type.port, toPort: type.port };
  const ports = parsePortRange(portRange);
  return ports === null ? null : { protocol: type.protocol, ...ports };
}

export interface RowErrors {
  readonly portRange?: string;
  readonly peer?: string;
  readonly ruleNumber?: string;
}

export function sgRowErrors(row: SgRuleRow, groupIds: ReadonlySet<string>): RowErrors {
  const peer = row.peer.trim();
  return {
    ...(protocolOf(row.typeId, row.portRange) === null
      ? { portRange: 'Enter a port or a port range, for example 80 or 1024-65535.' }
      : {}),
    ...(cidr.parseCidr(peer) === null && !groupIds.has(peer)
      ? { peer: 'Enter a CIDR block or a security group ID.' }
      : {}),
  };
}

export function naclRowErrors(row: NaclEntryRow): RowErrors {
  const ruleNumber = Number(row.ruleNumber);
  return {
    ...(Number.isInteger(ruleNumber) && ruleNumber >= 1 && ruleNumber <= 32766
      ? {}
      : { ruleNumber: 'Enter a rule number from 1 to 32766.' }),
    ...(protocolOf(row.typeId, row.portRange) === null
      ? { portRange: 'Enter a port or a port range, for example 80 or 1024-65535.' }
      : {}),
    ...(cidr.parseCidr(row.cidrBlock.trim()) === null
      ? { peer: 'Enter a valid IPv4 CIDR block.' }
      : {}),
  };
}

export const hasErrors = (errors: RowErrors) => Object.keys(errors).length > 0;

/** A row the caller checked with `sgRowErrors`. */
export function sgDraftOf(row: SgRuleRow): SecurityGroupRuleDraft {
  const peerText = row.peer.trim();
  const protocol = protocolOf(row.typeId, row.portRange) ?? { protocol: 'all' };
  const description = row.description.trim();
  return {
    ...(row.id === undefined ? {} : { id: row.id }),
    ...protocol,
    peer: peerText.startsWith('sg-')
      ? { type: 'security-group', securityGroupId: peerText }
      : { type: 'cidr', cidrBlock: peerText },
    ...(description === '' ? {} : { description }),
  };
}

/** A row the caller checked with `naclRowErrors`. */
export function naclEntryOf(row: NaclEntryRow): NetworkAclEntryInput {
  const protocol = protocolOf(row.typeId, row.portRange) ?? { protocol: 'all' };
  return {
    ruleNumber: Number(row.ruleNumber),
    ...protocol,
    cidrBlock: row.cidrBlock.trim(),
    action: row.action,
  };
}
