/** Who opened the connection; it decides the source (ephemeral) port range (EPH-02). */
export type ClientType = 'linux' | 'windows' | 'nat-gateway' | 'elb' | 'lambda' | 'custom';

export interface PortRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Ephemeral port range per client type. `custom` accepts any port and needs an explicit one.
 *
 * Rules: EPH-01, EPH-02 · https://docs.aws.amazon.com/vpc/latest/userguide/custom-network-acl.html
 */
export const CLIENT_PORT_RANGES: Readonly<Record<ClientType, PortRange>> = {
  linux: { from: 32768, to: 61000 },
  windows: { from: 49152, to: 65535 },
  'nat-gateway': { from: 1024, to: 65535 },
  elb: { from: 1024, to: 65535 },
  lambda: { from: 1024, to: 65535 },
  custom: { from: 1, to: 65535 },
};
