import {
  findLeaks,
  goldenFixtureSchema,
  scenarioAllowList,
  scenarioHash,
  type ComponentType,
  type FixtureAnalysis,
  type FixtureComponent,
  type FixtureExplanation,
  type GoldenFixture,
  type GoldenScenario,
} from '@sim/engine/golden';
import type {
  RawAclRule,
  RawAnalysis,
  RawExplanation,
  RawPacketHeader,
  RawPathComponent,
  RawRouteTableRoute,
  RawSecurityGroupRule,
} from './aws/ports';
import type { IdMap } from './id-map';

/**
 * Raw Reachability Analyzer result → fixture analysis (docs/specs/p9-golden.md section 5.1).
 * Allow-list only: every field not listed here is dropped (ARNs, names, account IDs, Regions,
 * zones, dates, tags, path and analysis IDs, free text). Every resource ID goes through the ID
 * map; an ID that isn't in it stops the capture.
 */

const TYPE_BY_PREFIX: Readonly<Record<string, ComponentType>> = {
  vpc: 'vpc',
  subnet: 'subnet',
  rtb: 'route-table',
  igw: 'internet-gateway',
  sg: 'security-group',
  acl: 'network-acl',
  i: 'instance',
  eni: 'network-interface',
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Drops `undefined` values so fixtures and test expectations hold only real fields. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

class Normalizer {
  readonly problems: string[] = [];
  private readonly queryId: string;
  private readonly map: IdMap;
  constructor(queryId: string, map: IdMap) {
    this.queryId = queryId;
    this.map = map;
  }

  id(ref: { readonly Id?: string | undefined } | undefined, path: string): string | undefined {
    if (ref?.Id === undefined) return undefined;
    const mapped = this.map.ids.get(ref.Id);
    if (mapped === undefined) this.problems.push(`${this.queryId}: unknown ID at ${path}`);
    return mapped ?? '';
  }

  idValue(value: string | undefined, path: string): string | undefined {
    return value === undefined ? undefined : this.id({ Id: value }, path);
  }

  address(value: string): string {
    const [address = '', prefix] = value.split('/');
    const mapped = this.map.addresses.get(address);
    if (mapped === undefined) return value;
    return prefix === undefined ? mapped : `${mapped}/${prefix}`;
  }

  addresses(values: readonly string[] | undefined) {
    return values?.map((value) => this.address(value));
  }

  ports(
    ranges:
      | readonly { readonly From?: number | undefined; readonly To?: number | undefined }[]
      | undefined,
  ) {
    return ranges?.map((range) => ({ from: range.From ?? 0, to: range.To ?? 0 }));
  }

  port(
    range: { readonly From?: number | undefined; readonly To?: number | undefined } | undefined,
  ) {
    return range === undefined ? undefined : { from: range.From ?? 0, to: range.To ?? 0 };
  }

  aclRule(rule: RawAclRule | undefined) {
    if (rule === undefined) return undefined;
    return compact({
      cidr: rule.Cidr,
      egress: rule.Egress,
      portRange: this.port(rule.PortRange),
      protocol: rule.Protocol,
      ruleAction: rule.RuleAction,
      ruleNumber: rule.RuleNumber,
    });
  }

  securityGroupRule(rule: RawSecurityGroupRule | undefined, path: string) {
    if (rule === undefined) return undefined;
    if (rule.PrefixListId !== undefined)
      this.problems.push(`${this.queryId}: prefix list at ${path} isn't modeled`);
    return compact({
      cidr: rule.Cidr,
      direction: rule.Direction,
      securityGroupId: this.idValue(rule.SecurityGroupId, `${path}.securityGroupId`),
      portRange: this.port(rule.PortRange),
      protocol: rule.Protocol,
    });
  }

  route(route: RawRouteTableRoute | undefined, path: string) {
    if (route === undefined) return undefined;
    return compact({
      destinationCidr: route.DestinationCidr,
      gatewayId: this.idValue(route.GatewayId, `${path}.gatewayId`),
      origin: route.Origin,
      state: route.State,
    });
  }

  header(header: RawPacketHeader | undefined) {
    if (header === undefined) return undefined;
    return compact({
      protocol: header.Protocol,
      sourceAddresses: this.addresses(header.SourceAddresses),
      destinationAddresses: this.addresses(header.DestinationAddresses),
      sourcePortRanges: this.ports(header.SourcePortRanges),
      destinationPortRanges: this.ports(header.DestinationPortRanges),
    });
  }

  explanation(raw: RawExplanation, path: string): FixtureExplanation {
    const ref = (key: keyof RawExplanation, value: RawExplanation[keyof RawExplanation]) =>
      this.id(
        value as { Id?: string } | undefined,
        `${path}.${key.charAt(0).toLowerCase()}${key.slice(1)}`,
      );
    if (raw.ExplanationCode === undefined)
      this.problems.push(`${this.queryId}: explanation without a code at ${path}`);
    return compact({
      explanationCode: raw.ExplanationCode ?? '',
      direction: raw.Direction,
      component: ref('Component', raw.Component),
      acl: ref('Acl', raw.Acl),
      securityGroup: ref('SecurityGroup', raw.SecurityGroup),
      securityGroups: raw.SecurityGroups?.map(
        (group, index) => this.id(group, `${path}.securityGroups[${String(index)}]`) ?? '',
      ),
      routeTable: ref('RouteTable', raw.RouteTable),
      subnetRouteTable: ref('SubnetRouteTable', raw.SubnetRouteTable),
      subnet: ref('Subnet', raw.Subnet),
      vpc: ref('Vpc', raw.Vpc),
      internetGateway: ref('InternetGateway', raw.InternetGateway),
      networkInterface: ref('NetworkInterface', raw.NetworkInterface),
      destination: ref('Destination', raw.Destination),
      aclRule: this.aclRule(raw.AclRule),
      securityGroupRule: this.securityGroupRule(raw.SecurityGroupRule, `${path}.securityGroupRule`),
      routeTableRoute: this.route(raw.RouteTableRoute, `${path}.routeTableRoute`),
      address: raw.Address === undefined ? undefined : this.address(raw.Address),
      addresses: this.addresses(raw.Addresses),
      cidrs: raw.Cidrs === undefined ? undefined : [...raw.Cidrs],
      portRanges: this.ports(raw.PortRanges),
      protocols: raw.Protocols === undefined ? undefined : [...raw.Protocols],
      packetField: raw.PacketField,
      port: raw.Port,
      state: raw.State,
      missingComponent: raw.MissingComponent,
    });
  }

  component(raw: RawPathComponent, path: string): FixtureComponent {
    const id = this.id(raw.Component, `${path}.component`) ?? '';
    const type = TYPE_BY_PREFIX[id.split('-')[0] ?? ''];
    if (id !== '' && type === undefined)
      this.problems.push(`${this.queryId}: unsupported component ${id} at ${path}`);
    if (raw.Component?.Id === undefined)
      this.problems.push(`${this.queryId}: component without an ID at ${path}`);
    return compact({
      sequenceNumber: raw.SequenceNumber ?? 0,
      component: { id, type: type ?? 'vpc' },
      attachedTo: this.id(raw.AttachedTo, `${path}.attachedTo`),
      subnet: this.id(raw.Subnet, `${path}.subnet`),
      vpc: this.id(raw.Vpc, `${path}.vpc`),
      sourceVpc: this.id(raw.SourceVpc, `${path}.sourceVpc`),
      destinationVpc: this.id(raw.DestinationVpc, `${path}.destinationVpc`),
      aclRule: this.aclRule(raw.AclRule),
      securityGroupRule: this.securityGroupRule(raw.SecurityGroupRule, `${path}.securityGroupRule`),
      routeTableRoute: this.route(raw.RouteTableRoute, `${path}.routeTableRoute`),
      inboundHeader: this.header(raw.InboundHeader),
      outboundHeader: this.header(raw.OutboundHeader),
      explanations: raw.Explanations?.map((item, index) =>
        this.explanation(item, `${path}.explanations[${String(index)}]`),
      ),
      additionalDetails: raw.AdditionalDetails?.map((detail) => ({
        type: detail.AdditionalDetailType ?? '',
      })),
    });
  }
}

export type NormalizeResult =
  | { readonly ok: true; readonly analysis: FixtureAnalysis }
  | { readonly ok: false; readonly problems: string[] };

export function normalizeAnalysis(queryId: string, raw: RawAnalysis, map: IdMap): NormalizeResult {
  if (raw.Status !== 'succeeded') {
    return {
      ok: false,
      problems: [
        `${queryId}: analysis status is ${raw.Status ?? 'missing'} (${raw.StatusMessage ?? 'no message'})`,
      ],
    };
  }
  const normalizer = new Normalizer(queryId, map);
  const analysis: Mutable<FixtureAnalysis> = {
    queryId,
    status: 'succeeded',
    networkPathFound: raw.NetworkPathFound === true,
    forwardPathComponents: (raw.ForwardPathComponents ?? []).map((item, index) =>
      normalizer.component(item, `forwardPathComponents[${String(index)}]`),
    ),
    returnPathComponents: (raw.ReturnPathComponents ?? []).map((item, index) =>
      normalizer.component(item, `returnPathComponents[${String(index)}]`),
    ),
    explanations: (raw.Explanations ?? []).map((item, index) =>
      normalizer.explanation(item, `explanations[${String(index)}]`),
    ),
  };
  if (raw.NetworkPathFound === undefined)
    normalizer.problems.push(`${queryId}: NetworkPathFound is missing`);
  return normalizer.problems.length > 0
    ? { ok: false, problems: normalizer.problems }
    : { ok: true, analysis };
}

export type FixtureResult =
  | { readonly ok: true; readonly fixture: GoldenFixture; readonly json: string }
  | { readonly ok: false; readonly problems: string[] };

/** Assembles, validates and leak-checks the fixture (sections 5 and 5.2). */
export function finalizeFixture(
  scenario: GoldenScenario,
  analyses: readonly FixtureAnalysis[],
  capturedAt: string,
): FixtureResult {
  const candidate = {
    fixtureVersion: 1,
    scenarioId: scenario.id,
    scenarioHash: scenarioHash(scenario),
    capturedAt,
    region: scenario.topology.region,
    analyses,
  };
  const parsed = goldenFixtureSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) => `schema: ${issue.path.join('.')} ${issue.message}`,
      ),
    };
  }
  const leaks = findLeaks(parsed.data, scenarioAllowList(scenario));
  if (leaks.length > 0) return { ok: false, problems: leaks.map((path) => `leak at ${path}`) };
  return { ok: true, fixture: parsed.data, json: `${JSON.stringify(parsed.data, null, 2)}\n` };
}
