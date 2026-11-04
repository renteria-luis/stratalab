# Routing rules (RT, IGW, NAT)

Read for: route tables, route selection, public vs private subnets, internet gateway, NAT gateway.

## Route tables

### RT-01 · Subnet association and the main route table
Rule: Each subnet is associated with exactly one route table at a time; one route table can serve many subnets. AWS creates a main route table with the VPC; a subnet with no explicit association uses it implicitly, and a subnet can also be associated with it explicitly. A nondefault VPC's main route table starts with only the local route. You can't delete the main route table; you can make another route table the main one.
Engine: `vpc.mainRouteTableId` names the main table and `subnet.routeTableId` holds an explicit association (absent = implicit main). Two associations for one subnet can't be represented.
Code: validation issue `VPC_MISMATCH` when a subnet or VPC points to a route table of another VPC.
Fidelity: Exact · Status: verified 2026-11-04 · Exam: SAA
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html · https://docs.aws.amazon.com/vpc/latest/userguide/RouteTables.html

### RT-02 · Route tables act on traffic leaving the subnet
Rule: A subnet route table decides where traffic from that subnet goes.
Engine: evaluate the source subnet's route table on the way out. Don't evaluate the destination subnet's route table for traffic arriving from an internet gateway (gateway/ingress route tables are Unsupported).
Fidelity: Exact for the way out · Inferred for "no lookup on arrival" (see Q1) · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html

### RT-03 · Local route
Rule: Every route table has a local route for the VPC CIDR. Local routes apply only to destinations inside the VPC CIDR (`VPC_LOCAL_ROUTE_CIDR_RESTRICTION`).
AWS also lets you replace or restore the local route's target, and add routes more specific than the local route (the destination must be a whole subnet CIDR and the target a NAT gateway, network interface or Gateway Load Balancer endpoint).
Engine: the local route is derived from the VPC CIDR, never stored, and can't be removed or retargeted. Replacing its target and routes more specific than it (middlebox routing) are Unsupported.
Code: validation issue `LOCAL_ROUTE_CONFLICT` for a stored route whose destination equals or is inside the VPC CIDR (with an internet gateway target AWS doesn't allow it).
Fidelity: Exact · Status: verified 2026-11-04
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html · https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

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
Rule: A route's state is `active` or `blackhole`. Blackhole means the target isn't available, for example the gateway isn't attached to the VPC. Reachability Analyzer reports a route that isn't functional as `BAD_STATE_ROUTE`.
Engine: a route to an internet gateway that isn't attached to the route table's VPC is `blackhole`. Matching traffic is dropped at that route. The route still takes part in longest prefix match, so traffic doesn't fall back to a less specific active route (Inferred, see Q8).
Fidelity: Exact (state and meaning) · Inferred (selection) · Status: verified 2026-11-04 (state and meaning)
Sources: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_Route.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### RT-09 · Public subnet
Rule: A subnet is public when its route table has a direct route to an internet gateway, and private when it doesn't. Never derive it from the subnet's name. A route to the internet gateway doesn't give internet access by itself: instances also need a public IPv4 address (IGW-01, ADR-10).
Engine: `deriveStatus` counts only `active` routes to an internet gateway (Inferred for blackhole routes, see Q8). The AWS docs also name isolated, VPN-only and EVS subnets; R0 reports only public or private.
Fidelity: Exact · Status: verified 2026-11-04 · Exam: CLF, SAA
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html · https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html

### RT-10 · ECMP and determinism
Rule: A virtual private gateway doesn't support ECMP for VPN connections. A transit gateway can (R2).
Engine: always one deterministic path. If several routes tie, pick one by a stable order and report how many tied.
Fidelity: Inferred · Status: verified 2026-11-03 (virtual private gateway part)
Source: https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-route-priority.html

### RT-11 · Unique and reserved route destinations
Rule: A route table can't have two routes with the same destination CIDR (API error `RouteAlreadyExists`). You can't add a route to 169.254.168.0/22 or any subset of it (reserved for AWS services such as IMDS and the Amazon DNS server). A larger block that overlaps it is allowed, but packets to that range aren't forwarded.
Code: validation issues `ROUTE_DUPLICATE_DESTINATION`, `ROUTE_DESTINATION_RESERVED`.
Fidelity: Exact · Status: verified 2026-11-04
Sources: https://docs.aws.amazon.com/ec2/latest/devguide/errors-overview.html · https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html

### RT-12 · Custom route tables
Rule: By default a route table contains only the local route. After you create a custom route table you add routes and associate it with subnets yourself, so a new custom table has no associations. You can add, remove and modify its routes, and you can delete it only when it has no associations.
Engine: `createRouteTable` stores no routes and changes no subnet. Deleting route tables is Unsupported in the R0 console (YAML can remove them).
Fidelity: Exact · Status: verified 2026-11-04 · Exam: SAA
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html · https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateRouteTable.html

## Internet gateway

### IGW-01 · Going out needs a public IPv4 address
Rule: Traffic reaches the internet through the internet gateway only if the source is paired with a public IPv4 address (`IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS`). The source subnet also needs a route to the internet gateway (RT-02), and security groups and NACLs must allow the traffic.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: CLF, SAA
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### IGW-02 · Coming in targets a public IPv4 address
Rule: The internet gateway accepts inbound traffic only if the destination is the public IP of a network interface in the VPC (`IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS`). It maps that public IP to the private IP.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### IGW-03 · No private or shared addresses across the internet gateway
Rule: The internet gateway rejects outbound traffic to RFC 1918 or RFC 6598 (100.64.0.0/10, shared address space) destinations, and inbound traffic from RFC 1918 or RFC 6598 sources.
Code: `IGW_DESTINATION_ADDRESS_NOT_IN_RFC1918_EGRESS`, `IGW_DESTINATION_ADDRESS_NOT_IN_RFC6598_EGRESS`, `IGW_SOURCE_ADDRESS_NOT_IN_RFC1918_INGRESS`, `IGW_SOURCE_ADDRESS_NOT_IN_RFC6598_INGRESS`.
Fidelity: Exact · Status: verified 2026-11-04
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### IGW-04 · Return path to internet clients
Rule: The server's reply leaves through its subnet route table, which must send the client's address to the internet gateway (usually 0.0.0.0/0 → igw). Without that route the reply is dropped (`NO_ROUTE_TO_DESTINATION` on the return path) and the connection fails.
Fidelity: Inferred (from RT-02 and IGW-01) · Status: confirm with a golden test (Q1)
Source: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html

### IGW-05 · Attachment: one internet gateway per VPC
Rule: To use an internet gateway you must attach it to a VPC and configure routing. You can attach only one internet gateway to a VPC at a time. A nondefault VPC has no internet gateway until you add one.
Code: validation issue `IGW_MULTIPLE_ATTACHED`.
Engine: `internetGateway.attachedVpcId` (absent = detached). A route to a detached internet gateway is `blackhole` (RT-08). If the destination VPC has no attached internet gateway, traffic from the internet stops at the edge with our code `NO_INTERNET_GATEWAY` (Inferred, see Q10).
Fidelity: Exact · Status: verified 2026-11-04 · Exam: CLF, SAA
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html · https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html

### IGW-06 · Internet endpoints use public addresses
Rule: When a path starts or ends at an internet gateway, its internet-side addresses must be public (`IGW_EXPECTS_PUBLIC_ADDRESS`). Reachability Analyzer doesn't support an internet gateway as an intermediate component (`IGW_NAT_REFLECTION`).
Engine: a trace query's internet address must not be in RFC 1918, RFC 6598, a restricted range (ADR-01) or a VPC CIDR; otherwise the query is rejected with `IGW_EXPECTS_PUBLIC_ADDRESS`. An instance reaching another instance through its public address (hairpin through the internet gateway) is Unsupported in R0 (`UNSUPPORTED_FEATURE`).
Fidelity: Exact · Status: verified 2026-11-04
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### IGW-07 · Detach and delete
Rule: You can't detach an internet gateway if the VPC has resources with associated public IP addresses or Elastic IP addresses. You can't delete an internet gateway while it is attached to a VPC.
Engine: `detachInternetGateway` fails with helper error `IGW_HAS_PUBLIC_ADDRESSES` while any network interface in the VPC has a public IPv4 address (`params.count`). Deleting internet gateways is Unsupported in the R0 console. Whether an instance can get a public IPv4 address at launch in a VPC without an attached internet gateway is open (Q11); the launch helper allows it (Inferred).
Fidelity: Exact · Status: verified 2026-11-04 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/delete-igw.html

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
- Q8: Confirm that a blackhole route still wins longest prefix match over a less specific active route, and decide whether a subnet whose only internet gateway route is blackhole counts as public (RT-08, RT-09). Golden test: 0.0.0.0/0 → attached igw plus 198.51.100.0/24 → a detached igw, then analyze instance → 198.51.100.10.
- Q11: Can an instance get an auto-assigned public IPv4 address at launch in a VPC with no attached internet gateway (IGW-07, ADR-10)? IGW-07 forbids detaching while public addresses exist, so the console path to "detached gateway + public address" (used by the RT-08 and IGW-05 trace tests) may only exist through launch. No Reachability Analyzer cost: the user launches one instance in the sandbox account and terminates it.
- Q10: What happens to internet traffic aimed at an instance's public IPv4 address when the VPC has no attached internet gateway, and can that state exist at all (detaching an internet gateway while public addresses are mapped)? The engine uses `NO_INTERNET_GATEWAY` until the docs or a capture answer it (IGW-05).
