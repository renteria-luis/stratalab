import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Autosuggest from '@cloudscape-design/components/autosuggest';
import Box from '@cloudscape-design/components/box';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import type { SecurityGroup } from '@sim/engine';
import { PROTOCOL_LABEL, RULE_TYPES, ruleType, type RuleTypeId } from '../rules';
import {
  ANYWHERE_IPV4,
  naclRowErrors,
  portEditable,
  portTextFor,
  rowKey,
  sgRowErrors,
  type NaclEntryRow,
  type SgRuleRow,
  type SourceType,
} from '../ruleRows';

const typeOptions = RULE_TYPES.map((type) => ({ value: type.id, label: type.label }));
const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'anywhere-ipv4', label: 'Anywhere-IPv4' },
];

function update<T extends { key: string }>(
  rows: readonly T[],
  key: string,
  change: Partial<T>,
): T[] {
  return rows.map((row) => (row.key === key ? { ...row, ...change } : row));
}

function typeChange(typeId: RuleTypeId, portRange: string) {
  return { typeId, portRange: portTextFor(typeId, portEditable(typeId) ? '' : portRange) };
}

/**
 * Security group rule rows: Type, Protocol, Port range, Source (or Destination) type,
 * Source, Description. Labels from the create security group and launch wizard captures.
 */
export function SgRulesEditor({
  rows,
  onChange,
  direction,
  groups,
  showErrors,
  emptyText,
}: {
  rows: readonly SgRuleRow[];
  onChange: (rows: SgRuleRow[]) => void;
  direction: 'inbound' | 'outbound';
  groups: readonly SecurityGroup[];
  showErrors: boolean;
  emptyText: string;
}) {
  const groupIds = new Set(groups.map((group) => group.id));
  const peerLabel = direction === 'inbound' ? 'Source' : 'Destination';
  return (
    <AttributeEditor<SgRuleRow>
      items={[...rows]}
      addButtonText="Add rule"
      removeButtonText="Delete"
      empty={<Box color="text-body-secondary">{emptyText}</Box>}
      onAddButtonClick={() => {
        onChange([
          ...rows,
          {
            key: rowKey(),
            typeId: 'custom-tcp',
            portRange: '',
            sourceType: 'custom',
            peer: '',
            description: '',
          },
        ]);
      }}
      onRemoveButtonClick={({ detail }) => {
        onChange(rows.filter((_, index) => index !== detail.itemIndex));
      }}
      definition={[
        {
          label: 'Type',
          control: (row) => (
            <Select
              selectedOption={{ value: row.typeId, label: ruleType(row.typeId).label }}
              options={typeOptions}
              onChange={({ detail }) => {
                onChange(
                  update(
                    rows,
                    row.key,
                    typeChange(detail.selectedOption.value as RuleTypeId, row.portRange),
                  ),
                );
              }}
            />
          ),
        },
        { label: 'Protocol', control: (row) => PROTOCOL_LABEL[ruleType(row.typeId).protocol] },
        {
          label: 'Port range',
          errorText: (row) => (showErrors ? sgRowErrors(row, groupIds).portRange : undefined),
          control: (row) =>
            portEditable(row.typeId) ? (
              <Input
                value={row.portRange}
                onChange={({ detail }) => {
                  onChange(update(rows, row.key, { portRange: detail.value }));
                }}
              />
            ) : (
              portTextFor(row.typeId, row.portRange)
            ),
        },
        {
          label: `${peerLabel} type`,
          control: (row) => (
            <Select
              selectedOption={
                SOURCE_TYPES.find((option) => option.value === row.sourceType) ?? null
              }
              options={SOURCE_TYPES}
              onChange={({ detail }) => {
                const sourceType = detail.selectedOption.value as SourceType;
                onChange(
                  update(rows, row.key, {
                    sourceType,
                    peer: sourceType === 'anywhere-ipv4' ? ANYWHERE_IPV4 : '',
                  }),
                );
              }}
            />
          ),
        },
        {
          label: peerLabel,
          errorText: (row) => (showErrors ? sgRowErrors(row, groupIds).peer : undefined),
          control: (row) => (
            <Autosuggest
              value={row.peer}
              disabled={row.sourceType === 'anywhere-ipv4'}
              placeholder="CIDR blocks or security groups"
              ariaLabel={peerLabel}
              i18nStrings={{ enteredTextLabel: (value) => `Use: "${value}"` }}
              options={groups.map((group) => ({
                value: group.id,
                label: group.id,
                description: group.name,
              }))}
              onChange={({ detail }) => {
                onChange(update(rows, row.key, { peer: detail.value }));
              }}
            />
          ),
        },
        {
          label: 'Description - optional',
          control: (row) => (
            <Input
              value={row.description}
              onChange={({ detail }) => {
                onChange(update(rows, row.key, { description: detail.value }));
              }}
            />
          ),
        },
      ]}
    />
  );
}

/** Network ACL entry rows: Rule number, Type, Protocol, Port range, Source, Allow/Deny. */
export function NaclEntriesEditor({
  rows,
  onChange,
  direction,
  showErrors,
}: {
  rows: readonly NaclEntryRow[];
  onChange: (rows: NaclEntryRow[]) => void;
  direction: 'inbound' | 'outbound';
  showErrors: boolean;
}) {
  const peerLabel = direction === 'inbound' ? 'Source' : 'Destination';
  return (
    <AttributeEditor<NaclEntryRow>
      items={[...rows]}
      addButtonText="Add new rule"
      removeButtonText="Remove"
      empty={<Box color="text-body-secondary">No rules</Box>}
      onAddButtonClick={() => {
        const next = Math.max(0, ...rows.map((row) => Number(row.ruleNumber) || 0)) + 100;
        onChange([
          ...rows,
          {
            key: rowKey(),
            ruleNumber: String(Math.min(next, 32766)),
            typeId: 'custom-tcp',
            portRange: '',
            cidrBlock: ANYWHERE_IPV4,
            action: 'allow',
          },
        ]);
      }}
      onRemoveButtonClick={({ detail }) => {
        onChange(rows.filter((_, index) => index !== detail.itemIndex));
      }}
      definition={[
        {
          label: 'Rule number',
          errorText: (row) => (showErrors ? naclRowErrors(row).ruleNumber : undefined),
          control: (row) => (
            <Input
              type="number"
              value={row.ruleNumber}
              onChange={({ detail }) => {
                onChange(update(rows, row.key, { ruleNumber: detail.value }));
              }}
            />
          ),
        },
        {
          label: 'Type',
          control: (row) => (
            <Select
              selectedOption={{ value: row.typeId, label: ruleType(row.typeId).label }}
              options={typeOptions}
              onChange={({ detail }) => {
                onChange(
                  update(
                    rows,
                    row.key,
                    typeChange(detail.selectedOption.value as RuleTypeId, row.portRange),
                  ),
                );
              }}
            />
          ),
        },
        { label: 'Protocol', control: (row) => PROTOCOL_LABEL[ruleType(row.typeId).protocol] },
        {
          label: 'Port range',
          errorText: (row) => (showErrors ? naclRowErrors(row).portRange : undefined),
          control: (row) =>
            portEditable(row.typeId) ? (
              <Input
                value={row.portRange}
                onChange={({ detail }) => {
                  onChange(update(rows, row.key, { portRange: detail.value }));
                }}
              />
            ) : (
              portTextFor(row.typeId, row.portRange)
            ),
        },
        {
          label: peerLabel,
          errorText: (row) => (showErrors ? naclRowErrors(row).peer : undefined),
          control: (row) => (
            <Input
              value={row.cidrBlock}
              onChange={({ detail }) => {
                onChange(update(rows, row.key, { cidrBlock: detail.value }));
              }}
            />
          ),
        },
        {
          label: 'Allow/Deny',
          control: (row) => (
            <Select
              selectedOption={{
                value: row.action,
                label: row.action === 'allow' ? 'Allow' : 'Deny',
              }}
              options={[
                { value: 'allow', label: 'Allow' },
                { value: 'deny', label: 'Deny' },
              ]}
              onChange={({ detail }) => {
                onChange(
                  update(rows, row.key, {
                    action: detail.selectedOption.value === 'deny' ? 'deny' : 'allow',
                  }),
                );
              }}
            />
          ),
        },
      ]}
    />
  );
}
