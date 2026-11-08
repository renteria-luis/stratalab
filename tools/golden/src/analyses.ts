import type { GoldenQuery, GoldenScenario } from '@sim/engine/golden';
import type { PathRequest } from './aws/ports';

/**
 * Query → `CreateNetworkInsightsPath` input, mapping version 1 (docs/specs/p9-golden.md
 * section 2.2). The internet side is always the internet gateway attached to the instance's
 * VPC, because a gateway can't be an intermediate component (TRC-06). Ports go in
 * `FilterAtSource`, which excludes the `SourceIp` and `DestinationPort` parameters.
 *
 * Rules: TRC-06, EPH-02 · https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateNetworkInsightsPath.html ·
 * https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_PathRequestFilter.html
 */

const single = (port: number) => ({ FromPort: port, ToPort: port });

function gatewayFor(scenario: GoldenScenario, instanceId: string): string {
  const { topology } = scenario;
  const instance = topology.instances.find((candidate) => candidate.id === instanceId);
  const subnet = topology.subnets.find(
    (candidate) => candidate.id === instance?.primaryNetworkInterface.subnetId,
  );
  const gateway = topology.internetGateways.find(
    (candidate) => candidate.attachedVpcId === subnet?.vpcId,
  );
  if (gateway === undefined)
    throw new Error(
      `GOLDEN_QUERY_SHAPE: ${instanceId} has no internet gateway attached to its VPC`,
    );
  return gateway.id;
}

/** `resolve` turns a scenario ID into the ID to send (identity for the dry run). */
export function pathRequest(
  scenario: GoldenScenario,
  query: GoldenQuery,
  resolve: (scenarioId: string) => string,
): PathRequest {
  const { source, destination, destinationPort, sourcePort } = query.query;
  if (
    source.type === 'internet' &&
    destination.type === 'instance' &&
    destination.address === 'public'
  ) {
    return {
      Source: resolve(gatewayFor(scenario, destination.instanceId)),
      Destination: resolve(destination.instanceId),
      Protocol: 'tcp',
      FilterAtSource: {
        SourceAddress: source.ipAddress,
        SourcePortRange: single(sourcePort),
        DestinationPortRange: single(destinationPort),
      },
    };
  }
  if (source.type === 'instance' && destination.type === 'internet') {
    return {
      Source: resolve(source.instanceId),
      Destination: resolve(gatewayFor(scenario, source.instanceId)),
      Protocol: 'tcp',
      FilterAtSource: {
        SourcePortRange: single(sourcePort),
        DestinationAddress: destination.ipAddress,
        DestinationPortRange: single(destinationPort),
      },
    };
  }
  throw new Error(
    `GOLDEN_QUERY_SHAPE: ${query.id} is neither internet → instance public nor instance → internet`,
  );
}
