# Filtering rules (SG, NACL, EPH)

Read for: security groups, network ACLs, ephemeral ports.

## Security groups

### SG-01 · Stateful
Rule: If a security group allows a flow, the responses are allowed automatically, whatever the rules in the other direction say.
Engine: when the request passes, mark the flow as allowed and skip security group checks for its responses.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: CLF, SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html

### SG-02 · Allow rules only
Rule: Security group rules can only allow. Traffic that matches no allow rule is dropped. There are no deny rules (use a NACL for that). A security group with no outbound rules allows no outbound traffic.
Code: `ENI_SG_RULES_MISMATCH` (no rule applies) or `SG_HAS_NO_RULES`.
Engine: report `SG_HAS_NO_RULES` when every security group on the interface has no rules in the evaluated direction; otherwise `ENI_SG_RULES_MISMATCH` (Inferred mapping).
Fidelity: Exact · Status: verified 2026-11-04 · Exam: CLF, SAA
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### SG-03 · Where security groups apply
Rule: Security groups are associated with network interfaces; changing an instance's groups changes its primary interface's groups. The outbound rules of the source interface apply to traffic it sends; the inbound rules of the destination interface apply to traffic it receives. With several groups on one interface, their rules are aggregated into one set.
Fidelity: Exact · Status: verified 2026-11-04 · Exam: SAA
Sources: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/changing-security-group.html · https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html

### SG-04 · Rule sources and destinations
Rule: A rule has a protocol (TCP 6, UDP 17, ICMP 1 or all), a port range for TCP and UDP (or ICMP type and code), and one source or destination: an IPv4 CIDR (a single address uses /32), a prefix list or a security group ID. A security group reference matches the private IP addresses of the network interfaces associated with the referenced group; no rules are copied from it. An inbound reference works within the same VPC or across a peering connection or transit gateway; an outbound reference within the same VPC or across a peering connection.
Engine: a reference matches only while the packet's address is the private address of a member interface. Traffic that arrives through an internet gateway carries a public source address, so it never matches (follows from the rule). Traffic through a NAT gateway carries the NAT gateway's address and doesn't match either (Inferred, `SG_REFERENCES_NOT_PRESERVED` describes components that drop security group information, Q3). Prefix lists are R1; references across VPCs are R2.
Fidelity: Exact (rule parts and reference matching) · Inferred (NAT behavior) · Status: verified 2026-11-04 (rule parts and reference matching)
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

### SG-05 · Defaults
Rule: Every VPC comes with a default security group named `default`. Its inbound rule allows all protocols and ports from the group itself; its outbound rule allows all traffic to 0.0.0.0/0 (plus ::/0 only with IPv6). You can change its rules but can't delete it. An instance launched without a security group gets the VPC's default group. A new security group has no inbound rules and one outbound rule that allows all traffic.
Fidelity: Exact · Status: verified 2026-11-04 · Exam: SAA
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/default-security-group.html · https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html

### SG-06 · Scope and names
Rule: You assign a security group to resources in the VPC it belongs to (the Security Group VPC Association feature extends this to other VPCs in the Region). A security group name is unique within its VPC, isn't case-sensitive, has up to 255 characters and can't start with `sg-`. Name and description are required, up to 255 characters, and use only a-z, A-Z, 0-9, spaces and `._-:/()#,@[]+=&;{}!$*`. AWS trims trailing spaces from the name before storing it.
Code: validation issues `VPC_MISMATCH`, `SG_NAME_DUPLICATE`, `SG_NAME_INVALID` (`params.reason`: `empty`, `too-long`, `invalid-characters`, `sg-prefix`).
Engine: names are compared and checked after trimming trailing spaces; descriptions as written. The Security Group VPC Association feature is Unsupported.
Fidelity: Exact · Status: verified 2026-11-04
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html · https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateSecurityGroup.html

### SG-07 · Quotas
Rule: Default quotas: 60 inbound and 60 outbound rules per security group (IPv4 and IPv6 counted separately), and 5 security groups per network interface (adjustable up to 16). Both are adjustable.
Code: validation warning `QUOTA_EXCEEDED`.
Engine: checks the default values only; adjusted quotas are Unsupported.
Fidelity: Exact · Status: verified 2026-11-04
Source: https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html

## Network ACLs

### NACL-01 · Association
Rule: Every subnet has exactly one network ACL. Without an explicit association it uses the VPC's default network ACL. One network ACL can serve many subnets.
Code: validation issue `VPC_MISMATCH` when a subnet uses a network ACL of another VPC.
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
Rule: The default network ACL allows all inbound and outbound IPv4 traffic with rule 100 (all traffic, 0.0.0.0/0, ALLOW) in each direction, before the `*` DENY rule. You can remove its numbered rules. A new custom network ACL blocks all inbound and outbound traffic (only the `*` rules) and isn't associated with any subnet until you associate it.
Fidelity: Exact · Status: verified 2026-11-04 · Exam: SAA
Sources: https://docs.aws.amazon.com/vpc/latest/userguide/default-network-acl.html · https://docs.aws.amazon.com/vpc/latest/userguide/create-network-acl.html · https://docs.aws.amazon.com/vpc/latest/userguide/custom-network-acl.html

### NACL-06 · Traffic that NACLs never filter
Rule: NACLs don't filter traffic to or from the Amazon DNS server (Route 53 Resolver, VPC+2), DHCP, instance metadata (IMDS), ECS task metadata, Windows license activation, Amazon Time Sync, or the addresses reserved for the VPC router.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html

### NACL-07 · No prefix lists in NACLs
Rule: NACL rules can't reference prefix lists. Use CIDRs.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html

### NACL-08 · Unique rule numbers
Rule: A rule number can be used only once per direction in a network ACL (API error `NetworkAclEntryAlreadyExists`). With the API you can only add and delete rules; the console replaces a rule when you edit it.
Code: validation issue `NACL_RULE_NUMBER_DUPLICATE`.
Fidelity: Exact · Status: verified 2026-11-04
Sources: https://docs.aws.amazon.com/ec2/latest/devguide/errors-overview.html · https://docs.aws.amazon.com/vpc/latest/userguide/create-network-acl.html

### NACL-09 · Quota
Rule: The default quota is 20 rules per network ACL in each direction, adjustable up to 40 per direction.
Code: validation warning `QUOTA_EXCEEDED`.
Engine: checks the default value only; adjusted quotas are Unsupported.
Fidelity: Exact · Status: verified 2026-11-04
Source: https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html

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

- Q2: Resolved 2026-11-04. SG-02, SG-03 and SG-05 confirmed in the security group pages.
- Q3: Confirm which components drop security group information (SG-04): golden test with an SG rule that references another group, once with direct private traffic and once through a NAT gateway.
