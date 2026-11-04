import type { InternetGateway, Topology } from '../schema';

/**
 * The internet gateway attached to a VPC, or null. A VPC has at most one; when a topology
 * attaches more (`IGW_MULTIPLE_ATTACHED`, which blocks traces), the first in array order wins.
 *
 * Rule: IGW-05 · https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html
 */
export function attachedInternetGateway(topology: Topology, vpcId: string): InternetGateway | null {
  return topology.internetGateways.find((igw) => igw.attachedVpcId === vpcId) ?? null;
}
