import Alert from '@cloudscape-design/components/alert';
import { helperErrorMessage, issueMessage } from '../../i18n/engineText';
import { useT } from '../../i18n/useT';
import type { ChangeFailure } from './failure';
import { FidelityLabel } from './FidelityLabel';

/**
 * Why a console change was rejected: a helper error, or the `validate()` errors it would
 * add (docs/specs/r0-engine.md 3.8). Simulator text, translated.
 */
export function ChangeErrors({ failure }: { failure: ChangeFailure | null }) {
  const translator = useT();
  const { t, locale } = translator;
  if (failure === null) return null;
  if ('error' in failure) {
    return (
      <div lang={locale}>
        <Alert type="error" header={t('change.failed')}>
          {helperErrorMessage(failure.error, translator)}
        </Alert>
      </div>
    );
  }
  return (
    <div lang={locale}>
      <Alert type="error" header={t('change.rejected')}>
        <ul className="sim-issue-list">
          {failure.issues.map((issue) => (
            <li key={`${issue.code}:${issue.path.join('.')}`}>
              {issueMessage(issue, translator)}{' '}
              <FidelityLabel fidelity={issue.fidelity} ruleIds={issue.ruleIds} />
            </li>
          ))}
        </ul>
      </Alert>
    </div>
  );
}
