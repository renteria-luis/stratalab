/**
 * Reachability Analyzer explanation codes the simulator reuses, grouped by the verdict they
 * mean (TRC-02, TRC-04). A fixture code outside both lists fails the golden test until it is
 * added to the skill and here.
 *
 * Rules: TRC-04 · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 */
export const ROUTING_CODES = [
  'NO_ROUTE_TO_DESTINATION',
  'MORE_SPECIFIC_ROUTE',
  'HIGHER_PRIORITY_ROUTE',
  'BAD_STATE_ROUTE',
  'VPC_LOCAL_ROUTE_CIDR_RESTRICTION',
  'DISCONNECTED_VPCS',
  'IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS',
  'IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS',
  'IGW_DESTINATION_ADDRESS_NOT_IN_RFC1918_EGRESS',
  'IGW_DESTINATION_ADDRESS_NOT_IN_RFC6598_EGRESS',
  'IGW_SOURCE_ADDRESS_NOT_IN_RFC1918_INGRESS',
  'IGW_SOURCE_ADDRESS_NOT_IN_RFC6598_INGRESS',
  'NGW_REQUIRES_SOURCE_IN_VPC',
  'PCX_REQUIRES_ADDRESS_IN_VPC_CIDR',
  'VPCE_INTRA_VPC_TRAFFIC',
  'TGW_ATTACH_MISSING_TGW_RTB_ASSOCIATION',
  'TGW_RTB_NO_ROUTE_TO_TGW_ATTACHMENT',
  'TGW_ROUTE_AZ_RESTRICTION',
] as const;

export const FILTERING_CODES = [
  'SUBNET_ACL_RESTRICTION',
  'ENI_SG_RULES_MISMATCH',
  'SG_HAS_NO_RULES',
  'SG_REFERENCING_SUPPORT',
  'VPCE_GATEWAY_PROTOCOL_RESTRICTION',
] as const;

const ROUTING = new Set<string>(ROUTING_CODES);
const FILTERING = new Set<string>(FILTERING_CODES);

export const isRoutingCode = (code: string) => ROUTING.has(code);
export const isFilteringCode = (code: string) => FILTERING.has(code);
