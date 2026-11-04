/** Fidelity labels from the aws-network-rules skill. The UI shows them. */
export type Fidelity = 'Exact' | 'Inferred' | 'Unsupported';

type RulePrefix =
  | 'ADR'
  | 'RT'
  | 'IGW'
  | 'NAT'
  | 'SG'
  | 'NACL'
  | 'EPH'
  | 'VPCE'
  | 'DNS'
  | 'SSM'
  | 'PCX'
  | 'TGW'
  | 'VPN'
  | 'TRC';

/** A rule ID from the aws-network-rules skill, for example `ADR-04`. */
export type RuleId = `${RulePrefix}-${string}`;
