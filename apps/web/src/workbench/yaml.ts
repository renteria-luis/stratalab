import { topologySchema, type Topology } from '@sim/engine';
import { isAlias, isNode, parseDocument, stringify, visit } from 'yaml';
import { z } from 'zod';
import type { MessageKey, MessageParams } from '../i18n/translate';
import type { CanvasLayout } from '../state/uiStore';

/**
 * YAML import and the editor draft (AGENTS.md, rule 6 and security): a size limit, the
 * YAML 1.2 core schema with no custom tags, unique keys, no tags, anchors or aliases at
 * all, then Zod. Only a valid result is committed; otherwise the problems are reported and
 * the last valid topology stays.
 */

export const YAML_LIMIT_KIB = 256;
const YAML_LIMIT_BYTES = YAML_LIMIT_KIB * 1024;

export interface YamlProblem {
  readonly key: MessageKey;
  readonly params: MessageParams;
  /** Character range in the text, when known. */
  readonly from?: number;
  readonly to?: number;
}

export type YamlParse =
  | {
      readonly ok: true;
      readonly topology: Topology;
      readonly layout: CanvasLayout | null;
      /** Some CIDRs were rewritten to canonical form (ADR-05). */
      readonly canonicalized: boolean;
    }
  | { readonly ok: false; readonly problems: readonly YamlProblem[] };

const layoutSchema = z.record(
  z.string().min(1).max(100),
  z.strictObject({ x: z.number(), y: z.number() }),
);

/** The YAML document of a topology, with an optional `layout` section the engine ignores. */
export function topologyToYaml(topology: Topology, layout: CanvasLayout): string {
  const document = Object.keys(layout).length === 0 ? topology : { ...topology, layout };
  return stringify(document, { lineWidth: 0 });
}

const CIDR_KEYS = new Set(['cidrBlock', 'destinationCidrBlock']);

function cidrValues(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) cidrValues(item, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (CIDR_KEYS.has(key) && typeof item === 'string') out.push(item);
      else cidrValues(item, out);
    }
  }
  return out;
}

export function parseTopologyYaml(text: string): YamlParse {
  if (new TextEncoder().encode(text).length > YAML_LIMIT_BYTES) {
    return { ok: false, problems: [{ key: 'yaml.tooLarge', params: { limit: YAML_LIMIT_KIB } }] };
  }
  const document = parseDocument(text, {
    version: '1.2',
    schema: 'core',
    customTags: [],
    merge: false,
    uniqueKeys: true,
    prettyErrors: false,
  });
  const problems: YamlProblem[] = document.errors.map((error) => ({
    key: 'yaml.syntax',
    params: { message: error.message.split('\n')[0] ?? error.code },
    from: error.pos[0],
    to: error.pos[1],
  }));
  visit(document, (_key, node) => {
    if (isAlias(node)) {
      problems.push({ key: 'yaml.alias', params: {}, from: node.range?.[0], to: node.range?.[1] });
    } else if (isNode(node)) {
      if (node.anchor !== undefined) {
        problems.push({
          key: 'yaml.alias',
          params: {},
          from: node.range?.[0],
          to: node.range?.[1],
        });
      }
      if (node.tag !== undefined) {
        problems.push({
          key: 'yaml.tag',
          params: { tag: node.tag },
          from: node.range?.[0],
          to: node.range?.[1],
        });
      }
    }
  });
  if (problems.length > 0) return { ok: false, problems };

  const value: unknown = document.toJS({ maxAliasCount: 0 });
  const { layout, ...rest } =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { layout: undefined };

  const layoutResult = layout === undefined ? null : layoutSchema.safeParse(layout);
  const parsed = topologySchema.safeParse(rest);
  const schemaProblems: YamlProblem[] = [];
  const rangeOf = (path: readonly PropertyKey[]) => {
    const node: unknown = document.getIn(
      path.filter((part) => typeof part !== 'symbol'),
      true,
    );
    return isNode(node) && node.range !== undefined && node.range !== null
      ? { from: node.range[0], to: node.range[1] }
      : {};
  };
  if (layoutResult !== null && !layoutResult.success) {
    for (const issue of layoutResult.error.issues) {
      schemaProblems.push({
        key: 'yaml.schema',
        params: { path: ['layout', ...issue.path.map(String)].join('.'), message: issue.message },
        ...rangeOf(['layout', ...issue.path]),
      });
    }
  }
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      schemaProblems.push({
        key: 'yaml.schema',
        params: { path: issue.path.map(String).join('.') || '(root)', message: issue.message },
        ...rangeOf(issue.path),
      });
    }
  }
  if (!parsed.success || schemaProblems.length > 0) return { ok: false, problems: schemaProblems };

  const before = cidrValues(rest);
  const after = cidrValues(parsed.data);
  return {
    ok: true,
    topology: parsed.data,
    layout: layoutResult?.success === true ? layoutResult.data : null,
    canonicalized: before.some((cidrText, index) => cidrText !== after[index]),
  };
}
