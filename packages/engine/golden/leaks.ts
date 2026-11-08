import type { GoldenScenario } from './scenario';

/**
 * Leak check for fixtures (docs/specs/p9-golden.md section 5.2): no ARN, account ID, real
 * resource ID or real address may end up in the repository. The capture runs it before
 * writing; the golden test runs it on every committed fixture.
 */

export interface AllowList {
  readonly ids: ReadonlySet<string>;
  readonly addresses: ReadonlySet<string>;
  readonly cidrs: ReadonlySet<string>;
}

const ID_PATTERN =
  /\b(?:vpc|subnet|rtb|rtbassoc|igw|sg|sgr|acl|aclassoc|i|eni|nip|nia|eipalloc|eipassoc|vol|ami|pl|nat|vpce|tgw|pcx)-[0-9a-f]{8,17}\b/g;
const IPV4_PATTERN = /(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?(?![\d.])/g;
/** Twelve digits between non-alphanumeric characters (so not inside a hex digest). */
const ACCOUNT_PATTERN = /(?<![0-9A-Za-z])\d{12}(?![0-9A-Za-z])/;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) strings(item, out);
  }
  return out;
}

/** What a fixture of this scenario may contain: the topology's IDs, addresses and CIDRs. */
export function scenarioAllowList(scenario: GoldenScenario): AllowList {
  const ids = new Set<string>();
  const addresses = new Set<string>();
  const cidrs = new Set<string>(['0.0.0.0/0']);
  for (const text of strings([scenario.topology, scenario.queries.map((query) => query.query)])) {
    for (const match of text.matchAll(ID_PATTERN)) ids.add(match[0]);
    for (const match of text.matchAll(IPV4_PATTERN)) {
      const [, address, prefix] = match;
      if (address === undefined) continue;
      if (prefix === undefined) addresses.add(address);
      else cidrs.add(`${address}/${prefix}`);
    }
  }
  return { ids, addresses, cidrs };
}

function leaks(text: string, allowed: AllowList): boolean {
  if (text.includes('arn:') || ACCOUNT_PATTERN.test(text)) return true;
  for (const match of text.matchAll(ID_PATTERN)) {
    if (!allowed.ids.has(match[0])) return true;
  }
  for (const match of text.matchAll(IPV4_PATTERN)) {
    const [whole, address, prefix] = match;
    if (address === undefined) continue;
    const isHost = prefix === undefined || prefix === '32';
    if (!(isHost && allowed.addresses.has(address)) && !allowed.cidrs.has(whole)) return true;
  }
  return false;
}

/** JSON paths (`$.analyses[0].component`) of values that could reveal a real account. */
export function findLeaks(value: unknown, allowed: AllowList): string[] {
  const found: string[] = [];
  const walk = (item: unknown, path: string) => {
    if (typeof item === 'string') {
      if (leaks(item, allowed)) found.push(path);
    } else if (typeof item === 'number') {
      if (leaks(String(item), allowed)) found.push(path);
    } else if (Array.isArray(item)) {
      item.forEach((child: unknown, index) => {
        walk(child, `${path}[${String(index)}]`);
      });
    } else if (typeof item === 'object' && item !== null) {
      for (const [key, child] of Object.entries(item)) walk(child, `${path}.${key}`);
    }
  };
  walk(value, '$');
  return found;
}
