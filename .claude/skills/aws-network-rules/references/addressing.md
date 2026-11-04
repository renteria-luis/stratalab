# Addressing rules (ADR)

Read for: CIDR parsing and math, VPC and subnet validation, reserved IPs, overlaps.

### ADR-01 · VPC IPv4 CIDR size
Rule: A VPC IPv4 CIDR block is between /16 and /28.
Code: validation issue `VPC_SIZE_INVALID`.
Fidelity: Exact · Status: to-verify · Exam: CLF, SAA
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

- None yet.
