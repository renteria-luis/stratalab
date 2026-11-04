import { z } from 'zod';
import {
  cidrSchema,
  icmpNumberSchema,
  instanceIdSchema,
  internetGatewayIdSchema,
  ipv4Schema,
  nameSchema,
  networkAclIdSchema,
  networkInterfaceIdSchema,
  portSchema,
  routeTableIdSchema,
  securityGroupIdSchema,
  securityGroupRuleIdSchema,
  subnetIdSchema,
  vpcIdSchema,
} from './primitives';
import { checkStructure } from './structure';

/**
 * R0 topology model: docs/specs/r0-engine.md section 3.
 * Objects are strict so YAML typos fail. Only shape is checked here; AWS rules between
 * resources are `validate()`'s job.
 */

const portRangeIsOrdered = (range: { fromPort: number; toPort: number }) =>
  range.fromPort <= range.toPort;
const portRangeError = { message: 'fromPort must not be greater than toPort', path: ['toPort'] };

export const vpcSchema = z.strictObject({
  id: vpcIdSchema,
  name: nameSchema.optional(),
  cidrBlock: cidrSchema, // ADR-01, ADR-05
  mainRouteTableId: routeTableIdSchema, // RT-01
  defaultNetworkAclId: networkAclIdSchema, // NACL-01, NACL-05
  defaultSecurityGroupId: securityGroupIdSchema, // SG-05
});

export const subnetSchema = z.strictObject({
  id: subnetIdSchema,
  name: nameSchema.optional(),
  vpcId: vpcIdSchema,
  cidrBlock: cidrSchema, // ADR-02, ADR-03, ADR-05
  availabilityZone: z.string().min(1),
  mapPublicIpOnLaunch: z.boolean().default(false), // ADR-10: only prefills the launch view
  routeTableId: routeTableIdSchema.optional(), // absent = implicit main association (RT-01)
  networkAclId: networkAclIdSchema.optional(), // absent = the VPC's default network ACL (NACL-01)
});

/** R0 has one target type. The local route is derived, so `type: local` is rejected (RT-03). */
const routeTargetSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('internet-gateway'),
    internetGatewayId: internetGatewayIdSchema,
  }),
]);

export const routeSchema = z.strictObject({
  destinationCidrBlock: cidrSchema, // RT-04, RT-11
  target: routeTargetSchema,
});

export const routeTableSchema = z.strictObject({
  id: routeTableIdSchema,
  name: nameSchema.optional(),
  vpcId: vpcIdSchema,
  routes: z.array(routeSchema),
});

export const internetGatewaySchema = z.strictObject({
  id: internetGatewayIdSchema,
  name: nameSchema.optional(),
  attachedVpcId: vpcIdSchema.optional(), // absent = detached (IGW-05)
});

/** SG-04: one source or destination per rule. Prefix lists are R1. */
const securityGroupPeerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('cidr'), cidrBlock: cidrSchema }),
  z.strictObject({ type: z.literal('security-group'), securityGroupId: securityGroupIdSchema }),
]);

const securityGroupRuleCommon = {
  id: securityGroupRuleIdSchema,
  peer: securityGroupPeerSchema,
  description: z.string().max(255).optional(),
};

/** SG-04: TCP and UDP need a port range, ICMP may name a type and code, "all" has neither. */
export const securityGroupRuleSchema = z.discriminatedUnion('protocol', [
  z
    .strictObject({
      ...securityGroupRuleCommon,
      protocol: z.enum(['tcp', 'udp']),
      fromPort: portSchema,
      toPort: portSchema,
    })
    .refine(portRangeIsOrdered, portRangeError),
  z.strictObject({
    ...securityGroupRuleCommon,
    protocol: z.literal('icmp'),
    icmpType: icmpNumberSchema.optional(),
    icmpCode: icmpNumberSchema.optional(),
  }),
  z.strictObject({ ...securityGroupRuleCommon, protocol: z.literal('all') }),
]);

export const securityGroupSchema = z.strictObject({
  id: securityGroupIdSchema,
  vpcId: vpcIdSchema,
  name: z.string(), // format rules are SG-06, checked by validate()
  description: z.string(),
  inboundRules: z.array(securityGroupRuleSchema),
  outboundRules: z.array(securityGroupRuleSchema),
});

const networkAclEntryCommon = {
  ruleNumber: z.number().int().min(1).max(32766), // NACL-02; the "*" entry is implicit
  cidrBlock: cidrSchema, // NACL-07: CIDRs only
  action: z.enum(['allow', 'deny']),
};

export const networkAclEntrySchema = z.discriminatedUnion('protocol', [
  z
    .strictObject({
      ...networkAclEntryCommon,
      protocol: z.enum(['tcp', 'udp']),
      fromPort: portSchema,
      toPort: portSchema,
    })
    .refine(portRangeIsOrdered, portRangeError),
  z.strictObject({
    ...networkAclEntryCommon,
    protocol: z.literal('icmp'),
    icmpType: icmpNumberSchema.optional(),
    icmpCode: icmpNumberSchema.optional(),
  }),
  z.strictObject({ ...networkAclEntryCommon, protocol: z.literal('all') }),
]);

export const networkAclSchema = z.strictObject({
  id: networkAclIdSchema,
  name: nameSchema.optional(),
  vpcId: vpcIdSchema,
  inboundEntries: z.array(networkAclEntrySchema),
  outboundEntries: z.array(networkAclEntrySchema),
});

export const networkInterfaceSchema = z.strictObject({
  id: networkInterfaceIdSchema,
  subnetId: subnetIdSchema,
  privateIpAddress: ipv4Schema, // ADR-04, ADR-09
  publicIp: z
    .strictObject({ kind: z.enum(['auto-assigned', 'elastic-ip']), address: ipv4Schema })
    .optional(), // ADR-10
  securityGroupIds: z.array(securityGroupIdSchema).min(1).max(16), // SG-03, SG-05, SG-07
});

export const runningServiceSchema = z.strictObject({
  protocol: z.literal('tcp'),
  port: z.number().int().min(1).max(65535),
  name: z.string().min(1).max(255),
  /** Rendered only inside <iframe sandbox srcdoc> without allow-scripts. Our limit. */
  responseHtml: z.string().max(65_536).optional(),
});

export const instanceSchema = z.strictObject({
  id: instanceIdSchema,
  name: nameSchema.optional(),
  platform: z.enum(['linux', 'windows']), // EPH-01
  primaryNetworkInterface: networkInterfaceSchema,
  runningServices: z.array(runningServiceSchema),
});

const topologyShapeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  region: z.string().min(1),
  vpcs: z.array(vpcSchema),
  subnets: z.array(subnetSchema),
  routeTables: z.array(routeTableSchema),
  internetGateways: z.array(internetGatewaySchema),
  securityGroups: z.array(securityGroupSchema),
  networkAcls: z.array(networkAclSchema),
  instances: z.array(instanceSchema),
});

/** Shape-valid topology before the structural checks. */
export type TopologyShape = z.output<typeof topologyShapeSchema>;

/**
 * The topology schema. After a successful parse every ID is unique and every reference
 * resolves, so the engine never fails on a lookup. The structural checks run only on a
 * shape-valid value.
 */
export const topologySchema = topologyShapeSchema.transform((topology, ctx) => {
  for (const issue of checkStructure(topology)) {
    ctx.addIssue({
      code: 'custom',
      message: issue.message,
      path: [...issue.path],
      params: { ...issue.params, code: issue.code },
      input: topology,
    });
  }
  return topology;
});

export type Topology = z.output<typeof topologySchema>;
export type TopologyInput = z.input<typeof topologySchema>;

export type Vpc = Topology['vpcs'][number];
export type Subnet = Topology['subnets'][number];
export type RouteTable = Topology['routeTables'][number];
export type Route = RouteTable['routes'][number];
export type InternetGateway = Topology['internetGateways'][number];
export type SecurityGroup = Topology['securityGroups'][number];
export type SecurityGroupRule = SecurityGroup['inboundRules'][number];
export type NetworkAcl = Topology['networkAcls'][number];
export type NetworkAclEntry = NetworkAcl['inboundEntries'][number];
export type Instance = Topology['instances'][number];
export type NetworkInterface = Instance['primaryNetworkInterface'];
export type RunningService = Instance['runningServices'][number];
