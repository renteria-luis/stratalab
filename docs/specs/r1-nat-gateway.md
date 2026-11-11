# R1 spec: public NAT gateway

Status: approved 2026-11-08 (the user delegated the section 7 decisions; the recommended options are applied) · Date: 2026-11-07 · Package: `packages/engine`
Rules: NAT-01 to NAT-09 in `.claude/skills/aws-network-rules/references/routing.md` (all verified 2026-11-07; NAT-05 was `to-verify`). Also RT-04, RT-05, RT-09, IGW-01, IGW-02, IGW-06, IGW-07, NACL-02..04, EPH-01..03, SG-01, SG-02, TRC-01..05. Open questions: Q7 (F3 order), Q15, Q16, Q17.

Adds one zonal public NAT gateway resource, the route target `nat-gateway` and trace flow F3. Builds on `docs/specs/r0-engine.md`; everything not listed here stays as it is.

## 1. Scope

In: schema, `validate()`, `trace()` (F3, TCP), `deriveStatus()`, creation helper, the IGW-07 detach check.
Out (Unsupported, can't be expressed): private and regional NAT gateways, secondary addresses, more than one Elastic IP (NAT-06), NAT gateway states other than `available`, deleting a NAT gateway, UDP and ICMP traces, peering, VPN and transit gateway (NAT-03).
Not in this step: console views (NAT gateways page, Create NAT gateway form). They need console captures first.

## 2. Schema

```ts
type NatGateway = {
  id: NatGatewayId; // "nat-" + 1 to 17 lowercase hex, our convention
  name?: string;
  subnetId: SubnetId; // its Availability Zone is the subnet's (NAT-07)
  connectivityType: 'public'; // default 'public'; 'private' is a schema error (NAT-06)
  privateIpAddress: Ipv4; // ADR-04, ADR-09, NAT-07
  elasticIpAddress: Ipv4; // ADR-10, NAT-01
};

type Route = {
  destinationCidrBlock: Ipv4Cidr;
  target:
    | { type: 'internet-gateway'; internetGatewayId: InternetGatewayId }
    | { type: 'nat-gateway'; natGatewayId: NatGatewayId }; // new (RT-05 static target)
};

type Topology = {
  /* ...R0 keys... */
  internetGateways: InternetGateway[];
  natGateways?: NatGateway[]; // new, optional: absent means none
  /* securityGroups, networkAcls, instances */
};
```

- `schemaVersion` stays `1`: the change only adds an optional key, so no migration is needed. The parser doesn't add the key when it is absent, so R0 YAML, saved data and the golden scenario hashes (`docs/specs/p9-golden.md` section 4) stay the same.
- The Elastic IP is stored as an address, not as a separate resource (same as an instance's `publicIp`).
- Structural checks: `DUPLICATE_ID` for NAT gateway IDs, `UNKNOWN_REFERENCE` for `subnetId` and `natGatewayId`.

## 3. `validate()`

New resource type `nat-gateway`; issues follow topology key order, so NAT gateway issues come after internet gateway issues.

| Code                          | Severity | Rule IDs               | Fidelity                                      | Raised when                                                                                              |
| ----------------------------- | -------- | ---------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NAT_SUBNET_NOT_PUBLIC`       | warning  | NAT-01, RT-09          | Exact rule, Inferred severity                 | The NAT gateway's subnet route table has no route to an internet gateway                                 |
| `NAT_VPC_NO_INTERNET_GATEWAY` | error    | NAT-07, IGW-07         | Inferred                                      | The NAT gateway's VPC has no attached internet gateway (this state can't exist in AWS)                   |
| `IP_OUT_OF_SUBNET`            | error    | ADR-09, NAT-07         | Exact                                         | The NAT gateway's private IP is outside its subnet                                                       |
| `IP_RESERVED`                 | error    | ADR-04, NAT-07         | Exact                                         | The NAT gateway's private IP is one of the 5 reserved addresses                                          |
| `IP_DUPLICATE`                | error    | ADR-09, ADR-10, NAT-07 | Inferred (private), Exact (Elastic IP in use) | The private IP equals an interface's or another NAT gateway's; the Elastic IP equals any other public IP |
| `PUBLIC_IP_INVALID`           | error    | ADR-10                 | Exact                                         | The Elastic IP is in RFC 1918, RFC 6598, a restricted range or a VPC CIDR                                |
| `VPC_MISMATCH`                | error    | RT-05, Q17             | Inferred                                      | A route targets a NAT gateway in another VPC                                                             |
| `QUOTA_EXCEEDED`              | warning  | NAT-08                 | Exact (default)                               | More than 5 NAT gateways in one Availability Zone (`params.quota: 'nat-gateways-per-az'`)                |

A NAT gateway in another Availability Zone than the subnets that use it raises nothing (NAT-09).

## 4. `trace()`

### 4.1 Query and flow

- New optional `natSourcePort` (1024–65535, default 1024): the port the NAT gateway gives the connection (NAT-04, EPH-02 style). Outside that range: `blocked`, `INVALID_QUERY`. Ignored when the path has no NAT gateway.
- `flow` is `F3` when the source subnet's route lookup (forward hop 2) picks a NAT gateway route, otherwise `F2` as before. F3 exists only for instance → internet.
- Blocked: an internet address equal to a NAT gateway's Elastic IP is a hairpin, `UNSUPPORTED_FEATURE` (IGW-06), as for instance public IPs.
- Result types: `HopStep` adds `nat-gateway`; component type adds `nat-gateway`; a route match `target` can be a NAT gateway ID; `translatedTo` also appears on `nat-gateway` hops; `ReasonCode` adds `UNSUPPORTED_FEATURE` (section 4.3).

### 4.2 F3 hop sequence

Fixture `nat-base` (section 6): `app-1` 10.0.2.10 (linux, port 32768) → 198.51.100.7:443 through `nat-a` (10.0.1.20, Elastic IP 203.0.113.30, port 1024).

| #   | Dir     | Step          | Component              | Packet (as it arrives)                                | Checks and fail codes                                                                          | Rule IDs                |
| --- | ------- | ------------- | ---------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------- |
| 0   | forward | sg-egress     | eni of app-1           | 10.0.2.10:32768 → 198.51.100.7:443                    | `SG_HAS_NO_RULES`, `ENI_SG_RULES_MISMATCH`                                                     | SG-02, SG-03            |
| 1   | forward | nacl-outbound | private subnet         | same                                                  | `SUBNET_ACL_RESTRICTION`; skipped `same-subnet` if the NAT gateway is in this subnet           | NACL-02, NACL-04        |
| 2   | forward | route-lookup  | private route table    | same                                                  | picks `0.0.0.0/0 → nat-a`; `NO_ROUTE_TO_DESTINATION`, `BAD_STATE_ROUTE`, `MORE_SPECIFIC_ROUTE` | RT-02, RT-04, RT-05     |
| 3   | forward | nacl-inbound  | NAT subnet             | same                                                  | `SUBNET_ACL_RESTRICTION` (remote address 10.0.2.10, port 443)                                  | NACL-02, NAT-05         |
| 4   | forward | nat-gateway   | nat-a                  | same → 10.0.1.20:1024 → 198.51.100.7:443              | no security group (NAT-05); `NGW_REQUIRES_SOURCE_IN_VPC` can't occur in R1                     | NAT-03, NAT-04, NAT-05  |
| 5   | forward | nacl-outbound | NAT subnet             | 10.0.1.20:1024 → 198.51.100.7:443                     | `SUBNET_ACL_RESTRICTION`                                                                       | NACL-02, NAT-05         |
| 6   | forward | route-lookup  | NAT subnet route table | same                                                  | must pick an internet gateway route; same codes as hop 2; a NAT gateway target is Q16          | RT-04, NAT-01, RT-08    |
| 7   | forward | igw-egress    | igw-0000000a           | same → 203.0.113.30:1024                              | as F2 (the NAT gateway's Elastic IP is its public address)                                     | IGW-01, IGW-03, NAT-04  |
| 8   | return  | igw-ingress   | igw-0000000a           | 198.51.100.7:443 → 203.0.113.30:1024 → 10.0.1.20:1024 | as F2                                                                                          | IGW-02, RT-02           |
| 9   | return  | nacl-inbound  | NAT subnet             | 198.51.100.7:443 → 10.0.1.20:1024                     | `SUBNET_ACL_RESTRICTION`: needs inbound 1024–65535 from the internet                           | NAT-04, NAT-05, EPH-01  |
| 10  | return  | nat-gateway   | nat-a                  | same → 198.51.100.7:443 → 10.0.2.10:32768             | stateful response, always passes                                                               | NAT-02, NAT-04          |
| 11  | return  | nacl-outbound | NAT subnet             | 198.51.100.7:443 → 10.0.2.10:32768                    | `SUBNET_ACL_RESTRICTION`; skipped `same-subnet` as in hop 1                                    | NACL-03, NAT-05, EPH-02 |
| 12  | return  | route-lookup  | NAT subnet route table | same                                                  | local route                                                                                    | RT-03                   |
| 13  | return  | nacl-inbound  | private subnet         | same                                                  | `SUBNET_ACL_RESTRICTION`; skipped `same-subnet` as in hop 1                                    | NACL-03, EPH-01         |
| 14  | return  | sg-ingress    | eni of app-1           | same                                                  | skipped `stateful-response`                                                                    | SG-01                   |

- Order: TRC-01, the same as the golden-checked F1 and F2 (NACL outbound before the route lookup). TRC-03 F3 in the skill lists the route before the NACL and changes to this order. Fidelity of the order: Inferred until a golden F3 run answers Q7.
- Hop fidelity: Exact, except hop 8 (Inferred, Q1, as in F2) and hop 12 (Inferred, the docs don't list it).
- Verdicts as TRC-02: route, NAT gateway and internet gateway hops give `BROKE_AT_HOP`; NACL and security group hops give `ROUTED_THEN_DROPPED`.

### 4.3 Routes to a NAT gateway outside F3

| Case                                                                                     | Result                                                                             | Rule IDs       | Fidelity    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------- | ----------- |
| F1 return: the server subnet's route table sends the client to a NAT gateway             | `BROKE_AT_HOP`, return route lookup, `UNSUPPORTED_FEATURE`; never `REACHED`        | NAT-02, Q15    | Unsupported |
| F3 hop 6: the NAT subnet's route table sends the destination to a NAT gateway            | `BROKE_AT_HOP`, hop 6, `UNSUPPORTED_FEATURE`                                       | NAT-01, Q16    | Unsupported |
| F0: a route to a NAT gateway can't win for a VPC address (`LOCAL_ROUTE_CONFLICT`, RT-03) | no change                                                                          | RT-03          | Exact       |
| Internet client → instance behind a NAT gateway                                          | F1, hop 0 `IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS` (the instance has no public IP) | NAT-02, IGW-02 | Exact       |

## 5. `deriveStatus()` and helpers

`Status` adds:

```ts
natGateways: Record<
  NatGatewayId,
  {
    state: 'available'; // the only state R1 models
    connectivityType: 'public';
    vpcId: VpcId;
    subnetId: SubnetId;
    availabilityZone: string;
    privateIpAddress: Ipv4;
    elasticIpAddress: Ipv4;
  }
>;
```

- Route table routes can show a NAT gateway target, always `active`.
- `availableIpv4Count` also subtracts NAT gateways in the subnet (NAT-07).
- A route to a NAT gateway doesn't make a subnet public (RT-09).

Helpers:

- `createNatGateway(topology, { subnetId, name?, privateIpAddress? })` → `{ natGatewayId, privateIpAddress, elasticIpAddress }`. The private IP is the first free usable address unless given (AWS picks one at random: Inferred, as for launch). The Elastic IP comes from the public pool 203.0.113.0/24 ("Allocate Elastic IP"). The ID follows section 3.8 of the R0 spec with prefix `nat`.
- Errors: `UNKNOWN_REFERENCE`, `NO_FREE_PRIVATE_ADDRESS`, `PUBLIC_POOL_EXHAUSTED`, and new `NAT_VPC_NO_INTERNET_GATEWAY` (NAT-07). A subnet without an internet gateway route is allowed; `validate()` warns.
- `replaceRoutes` accepts NAT gateway targets through the schema; no new route helper.
- `detachInternetGateway` also counts NAT gateways' Elastic IPs for `IGW_HAS_PUBLIC_ADDRESSES` (IGW-07, NAT-07).

The UI gets i18n strings for the new issue, reason and helper codes (`es`, `en`).

## 6. Test cases

Fixture `nat-base` = R0 `base` (section 3.9) plus:

- subnet `private-a` (`subnet-0000000b`, 10.0.2.0/24, us-east-1a) on route table `private-rt` (`rtb-00000003`: 0.0.0.0/0 → `nat-0000000a`);
- NAT gateway `nat-a` (`nat-0000000a`) in `public-a`, 10.0.1.20, Elastic IP 203.0.113.30;
- instance `app-1` (`i-0000000b`, `eni-0000000b`, 10.0.2.10, no public IP, linux), group `app` (`sg-0000000b`: no inbound rules, outbound all to 0.0.0.0/0), no services.

Query `F3` = `app-1` → 198.51.100.7:443. Both subnets use the default network ACL (allow all) unless stated.

Schema and validate:

- `NAT-06: a private NAT gateway or an unknown key is a schema error`.
- `SCHEMA: a topology without natGateways parses without adding the key`; `SCHEMA: a route to an unknown NAT gateway is a schema error`.
- `NAT-01: a NAT gateway in a subnet without an internet gateway route raises NAT_SUBNET_NOT_PUBLIC`; twin in `public-a` raises nothing.
- `NAT-07: a NAT gateway in a VPC without an attached internet gateway is an error`.
- `NAT-07: the NAT gateway's private IP is checked like an interface's` (out of subnet, reserved, duplicate of web-1's).
- `NAT-07: an Elastic IP already used by an instance is IP_DUPLICATE`; `ADR-10: a private Elastic IP is PUBLIC_IP_INVALID`.
- `NAT-08: six NAT gateways in one zone raise QUOTA_EXCEEDED; five don't`.
- `RT-05: a route to a NAT gateway of another VPC is VPC_MISMATCH (Q17)`.

Trace:

| Test                                                                          | Change to `nat-base`                                                            | Query                       | Expected                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| `TRC-02: F3 reaches the internet through the NAT gateway`                     | none                                                                            | F3                          | `REACHED`, flow `F3`, 15 hops, translations on hops 4, 7, 8 and 10 as in 4.2           |
| `NAT-05: no security group hop at the NAT gateway`                            | none                                                                            | F3                          | no `sg-*` hop has component `nat-0000000a`                                             |
| `NAT-04: the NAT port can be chosen`                                          | none                                                                            | F3, `natSourcePort` 40000   | `REACHED`, hop 4 `translatedTo.sourcePort` 40000                                       |
| `NAT-04: a NAT port outside 1024-65535 is rejected`                           | none                                                                            | F3, `natSourcePort` 80      | `blocked`, `INVALID_QUERY`                                                             |
| `NAT-05: the NAT subnet NACL must let the reply in on 1024-65535`             | `public-a` NACL: in 100 allow tcp 443 from 10.0.0.0/16; out 100 allow all       | F3                          | `ROUTED_THEN_DROPPED`, return, hop 9, `SUBNET_ACL_RESTRICTION`, match `*`              |
| `EPH-03: allowing 1024-65535 inbound on the NAT subnet fixes it`              | same plus in 110 allow tcp 1024–65535 from 0.0.0.0/0                            | F3                          | `REACHED`                                                                              |
| `NAT-05: the NAT subnet NACL must let the private subnet in`                  | `public-a` NACL: in 90 deny all from 10.0.2.0/24, in 100 allow all              | F3                          | `ROUTED_THEN_DROPPED`, forward, hop 3, match rule 90                                   |
| `NAT-05: the NAT subnet NACL must let the reply out to the instance`          | `public-a` NACL: out 100 allow tcp 443 only                                     | F3                          | `ROUTED_THEN_DROPPED`, return, hop 11                                                  |
| `NAT-01: a NAT gateway in a private subnet breaks at its route lookup`        | move `nat-a` to a new subnet 10.0.3.0/24 on the main table (NAT IP 10.0.3.20)   | F3                          | warning `NAT_SUBNET_NOT_PUBLIC`; `BROKE_AT_HOP`, hop 6, `NO_ROUTE_TO_DESTINATION`      |
| `RT-04: a more specific internet gateway route bypasses the NAT gateway`      | `private-rt` adds 198.51.100.0/24 → `igw-0000000a`                              | F3                          | flow `F2`, `BROKE_AT_HOP`, hop 3, `IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS`               |
| `NAT-02: an internet client can't reach an instance behind a NAT gateway`     | none                                                                            | internet → app-1 public :80 | `BROKE_AT_HOP`, hop 0, `IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`, `destinationIp: null` |
| `SG-02: no outbound rules, no NAT gateway use`                                | `app` outbound empty                                                            | F3                          | `ROUTED_THEN_DROPPED`, hop 0, `SG_HAS_NO_RULES`                                        |
| `SG-01: the reply skips the instance security group`                          | none (`app` has no inbound rules)                                               | F3                          | `REACHED`, hop 14 `skipped` `stateful-response`                                        |
| `NAT-09: a subnet in another zone can use the NAT gateway`                    | `private-a` in us-east-1b                                                       | F3                          | `REACHED`, no issues                                                                   |
| `NAT-02: a reply routed to a NAT gateway is unsupported (Q15)`                | `web-2` in `private-a` with public IP 203.0.113.26 and group `web`, nginx on 80 | internet → web-2 public :80 | `BROKE_AT_HOP`, return route lookup, `UNSUPPORTED_FEATURE`, fidelity `Unsupported`     |
| `NAT-01: a NAT subnet route to a NAT gateway is unsupported (Q16)`            | `public-rt` adds 198.51.100.0/24 → `nat-0000000a`                               | F3                          | `BROKE_AT_HOP`, hop 6, `UNSUPPORTED_FEATURE`                                           |
| `NAT-07: a NAT gateway in a VPC without an internet gateway blocks the trace` | detach `igw-0000000a`                                                           | F3                          | `blocked`, `NAT_VPC_NO_INTERNET_GATEWAY`                                               |
| `IGW-06: the NAT gateway's Elastic IP as an internet address is a hairpin`    | none                                                                            | app-1 → 203.0.113.30:443    | `blocked`, `UNSUPPORTED_FEATURE`                                                       |
| `TRC-05: F3 gives the same result for the same input`                         | none                                                                            | F3                          | deep-equal results, contiguous hop indexes                                             |

deriveStatus and helpers:

- `NAT-07: a NAT gateway uses one address of its subnet` (`public-a` available count 249).
- `RT-09: a route to a NAT gateway doesn't make a subnet public` (`private-a` is private).
- `NAT-01: status lists the NAT gateway as available and public, with its zone and addresses`; `RT-05: a route to a NAT gateway is active`.
- `NAT-07: createNatGateway picks the first free address and allocates an Elastic IP from the pool`.
- `NAT-07: createNatGateway fails without an attached internet gateway`; `NAT-07: createNatGateway fails in a full subnet`.
- `NAT-01: createNatGateway in a private subnet succeeds and validate warns`.
- `IGW-07: detach is rejected while a NAT gateway has an Elastic IP`.
- `HELPERS: console steps build nat-base`, then F3 gives `REACHED`.

Golden (later, the user runs it; NAT gateways and Elastic IPs bill per hour): a scenario `s6-f3-nat` with app-1 → internet gateway would answer Q7 for F3, and a second analysis would answer Q15. It needs a P9 spec update first.

## 7. Decisions to confirm

1. `natGateways` is optional (absent = none) and `schemaVersion` stays 1 (no migration, golden hashes unchanged).
2. The Elastic IP is an address on the NAT gateway, not a resource of its own.
3. One concrete NAT port per trace: `natSourcePort`, default 1024.
4. F3 order as in 4.2 (TRC-01, like F1 and F2), with a local route lookup on the way back. The skill's TRC-03 F3 text changes to match.
5. `NAT_SUBNET_NOT_PUBLIC` is a warning (the trace shows the break); `NAT_VPC_NO_INTERNET_GATEWAY` is an error.
6. Q15 and Q16: `UNSUPPORTED_FEATURE` also becomes a hop reason code (`BROKE_AT_HOP`, fidelity `Unsupported`). Q17: `VPC_MISMATCH`.
7. Console views come in a later step, after captures of the NAT gateways pages.

## 8. Docs to update with the code

- Skill: TRC-03 F3 order, TRC-04 code lists (`NAT_VPC_NO_INTERNET_GATEWAY`, `UNSUPPORTED_FEATURE` as a hop code), IGW-07 engine line (NAT gateway Elastic IPs).
- `docs/specs/r0-engine.md`: section 9 (NAT gateway moves out of Unsupported) and section 10 (NAT-05 verified).
- JSDoc of the new evaluators with rule IDs and source URLs.
