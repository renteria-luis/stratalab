import { cidr, type Instance, type Topology } from '@sim/engine';

export interface BrowserTarget {
  readonly instance: Instance;
  readonly address: 'public' | 'private';
  readonly port: number;
}

export type BrowserResolution =
  | { readonly kind: 'target'; readonly target: BrowserTarget }
  | { readonly kind: 'bad-address' }
  | { readonly kind: 'unknown-host' };

/**
 * Reads `http://<IPv4>[:port][/path]` or `https://…` (port 443). DNS names aren't
 * simulated (r0-engine.md section 9), so the host must be an IPv4 address of an instance.
 */
export function resolveBrowserAddress(text: string, topology: Topology): BrowserResolution {
  const match = /^(https?):\/\/([^/:?#]+)(?::(\d{1,5}))?(?:[/?#].*)?$/i.exec(text.trim());
  if (match === null) return { kind: 'bad-address' };
  const [, scheme = 'http', host = '', portText] = match;
  if (cidr.parseIpv4(host) === null) return { kind: 'bad-address' };
  const port =
    portText === undefined ? (scheme.toLowerCase() === 'https' ? 443 : 80) : Number(portText);
  if (port < 1 || port > 65535) return { kind: 'bad-address' };
  for (const instance of topology.instances) {
    const eni = instance.primaryNetworkInterface;
    if (eni.publicIp?.address === host)
      return { kind: 'target', target: { instance, address: 'public', port } };
    if (eni.privateIpAddress === host)
      return { kind: 'target', target: { instance, address: 'private', port } };
  }
  return { kind: 'unknown-host' };
}
