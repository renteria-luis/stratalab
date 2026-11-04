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

**F1 · Internet client → web server in a public subnet (TCP 80)**
- Forward: client → internet gateway (the destination must be the instance's public IP; the gateway maps it to the private IP, IGW-02) → no route table lookup on arrival (RT-02, Q1) → NACL inbound, port 80 → security group inbound, port 80 → host listening on 80.
- Return: security group passes (stateful) → NACL outbound to the client's ephemeral port → the subnet route table must send the client's IP to the internet gateway (IGW-04) → the internet gateway maps the private IP back to the public IP → client.

**F2 · Instance in a public subnet → internet (TCP 443)**
- Forward: security group outbound 443 → NACL outbound 443 → route 0.0.0.0/0 → igw → the internet gateway needs the instance's public IPv4 address (IGW-01) → internet.
- Return: internet gateway → NACL inbound to the instance's ephemeral port (by OS) → security group passes (stateful).

**F3 · Instance in a private subnet → internet through a NAT gateway (TCP 443)**
- Forward: security group outbound 443 → private subnet NACL outbound → private route 0.0.0.0/0 → nat → NAT subnet NACL inbound → NAT gateway (NAT-04) → NAT subnet route 0.0.0.0/0 → igw → NAT subnet NACL outbound → internet gateway (NAT private IP → Elastic IP) → internet.
- Return: internet gateway → NAT subnet NACL inbound to the NAT gateway's port (1024–65535) → NAT gateway → NAT subnet NACL outbound to the instance's ephemeral port → private subnet NACL inbound → security group passes.

**F4 · Instance → interface endpoint in another subnet (SSM, TCP 443)**
- First, DNS: VPCE-I03 and DNS-03 decide whether the service name points to the endpoint.
- Forward: security group outbound 443 → NACL outbound → local route → endpoint subnet NACL inbound 443 → endpoint security group inbound 443 → endpoint.
- Return: endpoint subnet NACL outbound to the instance's ephemeral port → instance subnet NACL inbound → security group passes.

**F5 · Instance → S3 through a gateway endpoint (TCP 443)**
- Forward: security group outbound 443 (0.0.0.0/0 or the S3 prefix list) → NACL outbound to the S3 CIDRs (NACL-07) → prefix-list route → vpce (VPCE-G02) → S3.
- Return: NACL inbound to the instance's ephemeral port → security group passes.

### TRC-04 · Reason codes
Reuse these Reachability Analyzer explanation codes with the same name and meaning:
- Routing and targets (`BROKE_AT_HOP`): `NO_ROUTE_TO_DESTINATION`, `MORE_SPECIFIC_ROUTE`, `HIGHER_PRIORITY_ROUTE`, `BAD_STATE_ROUTE`, `VPC_LOCAL_ROUTE_CIDR_RESTRICTION`, `DISCONNECTED_VPCS`, `IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS`, `IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`, `IGW_DESTINATION_ADDRESS_NOT_IN_RFC1918_EGRESS`, `NGW_REQUIRES_SOURCE_IN_VPC`, `PCX_REQUIRES_ADDRESS_IN_VPC_CIDR`, `VPCE_INTRA_VPC_TRAFFIC`, `TGW_ATTACH_MISSING_TGW_RTB_ASSOCIATION`, `TGW_RTB_NO_ROUTE_TO_TGW_ATTACHMENT`, `TGW_ROUTE_AZ_RESTRICTION`.
- Filtering (`ROUTED_THEN_DROPPED`): `SUBNET_ACL_RESTRICTION`, `ENI_SG_RULES_MISMATCH`, `SG_HAS_NO_RULES`, `SG_REFERENCING_SUPPORT`, `VPCE_GATEWAY_PROTOCOL_RESTRICTION`.

Our own codes, for cases Reachability Analyzer doesn't cover:
- `NO_LISTENER`: no service on the destination port (`ROUTED_THEN_DROPPED`).
- Validation: `VPC_SIZE_INVALID`, `SUBNET_SIZE_INVALID`, `SUBNET_CIDR_OUT_OF_VPC`, `CIDR_OVERLAP`, `IP_RESERVED`, `NAT_SUBNET_NOT_PUBLIC`.
- SSM status: see SSM-04.
- `UNSUPPORTED_FEATURE`: the path needs something the engine doesn't model. Never report `REACHED` in that case.

Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### TRC-05 · Determinism and scope
- Same input, same output: no randomness and no clock.
- One path per query. Ties are broken by a stable order and reported (RT-10).
- IPv4 only. DNS is modeled only for endpoint private DNS (DNS-03).

### TRC-06 · Golden tests with Reachability Analyzer
- Reachability Analyzer analyzes configuration. It doesn't send packets.
- An internet gateway can't be an intermediate component (`IGW_NAT_REFLECTION`). Split internet flows into two analyses: internet gateway → instance, and instance → internet gateway.
- For TCP through a transit gateway route table, it analyzes only forward traffic. It can also report `UNIDIRECTIONAL_PATH_ANALYSIS_ONLY` when it couldn't check the reverse path. Run the reverse path as a second analysis.
- IPv4 only. Billed per analysis.
- Store its explanation codes next to our expected codes; the golden test compares them one to one.

Sources: https://docs.aws.amazon.com/vpc/latest/reachability/how-reachability-analyzer-works.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html · https://docs.aws.amazon.com/vpc/latest/reachability/additional-detail-codes.html

## Open questions

- Q7: Confirm the TRC-01 order with golden tests for F1 to F3 before R0 ships.
