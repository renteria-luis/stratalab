---
name: aws-network-rules
description: AWS VPC networking rules the simulator engine must follow, each with its official AWS doc source, verification status, fidelity label and Reachability Analyzer reason code. Covers route tables and route priority, internet gateway, NAT gateway, security groups, network ACLs, ephemeral ports, VPC endpoints, VPC DNS, SSM managed-node status and, for R2, VPC peering, Transit Gateway and Site-to-Site VPN. Use this skill whenever you write, change, review or test anything in packages/engine (schema, validate, trace, deriveStatus, evaluators) or packages/labs, design a lab or a quiz answer, explain why a packet is allowed or blocked, or touch any AWS networking behavior, even if the task doesn't mention AWS by name. Never implement an AWS rule from memory; look it up here first.
---

# AWS network rules

This skill is the source of truth for every AWS behavior the simulator models.
The simulator teaches people how AWS works, so a wrong rule is worse than a missing one.
Code follows this skill; this skill follows the AWS docs.

## Workflow

1. Find the rule IDs in the index below. Open only the reference file you need.
2. Check the rule's status:
   - `verified YYYY-MM-DD`: the AWS doc text was checked on that date.
   - `to-verify`: confirm it in the current AWS docs (AWS documentation MCP tool or docs.aws.amazon.com) before you implement it. Then update the status and date in the file.
3. Write the test first. Start its name with the rule ID, for example `RT-05: static beats propagated for the same prefix`.
4. Implement. In the evaluator's JSDoc, list the rule IDs and their source URLs.
5. If the docs are silent or unclear, label the behavior `Inferred`, add it to the open questions at the end of the reference file and ask the user. Never fill gaps from memory.
6. If a doc contradicts a rule here, stop, tell the user and fix the rule before changing code.

## Fidelity labels

- `Exact`: matches a documented AWS rule.
- `Inferred`: our model of something AWS doesn't state in one place, or a simplification. The UI shows a notice.
- `Unsupported`: not modeled. The UI says so. Never treat it as allowed, free or instant.

## Rule record format

```text
### RT-05 · Same-destination priority
Rule: one or two plain sentences.
Engine: how the engine applies it (only when it differs from the rule).
Code: reason or validation code, if any.
Fidelity: Exact | Inferred | Unsupported · Status: verified YYYY-MM-DD | to-verify · Exam: CLF | SAA | ANS
Source: https://docs.aws.amazon.com/...
```

## Index

| File | Read when | Rule IDs |
|---|---|---|
| `references/addressing.md` | CIDR math, VPC and subnet validation, reserved IPs, overlaps | ADR |
| `references/routing.md` | route tables, route priority, public subnets, internet gateway, NAT gateway | RT, IGW, NAT |
| `references/filtering.md` | security groups, network ACLs, ephemeral ports | SG, NACL, EPH |
| `references/endpoints-ssm.md` | gateway and interface endpoints, VPC DNS, SSM managed status | VPCE, DNS, SSM |
| `references/connectivity.md` | VPC peering, Transit Gateway, Site-to-Site VPN (R2 only) | PCX, TGW, VPN |
| `references/trace-model.md` | hop order, round trips, canonical flows, verdicts, reason codes, golden tests | TRC |

## Quick check: the rules people get wrong most

- A subnet route table decides where traffic leaving the subnet goes. Replies to internet clients need the route to the internet gateway (RT-02, IGW-04).
- Longest prefix first. Same prefix: static > prefix list > propagated. Propagated routes never beat the local route (RT-04, RT-05, RT-07).
- "Public subnet" means a route to an internet gateway, not a name. Internet access also needs a public IPv4 address (RT-09, IGW-01).
- Security groups are stateful and allow-only. NACLs are stateless, ordered, first match wins, and act only at the subnet boundary (SG-01, SG-02, NACL-02, NACL-03, NACL-04).
- Replies go to the client's ephemeral port, and that range depends on the client type (EPH-01, EPH-02).
- A public NAT gateway sits in a public subnet with an Elastic IP and never accepts unsolicited inbound connections (NAT-01, NAT-02).
- Interface endpoint private DNS needs `enableDnsSupport` and `enableDnsHostnames` (VPCE-I03, DNS-02).
- SSM "Online" needs the agent, credentials and an HTTPS path. DHMC exists but isn't modeled in the MVP (SSM-01, SSM-02).

## Unsupported in the MVP

IPv6 · DNS beyond endpoint private DNS · gateway (ingress) route tables and middlebox routing · Gateway Load Balancer · AWS Network Firewall · VPC Block Public Access · regional and private NAT gateways · DHMC and IMDS settings · Direct Connect, Direct Connect gateways and virtual interfaces · BGP beyond VPN-02 · load balancers (R2) · Auto Scaling · security group references across Regions.

## Maintenance

- Re-verify `verified` rules every 6 months, or right away when a golden test disagrees with the engine.
- Keep this file short. Put detail in the reference files.
- Last full review: 2026-11-03. R0 rules re-verified 2026-11-04 (see `docs/specs/r0-engine.md`).
