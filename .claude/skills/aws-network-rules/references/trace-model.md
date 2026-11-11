# Trace model and reason codes (TRC)

Read for: building `trace()`, hop order, round trips, verdicts, reason codes, golden tests.

### TRC-01 · Checks in one direction
When a packet leaves a network interface:
1. Security group egress of the source interface. Skip it if the packet is a response in an allowed flow (SG-01).
2. If the next hop is outside the source subnet: NACL outbound of the source subnet (NACL-04).
3. Route lookup in the source subnet's route table (RT-02, RT-04 to RT-07). The result is a target.
4. Target rules: local delivery, internet gateway (IGW), NAT gateway (NAT), peering (PCX), endpoint (VPCE), transit gateway (TGW) or virtual private gateway (VPN).

When it arrives in a subnet:
5. NACL inbound of the destination subnet, if the packet crossed a subnet boundary.
6. Security group ingress of the destination interface. Skip it if the packet is a response in an allowed flow.
7. Host: is a service listening on the destination port? If not, the code is `NO_LISTENER` (our own code).

Fidelity: Inferred. The order matches how Reachability Analyzer lists path components; confirm it with golden tests.

### TRC-02 · Round trip
For TCP and UDP request–response traffic, once the forward path passes, run the return path: swap the addresses, use the server port as the source port and the client's ephemeral port as the destination port (EPH-02).
Verdicts:
- `REACHED`: both directions pass.
- `BROKE_AT_HOP`: a route or a target fails, in either direction.
- `ROUTED_THEN_DROPPED`: routing works, but a security group, a NACL or the host drops the packet, in either direction.
Always report which direction failed and at which hop.

### TRC-03 · Canonical flows
Use these as test fixtures and lab templates.

**F0 · Instance → instance in the same VPC, private address (TCP)**
- Forward: security group outbound → NACL outbound only if the subnets differ (NACL-04) → local route (RT-03) → NACL inbound of the destination subnet only if the subnets differ → security group inbound (an SG reference can match, SG-04) → host listening on the port.
- Return: security group passes (stateful) → NACL outbound to the client's ephemeral port, if the subnets differ → local route → NACL inbound, if the subnets differ → security group passes.

**F1 · Internet client → web server in a public subnet (TCP 80)**
- Forward: client → internet gateway (the destination must be the instance's public IP; the gateway maps it to the private IP, IGW-02) → no route table lookup on arrival (RT-02, Q1) → NACL inbound, port 80 → security group inbound, port 80 → host listening on 80.
- Return: security group passes (stateful) → NACL outbound to the client's ephemeral port → the subnet route table must send the client's IP to the internet gateway (IGW-04) → the internet gateway maps the private IP back to the public IP → client.

**F2 · Instance in a public subnet → internet (TCP 443)**
- Forward: security group outbound 443 → NACL outbound 443 → route 0.0.0.0/0 → igw → the internet gateway needs the instance's public IPv4 address (IGW-01) → internet.
- Return: internet gateway → NACL inbound to the instance's ephemeral port (by OS) → security group passes (stateful).

**F3 · Instance in a private subnet → internet through a NAT gateway (TCP 443)**
- Forward: security group outbound 443 → private subnet NACL outbound → private route 0.0.0.0/0 → nat → NAT subnet NACL inbound → NAT gateway (no security group, NAT-05; instance IP → NAT private IP, port remapped, NAT-04) → NAT subnet NACL outbound → NAT subnet route 0.0.0.0/0 → igw → internet gateway (NAT private IP → Elastic IP) → internet.
- Return: internet gateway → NAT subnet NACL inbound to the NAT gateway's port (1024–65535) → NAT gateway (back to the instance, stateful, NAT-02) → NAT subnet NACL outbound to the instance's ephemeral port → NAT subnet route lookup (local) → private subnet NACL inbound → security group passes.
- NACL outbound comes before the route lookup, as TRC-01 and the golden-checked F1 and F2 order (changed 2026-11-08 from "route, then NACL"; Inferred until Q7 covers F3). NACL hops between the instance and the NAT gateway are skipped when they share a subnet (NACL-04). Hop table: `docs/specs/r1-nat-gateway.md` section 4.2.

**F4 · Instance → interface endpoint in another subnet (SSM, TCP 443)**
- First, DNS: VPCE-I03 and DNS-03 decide whether the service name points to the endpoint.
- Forward: security group outbound 443 → NACL outbound → local route → endpoint subnet NACL inbound 443 → endpoint security group inbound 443 → endpoint.
- Return: endpoint subnet NACL outbound to the instance's ephemeral port → instance subnet NACL inbound → security group passes.

**F5 · Instance → S3 through a gateway endpoint (TCP 443)**
- Forward: security group outbound 443 (0.0.0.0/0 or the S3 prefix list) → NACL outbound to the S3 CIDRs (NACL-07) → prefix-list route → vpce (VPCE-G02) → S3.
- Return: NACL inbound to the instance's ephemeral port → security group passes.

### TRC-04 · Reason codes
Reuse these Reachability Analyzer explanation codes with the same name and meaning:
- Routing and targets (`BROKE_AT_HOP`): `NO_ROUTE_TO_DESTINATION`, `MORE_SPECIFIC_ROUTE`, `HIGHER_PRIORITY_ROUTE`, `BAD_STATE_ROUTE`, `VPC_LOCAL_ROUTE_CIDR_RESTRICTION`, `DISCONNECTED_VPCS`, `IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS`, `IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`, `IGW_DESTINATION_ADDRESS_NOT_IN_RFC1918_EGRESS`, `IGW_DESTINATION_ADDRESS_NOT_IN_RFC6598_EGRESS`, `IGW_SOURCE_ADDRESS_NOT_IN_RFC1918_INGRESS`, `IGW_SOURCE_ADDRESS_NOT_IN_RFC6598_INGRESS`, `NGW_REQUIRES_SOURCE_IN_VPC`, `PCX_REQUIRES_ADDRESS_IN_VPC_CIDR`, `VPCE_INTRA_VPC_TRAFFIC`, `TGW_ATTACH_MISSING_TGW_RTB_ASSOCIATION`, `TGW_RTB_NO_ROUTE_TO_TGW_ATTACHMENT`, `TGW_ROUTE_AZ_RESTRICTION`.
- Filtering (`ROUTED_THEN_DROPPED`): `SUBNET_ACL_RESTRICTION`, `ENI_SG_RULES_MISMATCH`, `SG_HAS_NO_RULES`, `SG_REFERENCING_SUPPORT`, `VPCE_GATEWAY_PROTOCOL_RESTRICTION`.
- Query configuration (the trace doesn't run): `IGW_EXPECTS_PUBLIC_ADDRESS` (IGW-06), and `DISCONNECTED_VPCS` for instances in different VPCs while no peering, transit gateway or VPN is modeled (R0 and R1). Reachability Analyzer's `IGW_NAT_REFLECTION` explains why hairpin paths are Unsupported.

Our own codes, for cases Reachability Analyzer doesn't cover:
- `NO_LISTENER`: no service on the destination port (`ROUTED_THEN_DROPPED`).
- `NO_INTERNET_GATEWAY`: internet traffic aimed at a VPC with no attached internet gateway (`BROKE_AT_HOP`, Inferred, IGW-05, Q10).
- `UNSUPPORTED_FEATURE` as a hop code: a route lookup picks a NAT gateway where the flow can't follow one (a reply, Q15, or the NAT gateway's own subnet, Q16). `BROKE_AT_HOP`, hop fidelity Unsupported.
- Validation: `VPC_SIZE_INVALID`, `VPC_CIDR_RESTRICTED`, `SUBNET_SIZE_INVALID`, `SUBNET_CIDR_OUT_OF_VPC`, `CIDR_OVERLAP`, `IP_RESERVED`, `IP_OUT_OF_SUBNET`, `IP_DUPLICATE`, `PUBLIC_IP_INVALID`, `ROUTE_DUPLICATE_DESTINATION`, `ROUTE_DESTINATION_RESERVED`, `LOCAL_ROUTE_CONFLICT`, `IGW_MULTIPLE_ATTACHED`, `VPC_MISMATCH`, `SG_NAME_DUPLICATE`, `SG_NAME_INVALID`, `NACL_RULE_NUMBER_DUPLICATE`, `QUOTA_EXCEEDED`, `NAT_SUBNET_NOT_PUBLIC` (warning), `NAT_VPC_NO_INTERNET_GATEWAY`. Reference and structure checks are listed in `docs/specs/r0-engine.md`.
- SSM status: see SSM-04.
- `UNSUPPORTED_FEATURE`: the path needs something the engine doesn't model. Never report `REACHED` in that case.

Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html (code list re-read 2026-11-04)

### TRC-05 · Determinism and scope
- Same input, same output: no randomness and no clock.
- One path per query. Ties are broken by a stable order and reported (RT-10).
- IPv4 only. DNS is modeled only for endpoint private DNS (DNS-03).

### TRC-06 · Golden tests with Reachability Analyzer
- Reachability Analyzer analyzes configuration. It doesn't send packets.
- An internet gateway can't be an intermediate component (`IGW_NAT_REFLECTION`). Split internet flows into two analyses: internet gateway → instance, and instance → internet gateway.
- For TCP through a transit gateway route table, it analyzes only forward traffic. It can also report `UNIDIRECTIONAL_PATH_ANALYSIS_ONLY` when it couldn't check the reverse path. Run the reverse path as a second analysis.
- IPv4 only. Billed per analysis. It also accepts an IP address as a destination.
- It doesn't send packets, so it has no listener check: a golden query must never depend on `NO_LISTENER`. It can't start at a detached internet gateway, so `NO_INTERNET_GATEWAY` can't be golden-tested either.
- Each analysis has a source and a destination resource, a protocol and a `FilterAtSource` (source and destination address, source and destination port range). With `FilterAtSource` you can't also pass `SourceIp` or `DestinationPort`. Each result has `NetworkPathFound`, forward and return path components and explanation codes.
- A reply leg sent as its own analysis is a new connection to Reachability Analyzer: the sending side's security group is checked, not skipped.
- Store its explanation codes next to our expected codes; the golden test compares them one to one: a found path is `REACHED`; otherwise the codes (as a set) must equal the failing hop's codes, and their TRC-04 group gives the verdict. Mapping, fixture format and commands: `docs/specs/p9-golden.md`.
Fidelity: Exact (API and behavior as documented) · Inferred (how an internet gateway source uses `FilterAtSource`, Q13) · Status: verified 2026-11-05

Sources: https://docs.aws.amazon.com/vpc/latest/reachability/how-reachability-analyzer-works.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html · https://docs.aws.amazon.com/vpc/latest/reachability/additional-detail-codes.html · https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateNetworkInsightsPath.html · https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_PathRequestFilter.html · https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_NetworkInsightsAnalysis.html

## Open questions

- Q7: Confirm the TRC-01 order with golden tests for F1 to F3 before R0 ships. Fixtures store forward and return path components for review; the golden test doesn't compare hop order yet. F1 agrees (golden `s1-f1-internet-to-web`, `s3-q1-return-route` 2026-11-05): forward internet gateway → network ACL → security group → network interface → instance; return instance → network interface → security group → network ACL → route table → internet gateway. F2 agrees too (golden `s2-f2-web-to-internet` 2026-11-05): forward instance → network interface → security group → network ACL → route table → internet gateway; return internet gateway → network ACL → security group → network interface → instance. F3 is open (R1).
- Q12: Answered 2026-11-05 by golden `s5-lab1-initial`: with two stacked faults (security group and missing return route) Reachability Analyzer lists one explanation, the security group (`ENI_SG_RULES_MISMATCH`), like the engine's first failing hop.
- Q13: Answered 2026-11-05 by golden `s1-f1-internet-to-web`: an internet gateway source accepts `FilterAtSource` with `SourceAddress` and `SourcePortRange`, and the three analyses match the engine.
