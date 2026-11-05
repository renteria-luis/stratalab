import { topologySchema, type TopologyInput } from '@sim/engine';
import { labSchema, type Lab } from '../schema';

/**
 * Lab 1 · Web server not reachable. Built on docs/specs/r0-engine.md section 3.9.
 *
 * Two stacked faults (docs/specs/p7-lab1.md):
 * 1. The `web` security group allows only TCP 443; the site is HTTP on port 80 (SG-02).
 * 2. `public-a` uses the main route table; `public-rt` has 0.0.0.0/0 → igw but no
 *    association, so replies to the internet have no route (RT-01, IGW-04).
 * A guard query keeps SSH (port 22, sshd running) closed to the internet, so opening all
 * traffic doesn't complete the lab.
 */

const CLIENT_IP = '198.51.100.7';
const PUBLIC_IP = '203.0.113.25';

function topology(fixed: boolean): TopologyInput {
  const allowAll = {
    ruleNumber: 100,
    protocol: 'all',
    cidrBlock: '0.0.0.0/0',
    action: 'allow',
  } as const;
  const webPort = fixed ? 80 : 443;
  return {
    schemaVersion: 1,
    region: 'us-east-1',
    vpcs: [
      {
        id: 'vpc-0a1b2c3d',
        name: 'lab-vpc',
        cidrBlock: '10.0.0.0/16',
        mainRouteTableId: 'rtb-00000001',
        defaultNetworkAclId: 'acl-00000001',
        defaultSecurityGroupId: 'sg-00000001',
      },
    ],
    subnets: [
      {
        id: 'subnet-0000000a',
        name: 'public-a',
        vpcId: 'vpc-0a1b2c3d',
        cidrBlock: '10.0.1.0/24',
        availabilityZone: 'us-east-1a',
        mapPublicIpOnLaunch: true,
        ...(fixed ? { routeTableId: 'rtb-00000002' } : {}),
      },
    ],
    routeTables: [
      { id: 'rtb-00000001', vpcId: 'vpc-0a1b2c3d', routes: [] },
      {
        id: 'rtb-00000002',
        name: 'public-rt',
        vpcId: 'vpc-0a1b2c3d',
        routes: [
          {
            destinationCidrBlock: '0.0.0.0/0',
            target: { type: 'internet-gateway', internetGatewayId: 'igw-0000000a' },
          },
        ],
      },
    ],
    internetGateways: [{ id: 'igw-0000000a', name: 'lab-igw', attachedVpcId: 'vpc-0a1b2c3d' }],
    securityGroups: [
      {
        id: 'sg-00000001',
        vpcId: 'vpc-0a1b2c3d',
        name: 'default',
        description: 'default VPC security group',
        inboundRules: [
          {
            id: 'sgr-00000001',
            protocol: 'all',
            peer: { type: 'security-group', securityGroupId: 'sg-00000001' },
          },
        ],
        outboundRules: [
          { id: 'sgr-00000002', protocol: 'all', peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
        ],
      },
      {
        id: 'sg-0000000a',
        vpcId: 'vpc-0a1b2c3d',
        name: 'web',
        description: fixed ? 'Allow HTTP' : 'Allow HTTPS',
        inboundRules: [
          {
            id: 'sgr-0000000a',
            protocol: 'tcp',
            fromPort: webPort,
            toPort: webPort,
            peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' },
          },
        ],
        outboundRules: [
          { id: 'sgr-0000000b', protocol: 'all', peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
        ],
      },
    ],
    networkAcls: [
      {
        id: 'acl-00000001',
        vpcId: 'vpc-0a1b2c3d',
        inboundEntries: [allowAll],
        outboundEntries: [allowAll],
      },
    ],
    instances: [
      {
        id: 'i-0000000a',
        name: 'web-1',
        platform: 'linux',
        primaryNetworkInterface: {
          id: 'eni-0000000a',
          subnetId: 'subnet-0000000a',
          privateIpAddress: '10.0.1.10',
          publicIp: { kind: 'auto-assigned', address: PUBLIC_IP },
          securityGroupIds: ['sg-0000000a'],
        },
        runningServices: [
          {
            protocol: 'tcp',
            port: 80,
            name: 'nginx',
            responseHtml:
              '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>It works</title></head><body><h1>It works</h1><p>Served by web-1.</p></body></html>',
          },
          { protocol: 'tcp', port: 22, name: 'sshd' },
        ],
      },
    ],
  };
}

const fromInternet = (destinationPort: number) =>
  ({
    protocol: 'tcp',
    source: { type: 'internet', ipAddress: CLIENT_IP },
    destination: { type: 'instance', instanceId: 'i-0000000a', address: 'public' },
    destinationPort,
  }) as const;

const sgDrop = {
  verdict: 'ROUTED_THEN_DROPPED',
  direction: 'forward',
  hopIndex: 2,
  reasonCodes: ['ENI_SG_RULES_MISMATCH'],
} as const;

export const lab01: Lab = labSchema.parse({
  id: 'lab-01',
  version: 1,
  title: { en: 'Web server not reachable', es: 'El servidor web no responde' },
  summary: {
    en: 'A web server in a public subnet does not answer from the internet.',
    es: 'Un servidor web en una subred pública no responde desde internet.',
  },
  story: {
    en: `Your team launched web-1, a web server in the subnet public-a of lab-vpc. Users report that http://${PUBLIC_IP} does not load. Find out why and fix it. Company policy: SSH (port 22) stays closed to the internet.`,
    es: `Tu equipo lanzó web-1, un servidor web en la subred public-a de lab-vpc. Los usuarios dicen que http://${PUBLIC_IP} no carga. Averigua por qué y arréglalo. Política de la empresa: SSH (puerto 22) sigue cerrado a internet.`,
  },
  goal: {
    en: `http://${PUBLIC_IP} loads from the internet, and SSH stays closed to the internet.`,
    es: `http://${PUBLIC_IP} carga desde internet, y SSH sigue cerrado a internet.`,
  },
  hints: [
    {
      en: 'Open the address in the workbench browser, then run a trace. It shows the hop where the packet stops.',
      es: 'Abre la dirección en el navegador del workbench y luego ejecuta una traza. Muestra el salto donde se detiene el paquete.',
    },
    {
      en: "Look at the inbound rules of web-1's security group. Which port does the site use?",
      es: 'Mira las reglas de entrada del grupo de seguridad de web-1. ¿Qué puerto usa el sitio?',
    },
    {
      en: 'Once the request gets in, the reply must leave the subnet. Which route table does public-a use, and does it route to the internet gateway?',
      es: 'Cuando la petición entra, la respuesta tiene que salir de la subred. ¿Qué tabla de rutas usa public-a, y tiene ruta al internet gateway?',
    },
    {
      en: 'public-a uses the main route table. Associate it with public-rt, which already routes 0.0.0.0/0 to the internet gateway.',
      es: 'public-a usa la tabla de rutas principal. Asóciala con public-rt, que ya envía 0.0.0.0/0 al internet gateway.',
    },
  ],
  initialTopology: topologySchema.parse(topology(false)),
  solutionTopology: topologySchema.parse(topology(true)),
  queries: [
    {
      id: 'web-reachable',
      label: {
        en: `Internet → web-1 (${PUBLIC_IP}) on TCP 80`,
        es: `Internet → web-1 (${PUBLIC_IP}) por TCP 80`,
      },
      query: fromInternet(80),
      mustStayBlocked: false,
      expected: { initial: sgDrop, solution: { verdict: 'REACHED' } },
    },
    {
      id: 'ssh-stays-closed',
      label: {
        en: `Internet → web-1 (${PUBLIC_IP}) on TCP 22 stays blocked`,
        es: `Internet → web-1 (${PUBLIC_IP}) por TCP 22 sigue bloqueado`,
      },
      query: fromInternet(22),
      mustStayBlocked: true,
      expected: { initial: sgDrop, solution: sgDrop },
    },
  ],
  relevantRoutes: [
    '/labs',
    '/vpc/your-vpcs',
    '/vpc/subnets',
    '/vpc/route-tables',
    '/vpc/internet-gateways',
    '/vpc/network-acls',
    '/vpc/security-groups',
    '/ec2/instances',
    '/ec2/security-groups',
  ],
  browserUrl: `http://${PUBLIC_IP}/`,
});
