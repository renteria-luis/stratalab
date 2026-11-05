import { deriveStatus, trace, type Topology } from '@sim/engine';
import { lab01 } from '@sim/labs';
import { describe, expect, it } from 'vitest';
import { hopNodeId, layoutTopology, nodeCenters, INTERNET_NODE_ID } from '../src/canvas/layout';
import { resolveBrowserAddress } from '../src/workbench/browserAddress';
import { parseTopologyYaml, topologyToYaml, YAML_LIMIT_KIB } from '../src/workbench/yaml';

const solution: Topology = lab01.solutionTopology;

describe('YAML editor parsing', () => {
  it('YAML: export then import gives the same topology and layout', () => {
    const text = topologyToYaml(solution, { 'i-0000000a': { x: 10, y: 20 } });
    const parsed = parseTopologyYaml(text);
    expect(parsed).toMatchObject({
      ok: true,
      topology: solution,
      layout: { 'i-0000000a': { x: 10, y: 20 } },
    });
  });

  it.each([
    ['an explicit tag', 'schemaVersion: !!int 1', 'yaml.tag'],
    ['a custom tag', 'region: !custom us-east-1', 'yaml.tag'],
    ['an anchor and alias', 'a: &x 1\nb: *x', 'yaml.alias'],
    ['a duplicate key', 'region: a\nregion: b', 'yaml.syntax'],
  ])('YAML: %s is rejected before Zod', (_name, text, key) => {
    const parsed = parseTopologyYaml(text);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.problems.map((problem) => problem.key)).toContain(key);
  });

  it('YAML: a document over the size limit is rejected', () => {
    const parsed = parseTopologyYaml(`# ${'x'.repeat(YAML_LIMIT_KIB * 1024)}`);
    expect(parsed.ok ? null : parsed.problems[0]?.key).toBe('yaml.tooLarge');
  });

  it('SCHEMA: schema problems point at the offending text', () => {
    const text = topologyToYaml(solution, {}).replace(
      'cidrBlock: 10.0.0.0/16',
      'cidrBlock: 10.0.0.0/99',
    );
    const parsed = parseTopologyYaml(text);
    if (parsed.ok) throw new Error('Expected a schema problem');
    const problem = parsed.problems.find((candidate) =>
      String(candidate.params.path).includes('cidrBlock'),
    );
    expect(problem?.key).toBe('yaml.schema');
    expect(text.slice(problem?.from, problem?.to)).toBe('10.0.0.0/99');
  });

  it('ADR-05: a non-canonical CIDR is stored in canonical form and reported', () => {
    const text = topologyToYaml(solution, {}).replace(
      'cidrBlock: 10.0.1.0/24',
      'cidrBlock: 10.0.1.7/24',
    );
    const parsed = parseTopologyYaml(text);
    expect(parsed).toMatchObject({ ok: true, canonicalized: true });
    expect(parsed.ok ? parsed.topology.subnets[0]?.cidrBlock : null).toBe('10.0.1.0/24');
  });
});

describe('virtual browser addresses', () => {
  it('BROWSER: http and https addresses of instance IPs resolve, with default ports', () => {
    expect(resolveBrowserAddress('http://203.0.113.25/', solution)).toMatchObject({
      kind: 'target',
      target: { address: 'public', port: 80 },
    });
    expect(resolveBrowserAddress('https://203.0.113.25', solution)).toMatchObject({
      target: { port: 443 },
    });
    expect(resolveBrowserAddress('http://10.0.1.10:8080', solution)).toMatchObject({
      target: { address: 'private', port: 8080 },
    });
  });

  it('BROWSER: names, other hosts and bad ports are not resolved', () => {
    expect(resolveBrowserAddress('http://example.com', solution).kind).toBe('bad-address');
    expect(resolveBrowserAddress('http://203.0.113.99', solution).kind).toBe('unknown-host');
    expect(resolveBrowserAddress('http://203.0.113.25:70000', solution).kind).toBe('bad-address');
    expect(resolveBrowserAddress('ftp://203.0.113.25', solution).kind).toBe('bad-address');
  });
});

describe('diagram layout', () => {
  it('CANVAS: the layout is deterministic and children sit inside their parents', () => {
    const nodes = layoutTopology(solution);
    expect(layoutTopology(solution)).toEqual(nodes);
    expect(nodes.map((node) => [node.id, node.kind, node.parentId])).toEqual([
      [INTERNET_NODE_ID, 'internet', undefined],
      ['vpc-0a1b2c3d', 'vpc', undefined],
      ['subnet-0000000a', 'subnet', 'vpc-0a1b2c3d'],
      ['i-0000000a', 'instance', 'subnet-0000000a'],
      ['igw-0000000a', 'igw', undefined],
    ]);
  });

  it('CANVAS: moved positions replace the computed ones', () => {
    const nodes = layoutTopology(solution, { 'igw-0000000a': { x: 5, y: 6 } });
    expect(nodes.find((node) => node.id === 'igw-0000000a')?.position).toEqual({ x: 5, y: 6 });
    expect(nodeCenters(nodes).get('igw-0000000a')).toEqual({ x: 5 + 65, y: 6 + 48 });
  });

  it('TRC-03: every F1 hop maps to the gateway, subnet or instance it happens at', () => {
    const query = lab01.queries[0]?.query;
    if (query === undefined) throw new Error('Lab 1 has a query');
    const result = trace(solution, query);
    if (result.status !== 'evaluated') throw new Error('Expected an evaluated trace');
    const status = deriveStatus(solution);
    expect(result.hops.map((hop) => hopNodeId(hop, query, solution, status))).toEqual([
      'igw-0000000a',
      'subnet-0000000a',
      'i-0000000a',
      'i-0000000a',
      'i-0000000a',
      'subnet-0000000a',
      'subnet-0000000a',
      'igw-0000000a',
    ]);
  });
});
