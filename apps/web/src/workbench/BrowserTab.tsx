import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { trace, type TraceQuery } from '@sim/engine';
import { useState } from 'react';
import { useT } from '../i18n/useT';
import { useTopology } from '../state/topologyStore';
import { traceStore } from '../state/traceStore';
import { useUi } from '../state/uiStore';
import { resolveBrowserAddress } from './browserAddress';
import { INTERNET_CLIENT_IP } from './constants';

type Page =
  | { readonly kind: 'none' }
  | { readonly kind: 'message'; readonly key: 'browser.badAddress' | 'browser.unknownHost' }
  | { readonly kind: 'unreachable'; readonly query: TraceQuery }
  | { readonly kind: 'page'; readonly html: string | undefined; readonly name: string };

/**
 * The virtual browser: the internet client 198.51.100.7 opens an address of an instance.
 * Behind it runs the engine's `trace()`; a `REACHED` result shows the service's
 * `responseHtml` in `<iframe sandbox srcdoc>` with no `allow-scripts` and no
 * `allow-same-origin` (AGENTS.md, security). Anything else shows a generic error; the
 * learner can open the request in the Trace tab.
 */
export function BrowserTab({ initialUrl }: { initialUrl: string }) {
  const { t, locale } = useT();
  const topology = useTopology();
  const setWorkbench = useUi((state) => state.setWorkbench);
  const [address, setAddress] = useState(initialUrl);
  const [page, setPage] = useState<Page>({ kind: 'none' });

  const open = () => {
    const resolution = resolveBrowserAddress(address, topology);
    if (resolution.kind === 'bad-address') {
      setPage({ kind: 'message', key: 'browser.badAddress' });
      return;
    }
    if (resolution.kind === 'unknown-host') {
      setPage({ kind: 'message', key: 'browser.unknownHost' });
      return;
    }
    const { instance, address: kind, port } = resolution.target;
    const query: TraceQuery = {
      protocol: 'tcp',
      source: { type: 'internet', ipAddress: INTERNET_CLIENT_IP },
      destination: { type: 'instance', instanceId: instance.id, address: kind },
      destinationPort: port,
    };
    const result = trace(topology, query);
    if (result.status === 'evaluated' && result.verdict === 'REACHED') {
      const service = instance.runningServices.find((candidate) => candidate.port === port);
      setPage({ kind: 'page', html: service?.responseHtml, name: instance.name ?? instance.id });
    } else {
      setPage({ kind: 'unreachable', query });
    }
  };

  return (
    <SpaceBetween size="m">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          open();
        }}
      >
        <SpaceBetween direction="horizontal" size="xs">
          <div className="sim-browser__address">
            <Input
              value={address}
              ariaLabel={t('browser.address')}
              placeholder="http://203.0.113.25"
              onChange={({ detail }) => {
                setAddress(detail.value);
              }}
            />
          </div>
          <Button variant="primary">{t('browser.go')}</Button>
        </SpaceBetween>
      </form>
      <Box variant="small" color="text-body-secondary">
        {t('browser.hint', { ip: INTERNET_CLIENT_IP })}
      </Box>
      <div className="sim-browser__viewport" lang={page.kind === 'page' ? undefined : locale}>
        {page.kind === 'message' && <Box padding="l">{t(page.key)}</Box>}
        {page.kind === 'unreachable' && (
          <Box padding="l">
            <SpaceBetween size="s">
              <Box variant="h3">{t('browser.cantReach')}</Box>
              <Box variant="p">{t('browser.cantReachHint')}</Box>
              <Button
                onClick={() => {
                  traceStore.getState().prepare(page.query);
                  setWorkbench(true, 'trace');
                }}
              >
                {t('browser.traceIt')}
              </Button>
            </SpaceBetween>
          </Box>
        )}
        {page.kind === 'page' &&
          (page.html === undefined ? (
            <Box padding="l">{t('browser.emptyResponse')}</Box>
          ) : (
            <iframe
              className="sim-browser__frame"
              title={t('browser.frameTitle', { name: page.name })}
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={page.html}
            />
          ))}
      </div>
    </SpaceBetween>
  );
}
