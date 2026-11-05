import type { TraceQuery } from '@sim/engine';
import { labStore } from '../state/labStore';
import { activeTopology, topologyStore } from '../state/topologyStore';
import { traceStore } from '../state/traceStore';
import { INTERNET_CLIENT_IP } from './constants';

/** Select value of the internet endpoint in the trace form. */
export const INTERNET = 'internet';

/** A TCP query from the trace form values (`<instanceId>|public` or `|private` destinations). */
export function queryFrom(source: string, destination: string, port: number): TraceQuery {
  const [instanceId = '', address] = destination.split('|');
  return {
    protocol: 'tcp',
    source:
      source === INTERNET
        ? { type: 'internet', ipAddress: INTERNET_CLIENT_IP }
        : { type: 'instance', instanceId: source },
    destination:
      destination === INTERNET
        ? { type: 'internet', ipAddress: INTERNET_CLIENT_IP }
        : { type: 'instance', instanceId, address: address === 'private' ? 'private' : 'public' },
    destinationPort: port,
  };
}

/** Runs a trace on the active topology and counts it in the open lab. */
export function runTrace(query: TraceQuery) {
  traceStore.getState().run(activeTopology(topologyStore.getState()), query);
  labStore.getState().recordTrace();
}
