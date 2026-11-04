# Connectivity rules for R2 (PCX, TGW, VPN)

Read for: VPC peering, Transit Gateway, Site-to-Site VPN. Not needed for R0 or R1.
These features change often. Re-read each source page before you implement a rule from this file.

## VPC peering

### PCX-01 · No overlapping CIDRs
Rule: VPCs with matching or overlapping CIDRs can't be peered. All their CIDR blocks count, even ones you don't plan to use.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html

### PCX-02 · Not transitive
Rule: Peering A–B and A–C doesn't connect B and C. Traffic crosses a peering connection only if its source or destination is inside the peer VPC's CIDR (`PCX_REQUIRES_ADDRESS_IN_VPC_CIDR`).
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Sources: https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### PCX-03 · No edge-to-edge routing
Rule: Resources in VPC B can't use VPC A's internet gateway, NAT device, VPN connection, Direct Connect connection or gateway endpoint.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html

### PCX-04 · Setup
Rule: The owner of the accepter VPC must accept the request before the connection is active. Both VPCs need routes to the peering connection (pcx-…), and security groups and NACLs still apply.
Fidelity: Exact · Status: verified 2026-11-03 (acceptance) · to-verify (routes)
Source: https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html

### PCX-05 · Private DNS across peering
Rule: Resolving the peer's private DNS hostnames needs DNS resolution support turned on for the peering connection.
Engine: Unsupported in the MVP (traces use IP addresses).
Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html

## Transit Gateway

### TGW-01 · The VPC side needs a route
Rule: After a VPC is attached, its subnet route tables still need a route to the transit gateway (tgw-…).
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html

### TGW-02 · Association and propagation
Rule: Each attachment is associated with one transit gateway route table; without one, traffic stops (`TGW_ATTACH_MISSING_TGW_RTB_ASSOCIATION`). Attachments can propagate routes into transit gateway route tables, and a VPC attachment propagates its VPC CIDRs. You can also add static routes.
Fidelity: Exact · Status: verified 2026-11-03
Sources: https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### TGW-03 · Route evaluation order
Rule: The most specific route wins. For the same CIDR from different sources: static (including VPN static) > prefix-list references > VPC-propagated > Direct Connect gateway-propagated > Transit Gateway Connect-propagated > VPN over private Direct Connect > VPN-propagated > VPN Concentrator, Client VPN and transit gateway peering.
Fidelity: Exact · Status: to-verify (seen quoted from the official page; read the full list there before implementing)
Source: https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html#tgw-route-evaluation-overview

### TGW-04 · A blackholed static route keeps its priority
Rule: A static route that becomes a blackhole still beats a propagated route for the same CIDR. There is no automatic failover; the static route must be removed.
Fidelity: Inferred · Status: to-verify (the source is an AWS support answer, not the docs)
Sources: https://www.repost.aws/questions/QUVRhZgm0NQsOUPO53eXx3cw/aws-transit-gateway-backup-vpn-path-behavior · confirm in https://docs.aws.amazon.com/vpc/latest/tgw/tgw-route-tables.html

### TGW-05 · AZ coverage
Rule: The VPC attachment needs a subnet in the Availability Zone where the traffic starts (`TGW_ROUTE_AZ_RESTRICTION`).
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### TGW-06 · Security group references across a transit gateway
Rule: Security group references work across a transit gateway only if the VPC attachment has security group referencing support turned on (`SG_REFERENCING_SUPPORT`).
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### TGW-07 · Out of scope
Appliance mode, Transit Gateway Connect, transit gateway peering and multicast are Unsupported.

## Site-to-Site VPN (virtual private gateway)

### VPN-01 · Routes in the VPC
Rule: The VPC route table needs a route to the virtual private gateway for the remote network, or route propagation turned on (the routes then appear as propagated).
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Sources: https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-route-priority.html · https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html

### VPN-02 · Path selection on the virtual private gateway
Rule: Tunnel health comes first. For the same prefix: Direct Connect BGP > VPN static > VPN BGP. Between BGP VPN connections: shortest AS_PATH wins, then the lowest MED.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: ANS
Source: https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-route-priority.html

### VPN-03 · What the virtual private gateway forwards
Rule: It sends traffic only to prefixes it knows (through BGP or a static route) or to its attached VPC's CIDR. Blackhole routes aren't advertised to the customer gateway. There is no ECMP on a virtual private gateway; a transit gateway supports ECMP for VPN.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-route-priority.html

### VPN-04 · Two tunnels
Rule: Each VPN connection has two tunnels, and AWS picks one as the primary egress path.
Engine: model tunnel up/down only. BGP attributes beyond VPN-02 are Unsupported.
Fidelity: Exact (tunnels) · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpn/latest/s2svpn/vpn-route-priority.html

## Open questions

- Q6: Confirm the full TGW-03 order and TGW-04 on the official Transit Gateway pages before R2 starts.
