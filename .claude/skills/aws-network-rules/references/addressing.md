# Addressing rules (ADR)

Read for: CIDR parsing and math, VPC and subnet validation, reserved IPs, overlaps.

### ADR-01 · VPC IPv4 CIDR size and restricted ranges
Rule: A VPC IPv4 CIDR block is between /16 (65,536 addresses) and /28 (16 addresses). You can't use 0.0.0.0/8, 127.0.0.0/8 (loopback), 169.254.0.0/16 (link-local) or 224.0.0.0/4 (multicast). AWS recommends RFC 1918 ranges, but a publicly routable block is allowed; the docs still call addresses inside the VPC CIDR "private".
Code: validation issues `VPC_SIZE_INVALID`, `VPC_CIDR_RESTRICTED`.
Engine: one primary IPv4 CIDR per VPC. Secondary CIDR blocks are Unsupported in R0. Any CIDR inside a restricted range is rejected (Inferred, see Q9).
Fidelity: Exact (size, ranges) · Inferred (subsets of the ranges) · Status: verified 2026-11-04 · Exam: CLF, SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html

### ADR-02 · Subnet CIDR size and placement
Rule: A subnet IPv4 CIDR is between /16 and /28. It is either the VPC CIDR itself or a subset of it.
Code: validation issues `SUBNET_SIZE_INVALID`, `SUBNET_CIDR_OUT_OF_VPC`.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html

### ADR-03 · No overlapping subnets
Rule: Subnet CIDRs in the same VPC can't overlap.
Code: validation issue `CIDR_OVERLAP`.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html

### ADR-04 · Five reserved addresses per subnet
Rule: The first four and the last IPv4 address of every subnet can't be assigned to a resource. Example 10.0.0.0/24: .0 network address, .1 VPC router, .2 reserved (DNS), .3 reserved for future use, .255 broadcast (broadcast isn't supported, so the address is reserved). Usable addresses = 2^(32 − N) − 5.
Code: validation issue `IP_RESERVED`.
Engine: BYOIP ranges (where all addresses are usable) are Unsupported.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html

### ADR-05 · Canonical form
Rule: When you create a subnet with the API or CLI, AWS rewrites the CIDR to its canonical form (100.68.0.18/18 becomes 100.68.0.0/18).
Engine: normalize the same way and show a notice, so the learner sees what changed.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html

### ADR-06 · Amazon DNS server address
Rule: The Amazon DNS server is at the base of the VPC range plus two (in the primary CIDR). The base plus two of every subnet is also reserved.
Fidelity: Exact · Status: verified 2026-11-03
Source: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html

### ADR-07 · Peering needs non-overlapping CIDRs
Rule: Two VPCs with matching or overlapping CIDRs can't be peered. All their CIDR blocks count. See PCX-01.
Fidelity: Exact · Status: verified 2026-11-03 · Exam: SAA
Source: https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html

### ADR-08 · IPv6
Unsupported in the MVP. Reachability Analyzer golden tests are IPv4-only as well.

### ADR-09 · Primary private IPv4 address of an instance
Rule: Each instance has a default network interface (index 0) with a primary private IPv4 address from the subnet's IPv4 range. If you don't pick one at launch, AWS selects an available address in that range. The address stays through stop and start and is released when the instance is terminated.
Code: validation issues `IP_OUT_OF_SUBNET`, `IP_RESERVED` (ADR-04), `IP_DUPLICATE`.
Engine: `IP_DUPLICATE` (two interfaces with the same private address) is inferred from "available address". Secondary private addresses and secondary network interfaces are Unsupported in R0.
Fidelity: Exact (range) · Inferred (uniqueness) · Status: verified 2026-11-04 · Exam: SAA
Source: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html

### ADR-10 · Public IPv4 address of an instance
Rule: Each subnet has an attribute that decides whether a new network interface in it (including an instance's primary interface) gets a public IPv4 address. Instances in a nondefault subnet get none by default; the launch setting overrides the subnet attribute. The address comes from Amazon's pool and the internet gateway maps it one to one to the primary private address. It is released when the instance stops, hibernates or terminates, and when an Elastic IP address is associated; an Elastic IP address is persistent.
Code: validation issue `PUBLIC_IP_INVALID` when the stored address is in RFC 1918, RFC 6598 (100.64.0.0/10), a restricted range (ADR-01) or any VPC CIDR.
Engine: the interface stores the resulting address and its kind (`auto-assigned` or `elastic-ip`). The subnet attribute only prefills the launch view. Stop, start and the address changes they cause are Unsupported in R0.
Fidelity: Exact · Status: verified 2026-11-04 · Exam: CLF, SAA
Sources: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html · https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html · https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html

## CIDR math (implementation)

Use unsigned 32-bit integers. JavaScript bitwise operators return signed 32-bit values, so end each expression with `>>> 0`.

```ts
ip    = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
mask  = n === 0 ? 0 : (~0 << (32 - n)) >>> 0   // n === 0 is special: JS only uses the low 5 bits of a shift count
start = (ip & mask) >>> 0
end   = (start | (~mask >>> 0)) >>> 0
contains(cidr, x) = ((x & cidr.mask) >>> 0) === cidr.start
overlaps(a, b)    = a.start <= b.end && b.start <= a.end
```

- Validate input first: exactly four octets from 0 to 255, prefix from 0 to 32.
- Property tests (fast-check):
  - `start <= ip <= end` for any address and prefix.
  - `contains` agrees with `start <= x <= end`.
  - `overlaps(a, b) === overlaps(b, a)`.
  - A /32 contains only itself; a /0 contains every address.

## Open questions

- Q9: ADR-01 lists blocks you "can't specify". Confirm whether that also covers smaller CIDRs inside them (for example 127.0.0.0/16). No Reachability Analyzer cost: the user tries `create-vpc` once in the sandbox account.
