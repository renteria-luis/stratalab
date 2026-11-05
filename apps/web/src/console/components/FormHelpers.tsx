import RadioGroup, { type RadioGroupProps } from '@cloudscape-design/components/radio-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { ReactNode } from 'react';
import { FidelityLabel } from './FidelityLabel';

/**
 * A captured radio group where only some options are simulated: the others stay visible,
 * disabled, with an Unsupported label (AGENTS.md, rule 8).
 */
export function PartlySupportedRadio({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: readonly { value: string; label: string; description?: string; supported: boolean }[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const items: RadioGroupProps.RadioButtonDefinition[] = options.map((option) => ({
    value: option.value,
    label: option.supported ? (
      option.label
    ) : (
      <SpaceBetween direction="horizontal" size="xs">
        <span>{option.label}</span>
        <FidelityLabel fidelity="Unsupported" />
      </SpaceBetween>
    ),
    description: option.description,
    disabled: !option.supported,
  }));
  return (
    <RadioGroup
      value={value}
      items={items}
      ariaLabel={ariaLabel}
      onChange={({ detail }) => {
        onChange(detail.value);
      }}
    />
  );
}

/** A label with a fidelity badge next to it. */
export function LabelWithFidelity({ label, badge }: { label: string; badge: ReactNode }) {
  return (
    <SpaceBetween direction="horizontal" size="xs" alignItems="center">
      <span>{label}</span>
      {badge}
    </SpaceBetween>
  );
}
