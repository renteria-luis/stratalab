import type { TopologyInput } from '../../src/index';
import type { GoldenScenarioInput } from '../scenario';

type QueryInput = GoldenScenarioInput['queries'][number]['query'];

/** The internet client of every golden scenario (RFC 5737, r0-engine.md section 8). */
export const CLIENT_IP = '198.51.100.7';
/** First port of the Linux client range (EPH-01, EPH-02). */
export const CLIENT_PORT = 32768;

/** Internet client → instance public address (F1 request, or an F2 reply leg with `custom`). */
export function fromInternet(
  instanceId: string,
  destinationPort: number,
  client: { clientType: 'linux' | 'custom'; sourcePort: number } = {
    clientType: 'linux',
    sourcePort: CLIENT_PORT,
  },
): QueryInput {
  return {
    protocol: 'tcp',
    source: { type: 'internet', ipAddress: CLIENT_IP },
    destination: { type: 'instance', instanceId, address: 'public' },
    destinationPort,
    ...client,
  };
}

/** Instance → internet address (F2 request, or an F1 reply leg with `custom`). */
export function toInternet(
  instanceId: string,
  ipAddress: string,
  destinationPort: number,
  client: { clientType: 'linux' | 'custom'; sourcePort: number } = {
    clientType: 'linux',
    sourcePort: CLIENT_PORT,
  },
): QueryInput {
  return {
    protocol: 'tcp',
    source: { type: 'instance', instanceId },
    destination: { type: 'internet', ipAddress },
    destinationPort,
    ...client,
  };
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type { TopologyInput };
