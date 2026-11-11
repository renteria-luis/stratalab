import { topologySchema, validate, type Topology } from '@sim/engine';

/**
 * Stage plan (docs/specs/p9-golden.md section 2.5). `CreateRoute` takes only an internet
 * gateway attached to the VPC, a VPC has one attached gateway at a time, and a gateway can't
 * be detached while the VPC has public IPv4 addresses. So a route to a detached gateway is
 * built in three revisions of one stack: attach it and add its routes, detach it, then
 * deploy the final topology.
 *
 * Rules: RT-08, IGW-05, IGW-07 · https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateRoute.html ·
 * https://docs.aws.amazon.com/vpc/latest/userguide/delete-igw.html
 */

export interface Stage {
  readonly label: string;
  readonly topology: Topology;
}

export type StagePlan =
  | { readonly ok: true; readonly stages: readonly Stage[] }
  | {
      readonly ok: false;
      readonly errors: readonly {
        readonly code: 'GOLDEN_DETACHED_ROUTES' | 'GOLDEN_STAGE_INVALID';
        readonly message: string;
      }[];
    };

function clone(topology: Topology): Topology {
  return JSON.parse(JSON.stringify(topology)) as Topology;
}

export function planStages(topology: Topology): StagePlan {
  /** VPC ID → the detached gateway its route tables point to. */
  const routedDetached = new Map<string, Set<string>>();
  for (const table of topology.routeTables) {
    for (const route of table.routes) {
      const { target } = route;
      if (target.type !== 'internet-gateway') continue;
      const gateway = topology.internetGateways.find(
        (candidate) => candidate.id === target.internetGatewayId,
      );
      if (gateway === undefined || gateway.attachedVpcId === table.vpcId) continue;
      const set = routedDetached.get(table.vpcId) ?? new Set<string>();
      set.add(gateway.id);
      routedDetached.set(table.vpcId, set);
    }
  }
  if (routedDetached.size === 0) return { ok: true, stages: [{ label: 'final', topology }] };

  const errors = [...routedDetached]
    .filter(([, gateways]) => gateways.size > 1)
    .map(([vpcId, gateways]) => ({
      code: 'GOLDEN_DETACHED_ROUTES' as const,
      message: `${vpcId}: routes point to ${String(gateways.size)} detached gateways (${[...gateways].join(', ')}); only one per VPC can be staged`,
    }));
  if (errors.length > 0) return { ok: false, errors };

  const spareOf = new Map(
    [...routedDetached].map(([vpcId, gateways]) => [vpcId, [...gateways][0] ?? '']),
  );
  const spares = new Set(spareOf.values());

  const first = clone(topology);
  first.instances = [];
  const ownGateways = new Set<string>();
  for (const gateway of first.internetGateways) {
    if (gateway.attachedVpcId !== undefined && spareOf.has(gateway.attachedVpcId)) {
      ownGateways.add(gateway.id);
      delete gateway.attachedVpcId;
    }
  }
  for (const gateway of first.internetGateways) {
    for (const [vpcId, spare] of spareOf) if (gateway.id === spare) gateway.attachedVpcId = vpcId;
  }
  for (const table of first.routeTables) {
    table.routes = table.routes.filter(
      (route) =>
        route.target.type !== 'internet-gateway' ||
        !ownGateways.has(route.target.internetGatewayId),
    );
  }

  const second = clone(first);
  for (const gateway of second.internetGateways)
    if (spares.has(gateway.id)) delete gateway.attachedVpcId;

  const stages: Stage[] = [
    { label: 'attach the spare gateway and create its routes', topology: first },
    { label: 'detach the spare gateway, so its routes become blackhole', topology: second },
    { label: 'final', topology },
  ];
  for (const [index, stage] of stages.entries()) {
    const parsed = topologySchema.safeParse(stage.topology);
    const invalid =
      !parsed.success || validate(parsed.data).some((issue) => issue.severity === 'error');
    if (invalid) {
      return {
        ok: false,
        errors: [
          {
            code: 'GOLDEN_STAGE_INVALID',
            message: `stage ${String(index + 1)} isn't a valid topology`,
          },
        ],
      };
    }
  }
  return { ok: true, stages };
}
