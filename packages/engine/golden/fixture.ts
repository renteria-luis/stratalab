import { z } from 'zod';

/**
 * Golden fixture: normalized Reachability Analyzer results for one scenario
 * (docs/specs/p9-golden.md section 5). Written only by `pnpm golden:capture`; the same strict
 * schema checks it before writing and when the golden test loads it. Every resource ID is a
 * scenario ID and every address comes from the scenario (the leak check enforces it).
 */

const portRange = z.strictObject({ from: z.number().int(), to: z.number().int() });

const aclRule = z.strictObject({
  cidr: z.string().optional(),
  egress: z.boolean().optional(),
  portRange: portRange.optional(),
  protocol: z.string().optional(),
  ruleAction: z.string().optional(),
  ruleNumber: z.number().int().optional(),
});

const securityGroupRule = z.strictObject({
  cidr: z.string().optional(),
  direction: z.string().optional(),
  securityGroupId: z.string().optional(),
  portRange: portRange.optional(),
  protocol: z.string().optional(),
});

const routeTableRoute = z.strictObject({
  destinationCidr: z.string().optional(),
  gatewayId: z.string().optional(),
  origin: z.string().optional(),
  state: z.string().optional(),
});

const packetHeader = z.strictObject({
  protocol: z.string().optional(),
  sourceAddresses: z.array(z.string()).optional(),
  destinationAddresses: z.array(z.string()).optional(),
  sourcePortRanges: z.array(portRange).optional(),
  destinationPortRanges: z.array(portRange).optional(),
});

export const COMPONENT_TYPES = [
  'vpc',
  'subnet',
  'route-table',
  'internet-gateway',
  'security-group',
  'network-acl',
  'instance',
  'network-interface',
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const fixtureExplanationSchema = z.strictObject({
  explanationCode: z.string().min(1),
  direction: z.string().optional(),
  component: z.string().optional(),
  acl: z.string().optional(),
  securityGroup: z.string().optional(),
  securityGroups: z.array(z.string()).optional(),
  routeTable: z.string().optional(),
  subnetRouteTable: z.string().optional(),
  subnet: z.string().optional(),
  vpc: z.string().optional(),
  internetGateway: z.string().optional(),
  networkInterface: z.string().optional(),
  destination: z.string().optional(),
  aclRule: aclRule.optional(),
  securityGroupRule: securityGroupRule.optional(),
  routeTableRoute: routeTableRoute.optional(),
  address: z.string().optional(),
  addresses: z.array(z.string()).optional(),
  cidrs: z.array(z.string()).optional(),
  portRanges: z.array(portRange).optional(),
  protocols: z.array(z.string()).optional(),
  packetField: z.string().optional(),
  port: z.number().int().optional(),
  state: z.string().optional(),
  missingComponent: z.string().optional(),
});

export const fixtureComponentSchema = z.strictObject({
  sequenceNumber: z.number().int(),
  component: z.strictObject({ id: z.string(), type: z.enum(COMPONENT_TYPES) }),
  attachedTo: z.string().optional(),
  subnet: z.string().optional(),
  vpc: z.string().optional(),
  sourceVpc: z.string().optional(),
  destinationVpc: z.string().optional(),
  aclRule: aclRule.optional(),
  securityGroupRule: securityGroupRule.optional(),
  routeTableRoute: routeTableRoute.optional(),
  inboundHeader: packetHeader.optional(),
  outboundHeader: packetHeader.optional(),
  explanations: z.array(fixtureExplanationSchema).optional(),
  additionalDetails: z.array(z.strictObject({ type: z.string() })).optional(),
});

export const fixtureAnalysisSchema = z.strictObject({
  queryId: z.string(),
  status: z.literal('succeeded'),
  networkPathFound: z.boolean(),
  forwardPathComponents: z.array(fixtureComponentSchema),
  returnPathComponents: z.array(fixtureComponentSchema),
  /** Analysis-level explanations: the codes the golden test compares. */
  explanations: z.array(fixtureExplanationSchema),
});

export const goldenFixtureSchema = z.strictObject({
  fixtureVersion: z.literal(1),
  scenarioId: z.string(),
  scenarioHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  region: z.string().min(1),
  analyses: z.array(fixtureAnalysisSchema),
});

export type FixtureExplanation = z.output<typeof fixtureExplanationSchema>;
export type FixtureComponent = z.output<typeof fixtureComponentSchema>;
export type FixtureAnalysis = z.output<typeof fixtureAnalysisSchema>;
export type GoldenFixture = z.output<typeof goldenFixtureSchema>;
