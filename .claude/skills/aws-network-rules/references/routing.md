# Routing rules (RT, IGW, NAT)

Read for: route tables, route selection, public vs private subnets, internet gateway, NAT gateway.

## Route tables

### RT-01 · Subnet association and the main route table
Rule: Each subnet uses exactly one route table. AWS creates a main route table with the VPC; a subnet with no explicit association uses it.
Fidelity: Exact · Status: to-verify (main route table creation verified 2026-11-03) · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html

### RT-02 · Route tables act on traffic leaving the subnet
Rule: A subnet route table decides where traffic from that subnet goes.
Engine: evaluate the source subnet's route table on the way out. Don't evaluate the destination subnet's route table for traffic arriving from an internet gateway (gateway/ingress route tables are Unsupported).
Fidelity: Exact for the way out · Inferred for "no lookup on arrival" (see Q1) · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html

### RT-03 · Local route
Rule: Every route table has a local route for the VPC CIDR. Local routes apply only to destinations inside the VPC CIDR (`VPC_LOCAL_ROUTE_CIDR_RESTRICTION`).
Engine: the local route can't be removed or retargeted. Routes more specific than the local route (middlebox routing) are Unsupported.
Fidelity: Exact · Status: verified 2026-11-03
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### RT-04 · Longest prefix match first
Rule: The most specific matching route wins. For overlapping routes, the more specific one always wins, whatever its type (static, propagated or prefix list).
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html

### RT-05 · Same-destination priority
Rule: When routes have the same destination: static > prefix-list routes > propagated. Among propagated routes: Direct Connect BGP > VPN static > VPN BGP.
Static targets include: internet gateway, NAT gateway, network interface, instance, gateway VPC endpoint, transit gateway, VPC peering connection, Gateway Load Balancer endpoint.
Code for a losing route: `HIGHER_PRIORITY_ROUTE` (same prefix) or `MORE_SPECIFIC_ROUTE`.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html

### RT-06 · Prefix list details
Rule: A static CIDR route beats an overlapping static prefix-list route. A prefix-list route beats a matching propagated route. With several overlapping prefix lists to different targets, AWS picks one at random and then keeps it.
Engine: model the first two. Report the third as a validation warning (Unsupported).
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html

### RT-07 · Propagated routes never beat the local route
Rule: VPN or Direct Connect propagated routes that overlap the VPC's local route lose, even when they are more specific. This is an exception to RT-04.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: ANS (needed in R2)
Source: https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-route-priority.html

### RT-08 · Blackhole routes
Rule: A route whose target was deleted or isn't working is in blackhole state. Matching traffic is dropped at that route (`BAD_STATE_ROUTE`). The route still takes part in route selection.
Fidelity: Exact · Status: to-verify
Source: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html

### RT-09 · Public subnet
Rule: A subnet is public when its route table has a route to an internet gateway. Never derive it from the subnet's name.
Fidelity: Exact · Status: to-verify · Exam: CLF, SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html

### RT-10 · ECMP and determinism
Rule: A virtual private gateway doesn't support ECMP for VPN connections. A transit gateway can (R2).
Engine: always one deterministic path. If several routes tie, pick one by a stable order and report how many tied.
Fidelity: Inferred · Status: verified 2026-11-03 (virtual private gateway part)
Source: https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-route-priority.html

## Internet gateway

### IGW-01 · Going out needs a public IPv4 address
Rule: Traffic reaches the internet through the internet gateway only if the source is paired with a public IPv4 address (`IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS`). The source subnet also needs a route to the internet gateway (RT-02), and security groups and NACLs must allow the traffic.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: CLF, SAA
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### IGW-02 · Coming in targets a public IPv4 address
Rule: The internet gateway accepts inbound traffic only if the destination is the public IP of a network interface in the VPC (`IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`). It maps that public IP to the private IP.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### IGW-03 · No private addresses across the internet gateway
Rule: The internet gateway rejects outbound traffic to RFC 1918 destinations and inbound traffic from RFC 1918 sources.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### IGW-04 · Return path to internet clients
Rule: The server's reply leaves through its subnet route table, which must send the client's address to the internet gateway (usually 0.0.0.0/0 → igw). Without that route the reply is dropped (`NO_ROUTE_TO_DESTINATION` on the return path) and the connection fails.
Fidelity: Inferred (from RT-02 and IGW-01) · Status: confirm with a golden test (Q1)
Source: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html

### IGW-05 · One internet gateway per VPC
Rule: A VPC can have only one internet gateway attached.
Fidelity: Exact · Status: to-verify
Source: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html

## NAT gateway (public, zonal)

### NAT-01 · Placement
Rule: A public NAT gateway is created in a public subnet and must get an Elastic IP address at creation. Traffic goes from the NAT gateway to the VPC's internet gateway.
Code: validation issue `NAT_SUBNET_NOT_PUBLIC` when the NAT gateway's subnet has no route to an internet gateway.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html

### NAT-02 · Outbound only
Rule: Instances behind a NAT gateway can't receive unsolicited inbound connections. Connections must start inside the VPC.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: CLF, SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html

### NAT-03 · The source must be in the same VPC
Rule: A NAT gateway forwards only traffic from network interfaces in its own VPC, never from peering, VPN or Direct Connect (`NGW_REQUIRES_SOURCE_IN_VPC`).
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### NAT-04 · Address and port translation
Rule: The NAT gateway replaces the instance's private source IP with its own private IP. The internet gateway then maps that IP to the NAT gateway's Elastic IP. Outbound source ports are remapped to 1024–65535 (`REMAP_EPHEMERAL_PORT`).
Engine: the internet reply targets the NAT gateway's port, so the NAT subnet's NACL must allow inbound 1024–65535 from the internet.
Fidelity: Exact · Status: verified 2026-11-03
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### NAT-05 · No security group on a NAT gateway
Rule: You can't attach a security group to a NAT gateway. The NACL of its subnet still applies in both directions.
Fidelity: Exact (security group part) · Inferred (NACL part) · Status: to-verify
Source: https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html

### NAT-06 · Out of scope
Regional NAT gateways (multi-AZ) and private NAT gateways exist. Both are Unsupported in the MVP: model one zonal public NAT gateway in one subnet.
Status: verified 2026-11-03 (they exist)
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html

## Open questions

- Q1: Confirm that traffic arriving from the internet gateway isn't looked up in the destination subnet's route table (RT-02, IGW-04). Golden test: Reachability Analyzer from the internet gateway to an instance, once with and once without the 0.0.0.0/0 → igw route in the instance's subnet.
