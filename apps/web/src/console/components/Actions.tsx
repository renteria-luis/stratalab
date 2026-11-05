import ButtonDropdown, {
  type ButtonDropdownProps,
} from '@cloudscape-design/components/button-dropdown';
import { useT } from '../../i18n/useT';

/** One item of a console "Actions" menu, as captured. */
export interface ConsoleAction {
  readonly id: string;
  readonly text: string;
  /** Unsupported items stay visible but disabled, with the reason (AGENTS.md, rule 8). */
  readonly supported: boolean;
  /** For supported items that need exactly one selected resource. */
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}

export interface ConsoleActionGroup {
  readonly text: string;
  readonly items: readonly ConsoleAction[];
}

/** The console's "Actions" dropdown with every captured item. */
export function ActionsDropdown({
  actions,
  label = 'Actions',
}: {
  actions: readonly (ConsoleAction | ConsoleActionGroup)[];
  label?: string;
}) {
  const { t } = useT();
  const all = actions.flatMap((entry) => ('items' in entry ? entry.items : [entry]));
  const toItem = (action: ConsoleAction): ButtonDropdownProps.Item => ({
    id: action.id,
    text: action.text,
    disabled: !action.supported || action.disabled === true,
    disabledReason: action.supported ? undefined : t('fidelity.notSimulated'),
  });
  return (
    <ButtonDropdown
      items={actions.map((entry) =>
        'items' in entry ? { text: entry.text, items: entry.items.map(toItem) } : toItem(entry),
      )}
      onItemClick={({ detail }) => {
        all.find((action) => action.id === detail.id)?.onClick?.();
      }}
    >
      {label}
    </ButtonDropdown>
  );
}
