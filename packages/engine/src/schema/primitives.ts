import { z } from 'zod';
import { canonicalizeCidr, parseCidr, parseIpv4 } from '../cidr';

/** A dotted-quad IPv4 address (ADR-08: IPv4 only). */
export const ipv4Schema = z
  .string()
  .refine((value) => parseIpv4(value) !== null, { message: 'Expected an IPv4 address' });

/**
 * An IPv4 CIDR, stored in canonical form like the AWS API stores it (ADR-05).
 * Size limits are AWS rules, so `validate()` checks them, not the schema.
 */
export const cidrSchema = z
  .string()
  .refine((value) => parseCidr(value) !== null, { message: 'Expected an IPv4 CIDR' })
  .transform((value) => canonicalizeCidr(value) ?? value);

/** Fake AWS-style IDs: prefix, "-", then 1 to 17 lowercase hex characters (our convention). */
function idSchema(prefix: string) {
  return z.string().regex(new RegExp(`^${prefix}-[0-9a-f]{1,17}$`), {
    message: `Expected an ID like ${prefix}-0a1b2c3d`,
  });
}

export const vpcIdSchema = idSchema('vpc');
export const subnetIdSchema = idSchema('subnet');
export const routeTableIdSchema = idSchema('rtb');
export const internetGatewayIdSchema = idSchema('igw');
export const natGatewayIdSchema = idSchema('nat');
export const securityGroupIdSchema = idSchema('sg');
export const securityGroupRuleIdSchema = idSchema('sgr');
export const networkAclIdSchema = idSchema('acl');
export const instanceIdSchema = idSchema('i');
export const networkInterfaceIdSchema = idSchema('eni');

/** The Name tag; 255 characters is our limit. */
export const nameSchema = z.string().max(255);

export const portSchema = z.number().int().min(0).max(65535);

/** ICMP type or code; -1 means any (our representation). */
export const icmpNumberSchema = z.number().int().min(-1).max(255);
