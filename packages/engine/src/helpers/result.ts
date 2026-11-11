import { topologySchema, type TopologyInput } from '../schema';
import type { Topology } from '../schema';
import { validate, type Issue } from '../validate';
import type { HelperError, HelperErrorCode, HelperResult } from './types';
import type { RuleId } from '../rules';

/**
 * Parses a candidate topology. Parsing stores CIDRs in canonical form (ADR-05) and checks
 * shape and references, so a helper can't return a topology the schema would reject.
 */
export function finish<T>(candidate: TopologyInput, created: T): HelperResult<T> {
  const parsed = topologySchema.safeParse(candidate);
  if (parsed.success) return { ok: true, topology: parsed.data, created };
  return {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      ruleIds: [],
      params: {},
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.filter((part) => typeof part !== 'symbol'),
        message: issue.message,
      })),
    },
  };
}

export function fail(
  code: HelperErrorCode,
  ruleIds: readonly RuleId[],
  params: HelperError['params'],
): { ok: false; error: HelperError } {
  return { ok: false, error: { code, ruleIds, params } };
}

/** Reference types a helper input can name. */
export type HelperReferenceType =
  | 'vpc'
  | 'subnet'
  | 'route-table'
  | 'internet-gateway'
  | 'nat-gateway'
  | 'security-group'
  | 'network-acl'
  | 'instance';

export function unknownReference(
  referenceType: HelperReferenceType,
  id: string,
): { ok: false; error: HelperError } {
  return fail('UNKNOWN_REFERENCE', [], { referenceType, id });
}

/** Identity of an issue without its path: array indexes can shift between two topologies. */
function issueKey(issue: Issue): string {
  return JSON.stringify([issue.code, issue.resource, issue.related ?? [], issue.params]);
}

/**
 * `validate()` errors of `after` that `before` doesn't have (r0-engine.md section 3.8).
 * A non-empty result rejects a console change, as the AWS API would. Errors that already
 * existed don't block unrelated changes; warnings never block.
 */
export function newErrors(before: Topology, after: Topology): Issue[] {
  const remaining = new Map<string, number>();
  for (const issue of validate(before)) {
    if (issue.severity !== 'error') continue;
    const key = issueKey(issue);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return validate(after).filter((issue) => {
    if (issue.severity !== 'error') return false;
    const key = issueKey(issue);
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

/** Replaces the item with `id`, keeping array order. The caller checked that it exists. */
export function replaceById<T extends { readonly id: string }>(
  items: readonly T[],
  id: string,
  change: (item: T) => T,
): T[] {
  return items.map((item) => (item.id === id ? change(item) : item));
}

/** A copy of `value` without `key`, so optional fields disappear instead of being `undefined`. */
export function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([entryKey]) => entryKey !== key)) as Omit<
    T,
    K
  >;
}

/** `{ name }` when a Name tag is given, `{}` for no tag or an empty one. */
export function nameTag(name: string | undefined): { name?: string } {
  return name === undefined || name === '' ? {} : { name };
}
