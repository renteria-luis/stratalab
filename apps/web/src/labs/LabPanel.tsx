import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import HelpPanel from '@cloudscape-design/components/help-panel';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { checkLab, type Lab, type LabCheck } from '@sim/labs';
import { useState } from 'react';
import { useT } from '../i18n/useT';
import { labStore, useLabs } from '../state/labStore';
import { activeTopology, topologyStore } from '../state/topologyStore';
import { leaveLab, openLab } from './labActions';

/**
 * The lab panel (AppLayout tools). It never points at the cause: Check reports only which
 * goals are met, hints appear only when the learner asks, and the review (hints, traces,
 * pages off the solution path) appears only after the lab is complete (catalog skill, lab
 * mode). Simulator text, translated.
 */
export function LabPanel({ lab }: { lab: Lab }) {
  const { t, locale } = useT();
  const progress = useLabs((state) => state.progress[lab.id]);
  const [check, setCheck] = useState<LabCheck | null>(null);
  const hintsUsed = progress?.hintsUsed ?? 0;
  const completed = progress?.status === 'completed';

  return (
    <div lang={locale}>
      <HelpPanel header={<h2>{lab.title[locale]}</h2>}>
        <SpaceBetween size="l">
          <div>
            <Box variant="h3">{t('lab.story')}</Box>
            <Box variant="p">{lab.story[locale]}</Box>
            <Box variant="h3">{t('lab.goal')}</Box>
            <Box variant="p">{lab.goal[locale]}</Box>
          </div>

          <SpaceBetween size="s">
            <Button
              variant="primary"
              onClick={() => {
                const result = checkLab(lab, activeTopology(topologyStore.getState()));
                setCheck(result);
                if (result.complete) labStore.getState().completeLab(lab.id);
              }}
            >
              {t('lab.check')}
            </Button>
            {check !== null && (
              <SpaceBetween size="xs">
                <Box variant="h4">{t('lab.checkResult')}</Box>
                {!check.topologyValid && <Alert type="warning">{t('lab.invalidTopology')}</Alert>}
                <ul className="sim-issue-list">
                  {lab.queries.map((query) => {
                    const passed = check.results.find(
                      (result) => result.queryId === query.id,
                    )?.passed;
                    return (
                      <li key={query.id}>
                        <StatusIndicator type={passed === true ? 'success' : 'pending'}>
                          {passed === true ? t('lab.passed') : t('lab.notYet')}
                        </StatusIndicator>{' '}
                        {query.label[locale]}
                      </li>
                    );
                  })}
                </ul>
              </SpaceBetween>
            )}
          </SpaceBetween>

          {completed && (
            <SpaceBetween size="s">
              <Alert type="success" header={t('lab.complete')} />
              <Box variant="h3">{t('lab.review')}</Box>
              <KeyValuePairs
                columns={1}
                items={[
                  {
                    label: t('lab.hintsUsed'),
                    value: `${String(hintsUsed)} / ${String(lab.hints.length)}`,
                  },
                  { label: t('lab.tracesRun'), value: progress.tracesRun },
                  {
                    label: t('lab.wrongTurns'),
                    value:
                      progress.wrongTurns.length === 0 ? (
                        t('lab.noWrongTurns')
                      ) : (
                        <ul className="sim-issue-list">
                          {progress.wrongTurns.map((path) => (
                            <li key={path}>
                              <code>{path}</code>
                            </li>
                          ))}
                        </ul>
                      ),
                  },
                ]}
              />
            </SpaceBetween>
          )}

          <SpaceBetween size="s">
            <Button
              disabled={hintsUsed >= lab.hints.length}
              onClick={() => {
                labStore.getState().takeHint(lab.id);
              }}
            >
              {t('lab.hint')}
            </Button>
            {lab.hints.slice(0, hintsUsed).map((hint, index) => (
              <Alert
                key={index}
                type="info"
                header={t('lab.hintN', { n: index + 1, total: lab.hints.length })}
              >
                {hint[locale]}
              </Alert>
            ))}
            {hintsUsed >= lab.hints.length && (
              <Box color="text-body-secondary">{t('lab.noMoreHints')}</Box>
            )}
          </SpaceBetween>

          <SpaceBetween direction="horizontal" size="xs">
            <Button
              onClick={() => {
                openLab(lab, true);
                setCheck(null);
              }}
            >
              {t('labs.restart')}
            </Button>
            <Button onClick={leaveLab}>{t('lab.leave')}</Button>
          </SpaceBetween>
        </SpaceBetween>
      </HelpPanel>
    </div>
  );
}
