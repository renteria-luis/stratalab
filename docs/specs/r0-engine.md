# R0 engine spec

Status: draft, waiting for review · Date: 2026-11-04 (sections 3.8, 3.10 and 8.5 added for P7) · Package: `packages/engine`
Rules: `.claude/skills/aws-network-rules` (R0 rules re-verified 2026-11-04, see section 10).

This spec defines the R0 topology schema, `validate()`, `trace()` and `deriveStatus()`.
Type blocks below are notation for the Zod schema and the result types, not code to copy.

## 1. Scope

In R0:

- VPC (one IPv4 CIDR), subnet, route table (main and custom), route, internet gateway.
- Security group and rules, network ACL and entries.
- EC2 instance with one primary network interface, an optional public IPv4 address and running TCP services.
- Trace flows F0, F1 and F2 (TRC-03), TCP only, both directions.

Everything else is listed in section 9 (Unsupported) and can't be expressed in the R0 schema.

## 2. Conventions

- IPv4 only (ADR-08). Every CIDR is stored in canonical form: the schema normalizes `10.0.1.7/24` to `10.0.1.0/24`, as the AWS API does (ADR-05). The YAML editor compares input and parsed output and shows the ADR-05 notice.
- IDs are fake and look like AWS IDs: a prefix, `-`, then 1 to 17 lowercase hex characters (`vpc-0a1b2c3d`). Prefixes: `vpc`, `subnet`, `rtb`, `igw`, `sg`, `sgr`, `acl`, `i`, `eni`. This format is our convention.
- `name` is the Name tag: optional, up to 255 characters (our limit).
- Objects are strict: unknown keys are schema errors, so YAML typos fail loudly.
- Arrays keep the user's order. Every output (issues, hops, status maps) follows topology array order, so the same input always gives the same output (TRC-05).
- Example addresses use the RFC 5737 documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24), so no fixture names a real host.
- The engine returns codes and parameters, never user-facing text. The UI translates `issue.<code>` and `reason.<code>` through i18n.

### Two layers of checks

| Layer                         | Checks                                                                                                                                     | On failure                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zod schema (`topologySchema`) | Shape, types, enums, number ranges, IPv4 and CIDR syntax, canonical CIDR, unique IDs, references to existing IDs, per-protocol port fields | The YAML draft isn't committed (AGENTS rule 6). Structural codes: `DUPLICATE_ID`, `UNKNOWN_REFERENCE`, `DUPLICATE_SERVICE_PORT`, `AZ_NOT_IN_REGION`. |
| `validate(topology)`          | AWS rules between resources (section 4)                                                                                                    | Returns `Issue[]`. Errors block `trace()`; warnings don't.                                                                                           |

After a successful parse every ID lookup succeeds, so the engine never crashes on a dangling reference.

## 3. Topology schema

```ts
type Topology = {
  schemaVersion: 1;
  region: string; // "us-east-1"; only used for the AZ check
  vpcs: Vpc[];
  subnets: Subnet[];
  routeTables: RouteTable[];
  internetGateways: InternetGateway[];
  securityGroups: SecurityGroup[];
  networkAcls: NetworkAcl[];
  instances: Instance[];
};
```

The YAML document owned by `apps/web` is this object plus an optional `layout` section. The web layer removes `layout` before parsing; the engine never sees it (AGENTS rule 5).

### 3.1 VPC

```ts
type Vpc = {
  id: VpcId;
  name?: string;
  cidrBlock: Ipv4Cidr; // ADR-01, ADR-05
  mainRouteTableId: RouteTableId; // RT-01
  defaultNetworkAclId: NetworkAclId; // NACL-01, NACL-05
  defaultSecurityGroupId: SecurityGroupId; // SG-05
};
```

### 3.2 Subnet

```ts
type Subnet = {
  id: SubnetId;
  name?: string;
  vpcId: VpcId;
  cidrBlock: Ipv4Cidr; // ADR-02, ADR-03, ADR-05
  availabilityZone: string; // must start with `region`; no effect on traces in R0
  mapPublicIpOnLaunch: boolean; // ADR-10; default false; only prefills the launch view
  routeTableId?: RouteTableId; // explicit association; absent = implicit main (RT-01)
  networkAclId?: NetworkAclId; // absent = the VPC's default network ACL (NACL-01)
};
```

A subnet can be explicitly associated with the main route table (`routeTableId` equal to `vpc.mainRouteTableId`); `deriveStatus` reports that as `explicit`.

### 3.3 Route table and route

```ts
type RouteTable = {
  id: RouteTableId;
  name?: string;
  vpcId: VpcId;
  routes: Route[]; // the local route is derived, never stored (RT-03)
};

type Route = {
  destinationCidrBlock: Ipv4Cidr; // RT-04, RT-11
  target: { type: 'internet-gateway'; internetGatewayId: InternetGatewayId };
};
```

- The local route (VPC CIDR → `local`) exists in every route table. It is shown by `deriveStatus` and the console, omitted from YAML, and a stored route with `type: local` is a schema error.
- Whether a table is the main one comes from `vpc.mainRouteTableId`, so a VPC always has exactly one main table (RT-01).
- R1 adds targets (`nat-gateway`, gateway endpoint with a prefix-list destination) to the `target` union.

### 3.4 Internet gateway

```ts
type InternetGateway = {
  id: InternetGatewayId;
  name?: string;
  attachedVpcId?: VpcId; // absent = detached (IGW-05)
};
```

### 3.5 Security group

```ts
type SecurityGroup = {
  id: SecurityGroupId;
  vpcId: VpcId;
  name: string; // SG-06
  description: string; // SG-06
  inboundRules: SgRule[];
  outboundRules: SgRule[];
};

type SgRule = {
  id: SgRuleId; // "sgr-…"
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  fromPort?: number; // tcp, udp: required, 0..65535, fromPort <= toPort
  toPort?: number;
  icmpType?: number; // icmp only; -1 = any (our representation)
  icmpCode?: number;
  peer:
    | { type: 'cidr'; cidrBlock: Ipv4Cidr } // SG-04
    | { type: 'security-group'; securityGroupId: SecurityGroupId }; // SG-04
  description?: string; // up to 255 characters (SG-04)
};
```

UDP and ICMP rules are stored and shown, but R0 traces are TCP only, so they never match a trace.

### 3.6 Network ACL

```ts
type NetworkAcl = {
  id: NetworkAclId;
  name?: string;
  vpcId: VpcId;
  inboundEntries: NaclEntry[]; // numbered entries only; the `*` DENY entry is implicit (NACL-02)
  outboundEntries: NaclEntry[];
};

type NaclEntry = {
  ruleNumber: number; // 1..32766 (NACL-02), unique per direction (NACL-08)
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  fromPort?: number; // tcp, udp: required, 0..65535
  toPort?: number;
  icmpType?: number; // icmp only; -1 = any
  icmpCode?: number;
  cidrBlock: Ipv4Cidr; // CIDRs only, no prefix lists (NACL-07)
  action: 'allow' | 'deny';
};
```

### 3.7 Instance

```ts
type Instance = {
  id: InstanceId;
  name?: string;
  platform: 'linux' | 'windows'; // sets the client port range when it starts a connection (EPH-01)
  primaryNetworkInterface: {
    id: NetworkInterfaceId; // "eni-…"
    subnetId: SubnetId;
    privateIpAddress: Ipv4; // ADR-04, ADR-09
    publicIp?: { kind: 'auto-assigned' | 'elastic-ip'; address: Ipv4 }; // ADR-10
    securityGroupIds: SecurityGroupId[]; // 1..16 (SG-03, SG-05, SG-07)
  };
  runningServices: RunningService[]; // unique by port
};

type RunningService = {
  protocol: 'tcp';
  port: number; // 1..65535
  name: string; // "nginx"
  responseHtml?: string; // up to 65,536 characters (our limit); shown only in <iframe sandbox srcdoc>
};
```

- Every R0 instance is `running`. Stop and start are Unsupported (ADR-10).
- The engine never reads `responseHtml`; the virtual browser renders it in a sandboxed iframe without `allow-scripts`.

### 3.8 What the creation helpers set

The schema doesn't create defaults. Pure functions in `packages/engine/src/helpers` build the AWS defaults (this section) and apply console edits (section 3.10). Each one takes a parsed `Topology`, never mutates it, and returns a new one:

```ts
type HelperResult<T> =
  | { ok: true; topology: Topology; created: T } // created: the new IDs, e.g. { vpcId, mainRouteTableId, … }
  | { ok: false; error: HelperError };

type HelperError = {
  code: HelperErrorCode; // translated by the UI as `helper.<code>`
  ruleIds: RuleId[];
  params: Record<string, string | number>;
  issues?: { path: (string | number)[]; message: string }[]; // INVALID_INPUT only
};
```

- Helpers build the candidate as `TopologyInput` and parse it with `topologySchema`, so CIDRs are stored in canonical form (ADR-05). A parse failure returns `INVALID_INPUT`; forms check fields first, so this is a safety net.
- Helpers check only what `validate()` can't see: lookups and state changes (codes below). AWS rules between resources stay in `validate()`. The store calls `newErrors(before, after)`, which returns the `validate()` errors of `after` that `before` doesn't have (same code, resource, related resources and params). A non-empty list rejects the change, as the AWS API would, and the form shows `issue.<code>`. Errors that already existed (for example from a YAML import) don't block unrelated edits.

**IDs** (our convention, deterministic). `nextId(topology, prefix)` returns the largest existing hex value with that prefix plus one, written with at least 8 hex characters (`vpc-00000001`, after `vpc-0a1b2c3d` comes `vpc-0a1b2c3e`). If that needs more than 17 characters, it returns the smallest unused value from 1. A helper that creates several resources takes their IDs in the order listed below, so the same calls on the same topology always give the same IDs. Removing the resource with the largest ID frees that ID again; AWS never reuses IDs, and R0 keeps no history keyed by ID.

| Action                  | Helper and input                                                                                                             | Creates                                                                                                                                                                                                                                                                                                                      | Rules                         | Fidelity                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------- |
| Create VPC              | `createVpc({ cidrBlock, name? })`                                                                                            | VPC; main route table with no stored routes (local only); default network ACL with entry 100 ALLOW all in each direction; security group `default` (description `default VPC security group`) with inbound all from itself and outbound all to 0.0.0.0/0. ID order: `vpc`, `rtb`, `acl`, `sg`, `sgr` inbound, `sgr` outbound | RT-01, NACL-05, SG-05, ADR-05 | Exact (description text Inferred) |
| Create subnet           | `createSubnet({ vpcId, cidrBlock, availabilityZone?, name? })`                                                               | `mapPublicIpOnLaunch: false`, no explicit associations. "No preference" (no zone given) picks `<region>a`                                                                                                                                                                                                                    | RT-01, NACL-01, ADR-10        | Exact (zone choice Inferred)      |
| Create route table      | `createRouteTable({ vpcId, name? })`                                                                                         | No stored routes (local only), no associations                                                                                                                                                                                                                                                                               | RT-12                         | Exact                             |
| Create internet gateway | `createInternetGateway({ name? })`                                                                                           | Detached                                                                                                                                                                                                                                                                                                                     | IGW-05                        | Exact                             |
| Create security group   | `createSecurityGroup({ vpcId, name, description })`                                                                          | No inbound rules; one outbound rule all to 0.0.0.0/0                                                                                                                                                                                                                                                                         | SG-05, SG-06                  | Exact                             |
| Create network ACL      | `createNetworkAcl({ vpcId, name? })`                                                                                         | No numbered entries (only `*`), not associated                                                                                                                                                                                                                                                                               | NACL-05                       | Exact                             |
| Launch instance         | `launchInstance({ subnetId, platform, name?, privateIpAddress?, autoAssignPublicIp?, securityGroupIds?, runningServices? })` | Instance and its primary network interface (ID order: `i`, `eni`), as below                                                                                                                                                                                                                                                  | ADR-04, ADR-09, ADR-10, SG-05 | see below                         |

Launch instance:

- `privateIpAddress` absent: the first address of the subnet that isn't reserved (ADR-04) and isn't used by another interface in the same VPC. AWS only says it picks "an available address" (ADR-09), so the choice is Inferred. None free: `NO_FREE_PRIVATE_ADDRESS`.
- `autoAssignPublicIp` absent: the subnet's `mapPublicIpOnLaunch` (ADR-10). When true, the interface gets `{ kind: 'auto-assigned', address }` with the first address of 203.0.113.1–203.0.113.254 (RFC 5737, our stand-in for Amazon's pool, Inferred) that no interface uses and no VPC CIDR contains. None free: `PUBLIC_POOL_EXHAUSTED`. In a VPC without an attached internet gateway the helper still assigns one (Q11, Inferred).
- `securityGroupIds` absent or empty: the VPC's default security group (SG-05).
- `runningServices` absent: none. AWS has no such launch field (software comes from the AMI or user data), so the launch view's "Simulated software" choice (none, or web server: `nginx` on TCP 80) is labeled Inferred.
- `platform` is required; the launch view maps the AMI choice to `linux` or `windows` (EPH-01).

Helper error codes: `UNKNOWN_REFERENCE` (an input ID doesn't exist), `INVALID_INPUT`, `NO_FREE_PRIVATE_ADDRESS`, `PUBLIC_POOL_EXHAUSTED`, and the internet gateway codes in section 3.10.

### 3.9 Example (lab 1 solution)

```yaml
schemaVersion: 1
region: us-east-1
vpcs:
  - id: vpc-0a1b2c3d
    name: lab-vpc
    cidrBlock: 10.0.0.0/16
    mainRouteTableId: rtb-00000001
    defaultNetworkAclId: acl-00000001
    defaultSecurityGroupId: sg-00000001
subnets:
  - id: subnet-0000000a
    name: public-a
    vpcId: vpc-0a1b2c3d
    cidrBlock: 10.0.1.0/24
    availabilityZone: us-east-1a
    mapPublicIpOnLaunch: true
    routeTableId: rtb-00000002
routeTables:
  - { id: rtb-00000001, vpcId: vpc-0a1b2c3d, routes: [] }
  - id: rtb-00000002
    name: public-rt
    vpcId: vpc-0a1b2c3d
    routes:
      - destinationCidrBlock: 0.0.0.0/0
        target: { type: internet-gateway, internetGatewayId: igw-0000000a }
internetGateways:
  - { id: igw-0000000a, attachedVpcId: vpc-0a1b2c3d }
securityGroups:
  - id: sg-00000001
    vpcId: vpc-0a1b2c3d
    name: default
    description: default VPC security group
    inboundRules:
      - {
          id: sgr-00000001,
          protocol: all,
          peer: { type: security-group, securityGroupId: sg-00000001 },
        }
    outboundRules:
      - { id: sgr-00000002, protocol: all, peer: { type: cidr, cidrBlock: 0.0.0.0/0 } }
  - id: sg-0000000a
    vpcId: vpc-0a1b2c3d
    name: web
    description: Allow HTTP
    inboundRules:
      - {
          id: sgr-0000000a,
          protocol: tcp,
          fromPort: 80,
          toPort: 80,
          peer: { type: cidr, cidrBlock: 0.0.0.0/0 },
        }
    outboundRules:
      - { id: sgr-0000000b, protocol: all, peer: { type: cidr, cidrBlock: 0.0.0.0/0 } }
networkAcls:
  - id: acl-00000001
    vpcId: vpc-0a1b2c3d
    inboundEntries: [{ ruleNumber: 100, protocol: all, cidrBlock: 0.0.0.0/0, action: allow }]
    outboundEntries: [{ ruleNumber: 100, protocol: all, cidrBlock: 0.0.0.0/0, action: allow }]
instances:
  - id: i-0000000a
    name: web-1
    platform: linux
    primaryNetworkInterface:
      id: eni-0000000a
      subnetId: subnet-0000000a
      privateIpAddress: 10.0.1.10
      publicIp: { kind: auto-assigned, address: 203.0.113.25 }
      securityGroupIds: [sg-0000000a]
    runningServices:
      - { protocol: tcp, port: 80, name: nginx, responseHtml: '<h1>It works</h1>' }
```

### 3.10 Edit helpers

Same `HelperResult` and `newErrors` check as section 3.8. `created` is `{}` unless stated.

| Console action                                    | Helper                                                         | Effect                                                                                                                                                              | Helper errors                                  | Rules               |
| ------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------- |
| Route table › Edit routes                         | `replaceRoutes(routeTableId, routes)`                          | Replaces the stored routes (the local route stays derived)                                                                                                          | none                                           | RT-03, RT-04, RT-11 |
| Route table › Edit subnet associations            | `associateRouteTable(subnetId, routeTableId)`                  | Explicit association; replaces the previous one. Choosing the main table makes the association explicit                                                             | none                                           | RT-01               |
| Route table › Edit subnet associations (unselect) | `disassociateRouteTable(subnetId)`                             | Removes the explicit association, so the subnet uses the main table implicitly                                                                                      | none                                           | RT-01               |
| Route table › Set main route table                | `setMainRouteTable(routeTableId)`                              | The table's VPC uses it as main; explicit associations don't change                                                                                                 | none                                           | RT-01               |
| Internet gateway › Attach to VPC                  | `attachInternetGateway(internetGatewayId, vpcId)`              | Sets `attachedVpcId`                                                                                                                                                | `IGW_ALREADY_ATTACHED`, `VPC_ALREADY_HAS_IGW`  | IGW-05              |
| Internet gateway › Detach from VPC                | `detachInternetGateway(internetGatewayId)`                     | Removes `attachedVpcId`                                                                                                                                             | `IGW_NOT_ATTACHED`, `IGW_HAS_PUBLIC_ADDRESSES` | IGW-07              |
| Security group › Edit inbound / outbound rules    | `replaceSecurityGroupRules(securityGroupId, direction, rules)` | Replaces the rules of one direction. A rule whose `id` the group already has in that direction keeps it; every other rule gets a new `sgr` ID, in list order        | none                                           | SG-02, SG-03, SG-04 |
| Network ACL › Edit inbound / outbound rules       | `replaceNetworkAclEntries(networkAclId, direction, entries)`   | Replaces the numbered entries of one direction (the `*` entry stays implicit)                                                                                       | none                                           | NACL-02, NACL-08    |
| Network ACL › Edit subnet associations            | `associateNetworkAcl(subnetId, networkAclId)`                  | Explicit association. Choosing the VPC's default network ACL clears `networkAclId`, because R0 models the default association as absent (section 3.2)               | none                                           | NACL-01             |
| Subnet › Edit subnet settings                     | `setMapPublicIpOnLaunch(subnetId, value)`                      | Sets the attribute; existing instances don't change                                                                                                                 | none                                           | ADR-10              |
| Any › Name tag                                    | `setNameTag(resource, name)`                                   | Sets or clears (`''`) `name` on a VPC, subnet, route table, internet gateway, network ACL or instance. A security group's name is its group name, not a tag (SG-06) | none                                           | none                |

- `IGW_ALREADY_ATTACHED`: the gateway is attached to a VPC (`params.vpcId`). `VPC_ALREADY_HAS_IGW`: the VPC has another attached gateway (`params.internetGatewayId`). `IGW_NOT_ATTACHED`: nothing to detach. `IGW_HAS_PUBLIC_ADDRESSES`: interfaces in the VPC have public IPv4 addresses (`params.count`).
- Every helper returns `UNKNOWN_REFERENCE` for an ID that doesn't exist and `INVALID_INPUT` when the result fails `topologySchema`.
- Deleting resources and terminating instances are Unsupported in the R0 console (section 9). The YAML editor can still remove them.

## 4. `validate(topology): Issue[]`

```ts
type Issue = {
  code: IssueCode;
  severity: 'error' | 'warning';
  ruleIds: RuleId[]; // e.g. ['ADR-03']
  fidelity: 'Exact' | 'Inferred' | 'Unsupported';
  resource: { type: ResourceType; id: string };
  path: (string | number)[]; // into the topology, e.g. ['subnets', 1, 'cidrBlock']
  related?: { type: ResourceType; id: string }[]; // e.g. the other subnet in an overlap
  params: Record<string, string | number>; // values for the i18n message
};
```

Order: resource collections in `Topology` key order, then array order, then the row order of this table.

| Code                          | Severity | Rule IDs                     | Fidelity                           | Raised when                                                                                                         |
| ----------------------------- | -------- | ---------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `VPC_SIZE_INVALID`            | error    | ADR-01                       | Exact                              | VPC prefix is not /16 to /28                                                                                        |
| `VPC_CIDR_RESTRICTED`         | error    | ADR-01                       | Exact (blocks), Inferred (subsets) | VPC CIDR is inside 0.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16 or 224.0.0.0/4                                            |
| `SUBNET_SIZE_INVALID`         | error    | ADR-02                       | Exact                              | Subnet prefix is not /16 to /28                                                                                     |
| `SUBNET_CIDR_OUT_OF_VPC`      | error    | ADR-02                       | Exact                              | Subnet CIDR is not the VPC CIDR or a subset of it                                                                   |
| `CIDR_OVERLAP`                | error    | ADR-03                       | Exact                              | Two subnets of one VPC overlap (`related` names the other)                                                          |
| `IP_OUT_OF_SUBNET`            | error    | ADR-09                       | Exact                              | Interface private address is outside its subnet                                                                     |
| `IP_RESERVED`                 | error    | ADR-04                       | Exact                              | Interface private address is one of the subnet's 5 reserved addresses                                               |
| `IP_DUPLICATE`                | error    | ADR-09, ADR-10               | Inferred                           | Two interfaces share a private address, or a public address (`params.kind`)                                         |
| `PUBLIC_IP_INVALID`           | error    | ADR-10                       | Exact                              | Public address is in RFC 1918, RFC 6598, a restricted range or any VPC CIDR                                         |
| `VPC_MISMATCH`                | error    | RT-01, NACL-01, SG-04, SG-06 | Exact                              | A subnet, VPC, interface or rule points to a route table, network ACL or security group of another VPC              |
| `ROUTE_DUPLICATE_DESTINATION` | error    | RT-11                        | Exact                              | Two routes in one table share a destination                                                                         |
| `ROUTE_DESTINATION_RESERVED`  | error    | RT-11                        | Exact                              | Route destination is 169.254.168.0/22 or inside it                                                                  |
| `LOCAL_ROUTE_CONFLICT`        | error    | RT-03                        | Exact                              | Stored route destination equals or is inside the VPC CIDR                                                           |
| `IGW_MULTIPLE_ATTACHED`       | error    | IGW-05                       | Exact                              | Two internet gateways are attached to one VPC                                                                       |
| `SG_NAME_INVALID`             | error    | SG-06                        | Exact                              | Name or description empty, over 255 characters, outside the allowed characters, or name starts with `sg-`           |
| `SG_NAME_DUPLICATE`           | error    | SG-06                        | Exact                              | Two groups in one VPC have the same name, ignoring case                                                             |
| `NACL_RULE_NUMBER_DUPLICATE`  | error    | NACL-08                      | Exact                              | Rule number used twice in one direction                                                                             |
| `QUOTA_EXCEEDED`              | warning  | SG-07, NACL-09               | Exact (default values)             | More than 60 rules per direction in a group, 5 groups on an interface, or 20 entries per direction in a network ACL |

A route to an internet gateway that isn't attached to the table's VPC is not an issue: AWS shows it as `blackhole`, and so does `deriveStatus` (RT-08).

## 5. `trace(topology, query): TraceResult`

### 5.1 TraceQuery

```ts
type TraceQuery = {
  protocol: 'tcp';
  source: { type: 'internet'; ipAddress: Ipv4 } | { type: 'instance'; instanceId: InstanceId };
  destination:
    | { type: 'internet'; ipAddress: Ipv4 }
    | { type: 'instance'; instanceId: InstanceId; address: 'public' | 'private' };
  destinationPort: number; // 1..65535
  clientType?: ClientType; // EPH-02; default below
  sourcePort?: number; // EPH-02; default: first port of the client's range
};

type ClientType = 'linux' | 'windows' | 'nat-gateway' | 'elb' | 'lambda' | 'custom';
```

| Client type                    | Ephemeral range (EPH-01)       | Default when omitted                                        |
| ------------------------------ | ------------------------------ | ----------------------------------------------------------- |
| `linux`                        | 32768–61000                    | instance source with `platform: linux`; any internet source |
| `windows`                      | 49152–65535                    | instance source with `platform: windows`                    |
| `nat-gateway`, `elb`, `lambda` | 1024–65535                     | never                                                       |
| `custom`                       | 1–65535, `sourcePort` required | never                                                       |

Supported shapes and their flow (TRC-03):

| Source   | Destination                         | Flow                                                                         |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| internet | instance, `public`                  | F1                                                                           |
| internet | instance, `private`                 | F1; fails at the internet gateway (`IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`) |
| instance | internet                            | F2                                                                           |
| instance | instance in the same VPC, `private` | F0                                                                           |

### 5.2 TraceResult

```ts
type TraceResult =
  | { status: 'blocked'; issues: (Issue | QueryIssue)[] } // validate() errors, then query issues
  | {
      status: 'evaluated';
      flow: 'F0' | 'F1' | 'F2';
      verdict: 'REACHED' | 'BROKE_AT_HOP' | 'ROUTED_THEN_DROPPED';
      failure?: { direction: 'forward' | 'return'; hopIndex: number; reasonCodes: ReasonCode[] }; // absent if REACHED
      client: { type: ClientType; portRange: { from: number; to: number }; sourcePort: number };
      hops: Hop[]; // forward, then return; ends at the failing hop
      fidelity: 'Exact' | 'Inferred' | 'Unsupported'; // lowest fidelity among the hops
    };

type Hop = {
  index: number; // 0-based, contiguous across both directions
  direction: 'forward' | 'return';
  step:
    | 'sg-egress'
    | 'nacl-outbound'
    | 'route-lookup'
    | 'igw-egress'
    | 'igw-ingress'
    | 'nacl-inbound'
    | 'sg-ingress'
    | 'host';
  component: {
    type: 'network-interface' | 'subnet' | 'route-table' | 'internet-gateway' | 'vpc' | 'instance';
    id: string;
  };
  packet: {
    protocol: 'tcp';
    sourceIp: Ipv4;
    sourcePort: number;
    destinationIp: Ipv4 | null;
    destinationPort: number;
  };
  translatedTo?: Hop['packet']; // internet gateway hops only (IGW-02, ADR-10)
  outcome: 'pass' | 'fail' | 'skipped';
  skippedBecause?: 'stateful-response' | 'same-subnet'; // SG-01, NACL-04
  match?:
    | {
        type: 'route';
        routeTableId: RouteTableId;
        destinationCidrBlock: Ipv4Cidr;
        target: 'local' | InternetGatewayId;
        state: 'active' | 'blackhole';
      }
    | {
        type: 'nacl-entry';
        networkAclId: NetworkAclId;
        ruleNumber: number | '*';
        action: 'allow' | 'deny';
      }
    | { type: 'sg-rule'; securityGroupId: SecurityGroupId; ruleId: SgRuleId }
    | { type: 'service'; port: number; name: string };
  reasonCodes: ReasonCode[]; // non-empty when outcome is 'fail'
  ruleIds: RuleId[];
  fidelity: 'Exact' | 'Inferred' | 'Unsupported';
};
```

- `QueryIssue` has the fields of `Issue` without `resource`; its `path` starts with `'query'` (for example `['query', 'destination', 'ipAddress']`).
- `destinationIp` is `null` only in one case: an F1 query to `public` when the instance has no public IPv4 address. Hop 0 then fails with `IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`, and the `null` shows the learner that there was no address to reach.
- Skipped hops are kept, so the learner sees that a NACL was not checked inside one subnet and that a security group let a response through.
- The trace stops at the first failing hop. The return path runs only after the forward path passes (TRC-02).

### 5.3 Blocked results

`trace()` returns `status: 'blocked'` and doesn't evaluate when:

| Code                         | Rule IDs  | Cause                                                                                                                                                                                  |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| any `validate()` error       | section 4 | The topology can't exist in AWS                                                                                                                                                        |
| `UNKNOWN_REFERENCE`          | none      | The query names an instance that doesn't exist                                                                                                                                         |
| `IGW_EXPECTS_PUBLIC_ADDRESS` | IGW-06    | An internet address is in RFC 1918, RFC 6598, a restricted range or a VPC CIDR                                                                                                         |
| `DISCONNECTED_VPCS`          | TRC-04    | Source and destination instances are in different VPCs (nothing connects VPCs before R2)                                                                                               |
| `UNSUPPORTED_FEATURE`        | IGW-06    | Instance to instance through a public address (hairpin), including an internet source or destination that is the public address of an instance in the topology                         |
| `INVALID_QUERY`              | EPH-02    | Internet to internet, same source and destination, `destinationPort` outside 1–65535, an invalid IPv4 address, `sourcePort` outside the client range, or `custom` without `sourcePort` |

### 5.4 Hop sequences

Steps follow TRC-01. Each failure maps to a verdict by TRC-02: routing and gateway steps give `BROKE_AT_HOP`; NACL, security group and host steps give `ROUTED_THEN_DROPPED`.

**F1 · internet → instance (forward)**

| #   | Step         | Component                                                | Checks                                                                                                                            | Fail code                                                                                                                                                 | Rule IDs                      | Fidelity                                                              |
| --- | ------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| 0   | igw-ingress  | IGW attached to the destination VPC (or the VPC if none) | an IGW is attached; destination is the public IP of an interface in the VPC; source not RFC 1918/6598; translate public → private | `NO_INTERNET_GATEWAY`, `IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`, `IGW_SOURCE_ADDRESS_NOT_IN_RFC1918_INGRESS`, `IGW_SOURCE_ADDRESS_NOT_IN_RFC6598_INGRESS` | IGW-02, IGW-03, IGW-05, RT-02 | Inferred (no route lookup on arrival, Q1; `NO_INTERNET_GATEWAY`, Q10) |
| 1   | nacl-inbound | destination subnet                                       | first matching entry, port `destinationPort`                                                                                      | `SUBNET_ACL_RESTRICTION`                                                                                                                                  | NACL-01..05                   | Exact                                                                 |
| 2   | sg-ingress   | network interface                                        | any rule of any group allows it                                                                                                   | `SG_HAS_NO_RULES`, `ENI_SG_RULES_MISMATCH`                                                                                                                | SG-02, SG-03, SG-04           | Exact                                                                 |
| 3   | host         | instance                                                 | a running service on `destinationPort`                                                                                            | `NO_LISTENER`                                                                                                                                             | TRC-01                        | Inferred                                                              |

**F1 · return**

| #   | Step          | Checks                                                                            | Fail code                                                                                                                                | Rule IDs                    | Fidelity              |
| --- | ------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------- |
| 4   | sg-egress     | skipped, `stateful-response`                                                      | none                                                                                                                                     | SG-01                       | Exact                 |
| 5   | nacl-outbound | entry for the client's port as destination port                                   | `SUBNET_ACL_RESTRICTION`                                                                                                                 | NACL-03, EPH-01, EPH-02     | Exact                 |
| 6   | route-lookup  | server subnet's table routes the client IP                                        | `NO_ROUTE_TO_DESTINATION`, `BAD_STATE_ROUTE`, `MORE_SPECIFIC_ROUTE`                                                                      | RT-02, RT-04, RT-08, IGW-04 | Inferred (IGW-04, Q1) |
| 7   | igw-egress    | source has a public IP; destination not RFC 1918/6598; translate private → public | `IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS`, `IGW_DESTINATION_ADDRESS_NOT_IN_RFC1918_EGRESS`, `IGW_DESTINATION_ADDRESS_NOT_IN_RFC6598_EGRESS` | IGW-01, IGW-03              | Exact                 |

**F2 · instance → internet**

| #   | Dir     | Step                                         | Fail code                                                           | Rule IDs            | Fidelity                                   |
| --- | ------- | -------------------------------------------- | ------------------------------------------------------------------- | ------------------- | ------------------------------------------ |
| 0   | forward | sg-egress                                    | `SG_HAS_NO_RULES`, `ENI_SG_RULES_MISMATCH`                          | SG-02, SG-03        | Exact                                      |
| 1   | forward | nacl-outbound                                | `SUBNET_ACL_RESTRICTION`                                            | NACL-02             | Exact                                      |
| 2   | forward | route-lookup                                 | `NO_ROUTE_TO_DESTINATION`, `BAD_STATE_ROUTE`, `MORE_SPECIFIC_ROUTE` | RT-02, RT-04, RT-08 | Exact (Inferred when a blackhole wins, Q8) |
| 3   | forward | igw-egress (translate private → public)      | `IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS`                              | IGW-01              | Exact                                      |
| 4   | return  | igw-ingress (translate public → private)     | none expected                                                       | IGW-02              | Inferred (RT-02, Q1)                       |
| 5   | return  | nacl-inbound, destination port = client port | `SUBNET_ACL_RESTRICTION`                                            | NACL-03, EPH-01     | Exact                                      |
| 6   | return  | sg-ingress, skipped `stateful-response`      | none                                                                | SG-01               | Exact                                      |

The internet server is outside the model and always answers (Inferred).

**F0 · instance → instance, same VPC, private address**

| #   | Dir     | Step          | Notes                                                                  | Rule IDs            |
| --- | ------- | ------------- | ---------------------------------------------------------------------- | ------------------- |
| 0   | forward | sg-egress     |                                                                        | SG-02, SG-03, SG-04 |
| 1   | forward | nacl-outbound | skipped `same-subnet` when the destination is in the source subnet     | NACL-02, NACL-04    |
| 2   | forward | route-lookup  | always the local route (RT-03; `LOCAL_ROUTE_CONFLICT` keeps it unique) | RT-03, RT-04        |
| 3   | forward | nacl-inbound  | skipped `same-subnet`                                                  | NACL-02, NACL-04    |
| 4   | forward | sg-ingress    | security group references can match (private addresses)                | SG-02, SG-03, SG-04 |
| 5   | forward | host          |                                                                        | TRC-01              |
| 6   | return  | sg-egress     | skipped `stateful-response`                                            | SG-01               |
| 7   | return  | nacl-outbound | to the client port; skipped `same-subnet`                              | NACL-02..04, EPH-02 |
| 8   | return  | route-lookup  | local route                                                            | RT-03, RT-04        |
| 9   | return  | nacl-inbound  | skipped `same-subnet`                                                  | NACL-02..04         |
| 10  | return  | sg-ingress    | skipped `stateful-response`                                            | SG-01               |

Fidelity of F0 hops: Exact, except `host` (Inferred) and the overall order (Inferred until Q7 is answered). A skipped `same-subnet` hop lists only NACL-04.

### 5.5 Matching details

- Route lookup: longest prefix match among the derived local route and the stored routes (RT-04). R0 has only static routes and no duplicate destinations, so there are no ties (RT-05, RT-10 don't apply). A matching `blackhole` route fails the hop (RT-08): with `MORE_SPECIFIC_ROUTE` when a less specific active route also matches (it shadows that route; golden `s4-q8-blackhole`, Q14), otherwise with `BAD_STATE_ROUTE` (Inferred). The hop's `match` is always the blackhole route.
- NACL: entries sorted by `ruleNumber`, first match wins; no match means the implicit `*` DENY (`ruleNumber: '*'`). An entry matches when the protocol is `tcp` or `all`, the port is in range (`all` matches any port) and the CIDR contains the remote address (source on inbound, destination on outbound) (NACL-02).
- Security group: allowed if any rule of any group on the interface matches (SG-03). A CIDR peer matches the remote address. A security group peer matches when the remote address is the private address of an interface that has that group (SG-04); a public or internet address never matches it.
- `SG_HAS_NO_RULES` when every group on the interface has zero rules in that direction; otherwise `ENI_SG_RULES_MISMATCH` (SG-02).

### 5.6 Reason codes used in R0

From Reachability Analyzer (TRC-04): `NO_ROUTE_TO_DESTINATION`, `BAD_STATE_ROUTE`, `MORE_SPECIFIC_ROUTE`, `IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS`, `IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`, `IGW_DESTINATION_ADDRESS_NOT_IN_RFC1918_EGRESS`, `IGW_DESTINATION_ADDRESS_NOT_IN_RFC6598_EGRESS`, `IGW_SOURCE_ADDRESS_NOT_IN_RFC1918_INGRESS`, `IGW_SOURCE_ADDRESS_NOT_IN_RFC6598_INGRESS`, `SUBNET_ACL_RESTRICTION`, `ENI_SG_RULES_MISMATCH`, `SG_HAS_NO_RULES`.

Our own: `NO_LISTENER`, `NO_INTERNET_GATEWAY`.

The four RFC 1918/6598 codes are checked at every internet gateway hop so the check matches IGW-03, but valid R0 queries can't trigger them: query validation rejects those addresses first.

## 6. `deriveStatus(topology): Status`

```ts
type Status = {
  vpcs: Record<VpcId, { internetGatewayId: InternetGatewayId | null }>; // IGW-05
  subnets: Record<
    SubnetId,
    {
      type: 'public' | 'private'; // RT-09
      routeTableId: RouteTableId;
      routeTableAssociation: 'explicit' | 'main'; // RT-01
      networkAclId: NetworkAclId;
      networkAclAssociation: 'explicit' | 'default'; // NACL-01
      availableIpv4Count: number; // 2^(32-n) - 5 - interfaces in the subnet (ADR-04)
    }
  >;
  routeTables: Record<
    RouteTableId,
    {
      main: boolean;
      subnetIds: SubnetId[]; // explicit and implicit associations
      routes: {
        destinationCidrBlock: Ipv4Cidr;
        target: 'local' | InternetGatewayId;
        state: 'active' | 'blackhole'; // RT-08
        origin: 'CreateRouteTable' | 'CreateRoute'; // local route first
      }[];
    }
  >;
  internetGateways: Record<InternetGatewayId, { state: 'attached' | 'detached' }>;
  instances: Record<
    InstanceId,
    {
      publicIpv4Address: Ipv4 | null; // ADR-10
      clientPortRange: { from: number; to: number }; // EPH-01 by platform
    }
  >;
};
```

- `public` means at least one `active` route to an internet gateway (RT-09; blackhole case Inferred, Q8).
- SSM managed status is R1 (SSM-01 to SSM-05).

## 7. Fidelity summary

| Primitive or behavior                              | Fidelity                                   | Rule IDs                   |
| -------------------------------------------------- | ------------------------------------------ | -------------------------- |
| CIDR sizes, placement, overlap, reserved addresses | Exact                                      | ADR-01..05                 |
| Restricted VPC ranges (subsets)                    | Inferred                                   | ADR-01, Q9                 |
| Private and public IPv4 of an interface            | Exact (uniqueness Inferred)                | ADR-09, ADR-10             |
| Main route table and associations                  | Exact                                      | RT-01                      |
| Local route, longest prefix match                  | Exact                                      | RT-03, RT-04               |
| Blackhole state                                    | Exact (selection Inferred)                 | RT-08, Q8                  |
| Public subnet                                      | Exact                                      | RT-09                      |
| Internet gateway translation and checks            | Exact                                      | IGW-01..03, IGW-05, IGW-06 |
| No route lookup on arrival, return through the IGW | Inferred                                   | RT-02, IGW-04, Q1          |
| No attached IGW for inbound internet traffic       | Inferred                                   | IGW-05, Q10                |
| Security groups                                    | Exact (`SG_HAS_NO_RULES` mapping Inferred) | SG-01..07                  |
| Network ACLs                                       | Exact                                      | NACL-01..09                |
| Ephemeral ports                                    | Exact                                      | EPH-01..03                 |
| Hop order                                          | Inferred                                   | TRC-01, Q7                 |
| Host listener                                      | Inferred                                   | TRC-01                     |

## 8. Test cases

Test names start with the rule ID. Fixtures build on the example in 3.9 (`base`). The internet client is `198.51.100.7`, client type `linux`, port 32768 unless stated.

### 8.1 Schema

- `ADR-05: a non-canonical CIDR is stored in canonical form` (`10.0.1.7/24` → `10.0.1.0/24`).
- `RT-03: a stored route with target local is a schema error`.
- `NACL-02: rule number 0, 32767 or "*" is a schema error`.
- `SG-04: a tcp rule without ports is a schema error; an all rule with ports is a schema error`.
- `SCHEMA: unknown keys, duplicate IDs and unknown references are schema errors`.

### 8.2 validate

One test per code in section 4, each with the smallest topology that raises it and a twin that doesn't. Also:

- `ADR-02: a subnet equal to the VPC CIDR is valid`.
- `ADR-04: 10.0.1.4 is usable, 10.0.1.0..3 and 10.0.1.255 are reserved in 10.0.1.0/24`.
- `RT-08: a route to a detached internet gateway raises no issue`.
- `VALIDATE: the same topology always gives the same issues in the same order`.

CIDR property tests (fast-check) follow the addressing reference (P3).

### 8.3 trace

| Test                                                             | Change to `base`                                                            | Query                                | Expected                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| `TRC-02: F1 reaches the web server`                              | none                                                                        | internet → web-1 public :80          | `REACHED`, 8 hops                                                                      |
| `TRC-02: F2 reaches the internet`                                | none                                                                        | web-1 → 198.51.100.7 :443            | `REACHED`, 7 hops                                                                      |
| `IGW-04: missing 0.0.0.0/0 route breaks the return path`         | remove the route                                                            | F1 :80                               | `BROKE_AT_HOP`, return, hop 6, `NO_ROUTE_TO_DESTINATION`                               |
| `RT-01: subnet on the main table has no internet route`          | remove `routeTableId`                                                       | F2 :443                              | `BROKE_AT_HOP`, forward, hop 2, `NO_ROUTE_TO_DESTINATION`                              |
| `IGW-02: no public IP, inbound`                                  | remove `publicIp`                                                           | F1 :80 public                        | `BROKE_AT_HOP`, hop 0, `IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`, `destinationIp: null` |
| `IGW-02: internet client aims at the private address`            | none                                                                        | F1 :80 private                       | `BROKE_AT_HOP`, hop 0, `IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`                        |
| `IGW-01: no public IP, outbound`                                 | remove `publicIp`                                                           | F2 :443                              | `BROKE_AT_HOP`, hop 3, `IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS`                          |
| `RT-08: detached internet gateway is a blackhole`                | remove `attachedVpcId`                                                      | F2 :443                              | `BROKE_AT_HOP`, hop 2, `BAD_STATE_ROUTE`                                               |
| `IGW-05: no attached internet gateway for inbound traffic`       | remove `attachedVpcId`                                                      | F1 :80                               | `BROKE_AT_HOP`, hop 0, `NO_INTERNET_GATEWAY`                                           |
| `EPH-01: NACL blocks the return port`                            | custom NACL: in 100 allow tcp 80; out 100 allow tcp 80                      | F1 :80                               | `ROUTED_THEN_DROPPED`, return, hop 5, `SUBNET_ACL_RESTRICTION`, match `*`              |
| `EPH-03: NACL allows 1024-65535 outbound`                        | same, out 110 allow tcp 1024–65535                                          | F1 :80                               | `REACHED`                                                                              |
| `EPH-02: windows client port outside the allowed range`          | out 110 allow tcp 32768–61000                                               | F1 :80, `windows`, port 65000        | `ROUTED_THEN_DROPPED`, return, hop 5                                                   |
| `NACL-02: lower deny wins`                                       | in 90 deny tcp 80 198.51.100.0/24 before 100 allow all                      | F1 :80                               | `ROUTED_THEN_DROPPED`, hop 1, match rule 90                                            |
| `NACL-03: inbound return traffic needs its own rule`             | custom NACL: in 100 allow tcp 80; out 100 allow all                         | F2 :443                              | `ROUTED_THEN_DROPPED`, return, hop 5                                                   |
| `SG-02: no inbound rule for port 80`                             | web SG inbound tcp 22 only                                                  | F1 :80                               | `ROUTED_THEN_DROPPED`, hop 2, `ENI_SG_RULES_MISMATCH`                                  |
| `SG-02: group with no inbound rules`                             | web SG inbound empty                                                        | F1 :80                               | `ROUTED_THEN_DROPPED`, hop 2, `SG_HAS_NO_RULES`                                        |
| `SG-01: responses skip the security group`                       | web SG outbound empty                                                       | F1 :80                               | `REACHED`, hop 4 `skipped` `stateful-response`                                         |
| `SG-02: no outbound rules blocks new connections`                | web SG outbound empty                                                       | F2 :443                              | `ROUTED_THEN_DROPPED`, hop 0, `SG_HAS_NO_RULES`                                        |
| `TRC-01: nothing listening on port 80`                           | `runningServices: []`                                                       | F1 :80                               | `ROUTED_THEN_DROPPED`, hop 3, `NO_LISTENER`                                            |
| `NACL-04: same-subnet traffic skips the NACL`                    | second instance in the same subnet; NACL denies all                         | F0 :80                               | `REACHED`, hops 1, 3, 7, 9 `skipped` `same-subnet`                                     |
| `NACL-04: cross-subnet traffic is checked`                       | second instance in another subnet; the source subnet uses the deny-all NACL | F0 :80                               | `ROUTED_THEN_DROPPED`, hop 1                                                           |
| `SG-04: security group reference matches private traffic`        | web SG inbound tcp 80 from `sg-app` only                                    | F0 from an app instance              | `REACHED`                                                                              |
| `SG-04: security group reference never matches internet traffic` | same                                                                        | F1 :80                               | `ROUTED_THEN_DROPPED`, hop 2, `ENI_SG_RULES_MISMATCH`                                  |
| `RT-04: longest prefix wins`                                     | add 198.51.100.0/24 → a detached IGW                                        | F2 to 198.51.100.7 / to 203.0.113.99 | `MORE_SPECIFIC_ROUTE` (golden, Q14) / `REACHED`                                        |
| `IGW-06: private internet address is rejected`                   | none                                                                        | web-1 → 10.1.0.5 as internet         | `blocked`, `IGW_EXPECTS_PUBLIC_ADDRESS`                                                |
| `TRC-04: instances in different VPCs`                            | second VPC with an instance                                                 | F0 across VPCs                       | `blocked`, `DISCONNECTED_VPCS`                                                         |
| `IGW-06: hairpin through the internet gateway is unsupported`    | second instance with a public IP                                            | instance → instance public           | `blocked`, `UNSUPPORTED_FEATURE`                                                       |
| `TRC-05: same input, same result`                                | any                                                                         | any                                  | deep-equal results, contiguous hop indexes                                             |
| `TRC-05: invalid topology blocks the trace`                      | overlapping subnets                                                         | F1                                   | `blocked`, `CIDR_OVERLAP`                                                              |

### 8.4 deriveStatus

- `RT-09: a subnet with an active route to an IGW is public; without one it is private`.
- `RT-09: a subnet whose only IGW route is blackhole is private` (Inferred, Q8).
- `RT-01: implicit and explicit associations to the main table`.
- `RT-03: every route table lists the local route first with origin CreateRouteTable`.
- `ADR-04: available IPv4 count of a /24 with one instance is 250`.
- `EPH-01: client port range follows the platform`.

### 8.5 Helpers

- `RT-01`, `NACL-05`, `SG-05`, `ADR-05`: create VPC builds the main route table, the default network ACL and the default security group, with the CIDR in canonical form.
- `RT-01`, `NACL-01`, `ADR-10`: a new subnet uses the main table and the default ACL implicitly and doesn't map public IPs; no zone gives `<region>a`.
- `RT-12`: a new route table has only the local route and no associations.
- `IGW-05`: a new internet gateway is detached; attach rejects an attached gateway and a VPC that already has one.
- `IGW-07`: detach rejects while an interface in the VPC has a public IPv4 address.
- `SG-05`: a new security group has no inbound rules and one outbound rule; launch without groups uses the VPC default group.
- `NACL-05`: a new network ACL has no entries and no associations.
- `ADR-09`, `ADR-04`: launch picks the first usable free address and skips reserved and used ones; a full subnet gives `NO_FREE_PRIVATE_ADDRESS`.
- `ADR-10`: launch assigns a public address when the subnet setting or the launch override asks for one, and none otherwise; the pool skips used addresses and VPC CIDRs.
- `RT-01`, `NACL-01`: associate, disassociate and set main; associating the default ACL clears the explicit association.
- `SG-04`: replacing rules keeps known rule IDs and gives new rules new IDs.
- `HELPERS: the same calls give the same IDs`, `HELPERS: helpers never mutate their input`, `HELPERS: newErrors returns only errors the change introduced`.
- `HELPERS: console steps build the lab 1 solution` (create, attach, route, associate, rules, launch), then `trace` F1 gives `REACHED`.

### 8.6 Golden tests

R0 needs golden fixtures (TRC-06) for F1 and F2 split into two analyses each, plus the IGW-04 and Q8 cases, before R0 ships. The user runs `pnpm golden:capture` (AGENTS.md, "Golden capture"). Scenarios, mapping and fixture format: `docs/specs/p9-golden.md`.

## 9. Unsupported in R0

None of these can be expressed in the R0 schema, except where noted.

| Feature                                                         | Rule IDs                    | Planned             |
| --------------------------------------------------------------- | --------------------------- | ------------------- |
| IPv6, secondary VPC CIDRs                                       | ADR-01, ADR-08              | not in MVP          |
| Secondary private addresses and network interfaces              | ADR-09                      | not planned         |
| Instance stop and start, address release                        | ADR-10                      | not planned         |
| Deleting resources and terminating instances in the console     | RT-12, IGW-07               | after lab 1         |
| Local route retargeting, middlebox routes, gateway route tables | RT-02, RT-03                | not in MVP          |
| Prefix lists, NAT gateway, VPC endpoints, SSM status            | RT-06, NAT-_, VPCE-_, SSM-* | R1                  |
| Peering, transit gateway, VPN (`DISCONNECTED_VPCS` until then)  | PCX-_, TGW-_, VPN-*         | R2                  |
| Hairpin through the internet gateway (`UNSUPPORTED_FEATURE`)    | IGW-06                      | not planned         |
| Security Group VPC Association                                  | SG-06                       | not planned         |
| Adjusted quotas                                                 | SG-07, NACL-09              | not planned         |
| UDP and ICMP traces (rules can be stored)                       | TRC-02                      | R1                  |
| Host firewalls, services bound to one address                   | TRC-01                      | not planned         |
| Default VPC, DNS hostnames                                      | DNS-*                       | R1 (DNS attributes) |

## 10. `to-verify` rules R0 depended on

All were checked with the AWS documentation MCP on 2026-11-04 and updated in the skill.

| Rule    | Finding                                                                                                                                                     | Source                                                 | New status                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| ADR-01  | /16 to /28 confirmed. Added the restricted blocks and the note that public ranges are allowed.                                                              | vpc-cidr-blocks.html                                   | verified 2026-11-04 (subsets Inferred, Q9)   |
| RT-01   | One route table per subnet at a time, implicit and explicit association with the main table, main table can't be deleted, starts with only the local route. | subnet-route-tables.html, RouteTables.html             | verified 2026-11-04                          |
| RT-08   | Route state is `active` or `blackhole`; blackhole means the target isn't available (gateway not attached). Selection behavior not documented.               | API_Route.html, explanation-codes.html                 | verified 2026-11-04 (selection Inferred, Q8) |
| RT-09   | Public subnet = direct route to an internet gateway; private = none.                                                                                        | configure-subnets.html, VPC_Internet_Gateway.html      | verified 2026-11-04                          |
| IGW-05  | "You can attach only one internet gateway to a VPC at a time."                                                                                              | amazon-vpc-limits.html                                 | verified 2026-11-04                          |
| SG-02   | Allow rules only; no outbound rules means no outbound traffic.                                                                                              | security-group-rules.html                              | verified 2026-11-04                          |
| SG-03   | Groups are associated with network interfaces; rules are aggregated.                                                                                        | changing-security-group.html                           | verified 2026-11-04                          |
| SG-04   | Rule parts confirmed; a reference matches private addresses of member interfaces; cross-VPC reference limits.                                               | security-group-rules.html                              | verified 2026-11-04 (NAT part Inferred, Q3)  |
| SG-05   | Default group rules, `default` name, can't be deleted, used when no group is chosen; new group defaults.                                                    | default-security-group.html, security-group-rules.html | verified 2026-11-04                          |
| NACL-05 | New custom ACL blocks all traffic and isn't associated; default ACL uses rule 100.                                                                          | create-network-acl.html, default-network-acl.html      | verified 2026-11-04                          |

New rules added from the same pages: ADR-09, ADR-10, RT-11, IGW-06, SG-06, SG-07, NACL-08, NACL-09, F0 in TRC-03. IGW-03 now includes RFC 6598 and the ingress codes. Q2 is resolved.

`to-verify` rules not needed in R0 (left unchanged): NAT-05, VPCE-G01, VPCE-I01, DNS-02 (R1); PCX and TGW items (R2).

## 11. Open questions and decisions to confirm

Open questions (skill files): Q1, Q8 and Q11 (routing), Q3 (filtering, R1), Q7 (trace order), Q9 (addressing), Q10 (no attached internet gateway).

Helper decisions (P7, confirmed 2026-11-04): deterministic IDs as in section 3.8; first free private address; public pool 203.0.113.0/24; `<region>a` for "No preference"; "Simulated software" at launch; `newErrors` rejects changes; console deletion deferred.

Design decisions in this spec, to confirm before P3:

1. The local route is derived and never stored in YAML.
2. One primary network interface per instance, nested inside the instance.
3. R0 traces are TCP only.
4. Invalid topologies and unsupported queries return `status: 'blocked'` instead of a verdict.
5. `NO_INTERNET_GATEWAY` is our own code until Q10 is answered.
6. The internet side of F2 always answers.
7. Every R0 instance is `running`.
