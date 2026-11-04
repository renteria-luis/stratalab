# Filtering rules (SG, NACL, EPH)

Read for: security groups, network ACLs, ephemeral ports.

## Security groups

### SG-01 · Stateful
Rule: If a security group allows a flow, the responses are allowed automatically, whatever the rules in the other direction say.
Engine: when the request passes, mark the flow as allowed and skip security group checks for its responses.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: CLF, SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html

### SG-02 · Allow rules only
Rule: Security group rules can only allow. Traffic that matches no allow rule is dropped. There are no deny rules (use a NACL for that).
Code: `ENI_SG_RULES_MISMATCH` (no rule applies) or `SG_HAS_NO_RULES`.
Fidelity: Exact · Status: to-verify · Exam: CLF, SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html

### SG-03 · Where security groups apply
Rule: Security groups apply at the network interface. The outbound rules of the source interface apply to connections it starts; the inbound rules of the destination interface apply to traffic it receives. With several groups on one interface, their rules add up.
Fidelity: Exact · Status: to-verify
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html

### SG-04 · Rule sources and destinations
Rule: A rule can name a CIDR, a prefix list (for example the S3 prefix list) or another security group. A security group reference matches traffic from interfaces that belong to that group.
Engine: a reference matches only while the packet keeps its original private source address inside the VPC. Traffic that went through an internet gateway or a NAT gateway doesn't match (`SG_REFERENCES_NOT_PRESERVED` describes components that drop security group information).
Fidelity: Exact (rule types) · Inferred (internet gateway and NAT behavior) · Status: to-verify
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### SG-05 · Defaults
Rule: The default security group allows inbound traffic from itself and all outbound traffic. A new security group has no inbound rules and one rule that allows all outbound traffic.
Fidelity: Exact · Status: to-verify · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html

## Network ACLs

### NACL-01 · Association
Rule: Every subnet has exactly one network ACL. Without an explicit association it uses the VPC's default network ACL. One network ACL can serve many subnets.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html

### NACL-02 · Rule order
Rule: Rules are evaluated from the lowest number up. The first matching rule decides (allow or deny) and no other rule is checked. Rule numbers go from 1 to 32766. The final `*` rule denies and can't be deleted.
Code: `SUBNET_ACL_RESTRICTION`.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html · https://docs.aws.amazon.com/vpc/latest/userguide/custom-network-acl.html

### NACL-03 · Stateless
Rule: Requests and responses are checked separately. A response needs its own allow rule in the other direction.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: CLF, SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html

### NACL-04 · Only at the subnet boundary
Rule: NACL rules are evaluated when traffic enters or leaves the subnet, not for traffic that stays inside the subnet.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html

### NACL-05 · Defaults
Rule: The default network ACL allows all inbound and outbound IPv4 traffic. A custom network ACL denies everything until you add rules.
Fidelity: Exact · Status: verified 2026-11-03 (default ACL) · to-verify (custom ACL) · Exam: SAA
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html · https://docs.aws.amazon.com/vpc/latest/userguide/custom-network-acl.html

### NACL-06 · Traffic that NACLs never filter
Rule: NACLs don't filter traffic to or from the Amazon DNS server (Route 53 Resolver, VPC+2), DHCP, instance metadata (IMDS), ECS task metadata, Windows license activation, Amazon Time Sync, or the addresses reserved for the VPC router.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html

### NACL-07 · No prefix lists in NACLs
Rule: NACL rules can't reference prefix lists. Use CIDRs.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html

## Ephemeral ports

### EPH-01 · The client chooses the reply port
Rule: Responses go to the client's ephemeral (source) port, and the range depends on the client. Many Linux kernels, including Amazon Linux: 32768–61000. Windows Server 2008 and later: 49152–65535. Windows Server 2003 and earlier: 1025–5000. Elastic Load Balancing, NAT gateways and Lambda: 1024–65535.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/custom-network-acl.html

### EPH-02 · The engine uses one concrete port
Rule: Every trace query has a client type (`linux`, `windows`, `nat-gateway`, `elb`, `lambda` or `custom`) and a concrete source port. The default port is the first one in that client's range; the user can change it. NACL rules are checked against that port, never against a range.
Fidelity: Exact (applies EPH-01) · Status: design rule

### EPH-03 · Recommended NACL ranges
Rule: AWS's example NACLs use 32768–65535. To cover every client type, open 1024–65535 and put DENY rules for unwanted ports before the wide ALLOW rule.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/userguide/custom-network-acl.html

## Open questions

- Q2: Confirm SG-02, SG-03 and SG-05 on the security groups page.
- Q3: Confirm which components drop security group information (SG-04): golden test with an SG rule that references another group, once with direct private traffic and once through a NAT gateway.
