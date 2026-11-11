import { mustParseIpv4 } from '../cidr';
import { mustGet } from '../internal/lookup';
import { attachedInternetGateway, networkAclOf, routeTableOf, type Model } from '../model';
import type { Instance, NatGateway, NetworkInterface, Subnet, Vpc } from '../schema';
import {
  edgeIngressStep,
  hostStep,
  igwEgressStep,
  igwIngressStep,
  naclStep,
  natStep,
  routeStep,
  runFlow,
  sameSubnetNaclStep,
  sgStep,
  statefulSgStep,
} from './steps';
import type { EvaluatedTrace, Packet, TraceClient } from './types';

/** An instance with the resources around its primary network interface. */
export interface Endpoint {
  readonly instance: Instance;
  readonly networkInterface: NetworkInterface;
  readonly subnet: Subnet;
  readonly vpc: Vpc;
}

export function endpointOf(model: Model, instance: Instance): Endpoint {
  const networkInterface = instance.primaryNetworkInterface;
  const subnet = mustGet(model.subnets, networkInterface.subnetId);
  return { instance, networkInterface, subnet, vpc: mustGet(model.vpcs, subnet.vpcId) };
}

function tcp(
  sourceIp: string,
  sourcePort: number,
  destinationIp: string | null,
  destinationPort: number,
): Packet {
  return { protocol: 'tcp', sourceIp, sourcePort, destinationIp, destinationPort };
}

/**
 * F1 · internet client → instance, then the response (TRC-03, docs/specs/r0-engine.md 5.4).
 * Forward: internet gateway (no route lookup on arrival) → NACL inbound → security group
 * inbound → host. Return: security group (stateful) → NACL outbound to the client port →
 * route to the internet gateway (IGW-04) → internet gateway.
 *
 * Rules: TRC-01, TRC-02, TRC-03, IGW-01 to IGW-05, RT-02, RT-04, RT-08, NACL-01 to NACL-05,
 * SG-01 to SG-04, EPH-01, EPH-02 · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 */
export function traceF1(
  model: Model,
  plan: {
    clientIp: string;
    destination: Endpoint;
    address: 'public' | 'private';
    client: TraceClient;
    port: number;
  },
): EvaluatedTrace {
  const { clientIp, destination, address, client, port } = plan;
  const { instance, networkInterface, subnet, vpc } = destination;
  const privateIp = networkInterface.privateIpAddress;
  const publicIp = networkInterface.publicIp?.address ?? null;
  const clientPort = client.sourcePort;

  const arriving = tcp(clientIp, clientPort, address === 'public' ? publicIp : privateIp, port);
  const request = tcp(clientIp, clientPort, privateIp, port);
  const reply = tcp(privateIp, port, clientIp, clientPort);
  const igw = attachedInternetGateway(model.topology, vpc.id);
  const { acl } = networkAclOf(model, subnet);
  const { table } = routeTableOf(model, subnet);
  let egressGatewayId: string | null = null;

  return runFlow(
    'F1',
    client,
    [
      () =>
        edgeIngressStep({
          internetGatewayId: igw?.id ?? null,
          vpcId: vpc.id,
          packet: arriving,
          targetsPublicAddress: address === 'public',
          privateIp,
        }),
      () =>
        naclStep({
          step: 'nacl-inbound',
          subnet,
          acl,
          packet: request,
          remoteIp: clientIp,
          port,
          ruleIds: ['NACL-01', 'NACL-02', 'NACL-03', 'NACL-04', 'NACL-05'],
        }),
      () =>
        sgStep({
          step: 'sg-ingress',
          model,
          networkInterface,
          packet: request,
          remote: { ip: mustParseIpv4(clientIp), networkInterface: null },
          port,
          ruleIds: ['SG-02', 'SG-03', 'SG-04'],
        }),
      () => hostStep(instance, request, port),
    ],
    [
      () => statefulSgStep('sg-egress', networkInterface, reply),
      () =>
        naclStep({
          step: 'nacl-outbound',
          subnet,
          acl,
          packet: reply,
          remoteIp: clientIp,
          port: clientPort,
          ruleIds: ['NACL-03', 'EPH-01', 'EPH-02'],
        }),
      () => {
        const routed = routeStep({
          model,
          table,
          packet: reply,
          destinationIp: clientIp,
          expectedTarget: 'internet-gateway',
          ruleIds: ['RT-02', 'RT-04', 'RT-08', 'IGW-04'],
          fidelity: 'Inferred',
          // A reply sent to a NAT gateway: not documented, so not modeled (Q15).
          unsupportedNatRuleId: 'NAT-02',
        });
        egressGatewayId = routed.internetGatewayId;
        return routed.hop;
      },
      () =>
        igwEgressStep({
          // Set by the route step, which passes only with an internet gateway target.
          internetGatewayId: egressGatewayId ?? '',
          packet: reply,
          publicIp,
          ruleIds: ['IGW-01', 'IGW-03'],
        }),
    ],
  );
}

/**
 * F2 · instance → internet server, then the response (TRC-03, docs/specs/r0-engine.md 5.4).
 * Forward: security group outbound → NACL outbound → route → internet gateway.
 * Return: internet gateway → NACL inbound to the client port → security group (stateful).
 * The internet server is outside the model and always answers (Inferred).
 *
 * Rules: TRC-01, TRC-02, TRC-03, IGW-01, IGW-02, RT-02, RT-04, RT-08, NACL-02, NACL-03,
 * SG-01 to SG-03, EPH-01 · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 */
export function traceF2(
  model: Model,
  plan: { source: Endpoint; serverIp: string; client: TraceClient; port: number },
): EvaluatedTrace {
  const { source, serverIp, client, port } = plan;
  const { networkInterface, subnet } = source;
  const privateIp = networkInterface.privateIpAddress;
  const publicIp = networkInterface.publicIp?.address ?? null;
  const clientPort = client.sourcePort;

  const request = tcp(privateIp, clientPort, serverIp, port);
  const arriving = tcp(serverIp, port, publicIp, clientPort);
  const reply = tcp(serverIp, port, privateIp, clientPort);
  const { acl } = networkAclOf(model, subnet);
  const { table } = routeTableOf(model, subnet);
  let gatewayId: string | null = null;

  return runFlow(
    'F2',
    client,
    [
      () =>
        sgStep({
          step: 'sg-egress',
          model,
          networkInterface,
          packet: request,
          remote: { ip: mustParseIpv4(serverIp), networkInterface: null },
          port,
          ruleIds: ['SG-02', 'SG-03'],
        }),
      () =>
        naclStep({
          step: 'nacl-outbound',
          subnet,
          acl,
          packet: request,
          remoteIp: serverIp,
          port,
          ruleIds: ['NACL-02'],
        }),
      () => {
        const routed = routeStep({
          model,
          table,
          packet: request,
          destinationIp: serverIp,
          expectedTarget: 'internet-gateway',
          ruleIds: ['RT-02', 'RT-04', 'RT-08'],
          fidelity: 'Exact',
        });
        gatewayId = routed.internetGatewayId;
        return routed.hop;
      },
      () =>
        igwEgressStep({
          // Set by the route step, which passes only with an internet gateway target.
          internetGatewayId: gatewayId ?? '',
          packet: request,
          publicIp,
          ruleIds: ['IGW-01'],
        }),
    ],
    [
      () =>
        igwIngressStep({
          internetGatewayId: gatewayId ?? '',
          packet: arriving,
          privateIp,
          ruleIds: ['IGW-02'],
          fidelity: 'Inferred',
        }),
      () =>
        naclStep({
          step: 'nacl-inbound',
          subnet,
          acl,
          packet: reply,
          remoteIp: serverIp,
          port: clientPort,
          ruleIds: ['NACL-03', 'EPH-01'],
        }),
      () => statefulSgStep('sg-ingress', networkInterface, reply),
    ],
  );
}

/**
 * F0 · instance → instance in the same VPC by private address, then the response (TRC-03,
 * docs/specs/r0-engine.md 5.4). Network ACLs are skipped when both instances share a subnet
 * (NACL-04). Both directions use the local route (RT-03). Security group references can
 * match because the addresses are private (SG-04).
 *
 * Rules: TRC-01, TRC-02, TRC-03, RT-03, RT-04, NACL-02 to NACL-04, SG-01 to SG-04, EPH-02 ·
 * https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html
 */
export function traceF0(
  model: Model,
  plan: { source: Endpoint; destination: Endpoint; client: TraceClient; port: number },
): EvaluatedTrace {
  const { source, destination, client, port } = plan;
  const sourceIp = source.networkInterface.privateIpAddress;
  const destinationIp = destination.networkInterface.privateIpAddress;
  const clientPort = client.sourcePort;
  const sameSubnet = source.subnet.id === destination.subnet.id;

  const request = tcp(sourceIp, clientPort, destinationIp, port);
  const reply = tcp(destinationIp, port, sourceIp, clientPort);
  const sourceAcl = networkAclOf(model, source.subnet).acl;
  const destinationAcl = networkAclOf(model, destination.subnet).acl;

  const nacl = (
    step: 'nacl-inbound' | 'nacl-outbound',
    endpoint: Endpoint,
    packet: Packet,
    remoteIp: string,
    naclPort: number,
    ruleIds: Parameters<typeof naclStep>[0]['ruleIds'],
  ) => {
    if (sameSubnet) return sameSubnetNaclStep(step, endpoint.subnet, packet);
    const acl = endpoint === source ? sourceAcl : destinationAcl;
    return naclStep({
      step,
      subnet: endpoint.subnet,
      acl,
      packet,
      remoteIp,
      port: naclPort,
      ruleIds,
    });
  };
  const route = (endpoint: Endpoint, packet: Packet, toIp: string) =>
    routeStep({
      model,
      table: routeTableOf(model, endpoint.subnet).table,
      packet,
      destinationIp: toIp,
      expectedTarget: 'local',
      ruleIds: ['RT-03', 'RT-04'],
      fidelity: 'Exact',
    }).hop;

  return runFlow(
    'F0',
    client,
    [
      () =>
        sgStep({
          step: 'sg-egress',
          model,
          networkInterface: source.networkInterface,
          packet: request,
          remote: {
            ip: mustParseIpv4(destinationIp),
            networkInterface: destination.networkInterface,
          },
          port,
          ruleIds: ['SG-02', 'SG-03', 'SG-04'],
        }),
      () => nacl('nacl-outbound', source, request, destinationIp, port, ['NACL-02', 'NACL-04']),
      () => route(source, request, destinationIp),
      () => nacl('nacl-inbound', destination, request, sourceIp, port, ['NACL-02', 'NACL-04']),
      () =>
        sgStep({
          step: 'sg-ingress',
          model,
          networkInterface: destination.networkInterface,
          packet: request,
          remote: { ip: mustParseIpv4(sourceIp), networkInterface: source.networkInterface },
          port,
          ruleIds: ['SG-02', 'SG-03', 'SG-04'],
        }),
      () => hostStep(destination.instance, request, port),
    ],
    [
      () => statefulSgStep('sg-egress', destination.networkInterface, reply),
      () =>
        nacl('nacl-outbound', destination, reply, sourceIp, clientPort, [
          'NACL-02',
          'NACL-03',
          'NACL-04',
          'EPH-02',
        ]),
      () => route(destination, reply, sourceIp),
      () =>
        nacl('nacl-inbound', source, reply, destinationIp, clientPort, [
          'NACL-02',
          'NACL-03',
          'NACL-04',
        ]),
      () => statefulSgStep('sg-ingress', source.networkInterface, reply),
    ],
  );
}

/**
 * F3 · instance → internet server through a NAT gateway, then the response
 * (docs/specs/r1-nat-gateway.md section 4.2). Forward: security group outbound → NACL
 * outbound → route to the NAT gateway → NAT subnet NACL inbound → NAT gateway (source becomes
 * its private IP and NAT port) → NAT subnet NACL outbound → NAT subnet route to the internet
 * gateway → internet gateway (private IP → Elastic IP). Return: internet gateway → NAT subnet
 * NACL inbound to the NAT port → NAT gateway (back to the instance) → NAT subnet NACL outbound
 * to the client port → local route → NACL inbound → security group (stateful).
 * Network ACL hops between the instance and the NAT gateway are skipped when they share a
 * subnet (NACL-04). The order follows TRC-01, as in F1 and F2 (Inferred until Q7 for F3).
 *
 * Rules: TRC-01, TRC-02, NAT-01 to NAT-05, RT-02 to RT-05, RT-08, IGW-01 to IGW-03,
 * NACL-02 to NACL-04, SG-01 to SG-03, EPH-01, EPH-02 ·
 * https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html ·
 * https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html ·
 * https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 */
export function traceF3(
  model: Model,
  plan: {
    source: Endpoint;
    serverIp: string;
    client: TraceClient;
    port: number;
    nat: NatGateway;
    natPort: number;
  },
): EvaluatedTrace {
  const { source, serverIp, client, port, nat, natPort } = plan;
  const { networkInterface, subnet } = source;
  const privateIp = networkInterface.privateIpAddress;
  const clientPort = client.sourcePort;
  const natSubnet = mustGet(model.subnets, nat.subnetId);
  const sameSubnet = natSubnet.id === subnet.id;
  const sourceAcl = networkAclOf(model, subnet).acl;
  const natAcl = networkAclOf(model, natSubnet).acl;
  const sourceTable = routeTableOf(model, subnet).table;
  const natTable = routeTableOf(model, natSubnet).table;
  const natIp = nat.privateIpAddress;

  const request = tcp(privateIp, clientPort, serverIp, port);
  const fromNat = tcp(natIp, natPort, serverIp, port);
  const arriving = tcp(serverIp, port, nat.elasticIpAddress, natPort);
  const replyToNat = tcp(serverIp, port, natIp, natPort);
  const reply = tcp(serverIp, port, privateIp, clientPort);
  let gatewayId: string | null = null;

  /** A NACL hop between the instance and the NAT gateway (NACL-04). */
  const innerNacl = (
    step: 'nacl-inbound' | 'nacl-outbound',
    naclSubnet: Subnet,
    packet: Packet,
    remoteIp: string,
    naclPort: number,
    ruleIds: Parameters<typeof naclStep>[0]['ruleIds'],
  ) => {
    if (sameSubnet) return sameSubnetNaclStep(step, naclSubnet, packet);
    const acl = naclSubnet.id === subnet.id ? sourceAcl : natAcl;
    return naclStep({ step, subnet: naclSubnet, acl, packet, remoteIp, port: naclPort, ruleIds });
  };

  return runFlow(
    'F3',
    client,
    [
      () =>
        sgStep({
          step: 'sg-egress',
          model,
          networkInterface,
          packet: request,
          remote: { ip: mustParseIpv4(serverIp), networkInterface: null },
          port,
          ruleIds: ['SG-02', 'SG-03'],
        }),
      () => innerNacl('nacl-outbound', subnet, request, serverIp, port, ['NACL-02', 'NACL-04']),
      () =>
        routeStep({
          model,
          table: sourceTable,
          packet: request,
          destinationIp: serverIp,
          expectedTarget: 'nat-gateway',
          ruleIds: ['RT-02', 'RT-04', 'RT-05'],
          fidelity: 'Exact',
        }).hop,
      () => innerNacl('nacl-inbound', natSubnet, request, privateIp, port, ['NACL-02', 'NAT-05']),
      () =>
        natStep({
          natGatewayId: nat.id,
          packet: request,
          translatedTo: fromNat,
          ruleIds: ['NAT-03', 'NAT-04', 'NAT-05'],
        }),
      () =>
        naclStep({
          step: 'nacl-outbound',
          subnet: natSubnet,
          acl: natAcl,
          packet: fromNat,
          remoteIp: serverIp,
          port,
          ruleIds: ['NACL-02', 'NAT-05'],
        }),
      () => {
        const routed = routeStep({
          model,
          table: natTable,
          packet: fromNat,
          destinationIp: serverIp,
          expectedTarget: 'internet-gateway',
          ruleIds: ['RT-04', 'RT-08', 'NAT-01'],
          fidelity: 'Exact',
          // The NAT gateway's subnet sends the packet to a NAT gateway again (Q16).
          unsupportedNatRuleId: 'NAT-01',
        });
        gatewayId = routed.internetGatewayId;
        return routed.hop;
      },
      () =>
        igwEgressStep({
          // Set by the route step, which passes only with an internet gateway target.
          internetGatewayId: gatewayId ?? '',
          packet: fromNat,
          publicIp: nat.elasticIpAddress,
          ruleIds: ['IGW-01', 'IGW-03', 'NAT-04'],
        }),
    ],
    [
      () =>
        igwIngressStep({
          internetGatewayId: gatewayId ?? '',
          packet: arriving,
          privateIp: natIp,
          ruleIds: ['IGW-02', 'RT-02'],
          fidelity: 'Inferred',
        }),
      () =>
        naclStep({
          step: 'nacl-inbound',
          subnet: natSubnet,
          acl: natAcl,
          packet: replyToNat,
          remoteIp: serverIp,
          port: natPort,
          ruleIds: ['NAT-04', 'NAT-05', 'EPH-01'],
        }),
      () =>
        natStep({
          natGatewayId: nat.id,
          packet: replyToNat,
          translatedTo: reply,
          ruleIds: ['NAT-02', 'NAT-04'],
        }),
      () =>
        innerNacl('nacl-outbound', natSubnet, reply, privateIp, clientPort, [
          'NACL-03',
          'NAT-05',
          'EPH-02',
        ]),
      () =>
        routeStep({
          model,
          table: natTable,
          packet: reply,
          destinationIp: privateIp,
          expectedTarget: 'local',
          ruleIds: ['RT-03'],
          // The docs don't list this lookup; it follows TRC-01 (r1-nat-gateway.md 4.2).
          fidelity: 'Inferred',
        }).hop,
      () => innerNacl('nacl-inbound', subnet, reply, serverIp, clientPort, ['NACL-03', 'EPH-01']),
      () => statefulSgStep('sg-ingress', networkInterface, reply),
    ],
  );
}
