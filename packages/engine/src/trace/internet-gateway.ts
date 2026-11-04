import { contains, mustParseIpv4, RFC1918_BLOCKS, RFC6598_BLOCK } from '../cidr';
import type { ReasonCode } from './types';

/**
 * The internet gateway drops inbound traffic from RFC 1918 or RFC 6598 sources. Query checks
 * reject those addresses first, so valid R0 queries never fail here.
 *
 * Rule: IGW-03 · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 */
export function ingressSourceProblem(sourceIp: string): ReasonCode | null {
  const address = mustParseIpv4(sourceIp);
  if (RFC1918_BLOCKS.some((block) => contains(block, address))) {
    return 'IGW_SOURCE_ADDRESS_NOT_IN_RFC1918_INGRESS';
  }
  if (contains(RFC6598_BLOCK, address)) return 'IGW_SOURCE_ADDRESS_NOT_IN_RFC6598_INGRESS';
  return null;
}

/**
 * The internet gateway drops outbound traffic to RFC 1918 or RFC 6598 destinations.
 *
 * Rule: IGW-03 · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 */
export function egressDestinationProblem(destinationIp: string): ReasonCode | null {
  const address = mustParseIpv4(destinationIp);
  if (RFC1918_BLOCKS.some((block) => contains(block, address))) {
    return 'IGW_DESTINATION_ADDRESS_NOT_IN_RFC1918_EGRESS';
  }
  if (contains(RFC6598_BLOCK, address)) return 'IGW_DESTINATION_ADDRESS_NOT_IN_RFC6598_EGRESS';
  return null;
}
