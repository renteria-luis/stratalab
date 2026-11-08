/**
 * Canonical JSON for the scenario hash (docs/specs/p9-golden.md section 4): object keys
 * sorted by UTF-16 code units, arrays in order, no whitespace, `undefined` keys omitted
 * (`undefined` in arrays becomes `null`, as in `JSON.stringify`). Non-finite numbers throw.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error(`canonicalJson: ${String(value)} is not finite`);
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item: unknown) => canonicalJson(item ?? null)).join(',')}]`;
      }
      const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported ${typeof value}`);
  }
}
