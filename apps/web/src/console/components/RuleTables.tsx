import Table from '@cloudscape-design/components/table';
import type { NetworkAclEntry, SecurityGroupRule } from '@sim/engine';
import type { ReactNode } from 'react';
import { PROTOCOL_LABEL, portRangeOf, ruleTypeOf } from '../rules';
import { DASH, orDash } from './values';

/**
 * Network ACL entries in rule-number order, then the implicit `*` deny (NACL-02).
 * Columns follow the AWS docs procedures; no text capture of this tab exists yet
 * (docs/specs/p7-lab1.md, missing captures).
 */
export function NaclEntriesTable({
  entries,
  direction,
  header,
}: {
  entries: readonly NetworkAclEntry[];
  direction: 'inbound' | 'outbound';
  header?: ReactNode;
}) {
  interface Row {
    key: string;
    ruleNumber: string;
    type: string;
    protocol: string;
    ports: string;
    cidr: string;
    action: string;
  }
  const rows: Row[] = [
    ...entries
      .toSorted((a, b) => a.ruleNumber - b.ruleNumber)
      .map((entry) => ({
        key: String(entry.ruleNumber),
        ruleNumber: String(entry.ruleNumber),
        type: ruleTypeOf(entry).label,
        protocol: PROTOCOL_LABEL[entry.protocol],
        ports: portRangeOf(entry),
        cidr: entry.cidrBlock,
        action: entry.action === 'allow' ? 'Allow' : 'Deny',
      })),
    {
      key: '*',
      ruleNumber: '*',
      type: 'All traffic',
      protocol: 'All',
      ports: 'All',
      cidr: '0.0.0.0/0',
      action: 'Deny',
    },
  ];
  return (
    <Table<Row>
      variant="embedded"
      header={header}
      items={rows}
      trackBy="key"
      columnDefinitions={[
        { id: 'rule', header: 'Rule number', cell: (row) => row.ruleNumber },
        { id: 'type', header: 'Type', cell: (row) => row.type },
        { id: 'protocol', header: 'Protocol', cell: (row) => row.protocol },
        { id: 'ports', header: 'Port range', cell: (row) => row.ports },
        {
          id: 'cidr',
          header: direction === 'inbound' ? 'Source' : 'Destination',
          cell: (row) => row.cidr,
        },
        { id: 'action', header: 'Allow/Deny', cell: (row) => row.action },
      ]}
    />
  );
}

/**
 * Security group rules of one direction. Columns follow the create security group capture
 * and the AWS docs; no text capture of the rules tab exists yet.
 */
export function SecurityGroupRulesTable({
  rules,
  direction,
  groupNames,
  header,
}: {
  rules: readonly SecurityGroupRule[];
  direction: 'inbound' | 'outbound';
  groupNames: ReadonlyMap<string, string>;
  header?: ReactNode;
}) {
  return (
    <Table<SecurityGroupRule>
      variant="embedded"
      header={header}
      items={[...rules]}
      trackBy="id"
      empty={`This security group has no ${direction} rules.`}
      columnDefinitions={[
        { id: 'name', header: 'Name', cell: () => DASH },
        { id: 'id', header: 'Security group rule ID', cell: (rule) => rule.id },
        {
          id: 'ip-version',
          header: 'IP version',
          cell: (rule) => (rule.peer.type === 'cidr' ? 'IPv4' : DASH),
        },
        { id: 'type', header: 'Type', cell: (rule) => ruleTypeOf(rule).label },
        { id: 'protocol', header: 'Protocol', cell: (rule) => PROTOCOL_LABEL[rule.protocol] },
        { id: 'ports', header: 'Port range', cell: (rule) => portRangeOf(rule) },
        {
          id: 'peer',
          header: direction === 'inbound' ? 'Source' : 'Destination',
          cell: (rule) =>
            rule.peer.type === 'cidr'
              ? rule.peer.cidrBlock
              : `${rule.peer.securityGroupId} / ${groupNames.get(rule.peer.securityGroupId) ?? ''}`,
        },
        { id: 'description', header: 'Description', cell: (rule) => orDash(rule.description) },
      ]}
    />
  );
}
