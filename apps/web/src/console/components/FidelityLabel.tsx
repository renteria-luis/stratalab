import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Popover from '@cloudscape-design/components/popover';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { Fidelity, RuleId } from '@sim/engine';
import { useT } from '../../i18n/useT';

const BADGE_COLOR: Readonly<Record<Fidelity, 'blue' | 'grey'>> = {
  Exact: 'blue',
  Inferred: 'grey',
  Unsupported: 'grey',
};

/**
 * The fidelity label of a primitive or rule (AGENTS.md, architecture rule 8). Simulator
 * text, so it follows the UI language. The label text is the signal; color only repeats it.
 */
export function FidelityLabel({
  fidelity,
  ruleIds = [],
  note,
}: {
  fidelity: Fidelity;
  ruleIds?: readonly RuleId[];
  note?: string;
}) {
  const { t, locale } = useT();
  const label = t(`fidelity.${fidelity}`);
  return (
    <span lang={locale} className="sim-fidelity">
      <Popover
        triggerType="custom"
        size="medium"
        header={t('fidelity.title', { label })}
        content={
          <SpaceBetween size="xs">
            <Box variant="p">{t(`fidelity.${fidelity}.description`)}</Box>
            {note !== undefined && <Box variant="p">{note}</Box>}
            {ruleIds.length > 0 && (
              <Box variant="small">{t('fidelity.rules', { ruleIds: ruleIds.join(', ') })}</Box>
            )}
          </SpaceBetween>
        }
      >
        <button type="button" className="sim-fidelity__trigger">
          <Badge color={BADGE_COLOR[fidelity]}>{label}</Badge>
        </button>
      </Popover>
    </span>
  );
}
