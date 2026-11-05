import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Select, { type SelectProps } from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import type { Hop, Topology, TraceQuery } from '@sim/engine';
import { INTERNET, queryFrom, runTrace } from './traceActions';
import { useState } from 'react';
import { FidelityLabel } from '../console/components/FidelityLabel';
import { blockedIssueMessage, reasonMessage } from '../i18n/engineText';
import { useT, type Translator } from '../i18n/useT';
import { useTopology } from '../state/topologyStore';
import { traceStore, useTrace } from '../state/traceStore';
import { INTERNET_CLIENT_IP } from './constants';

/** Source and destination options: the internet client and every instance. */
function endpointOptions(topology: Topology, { t }: Translator, side: 'source' | 'destination') {
  const options: SelectProps.Option[] = [
    {
      value: INTERNET,
      label:
        side === 'source'
          ? t('trace.internetClient', { ip: INTERNET_CLIENT_IP })
          : t('trace.internetServer', { ip: INTERNET_CLIENT_IP }),
    },
  ];
  for (const instance of topology.instances) {
    const name = instance.name ?? instance.id;
    if (side === 'source') {
      options.push({ value: instance.id, label: name, description: instance.id });
    } else {
      options.push(
        {
          value: `${instance.id}|public`,
          label: t('trace.instancePublic', { name }),
          description: instance.primaryNetworkInterface.publicIp?.address ?? '–',
        },
        {
          value: `${instance.id}|private`,
          label: t('trace.instancePrivate', { name }),
          description: instance.primaryNetworkInterface.privateIpAddress,
        },
      );
    }
  }
  return options;
}

function valuesOf(
  query: TraceQuery | null,
): { source: string; destination: string; port: string } | null {
  if (query === null) return null;
  return {
    source: query.source.type === 'internet' ? INTERNET : query.source.instanceId,
    destination:
      query.destination.type === 'internet'
        ? INTERNET
        : `${query.destination.instanceId}|${query.destination.address}`,
    port: String(query.destinationPort),
  };
}

/**
 * The Trace tab: pick the endpoints and the port, run the engine's `trace()`, then step
 * through the hops. Simulator text, translated. Available in lab mode too, like
 * Reachability Analyzer in AWS (docs/specs/p7-lab1.md); each run is counted.
 */
export function TraceTab() {
  const translator = useT();
  const { t } = translator;
  const topology = useTopology();
  const query = useTrace((state) => state.query);
  const result = useTrace((state) => state.result);
  const currentHopIndex = useTrace((state) => state.currentHopIndex);
  const playing = useTrace((state) => state.playing);
  const initial = valuesOf(query);
  const [source, setSource] = useState(initial?.source ?? INTERNET);
  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [port, setPort] = useState(initial?.port ?? '80');
  const [submitted, setSubmitted] = useState(false);
  const portNumber = Number(port);
  const portValid = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
  const sources = endpointOptions(topology, translator, 'source');
  const destinations = endpointOptions(topology, translator, 'destination');
  const hops: readonly Hop[] = result?.status === 'evaluated' ? result.hops : [];

  return (
    <SpaceBetween size="m">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!portValid || destination === '') return;
          runTrace(queryFrom(source, destination, portNumber));
        }}
      >
        <ColumnLayout columns={4}>
          <FormField label={t('trace.source')}>
            <Select
              selectedOption={sources.find((option) => option.value === source) ?? null}
              options={sources}
              onChange={({ detail }) => {
                setSource(detail.selectedOption.value ?? INTERNET);
              }}
            />
          </FormField>
          <FormField label={t('trace.destination')}>
            <Select
              selectedOption={destinations.find((option) => option.value === destination) ?? null}
              options={destinations}
              invalid={submitted && destination === ''}
              onChange={({ detail }) => {
                setDestination(detail.selectedOption.value ?? '');
              }}
            />
          </FormField>
          <FormField
            label={t('trace.port')}
            errorText={submitted && !portValid ? t('trace.portInvalid') : undefined}
          >
            <Input
              type="number"
              value={port}
              onChange={({ detail }) => {
                setPort(detail.value);
              }}
            />
          </FormField>
          <FormField label=" ">
            <Button variant="primary">{t('trace.run')}</Button>
          </FormField>
        </ColumnLayout>
      </form>

      {result === null && <Box color="text-body-secondary">{t('trace.none')}</Box>}

      {result?.status === 'blocked' && (
        <Alert type="error" header={t('trace.blocked')}>
          <Box variant="p">{t('trace.blockedHint')}</Box>
          <ul className="sim-issue-list">
            {result.issues.map((issue) => (
              <li key={`${issue.code}:${issue.path.join('.')}`}>
                {blockedIssueMessage(issue, translator)}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {result?.status === 'evaluated' && (
        <SpaceBetween size="s">
          <SpaceBetween direction="horizontal" size="s" alignItems="center">
            <StatusIndicator type={result.verdict === 'REACHED' ? 'success' : 'error'}>
              {t(`verdict.${result.verdict}`)}
              {result.failure === undefined
                ? ''
                : ` · ${t('trace.failedAt', {
                    direction: t(`direction.${result.failure.direction}`),
                    hop: result.failure.hopIndex,
                  })}`}
            </StatusIndicator>
            <FidelityLabel fidelity={result.fidelity} ruleIds={['TRC-01', 'TRC-02']} />
            <Button
              iconName="angle-left"
              ariaLabel={t('trace.previous')}
              disabled={currentHopIndex <= 0}
              onClick={() => {
                traceStore.getState().goTo(currentHopIndex - 1);
              }}
            />
            <Button
              iconName={playing ? 'pause' : 'caret-right-filled'}
              onClick={() => {
                if (playing) traceStore.getState().pause();
                else traceStore.getState().play();
              }}
            >
              {playing ? t('trace.pause') : t('trace.play')}
            </Button>
            <Button
              iconName="angle-right"
              ariaLabel={t('trace.next')}
              disabled={currentHopIndex >= hops.length - 1}
              onClick={() => {
                traceStore.getState().goTo(currentHopIndex + 1);
              }}
            />
          </SpaceBetween>
          <Table<Hop>
            variant="embedded"
            header={t('trace.hops')}
            items={[...hops]}
            trackBy="index"
            selectionType="single"
            selectedItems={hops.filter((hop) => hop.index === currentHopIndex)}
            onSelectionChange={({ detail }) => {
              const hop = detail.selectedItems[0];
              if (hop !== undefined) traceStore.getState().goTo(hop.index);
            }}
            ariaLabels={{
              selectionGroupLabel: t('trace.hops'),
              itemSelectionLabel: (_data, hop) => `${String(hop.index)} ${t(`step.${hop.step}`)}`,
            }}
            columnDefinitions={[
              { id: 'index', header: t('trace.col.index'), cell: (hop) => hop.index },
              {
                id: 'direction',
                header: t('trace.col.direction'),
                cell: (hop) => t(`direction.${hop.direction}`),
              },
              { id: 'step', header: t('trace.col.step'), cell: (hop) => t(`step.${hop.step}`) },
              {
                id: 'component',
                header: t('trace.col.component'),
                cell: (hop) => hop.component.id,
              },
              {
                id: 'outcome',
                header: t('trace.col.outcome'),
                cell: (hop) => (
                  <StatusIndicator
                    type={
                      hop.outcome === 'pass'
                        ? 'success'
                        : hop.outcome === 'fail'
                          ? 'error'
                          : 'stopped'
                    }
                  >
                    {t(`outcome.${hop.outcome}`)}
                  </StatusIndicator>
                ),
              },
              {
                id: 'reason',
                header: t('trace.col.reason'),
                cell: (hop) =>
                  hop.reasonCodes.length > 0
                    ? hop.reasonCodes
                        .map((code) => `${reasonMessage(code, translator)} (${code})`)
                        .join(' ')
                    : hop.skippedBecause === undefined
                      ? '–'
                      : t(`skipped.${hop.skippedBecause}`),
              },
              {
                id: 'fidelity',
                header: '',
                cell: (hop) => <FidelityLabel fidelity={hop.fidelity} ruleIds={hop.ruleIds} />,
              },
            ]}
          />
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}
