# Endpoints, DNS and SSM (VPCE, DNS, SSM)

Read for: gateway endpoints, interface endpoints (PrivateLink), VPC DNS attributes, SSM managed-node status.

## Gateway endpoints

### VPCE-G01 · Services
Rule: Gateway endpoints exist only for Amazon S3 and Amazon DynamoDB.
Fidelity: Exact · Status: to-verify · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html

### VPCE-G02 · A route with a prefix list
Rule: When you associate a route table with the endpoint, AWS adds a route whose destination is the service's AWS-managed prefix list (pl-…) and whose target is the endpoint (vpce-…). Its CIDRs are more specific than 0.0.0.0/0, so service traffic takes the endpoint instead of the NAT gateway or internet gateway (RT-04).
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-ddb.html

### VPCE-G03 · Same Region only
Rule: A gateway endpoint works only for the service in its own Region.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html

### VPCE-G04 · Not usable from outside the VPC
Rule: Resources on the other side of a VPN, Direct Connect, VPC peering connection or transit gateway can't use the gateway endpoint. They need an interface endpoint.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-ddb.html

### VPCE-G05 · Filtering and cost
Rule: Instance security groups must allow the traffic (they can reference the service's prefix list). NACLs can't reference prefix lists (NACL-07). Gateway endpoints accept only TCP or ICMP echo traffic (`VPCE_GATEWAY_PROTOCOL_RESTRICTION`). Gateway endpoints have no extra charge.
Fidelity: Exact · Status: verified 2026-11-03
Sources: https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

## Interface endpoints (PrivateLink)

### VPCE-I01 · One network interface per enabled subnet
Rule: An interface endpoint creates an endpoint network interface, with a private IP, in each subnet you enable for it.
Fidelity: Exact · Status: to-verify
Source: https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html

### VPCE-I02 · Its own security group
Rule: The endpoint's security group must allow inbound HTTPS (TCP 443) from the clients.
Fidelity: Exact · Status: verified 2026-11-03 (for the SSM endpoints) · Exam: SAA
Source: https://docs.aws.amazon.com/systems-manager/latest/userguide/diagnosing-ec2-category-types.html

### VPCE-I03 · Private DNS
Rule: With private DNS enabled, the service's default Regional name (for example `ssm.<region>.amazonaws.com`) resolves to the endpoint's private IPs. Private DNS needs both VPC attributes, `enableDnsSupport` and `enableDnsHostnames`, set to true.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/cli/latest/reference/ec2/create-vpc-endpoint.html

### VPCE-I04 · Endpoints don't start connections
Rule: An interface endpoint can't initiate connections to resources in its own VPC (`VPCE_INTRA_VPC_TRAFFIC`).
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html

## VPC DNS

### DNS-01 · Dependency
Rule: You can enable `enableDnsHostnames` only if `enableDnsSupport` is enabled.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/cli/latest/reference/ec2/modify-vpc-attribute.html

### DNS-02 · Defaults
Rule: In the default VPC and in VPCs made with the console wizard, both attributes are true. In VPCs created any other way (API, CLI, CloudFormation), only `enableDnsSupport` is true.
Fidelity: Exact · Status: to-verify · Exam: SAA (a common cause of SSM failures)
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html

### DNS-03 · Without private DNS
Rule: If private DNS is off, or either DNS attribute is false, service names resolve to public IPs. Traffic then follows the internet path (internet gateway or NAT gateway) instead of the endpoint.
Fidelity: Inferred · Status: confirm with a golden test

### DNS-04 · DNS queries aren't filtered by NACLs
Rule: Queries to the Amazon DNS server (VPC+2) pass whatever the NACLs say (NACL-06).
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html

## SSM managed status

### SSM-01 · What "Online" needs
Rule: An EC2 instance shows as a managed node only if all three hold:
1. SSM Agent is installed and running.
2. It has credentials: an instance profile with the Systems Manager core permissions (for example the `AmazonSSMManagedInstanceCore` managed policy), or Default Host Management Configuration (DHMC) turned on in that account and Region. DHMC requires IMDSv2.
3. It can reach the `ssm` and `ssmmessages` endpoints over HTTPS (TCP 443). From agent version 3.3.40.0, the agent uses `ssmmessages` instead of `ec2messages` when available. `ec2messages` exists only in Regions launched before 2024.
Fidelity: Inferred (each part is documented; the combined rule is ours) · Status: verified 2026-11-03 (each part)
Sources: https://docs.aws.amazon.com/systems-manager/latest/userguide/fleet-manager-default-host-management-configuration.html · https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-create-vpc.html · https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-setting-up-messageAPIs.html

### SSM-02 · MVP model
Rule: Model only the instance-profile path. DHMC, IMDS settings and agent versions are Unsupported: assume agent 3.3.40.0 or later and that IMDS works. Required endpoints: `ssm` and `ssmmessages`. The UI shows these assumptions.
Fidelity: Inferred · Status: design rule

### SSM-03 · Valid network paths for part 3
Rule: One of these paths must work:
- public subnet + public IPv4 address + route to the internet gateway;
- private subnet + route to a NAT gateway;
- interface endpoints for `ssm` and `ssmmessages` in the VPC, with private DNS on and both DNS attributes true.
On every path: the instance security group allows outbound 443; the endpoint security group allows inbound 443 (endpoint path only); NACLs allow outbound 443 and inbound replies on the instance's ephemeral port (EPH-02). AWS's own check looks for 1024–65535.
Fidelity: Inferred · Status: verified 2026-11-03 (the checks AWS's diagnosis runs)
Source: https://docs.aws.amazon.com/systems-manager/latest/userguide/diagnosing-ec2-category-types.html

### SSM-04 · Failure codes
Own codes, named after the categories that AWS's "Diagnose and remediate" uses:
- `SSM_AGENT_NOT_RUNNING`
- `SSM_NO_CREDENTIALS`: no instance profile with the required permissions
- `SSM_SG_EGRESS_443_BLOCKED`: instance security group
- `SSM_ENDPOINT_SG_INGRESS_443_BLOCKED`: security group of the `ssm` or `ssmmessages` endpoint
- `SSM_NO_PATH`: no internet route and no interface endpoints
- `SSM_ENDPOINT_MISSING`: the endpoint path is used but the `ssm` or `ssmmessages` endpoint doesn't exist in the VPC
- `SSM_VPC_DNS_DISABLED`: private DNS is needed but a DNS attribute is false
- `SSM_NACL_EGRESS_443_BLOCKED`
- `SSM_NACL_INGRESS_EPHEMERAL_BLOCKED`
Routing failures reuse the trace codes, for example `NO_ROUTE_TO_DESTINATION`.
Status: verified 2026-11-03 (the categories)
Sources: https://docs.aws.amazon.com/systems-manager/latest/userguide/diagnosing-ec2-category-types.html · https://docs.aws.amazon.com/systems-manager/latest/userguide/diagnose-and-remediate.html

### SSM-05 · Be honest in the UI
Rule: The real Systems Manager console can also diagnose unmanaged instances. Never claim that AWS can't. The simulator's value is showing the path visually, for free and instantly.
Source: https://docs.aws.amazon.com/systems-manager/latest/userguide/diagnose-and-remediate.html

## Open questions

- Q4: Confirm DNS-02 defaults on the VPC DNS attributes page.
- Q5: Golden test for DNS-03: instance in a private subnet with a NAT gateway and an `ssm` endpoint, once with private DNS on and once off.
