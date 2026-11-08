# P9 spec: golden tests with Reachability Analyzer

Status: approved 2026-11-05 (dependencies included) · Phases stop for review after each one.
Packages: `packages/engine` (golden module and golden test), `tools/golden` (capture and cleanup), `packages/labs` (one drift test).
Rules: TRC-06 (golden tests), TRC-02, TRC-04 · Open questions: Q1, Q8 (routing), Q7 (trace order), Q10, Q11 (routing, manual checks).
Engine: `docs/specs/r0-engine.md` sections 5 and 8.6.

## 0. Hard limits

- Agents never run `pnpm golden:capture` or `pnpm golden:cleanup` (not even `--dry-run`), `cdk deploy`, `cdk destroy`, `cdk bootstrap`, any AWS SDK call, or anything that reads AWS credentials. Tests call the dry-run planner as a function.
- Unit tests make no network calls. They never import the real SDK adapter (`tools/golden/src/aws/sdk.ts`) or `@aws-sdk/*`; an ESLint rule enforces it.
- The capture runs only in a dedicated sandbox account with a budget alarm (AGENTS.md, "Golden capture").

## 1. Decisions to confirm

| #   | Topic              | Proposal                                                                                                                                                                                                                                                                    |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Deploy             | CDK only synthesizes (L1 constructs). The tool deploys the template with the CloudFormation API (`CreateStack`, `UpdateStack`, `DeleteStack`). No CDK CLI and no `cdk bootstrap` (section 9.3).                                                                             |
| D2  | Where scenarios go | `packages/engine/golden/` (pure TypeScript, exported as `@sim/engine/golden`): scenarios, hash, fixture schema, comparison, leak check. Fixtures in `packages/engine/__tests__/golden/fixtures/`. No workspace cycle: `tools/golden` and `packages/labs` import the engine. |
| D3  | Lab 1              | S1 and S2 use the lab 1 solution topology (no extra deploy). S5 is the lab 1 initial topology (one deploy, 3 analyses). A labs test keeps them equal to `lab01`.                                                                                                            |
| D4  | S3 shape           | One topology with two subnets and two instances: one subnet has 0.0.0.0/0 → igw, the other uses the main route table (local only). One deploy covers "with" and "without".                                                                                                  |
| D5  | S2 reply leg       | Kept (1 analysis), although it can only show that Reachability Analyzer treats a split reply leg as a new connection (section 2.3). Drop it to save one analysis.                                                                                                           |
| D6  | Instances          | `t3.micro`, `CreditSpecification: standard` (T3 defaults to unlimited), Amazon Linux 2023 x86_64 through the public SSM parameter. No key pair, no user data, no instance profile.                                                                                          |
| D7  | Runner             | `tsx` runs the CLI. Node's type stripping can't load the engine's extensionless imports.                                                                                                                                                                                    |
| D8  | Re-capture         | A new capture overwrites the scenario's fixture. Git shows the diff.                                                                                                                                                                                                        |
| D9  | Path components    | Stored in fixtures, not compared yet. Hop order (Q7) is reviewed by hand first, then automated in a later phase.                                                                                                                                                            |

## 2. Scenarios

### 2.1 Scenario record

```ts
type GoldenScenario = {
  id: string; // /^s[0-9]+-[a-z0-9-]+$/, also the fixture file name and the stack suffix
  title: string; // English, docs only
  topology: TopologyInput; // one topology per scenario; parsed with topologySchema
  queries: GoldenQuery[]; // one Reachability Analyzer analysis per query
};

type GoldenQuery = {
  id: string; // /^[a-z0-9-]+$/, unique in the scenario
  label: string; // English, docs only
  ruleIds: RuleId[]; // test name prefix, at least one
  leg: 'request' | 'reply'; // reply = the other direction of a request, as its own analysis (TRC-06)
  query: TraceQuery; // clientType and sourcePort always explicit
  expected: ExpectedResult; // the engine's current result (same shape as packages/labs)
};
```

Self-checks (always-on tests, section 6):

- The topology parses and `validate()` returns no errors. Every query traces with `status: 'evaluated'` and matches `expected`.
- No expected result contains `NO_LISTENER` or `NO_INTERNET_GATEWAY`. Reachability Analyzer analyzes configuration and doesn't send packets, so it has no listener check, and it can't start at a gateway that isn't attached.
- Every query has one of the two shapes in 2.2; every instance is `linux`; every public IP is `auto-assigned`.

### 2.2 Query → analysis mapping (mapping version 1)

| Query shape                   | `Source`                                        | `Destination`                                   | `Protocol` | `FilterAtSource` (PathRequestFilter)                                                                           |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| internet → instance, `public` | internet gateway attached to the instance's VPC | instance                                        | `tcp`      | `SourceAddress` = internet IP, `SourcePortRange` = client port, `DestinationPortRange` = destination port      |
| instance → internet           | instance                                        | internet gateway attached to the instance's VPC | `tcp`      | `SourcePortRange` = client port, `DestinationAddress` = internet IP, `DestinationPortRange` = destination port |

- `FilterAtSource` excludes the `SourceIp` and `DestinationPort` parameters, so ports go in the filter (API_CreateNetworkInsightsPath). `DestinationIp` and `FilterAtDestination` stay unset.
- Ports are single-port ranges so NACL checks use one concrete client port (EPH-02).
- Any other shape (F0, `private` address, hairpin) is rejected in R0 golden.
- The mapping is Inferred until S1 runs: the docs show an internet gateway as a source but don't say how `SourceAddress` is used there. Capture S1 first.
- Changing this table, the stage plan (2.4) or the comparison rule bumps `GOLDEN_MAPPING_VERSION`, which is part of the hash (section 4), so every fixture becomes stale.

Sources: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateNetworkInsightsPath.html · https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_PathRequestFilter.html · https://docs.aws.amazon.com/vpc/latest/reachability/how-reachability-analyzer-works.html (checked 2026-11-05)

### 2.3 Request and reply legs

An internet gateway can't be an intermediate component (TRC-06), so an internet flow becomes two analyses with the gateway at one end. Each analysis also returns its own `ReturnPathComponents`.

- A `request` analysis compares with the engine's whole trace of that query (forward and return).
- A `reply` analysis is the reply packet sent as a new connection: source and destination swapped, server port as source port, client port as destination port. Reachability Analyzer evaluates it as a new connection, so the security group on the sending side is checked, not skipped. The engine query for it uses `clientType: 'custom'` with `sourcePort` = server port, and the comparison uses the engine's trace of that query.
- F1 reply (S1 q2): the web group allows all outbound, so it really tests NACL outbound to the client port, the route back to the gateway (IGW-04) and the gateway's public IP.
- F2 reply (S2 q2): the web group has no inbound rule for the client port, so it can only show the group blocking a new connection. F2's stateful return is covered by the return path of S2 q1 (D5).

### 2.4 Scenarios and expected engine results

Client 198.51.100.7, port 32768 (`linux`) unless stated. Hop indexes are 0-based (r0-engine.md 5.4). Expected results were computed with the current engine on 2026-11-05.

**S1 `s1-f1-internet-to-web`** · topology: lab 1 solution (`lab01.solutionTopology`).

| Query           | Leg     | Packet                                        | Engine expected                                           | Rule IDs               |
| --------------- | ------- | --------------------------------------------- | --------------------------------------------------------- | ---------------------- |
| `igw-to-web-80` | request | 198.51.100.7:32768 → web-1 public :80         | `REACHED` (8 hops)                                        | TRC-06, IGW-02, IGW-04 |
| `web-80-to-igw` | reply   | web-1 :80 → 198.51.100.7:32768 (`custom`, 80) | `REACHED` (7 hops)                                        | IGW-04, IGW-01, EPH-02 |
| `igw-to-web-22` | request | 198.51.100.7:32768 → web-1 public :22 (guard) | `ROUTED_THEN_DROPPED`, forward 2, `ENI_SG_RULES_MISMATCH` | SG-02                  |

**S2 `s2-f2-web-to-internet`** · topology: lab 1 solution.

| Query            | Leg     | Packet                                                 | Engine expected                                           | Rule IDs              |
| ---------------- | ------- | ------------------------------------------------------ | --------------------------------------------------------- | --------------------- |
| `web-to-igw-443` | request | web-1:32768 → 198.51.100.7:443                         | `REACHED` (7 hops)                                        | IGW-01, EPH-01, SG-01 |
| `igw-443-to-web` | reply   | 198.51.100.7:443 → web-1 public :32768 (`custom`, 443) | `ROUTED_THEN_DROPPED`, forward 2, `ENI_SG_RULES_MISMATCH` | SG-01, SG-02          |

**S3 `s3-q1-return-route`** (Q1, IGW-04) · topology: lab 1 solution, plus subnet `no-route-b` (`subnet-0000000b`, 10.0.2.0/24, us-east-1a, no explicit association, so the main table with only the local route), `web-1` renamed `web-a`, and `web-b` (`i-0000000b`, `eni-0000000b`, 10.0.2.10, public 203.0.113.26, group `web`). Both instances run only `nginx` on 80.

| Query             | Leg     | Packet                                | Engine expected                                                | Rule IDs      |
| ----------------- | ------- | ------------------------------------- | -------------------------------------------------------------- | ------------- |
| `igw-to-web-a-80` | request | 198.51.100.7:32768 → web-a public :80 | `REACHED` (8 hops)                                             | RT-02, IGW-04 |
| `igw-to-web-b-80` | request | 198.51.100.7:32768 → web-b public :80 | `BROKE_AT_HOP`, return 6, `NO_ROUTE_TO_DESTINATION` (Inferred) | IGW-04, RT-02 |

Reading the fixture: if q2 reports `NO_ROUTE_TO_DESTINATION`, check that the blocking component is the route table of `no-route-b` and that it sits on the return path. That answers Q1 for RT-02 ("no lookup on arrival") and IGW-04.

**S4 `s4-q8-blackhole`** (Q8, RT-08) · topology: lab 1 solution, plus `igw-0000000b` (`spare-igw`, detached) and the route 198.51.100.0/24 → `igw-0000000b` in `public-rt`.

| Query                      | Leg     | Packet                          | Engine expected                                         | Rule IDs     |
| -------------------------- | ------- | ------------------------------- | ------------------------------------------------------- | ------------ |
| `web-to-198-51-100-10-443` | request | web-1:32768 → 198.51.100.10:443 | `BROKE_AT_HOP`, forward 2, `BAD_STATE_ROUTE` (Inferred) | RT-08, RT-04 |
| `web-to-192-0-2-10-443`    | request | web-1:32768 → 192.0.2.10:443    | `REACHED` (7 hops), control for the default route       | RT-04        |

Can this state be built? Yes, but only in one order (docs checked 2026-11-05):

- `CreateRoute` takes "the ID of an internet gateway or virtual private gateway attached to your VPC", so a route to a detached gateway can't be created directly (API_CreateRoute).
- A VPC has one attached internet gateway at a time (IGW-05).
- A gateway can't be detached while the VPC has resources with public IPv4 addresses (IGW-07, delete-igw.html).
- So: attach `spare-igw`, add its route, detach it (no public addresses exist yet), then attach `lab-igw`, add 0.0.0.0/0, launch the instance. The tool deploys this as three revisions of one stack (2.5).
- Docs gap: CloudFormation doesn't say anything about a route whose gateway is detached by a later update. The route resource itself doesn't change, so no handler should touch it (Inferred). After the last stage the tool reads the route states (`DescribeRouteTables`) and stops before any analysis unless 198.51.100.0/24 is `blackhole` and 0.0.0.0/0 is `active`.

Sources: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateRoute.html · https://docs.aws.amazon.com/vpc/latest/userguide/delete-igw.html · https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_Route.html

**S5 `s5-lab1-initial`** · topology: lab 1 initial (`lab01.initialTopology`).

| Query           | Leg     | Packet                                        | Engine expected                                           | Rule IDs      |
| --------------- | ------- | --------------------------------------------- | --------------------------------------------------------- | ------------- |
| `igw-to-web-80` | request | 198.51.100.7:32768 → web-1 public :80         | `ROUTED_THEN_DROPPED`, forward 2, `ENI_SG_RULES_MISMATCH` | SG-02         |
| `igw-to-web-22` | request | 198.51.100.7:32768 → web-1 public :22         | `ROUTED_THEN_DROPPED`, forward 2, `ENI_SG_RULES_MISMATCH` | SG-02         |
| `web-80-to-igw` | reply   | web-1 :80 → 198.51.100.7:32768 (`custom`, 80) | `BROKE_AT_HOP`, forward 2, `NO_ROUTE_TO_DESTINATION`      | RT-01, IGW-04 |

S5 q1 has two stacked faults. The engine stops at the first failing hop. Reachability Analyzer "displays information about the component or combination of components that is blocking the path. There might be additional components blocking the path." If it lists both codes, the test fails and we decide (Q12). q3 shows fault 2 on its own.

### 2.5 Stage plan

- No route to a detached gateway: one stage, the final topology.
- Routes to a detached gateway (at most one such gateway per VPC; more is rejected): three stages, each checked with `topologySchema` and `validate()` (no errors).
  1. Final topology without instances and without routes to attached gateways; the routed detached gateway is attached instead of the VPC's own gateway.
  2. Stage 1 with that gateway detached. Its routes become `blackhole`; no public address exists yet (IGW-07).
  3. Final topology.

### 2.6 Analyses and deploys

| Scenario | Stages | Instances | Analyses |
| -------- | ------ | --------- | -------- |
| S1       | 1      | 1         | 3        |
| S2       | 1      | 1         | 2        |
| S3       | 1      | 2         | 2        |
| S4       | 3      | 1         | 2        |
| S5       | 1      | 1         | 3        |
| Total    |        | 6         | 12       |

Suggested order: S1 (checks the whole pipeline and the mapping), S3, S4, S2, S5.

## 3. Manual checks for Q11 and Q10 (no Reachability Analyzer)

Sandbox account, us-east-1, console. Labels may differ from these: write down the exact text you see. Billable while it exists: one instance, its root volume and one public IPv4 address. Q10 reuses the Q11 instance.

**Q11: can an instance get an auto-assigned public IPv4 address in a VPC with no attached internet gateway?**

1. VPC › Your VPCs › Create VPC: "VPC only", Name `sim-q11`, IPv4 CIDR 10.99.0.0/16. Create no internet gateway.
2. Subnets › Create subnet: VPC `sim-q11`, us-east-1a, 10.99.1.0/24. Select it › Actions › Edit subnet settings › enable auto-assign public IPv4 address › Save. Note whether the console allows it, and any warning.
3. Security groups › Create security group `sim-q10-web` in `sim-q11`: inbound TCP 80 from My IP. Keep the default outbound rule.
4. EC2 › Launch instance: Name `sim-q11`, Amazon Linux 2023, t3.micro, proceed without a key pair. Network settings › Edit: VPC `sim-q11`, the subnet, Auto-assign public IP Enable, existing group `sim-q10-web`. Advanced details › User data:
   ```bash
   #!/bin/bash
   mkdir -p /srv && echo ok > /srv/index.html && cd /srv && nohup python3 -m http.server 80 >/dev/null 2>&1 &
   ```
   Launch. If it fails, copy the exact error text: that answers Q11 (no). Skip to step 9.
5. Instances › `sim-q11` › Details: note "Public IPv4 address". Or run `aws ec2 describe-instances --filters Name=tag:Name,Values=sim-q11 --query 'Reservations[].Instances[].[InstanceId,State.Name,PublicIpAddress]' --output text`. An address means Q11 is yes.

**Q10: what happens to internet traffic to that address while no internet gateway is attached, and can the state be reached by detaching?** (only if step 5 showed an address)

6. From your computer: `curl -sS -m 10 http://<public-ip>/`. Note the result (timeout or error text).
7. Control: create internet gateway `sim-q10-igw`, attach it to `sim-q11`, and add 0.0.0.0/0 → `sim-q10-igw` to the VPC's main route table. Wait a minute and run the same `curl`. Note the result (`ok` expected).
8. With the instance still running: Internet gateways › `sim-q10-igw` › Actions › Detach from VPC. Copy the exact error text (IGW-07 says it's refused).
9. Clean up: terminate the instance and wait for `terminated`; remove the 0.0.0.0/0 route; detach and delete `sim-q10-igw`; delete VPC `sim-q11` (it removes the subnet and the groups). Check that no `sim-q1*` instance, gateway or VPC is left.

Send me: step 2 and 4 notes, the step 5 address (yes/no, not the address), the step 6 and 7 results, and the step 8 error text. I update Q10, Q11, IGW-05 and IGW-07 in the skill before any engine change. Step 6 shows the verdict only; `NO_INTERNET_GATEWAY` stays our own code (Inferred).

## 4. Scenario hash

```ts
scenarioHash =
  'sha256:' +
  hex(
    sha256(
      utf8(
        canonicalJson({
          hashVersion: 1,
          mappingVersion: GOLDEN_MAPPING_VERSION, // 1
          scenarioId,
          topology: topologySchema.parse(scenario.topology), // canonical CIDRs (ADR-05)
          queries: scenario.queries.map((q) => ({ id: q.id, query: q.query })),
        }),
      ),
    ),
  );
```

- Titles, labels, `ruleIds`, `leg` and `expected` aren't hashed, so docs edits don't make fixtures stale.
- Canonical JSON: object keys sorted by UTF-16 code units, arrays in order, no whitespace, absent keys omitted, `JSON.stringify` for strings and numbers; non-finite numbers throw.
- SHA-256 and UTF-8 encoding are written in plain TypeScript (no Node or DOM APIs), so the engine stays pure and the browser could run it too. Tested against the FIPS 180-4 example vectors.

## 5. Fixture format

File: `packages/engine/__tests__/golden/fixtures/<scenario-id>.json`. Written only by `pnpm golden:capture`, never by hand. JSON with 2-space indent and a final newline, keys in schema order. Strict Zod schema shared by the tool (before writing) and the test (on load).

```ts
type GoldenFixture = {
  fixtureVersion: 1;
  scenarioId: string;
  scenarioHash: string; // 'sha256:<64 hex>'
  capturedAt: string; // 'YYYY-MM-DD', UTC date of the capture
  region: string; // equals scenario.topology.region
  analyses: FixtureAnalysis[]; // one per query, in query order
};

type FixtureAnalysis = {
  queryId: string;
  status: 'succeeded'; // a failed analysis means no fixture
  networkPathFound: boolean;
  forwardPathComponents: FixtureComponent[];
  returnPathComponents: FixtureComponent[];
  explanations: FixtureExplanation[]; // analysis-level ExplanationSet; compared by the test
};

type FixtureComponent = {
  sequenceNumber: number;
  component: { id: string; type: ComponentType }; // scenario ID; type from its prefix
  attachedTo?: string;
  subnet?: string;
  vpc?: string;
  sourceVpc?: string;
  destinationVpc?: string;
  aclRule?: {
    cidr: string;
    egress: boolean;
    portRange?: PortRange;
    protocol: string;
    ruleAction: string;
    ruleNumber: number;
  };
  securityGroupRule?: {
    cidr?: string;
    direction: string;
    securityGroupId?: string;
    portRange?: PortRange;
    protocol: string;
  };
  routeTableRoute?: {
    destinationCidr?: string;
    gatewayId?: string;
    origin?: string;
    state?: string;
  };
  inboundHeader?: PacketHeader;
  outboundHeader?: PacketHeader; // { protocol, sourceAddresses, destinationAddresses, sourcePortRanges, destinationPortRanges }
  explanations?: FixtureExplanation[]; // component-level, stored only
  additionalDetails?: { type: string }[];
};

type FixtureExplanation = {
  explanationCode: string;
  direction?: 'ingress' | 'egress';
  component?: string;
  acl?: string;
  securityGroup?: string;
  securityGroups?: string[];
  routeTable?: string;
  subnetRouteTable?: string;
  subnet?: string;
  vpc?: string;
  internetGateway?: string;
  networkInterface?: string;
  destination?: string;
  aclRule?: FixtureComponent['aclRule'];
  securityGroupRule?: FixtureComponent['securityGroupRule'];
  routeTableRoute?: FixtureComponent['routeTableRoute'];
  address?: string;
  addresses?: string[];
  cidrs?: string[];
  portRanges?: PortRange[];
  protocols?: string[];
  packetField?: string;
  port?: number;
  state?: string;
  missingComponent?: string;
};
```

SDK names map to fixture names (`NetworkPathFound` → `networkPathFound`, `ForwardPathComponents` → `forwardPathComponents`, `Explanations` → `explanations`, `ExplanationCode` → `explanationCode`, `DestinationAddresses` → `destinationAddresses`, and so on).

### 5.1 Normalization

The normalizer (tools/golden) keeps only the fields above (allow-list) and drops everything else: ARNs, `Name`, `componentAccount`, `componentRegion`, Availability Zone IDs, dates, tags, path and analysis IDs, warning and status messages.

The ID map is built after the last stage, with read-only calls:

| Real value                                                                | Scenario value                                                      | From                                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Stack resources (VPC, subnets, tables, gateways, groups, ACLs, instances) | topology ID behind the logical ID                                   | `DescribeStackResources` (logical IDs come from topology IDs)                                                                  |
| Main route table, default network ACL, default security group             | `mainRouteTableId`, `defaultNetworkAclId`, `defaultSecurityGroupId` | `DescribeRouteTables` (`association.main`), `DescribeNetworkAcls` (`default`), `DescribeSecurityGroups` (`group-name=default`) |
| Primary network interface of each instance                                | `primaryNetworkInterface.id`                                        | `DescribeInstances`                                                                                                            |
| Public IPv4 address of each instance                                      | `publicIp.address`                                                  | `DescribeInstances`                                                                                                            |
| Security group rule IDs (if any show up)                                  | rule ID with the same group, direction, protocol, ports and peer    | `DescribeSecurityGroupRules`                                                                                                   |

Before any analysis the tool also checks that each private address and each CIDR equals the topology, and stops otherwise.

### 5.2 Leak check

A shared function `findLeaks(fixture, scenario)` walks every string and returns JSON paths for:

- anything containing `arn:`;
- any run of exactly 12 digits;
- any AWS-shaped ID (`vpc-`, `subnet-`, `rtb-`, `rtbassoc-`, `igw-`, `sg-`, `sgr-`, `acl-`, `aclassoc-`, `i-`, `eni-`, `nip-`, `nia-`, `eipalloc-`, `eipassoc-`, `vol-`, `ami-`, `pl-` followed by 8 to 17 hex characters) that isn't an ID of the scenario;
- any IPv4 address or CIDR that isn't in the scenario topology, its queries or 0.0.0.0/0.

The capture writes nothing if the list isn't empty and prints the paths. The golden test runs the same check on every committed fixture.

## 6. Golden test

File: `packages/engine/__tests__/golden/golden.test.ts`. Fixtures load with `import.meta.glob('./fixtures/*.json', { eager: true })` (Vitest supports it; a local `.d.ts` types it, since the engine has `types: []`).

Always-on tests (pass with no fixtures):

- `TRC-06: <scenario-id> scenario is valid and the engine matches its expected results` (self-checks in 2.1).
- `TRC-06: scenario IDs, query IDs and hashes are unique`.

Per fixture:

- `TRC-06: <scenario-id> fixture parses and holds no real IDs, ARNs or addresses`.
- `TRC-06: <scenario-id> fixture is not stale`: the stored hash must equal the scenario's hash. A stale fixture fails here with "re-run pnpm golden:capture <id>", and its comparison tests aren't generated.
- `TRC-06: <scenario-id> fixture has one analysis per query`, in order, no extras.
- One test per query: `<ruleIds joined by space>: <scenario-id> <query-id> matches Reachability Analyzer`, for example `IGW-04 RT-02: s3-q1-return-route igw-to-web-b-80 matches Reachability Analyzer`.
- A fixture whose scenario doesn't exist fails.

Comparison (one to one, TRC-06), engine side = `trace(topology, query)` run live, not `expected`:

| Fixture                                          | Verdict from the fixture | Must equal                                                        |
| ------------------------------------------------ | ------------------------ | ----------------------------------------------------------------- |
| `networkPathFound: true`                         | `REACHED`                | engine `REACHED` and no explanation codes                         |
| `false`, every code in the TRC-04 routing list   | `BROKE_AT_HOP`           | engine verdict, and the set of codes equals `failure.reasonCodes` |
| `false`, every code in the TRC-04 filtering list | `ROUTED_THEN_DROPPED`    | same                                                              |
| `false` with codes from both lists               | fails (`MIXED_CODES`)    | decide case by case (Q12)                                         |
| `false` with a code in neither list              | fails (`UNMAPPED_CODE`)  | add the code to TRC-04 first                                      |
| `false` with no explanation                      | fails (`NO_EXPLANATION`) |                                                                   |

Codes compare as sets (order and duplicates ignored). Direction and hop index aren't compared: Reachability Analyzer has no such index (D9). A failing comparison is a finding: re-verify the rule in the skill, fix the rule, then the engine. Never edit the fixture.

## 7. Topology → CDK translation

L1 constructs only (`Cfn*`), created directly under the stack with logical IDs derived from topology IDs (`vpc-0a1b2c3d` → `Vpc0a1b2c3d`, `rtb-00000002` route 0 → `Rtb00000002Route0`, and so on). Stack props: `analyticsReporting: false` (no `AWS::CDK::Metadata`), `DefaultStackSynthesizer({ generateBootstrapVersionRule: false })` (no `BootstrapVersion` parameter or rule). CDK still writes `aws:cdk:path` in each resource's `Metadata`; CloudFormation ignores it and it creates nothing.

| Topology                             | CloudFormation                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VPC                                  | `AWS::EC2::VPC` (`CidrBlock`, Name tag). DNS attributes left at their defaults                                                                                                                                                                                                                                                                                                                          |
| `mainRouteTableId`                   | no resource: the VPC's implicit main table                                                                                                                                                                                                                                                                                                                                                              |
| `defaultNetworkAclId`                | `Fn::GetAtt <Vpc>.DefaultNetworkAcl`                                                                                                                                                                                                                                                                                                                                                                    |
| `defaultSecurityGroupId`             | `Fn::GetAtt <Vpc>.DefaultSecurityGroup`                                                                                                                                                                                                                                                                                                                                                                 |
| Subnet                               | `AWS::EC2::Subnet` (`VpcId`, `CidrBlock`, `AvailabilityZone`, `MapPublicIpOnLaunch`)                                                                                                                                                                                                                                                                                                                    |
| `subnet.routeTableId` (custom table) | `AWS::EC2::SubnetRouteTableAssociation`                                                                                                                                                                                                                                                                                                                                                                 |
| `subnet.networkAclId` (custom ACL)   | `AWS::EC2::SubnetNetworkAclAssociation`                                                                                                                                                                                                                                                                                                                                                                 |
| Custom route table                   | `AWS::EC2::RouteTable`                                                                                                                                                                                                                                                                                                                                                                                  |
| Route → internet gateway             | `AWS::EC2::Route` (`DestinationCidrBlock`, `GatewayId`), `DependsOn` the gateway's attachment                                                                                                                                                                                                                                                                                                           |
| Internet gateway / `attachedVpcId`   | `AWS::EC2::InternetGateway` / `AWS::EC2::VPCGatewayAttachment`                                                                                                                                                                                                                                                                                                                                          |
| Custom security group                | `AWS::EC2::SecurityGroup` (`GroupName`, `GroupDescription`, `VpcId`, CIDR rules inline, `SecurityGroupEgress` always explicit)                                                                                                                                                                                                                                                                          |
| Rule with a security group peer      | `AWS::EC2::SecurityGroupIngress` / `AWS::EC2::SecurityGroupEgress` (inline references can create circular dependencies)                                                                                                                                                                                                                                                                                 |
| Custom network ACL and entries       | `AWS::EC2::NetworkAcl`, one `AWS::EC2::NetworkAclEntry` per entry (`Protocol` -1/6/17/1, `PortRange`, `Icmp`, `Egress` always explicit)                                                                                                                                                                                                                                                                 |
| Instance                             | `AWS::EC2::Instance`: `ImageId: '{{resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64}}'`, `InstanceType: t3.micro`, `CreditSpecification: { CPUCredits: standard }`, `NetworkInterfaces[0]`: `DeviceIndex '0'`, `SubnetId`, `PrivateIpAddress`, `GroupSet`, `AssociatePublicIpAddress`, `DeleteOnTermination: true`. `DependsOn` the attachment when it has a public IP |

Tags: stack tags `sim:golden=true`, `sim:scenario=<id>`, `sim:run=<UTC timestamp>` (CloudFormation propagates them); each resource adds `Name` (from `name`) and `sim:resource=<topology id>`.

### 7.1 What CloudFormation and EC2 add, and mismatches with our model

Checked in the docs on 2026-11-05.

| Default                                                                                                                                                                  | Source                               | Our model                                                                                          | Handling                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new VPC gets a main route table (local route only), a default network ACL and a default security group                                                                 | RT-01, NACL-05, SG-05; AWS::EC2::VPC | Same (`createVpc` helper)                                                                          | Mapped as above                                                                                                                                                |
| `AWS::EC2::VPC` returns `DefaultNetworkAcl` and `DefaultSecurityGroup`, but no main route table ID                                                                       | AWS::EC2::VPC return values          | We can add routes to the main table, associate it explicitly and change which table is main        | Mismatch. Rejected: routes in the main table, explicit association to it, a main table other than the VPC's first one                                          |
| Default security group: inbound all from itself, outbound all to 0.0.0.0/0                                                                                               | SG-05                                | Same                                                                                               | Its rules must equal these (rule IDs ignored), else rejected                                                                                                   |
| Default network ACL: rule 100 allow all in each direction, then `*`                                                                                                      | NACL-05                              | Same                                                                                               | Its entries must equal these, else rejected                                                                                                                    |
| `AWS::EC2::SecurityGroup` without egress rules gets allow-all IPv4 and IPv6 egress; with egress rules, none are added. The docs suggest 127.0.0.1/32 to block all egress | AWS::EC2::SecurityGroup              | `createSecurityGroup` adds only IPv4 all; a group can have zero outbound rules (`SG_HAS_NO_RULES`) | Egress always written explicitly. A group with no outbound rules is rejected (the 127.0.0.1/32 rule would turn `SG_HAS_NO_RULES` into `ENI_SG_RULES_MISMATCH`) |
| A new custom network ACL denies everything (`*` only)                                                                                                                    | NACL-05                              | Same                                                                                               | Entries emitted one by one                                                                                                                                     |
| `NetworkAclEntry` `Egress` defaults to false; protocol -1 ignores `PortRange`                                                                                            | AWS::EC2::NetworkAclEntry            | Direction and `all` explicit                                                                       | Always written explicitly                                                                                                                                      |
| Subnet `MapPublicIpOnLaunch` defaults to false; new subnets use the main table and the default ACL                                                                       | AWS::EC2::Subnet, RT-01, NACL-01     | Same                                                                                               | Mapped                                                                                                                                                         |
| A route to an internet gateway needs `DependsOn` its attachment; an instance with a public IP in the same template too                                                   | AWS::EC2::Route, AWS::EC2::Instance  | Not modeled (ordering)                                                                             | Added by the translator                                                                                                                                        |
| `CreateRoute` needs an attached gateway                                                                                                                                  | API_CreateRoute                      | A route to a detached gateway is valid (`blackhole`)                                               | Stage plan (2.5)                                                                                                                                               |
| Instance: AMI, instance type, root volume, credit option; T3 defaults to `unlimited`; no security group means the default group                                          | AWS::EC2::Instance                   | Not modeled (except groups and platform)                                                           | Fixed choices (D6), always explicit `GroupSet`; `windows` rejected                                                                                             |
| `runningServices` and `responseHtml`                                                                                                                                     | not deployable                       | Engine host check (`NO_LISTENER`)                                                                  | Not deployed; queries that would give `NO_LISTENER` are rejected (2.1)                                                                                         |
| Public IPv4 comes from Amazon's pool                                                                                                                                     | ADR-10                               | 203.0.113.0/24 stand-in                                                                            | `AssociatePublicIpAddress: true`; the normalizer maps the real address back. `elastic-ip` rejected                                                             |
| Rule IDs (`sgr-…`) and resource IDs are assigned by AWS                                                                                                                  |                                      | Fake deterministic IDs                                                                             | ID map (5.1)                                                                                                                                                   |
| VPC DNS: support on, hostnames off for a nondefault VPC                                                                                                                  | AWS::EC2::VPC                        | Not modeled in R0                                                                                  | Left at defaults; no effect on these flows                                                                                                                     |
| Template body limit                                                                                                                                                      | CloudFormation `TemplateBody`        |                                                                                                    | The tool stops if the template needs S3                                                                                                                        |

Sources: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-vpc.html · https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-securitygroup.html · https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-networkaclentry.html · https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-subnet.html · https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-route.html · https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-instance.html · https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.DefaultStackSynthesizerProps.html

Translator errors (codes, never AWS calls): `GOLDEN_MAIN_TABLE_ROUTES`, `GOLDEN_MAIN_TABLE_EXPLICIT`, `GOLDEN_DEFAULT_SG_CHANGED`, `GOLDEN_DEFAULT_ACL_CHANGED`, `GOLDEN_SG_WITHOUT_EGRESS`, `GOLDEN_WINDOWS`, `GOLDEN_ELASTIC_IP`, `GOLDEN_DETACHED_ROUTES`, `GOLDEN_QUERY_SHAPE`, `GOLDEN_TEMPLATE_TOO_LARGE`.

## 8. Commands

```bash
pnpm golden:capture --list                                   # scenarios, hashes, analyses; no credentials
pnpm golden:capture <scenario-id> --dry-run                  # no credentials, no AWS call
pnpm golden:capture <scenario-id> --account <account-id> [--yes]
pnpm golden:cleanup --account <account-id> [--dry-run] [--yes]
```

Root `package.json`: `"golden:capture": "pnpm --filter @sim/golden capture"`, `"golden:cleanup": "pnpm --filter @sim/golden cleanup"`. `tools/golden`: `"capture": "tsx ./src/cli/capture.ts"`, `"cleanup": "tsx ./src/cli/cleanup.ts"`. AGENTS.md "Commands" gets the same four lines.

### 8.1 `--dry-run`

Parses the scenario, runs the self-checks, synthesizes every stage and prints: stack name, region, scenario hash, each stage's resources (type, logical ID, topology ID), the billable items, each analysis (its `CreateNetworkInsightsPath` input with scenario IDs) and the engine's expected result. It never creates an AWS client and never reads credentials (a test checks the client factory isn't called).

### 8.2 Capture flow

1. Parse flags. `--account` is required without `--dry-run` and must be 12 digits. Unknown flags are errors.
2. Self-checks and synthesis, as in the dry run.
3. Identity: `sts:GetCallerIdentity` (needs no IAM permission). Stop unless the account equals `--account`.
4. Region: the SDK's resolved region (`AWS_REGION` or the profile) must equal the scenario's region. Stop otherwise; the tool never overrides it.
5. Leftovers (read-only): stop if stack `sim-golden-<id>` exists or any network insights path is tagged `sim:golden=true`; print the cleanup command.
6. Confirmation: print billable items and the number of analyses, then ask to type the scenario ID. `--yes` skips it; without a TTY and without `--yes` the tool stops.
7. `try`: deploy each stage (`CreateStack` with `OnFailure: DELETE`, then `UpdateStack`, waiting for each), check route states (S4), build the ID map (5.1), then for each query `CreateNetworkInsightsPath` and `StartNetworkInsightsAnalysis` (both tagged), wait until it isn't `running` (10 min limit), normalize, run the leak check, and write the fixture only if every analysis `succeeded` and the check is clean (temporary file, then rename).
8. `finally`: delete the analyses and paths it created, `DeleteStack` and wait, then look for anything still tagged with this run. Exit 0 if clean; exit 2 and print `pnpm golden:cleanup --account <id>` if not.

Stack operations time out after 20 minutes. The first Ctrl+C stops the current step and runs step 8; a second one exits at once and prints the cleanup command.

### 8.3 Cleanup flow

Same flag, identity and region checks. It lists, then (unless `--dry-run`) deletes, only resources tagged `sim:golden=true`:

1. Network insights analyses, then paths (filtered by their tags).
2. Stacks `sim-golden-*` tagged `sim:golden=true`: `DeleteStack` and wait.
3. EC2 resources still tagged (a stack in `DELETE_FAILED`): terminate instances and wait, detach and delete internet gateways, delete subnets, custom route tables, custom network ACLs, custom security groups, then VPCs. Then retry the stack delete.

`--dry-run` here makes read-only calls, so it needs credentials.

## 9. AWS setup

### 9.1 Before the first run

- A dedicated sandbox account with a budget alarm. Check that its plan allows EC2 instances, public IPv4 addresses and Reachability Analyzer (some free plan accounts block services).
- Region us-east-1 (all scenarios). Check that t3.micro is offered in the zone your account calls `us-east-1a`; if not, CloudFormation fails fast and the tool tears down.
- A role or permission set with the policy in 9.2. The tool picks it up through `AWS_PROFILE`.

### 9.2 Least-privilege policy for the capture role

Stored as `tools/golden/iam/capture-policy.json` in phase B. Replace `<ACCOUNT_ID>`. Sources: the CloudFormation registry schemas' handler permissions (create, read and delete) for the 14 resource types in section 7, downloaded 2026-11-05, and the AWS managed policy `AmazonVPCReachabilityAnalyzerFullAccessPolicy` (Reachability Analyzer reads the configuration with the caller's permissions). Instance-handler actions for properties we never set (instance profiles, volumes, SSM associations, start/stop, monitoring) are left out. If a stack event shows `AccessDenied` for an action, add it with the same scoping and note it here.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GoldenStacks",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResources",
        "cloudformation:TagResource"
      ],
      "Resource": "arn:aws:cloudformation:us-east-1:<ACCOUNT_ID>:stack/sim-golden-*/*"
    },
    {
      "Sid": "ListStacksForCleanup",
      "Effect": "Allow",
      "Action": "cloudformation:ListStacks",
      "Resource": "*"
    },
    {
      "Sid": "AmiParameter",
      "Effect": "Allow",
      "Action": "ssm:GetParameters",
      "Resource": "arn:aws:ssm:us-east-1::parameter/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
    },
    {
      "Sid": "CreateNetworkInRegion",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateVpc",
        "ec2:ModifyVpcAttribute",
        "ec2:CreateSubnet",
        "ec2:ModifySubnetAttribute",
        "ec2:CreateRouteTable",
        "ec2:CreateRoute",
        "ec2:AssociateRouteTable",
        "ec2:ReplaceRouteTableAssociation",
        "ec2:DisassociateRouteTable",
        "ec2:CreateInternetGateway",
        "ec2:AttachInternetGateway",
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:AuthorizeSecurityGroupEgress",
        "ec2:RevokeSecurityGroupEgress",
        "ec2:CreateNetworkAcl",
        "ec2:CreateNetworkAclEntry",
        "ec2:ReplaceNetworkAclAssociation",
        "ec2:CreateTags"
      ],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "us-east-1" } }
    },
    {
      "Sid": "RunOnlyT3Micro",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:us-east-1:<ACCOUNT_ID>:instance/*",
      "Condition": { "StringEquals": { "ec2:InstanceType": "t3.micro" } }
    },
    {
      "Sid": "RunInstancesNetworkAndVolume",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": [
        "arn:aws:ec2:us-east-1:<ACCOUNT_ID>:network-interface/*",
        "arn:aws:ec2:us-east-1:<ACCOUNT_ID>:subnet/*",
        "arn:aws:ec2:us-east-1:<ACCOUNT_ID>:security-group/*",
        "arn:aws:ec2:us-east-1:<ACCOUNT_ID>:volume/*"
      ]
    },
    {
      "Sid": "RunInstancesAmazonImagesOnly",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:us-east-1::image/*",
      "Condition": { "StringEquals": { "ec2:Owner": "amazon" } }
    },
    {
      "Sid": "ChangeOrDeleteOnlyTagged",
      "Effect": "Allow",
      "Action": [
        "ec2:TerminateInstances",
        "ec2:ModifyInstanceAttribute",
        "ec2:ModifyInstanceCreditSpecification",
        "ec2:ModifyInstancePlacement",
        "ec2:ModifyPrivateDnsNameOptions",
        "ec2:DeleteVpc",
        "ec2:DeleteSubnet",
        "ec2:DeleteRouteTable",
        "ec2:DeleteRoute",
        "ec2:DetachInternetGateway",
        "ec2:DeleteInternetGateway",
        "ec2:DeleteSecurityGroup",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:DeleteNetworkAcl",
        "ec2:DeleteNetworkAclEntry",
        "ec2:DeleteTags"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:RequestedRegion": "us-east-1", "aws:ResourceTag/sim:golden": "true" }
      }
    },
    {
      "Sid": "ReachabilityAnalyzer",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateNetworkInsightsPath",
        "ec2:StartNetworkInsightsAnalysis",
        "ec2:DeleteNetworkInsightsAnalysis",
        "ec2:DeleteNetworkInsightsPath"
      ],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "us-east-1" } }
    },
    {
      "Sid": "ReadEc2",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeAddresses",
        "ec2:DescribeAvailabilityZones",
        "ec2:DescribeCustomerGateways",
        "ec2:DescribeIamInstanceProfileAssociations",
        "ec2:DescribeInstanceAttribute",
        "ec2:DescribeInstanceCreditSpecifications",
        "ec2:DescribeInstances",
        "ec2:DescribeInternetGateways",
        "ec2:DescribeKeyPairs",
        "ec2:DescribeLaunchTemplates",
        "ec2:DescribeLaunchTemplateVersions",
        "ec2:DescribeManagedPrefixLists",
        "ec2:DescribeNatGateways",
        "ec2:DescribeNetworkAcls",
        "ec2:DescribeNetworkInsightsAnalyses",
        "ec2:DescribeNetworkInsightsPaths",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DescribePrefixLists",
        "ec2:DescribeRegions",
        "ec2:DescribeRouteTables",
        "ec2:DescribeSecurityGroupRules",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeSubnets",
        "ec2:DescribeTags",
        "ec2:DescribeTransitGatewayAttachments",
        "ec2:DescribeTransitGatewayConnects",
        "ec2:DescribeTransitGatewayPeeringAttachments",
        "ec2:DescribeTransitGatewayPolicyTables",
        "ec2:DescribeTransitGatewayRouteTables",
        "ec2:DescribeTransitGateways",
        "ec2:DescribeTransitGatewayVpcAttachments",
        "ec2:DescribeVolumes",
        "ec2:DescribeVpcAttribute",
        "ec2:DescribeVpcEncryptionControls",
        "ec2:DescribeVpcEndpoints",
        "ec2:DescribeVpcEndpointServiceConfigurations",
        "ec2:DescribeVpcPeeringConnections",
        "ec2:DescribeVpcs",
        "ec2:DescribeVpnConnections",
        "ec2:DescribeVpnGateways",
        "ec2:GetManagedPrefixListEntries",
        "ec2:GetTransitGatewayPolicyTableAssociations",
        "ec2:GetTransitGatewayPolicyTableEntries",
        "ec2:GetTransitGatewayRouteTablePropagations",
        "ec2:SearchTransitGatewayRoutes"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ReachabilityAnalyzerReads",
      "Effect": "Allow",
      "Action": [
        "directconnect:DescribeConnections",
        "directconnect:DescribeDirectConnectGatewayAssociations",
        "directconnect:DescribeDirectConnectGatewayAttachments",
        "directconnect:DescribeDirectConnectGateways",
        "directconnect:DescribeVirtualGateways",
        "directconnect:DescribeVirtualInterfaces",
        "elasticloadbalancing:DescribeListeners",
        "elasticloadbalancing:DescribeLoadBalancerAttributes",
        "elasticloadbalancing:DescribeLoadBalancers",
        "elasticloadbalancing:DescribeRules",
        "elasticloadbalancing:DescribeTags",
        "elasticloadbalancing:DescribeTargetGroupAttributes",
        "elasticloadbalancing:DescribeTargetGroups",
        "elasticloadbalancing:DescribeTargetHealth",
        "globalaccelerator:ListAccelerators",
        "globalaccelerator:ListCustomRoutingAccelerators",
        "globalaccelerator:ListCustomRoutingEndpointGroups",
        "globalaccelerator:ListCustomRoutingListeners",
        "globalaccelerator:ListCustomRoutingPortMappings",
        "globalaccelerator:ListEndpointGroups",
        "globalaccelerator:ListListeners",
        "network-firewall:DescribeFirewall",
        "network-firewall:DescribeFirewallMetadata",
        "network-firewall:DescribeFirewallPolicy",
        "network-firewall:DescribeResourcePolicy",
        "network-firewall:DescribeRuleGroup",
        "network-firewall:ListFirewallPolicies",
        "network-firewall:ListFirewalls",
        "network-firewall:ListRuleGroups",
        "tiros:CreateQuery",
        "tiros:ExtendQuery",
        "tiros:GetQueryAnswer",
        "tiros:GetQueryExplanation",
        "tiros:GetQueryExtensionAccounts"
      ],
      "Resource": "*"
    }
  ]
}
```

Notes: `CreateTags` is region-scoped, not tag-scoped, because CloudFormation may tag after create. The default network ACL and the main route table are untagged, so association changes stay region-scoped. Deletes and terminations only reach resources tagged `sim:golden=true`.

Sources: https://docs.aws.amazon.com/vpc/latest/reachability/security_iam_required-API-permissions.html · https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonVPCReachabilityAnalyzerFullAccessPolicy.html · CloudFormation registry schemas (`handlers.*.permissions`), https://schema.cloudformation.us-east-1.amazonaws.com/CloudformationSchema.zip

### 9.3 No `cdk bootstrap`

With D1 nothing needs bootstrapping: the template has no assets, no bootstrap version rule, and the tool deploys it with the caller's permissions. If you prefer `cdk deploy`, the one-time step would be `pnpm exec cdk bootstrap aws://<ACCOUNT_ID>/us-east-1` (needs the `aws-cdk` CLI package). It creates the `CDKToolkit` stack with a staging bucket, a repository and IAM roles, and its CloudFormation execution role gets `AdministratorAccess` unless you pass `--cloudformation-execution-policies`. That is why D1 avoids it.

### 9.4 Billable resources per run

| Item                                 | S1  | S2  | S3  | S4  | S5  |
| ------------------------------------ | --- | --- | --- | --- | --- |
| t3.micro instance (standard credits) | 1   | 1   | 2   | 1   | 1   |
| EBS root volume (AMI default)        | 1   | 1   | 2   | 1   | 1   |
| Public IPv4 address (auto-assigned)  | 1   | 1   | 2   | 1   | 1   |
| Reachability Analyzer analyses       | 3   | 2   | 2   | 2   | 3   |

They exist from the first stage that creates them until the stack delete finishes. No NAT gateways, Elastic IPs or transit gateways. No prices here; check:

- Reachability Analyzer and public IPv4 addresses: https://aws.amazon.com/vpc/pricing/
- EC2 instances: https://aws.amazon.com/ec2/pricing/on-demand/
- EBS volumes: https://aws.amazon.com/ebs/pricing/
- CloudFormation: https://aws.amazon.com/cloudformation/pricing/

## 10. Dependencies (approval pending)

All published at least 14 days before 2026-11-05. Installed with exact versions in `tools/golden` only.

| Package                        | Version  | Published  | Kind | Why                                                     |
| ------------------------------ | -------- | ---------- | ---- | ------------------------------------------------------- |
| aws-cdk-lib                    | 2.274.0  | 2026-10-20 | dep  | L1 constructs, synthesis, `Template.fromStack` in tests |
| constructs                     | 10.8.1   | 2026-08-03 | dep  | peer of aws-cdk-lib (`^10.5.0`)                         |
| @aws-sdk/client-cloudformation | 3.1156.0 | 2026-10-22 | dep  | stacks, waiters, `ListStacks`                           |
| @aws-sdk/client-ec2            | 3.1156.0 | 2026-10-22 | dep  | Reachability Analyzer and read-only describes           |
| @aws-sdk/client-sts            | 3.1156.0 | 2026-10-22 | dep  | `GetCallerIdentity`                                     |
| tsx                            | 4.23.15  | 2026-09-20 | dev  | runs the CLI (D7)                                       |

Newer releases exist (aws-cdk-lib 2.275.0 on 2026-10-26, SDK 3.1162.0 on 2026-11-04) but are younger than 14 days. All need Node 20 or newer (we pin 24). The SDK clients bring `@smithy/*` and the default credential chain transitively; the lockfile pins them. No `aws-cdk` CLI. `tools/golden` also gets `@sim/engine` (`workspace:*`) and `zod`.

## 11. Code layout

```text
packages/engine/golden/                  exported as "@sim/engine/golden"; pure, same lint rules as src
  index.ts  scenario.ts  fixture.ts  hash.ts  sha256.ts  canonical-json.ts
  compare.ts  leaks.ts  codes.ts         codes.ts: TRC-04 routing and filtering lists
  scenarios/  s1-…ts … s5-…ts  index.ts
packages/engine/__tests__/golden/
  golden.test.ts  import-meta-glob.d.ts
  fixtures/                              written only by the tool (.gitkeep)
packages/engine/__tests__/golden-*.test.ts   hash, canonical JSON, compare, leak check
packages/labs/__tests__/golden-scenarios.test.ts
tools/golden/
  iam/capture-policy.json
  src/cli/capture.ts  src/cli/cleanup.ts  src/args.ts
  src/plan.ts                            dry-run plan and printing
  src/cdk/translate.ts  src/cdk/stages.ts
  src/analyses.ts                        query → CreateNetworkInsightsPath input (2.2)
  src/normalize.ts  src/id-map.ts
  src/capture.ts  src/cleanup.ts         orchestration over the ports below
  src/aws/ports.ts                       interfaces: Identity, Stacks, Inventory, Reachability, FixtureStore, Prompt, Clock
  src/aws/sdk.ts                         the only file that imports @aws-sdk/*
tools/golden/__tests__/fakes/            hand-written fakes of the ports
```

Also: engine `tsconfig` includes `golden`; the ESLint purity block covers `packages/engine/golden/**`; the ESLint and Prettier ignores narrow from `packages/engine/__tests__/golden/` to its `fixtures/` folder, so the test file is linted.

## 12. Phase B: TDD

Order: skill and doc updates (section 13), then failing tests, then code. Test names start with the rule ID.

Engine (`packages/engine`):

- `TRC-06: sha256 matches the FIPS 180-4 example vectors` (including a multi-byte UTF-8 string).
- `TRC-06: canonical JSON sorts keys, keeps array order and rejects non-finite numbers`.
- `TRC-06: the scenario hash ignores titles, labels, rule IDs, legs and expected results`.
- `TRC-06: the scenario hash changes with the topology, a query or the mapping version`.
- `ADR-05: a non-canonical CIDR hashes like its canonical form`.
- `TRC-06: a found path matches REACHED and nothing else`; `… codes must equal the failing hop's codes`; `… routing codes mean BROKE_AT_HOP and filtering codes ROUTED_THEN_DROPPED`; `… unmapped, mixed or missing codes fail`.
- `TRC-06: the leak check flags ARNs, 12-digit numbers, unknown AWS IDs and unknown addresses, and passes a clean fixture`.
- `golden.test.ts` as in section 6.

Labs: `TRC-06: golden S1 and S2 use the lab 1 solution topology and S5 the initial one`.

Tools (`tools/golden`), with hand-written fakes:

- Normalizer: `TRC-06: real IDs become scenario IDs`; `… ARNs, account IDs, Regions and zone IDs are dropped`; `… the real public IP becomes the scenario public IP`; `… an unknown ID or address stops the capture`; `… fields outside the allow-list are dropped`; `… SDK names map to fixture names`.
- Mapping: `TRC-06: internet → instance uses the internet gateway as source and FilterAtSource`; `… instance → internet uses it as destination`; `… other shapes are rejected`.
- Translation (`Template.fromStack` assertions only): `RT-01: the main route table gets no resource and unassociated subnets use it`; `RT-01: routes in the main table or an explicit main association are rejected`; `SG-05: the default group is referenced with GetAtt and must keep its default rules`; `SG-05: custom groups always declare egress`; `SG-02: a group without outbound rules is rejected`; `NACL-05: the default ACL is referenced with GetAtt and must keep rule 100`; `NACL-02: entries map protocol, ports, direction and action`; `SG-04: rules with a group peer become separate rule resources`; `IGW-05: an attached gateway gets an attachment and its routes depend on it`; `ADR-10: an auto-assigned public IP sets AssociatePublicIpAddress and depends on the attachment`; `TRC-06: only allow-listed resource types, no CDK metadata resource, no bootstrap parameter or rule`; `TRC-06: logical IDs come from topology IDs`; `TRC-06: instances are t3.micro with standard credits and the AL2023 parameter`; `TRC-06: windows instances and Elastic IPs are rejected`.
- Stages: `RT-08: a route to a detached gateway builds in three valid stages`; `RT-08: two routed detached gateways in one VPC are rejected`; `TRC-06: other topologies have one stage`.
- Plan: `TRC-06: the dry run lists stages, resources, billable items, analyses and the hash without creating AWS clients`.
- Capture: `TRC-06: an account mismatch stops after the identity check`; `… a region mismatch stops`; `… leftovers stop the capture`; `… no confirmation, no deploy`; `… teardown runs when a deploy, an analysis or the normalizer fails`; `… the fixture is written only when every analysis succeeded and the leak check is clean`; `RT-08: a route that isn't blackhole after the last stage stops before any analysis`; `TRC-06: analyses and paths are deleted even when the stack delete fails`; `TRC-06: an incomplete teardown exits 2 and prints the cleanup command`.
- Cleanup: `TRC-06: cleanup only touches resources tagged sim:golden=true`; `… deletes in dependency order`; `… the dry run deletes nothing`; `… account and region checks`.
- Args: `TRC-06: --account must be 12 digits and is required without --dry-run; unknown flags fail`.

Done for phase B: `pnpm typecheck`, `pnpm lint`, `pnpm test` pass; no fixture exists yet, so no golden comparison runs.

## 13. Skill and doc updates (phase B, before code)

- `trace-model.md` TRC-06: mapping (2.2), request and reply legs (2.3), comparison rule (section 6), "no packets, so no listener check", IP addresses allowed as destinations; status verified 2026-11-05.
- `routing.md` RT-08: `CreateRoute` needs an attached gateway, so the blackhole state needs attach, route, detach before any public address exists. Q1, Q8: point to S3 and S4. Q10, Q11: point to section 3.
- `trace-model.md` Q7: path components are stored for review. New Q12 (below).
- AGENTS.md "Commands", root `package.json` scripts, `docs/specs/r0-engine.md` 8.6 (points here).

## 14. Open questions

- Q12 (new, trace-model): with two stacked faults (S5 q1), does Reachability Analyzer list one blocking explanation or several? The engine reports only the first failing hop.
- Q13 (new, trace-model): does an internet gateway source honor `FilterAtSource.SourceAddress` and `SourcePortRange` as in 2.2? S1 answers it.
- Golden results don't fit the fidelity labels (`Exact` means documented). Proposal: keep the label and add a `Golden: <scenario-id> <date>` line to the rule record when a fixture confirms it.

## Open items (not in P9)

Reference cards batch 2 and the second review of batch 1; the missing console captures listed in `docs/specs/p7-lab1.md` (the section 3 run can capture Edit subnet settings and Attach internet gateway on the way).

## Phase B notes (2026-11-05)

- Dependencies installed with the exact versions in section 10. `pnpm-workspace.yaml` sets `allowBuilds: esbuild: false`: tsx runs with esbuild's prebuilt binary, so its install script never runs (CI's frozen install failed on the ignored build otherwise).
- Two translator errors added while writing the tests: `GOLDEN_SG_PEER_EGRESS` (an outbound rule with a group peer needs a separate egress resource, and CloudFormation would then add its default egress) and `GOLDEN_PUBLIC_IP_WITHOUT_IGW` (open until Q11 is answered).
- aws-cdk-lib 2.274 runs a built-in CloudFormation validation on synth. Its W3010 warning (literal Availability Zone) is acknowledged per subnet with `Validations.of(subnet).acknowledge()`: the zone comes from the topology on purpose.
- When results can't become a fixture (unknown ID, leak, schema), the raw responses go to `<os tmpdir>/sim-golden-diagnostics/` (mode 0600), never the repository, so a paid run isn't lost.
- The IAM policy in 9.2 is stored as `tools/golden/iam/capture-policy.json`.
- The golden test file is now linted and formatted; only `packages/engine/__tests__/golden/fixtures/` stays ignored.
- First S4 run (2026-11-05) failed at stage 3 with `UPDATE_ROLLBACK_COMPLETE`, then tore down cleanly. Cause: route logical IDs used the route's position, so the blackhole route was `Route0` in stage 1 and `Route1` in stage 3, and CloudFormation tried to recreate it toward the detached gateway. Route logical IDs now come from the destination (`Rtb00000002Route198d51d100d0s24`), and a test checks that resources shared by consecutive stages keep the same properties. Stack failures now print CloudFormation's own reasons. The S1 and S3 fixtures stay valid: logical IDs aren't part of the hash.
- All five fixtures captured on 2026-11-05. Eleven of twelve analyses matched at once; `s4-q8-blackhole` `web-to-198-51-100-10-443` agreed on the verdict but reported `MORE_SPECIFIC_ROUTE` instead of the engine's `BAD_STATE_ROUTE`. Decided with the user (Q14, RT-08): the engine now reports `MORE_SPECIFIC_ROUTE` when a blackhole route shadows a less specific active route, and keeps `BAD_STATE_ROUTE` (Inferred) when no active route matches. Answered: Q1, Q12, Q13; Q7 for F1 and F2. Open: Q8 (public subnet with only a blackhole route), the `BAD_STATE_ROUTE` case, Q10 and Q11 (manual checks, section 3).
- Checking a fixture by hand: `grep -nE 'arn:|[0-9]{12}'` also matches digit runs inside `scenarioHash`. Use the golden test's leak check instead (`pnpm test:engine`).
